import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/*
 * export-ndjson v2 — Incremental sync shape
 *
 * FIX #2: Per-candidate JSON files instead of one monolithic NDJSON.
 * Output modes:
 *   ?candidate_id=<uuid>  → single JSON object for that candidate
 *   ?mode=batch           → NDJSON (all candidates, one line each) for initial bulk import
 *   (default)             → JSON manifest with per-candidate objects keyed by ID
 *
 * GCS target: gs://BUCKET/structured/candidates/{candidateId}.json
 * This gives change isolation, easier audits, and no full reimports on single-candidate updates.
 */

interface CandidateRow {
  id: string;
  nova_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  specialty: string;
  sub_specialty: string | null;
  years_experience: number | null;
  profession: string | null;
  preferred_locations: string[] | null;
  preferred_shift: string | null;
  pay_floor: number | null;
  housing_pref: string | null;
  available_date: string | null;
  ldw: string | null;
  time_off_requests: string | null;
  communication_style: string | null;
  notes_summary: string | null;
  source: string | null;
  updated_at: string | null;
}

// Frozen schema contract — v1
// These fields are the stable interface between Supabase and Vertex AI Search.
// Adding new fields requires a planned version bump.
interface CandidateDocument {
  // Identity (stable join key)
  id: string;                           // UUID — primary key
  resource_name: string;                 // candidates/{uuid} — canonical reference across stores
  nova_id: string | null;

  // Demographics
  name: string;
  first_name: string;
  last_name: string;

  // Contact (excluded from structured store for privacy — unstructured only)
  // email, phone intentionally omitted from structured export

  // Clinical
  specialty: string;                     // filterable
  sub_specialty: string | null;          // filterable
  profession: string | null;             // filterable
  years_experience: number | null;       // filterable

  // Availability
  preferred_locations: string[];         // filterable (array)
  preferred_shift: string | null;        // filterable
  available_date: string | null;         // filterable
  last_day_worked: string | null;

  // Preferences
  pay_floor: number | null;
  housing_pref: string | null;
  time_off_requests: string | null;
  communication_style: string | null;
  summary: string | null;

  // Related entities (denormalized for search)
  licenses: LicenseDoc[];
  certifications: CertDoc[];
  assignments: AssignmentDoc[];
  notes_count: number;                   // count only — content in unstructured store

  // Metadata
  schema_version: string;                // "v1" — for migration tracking
  exported_at: string;                   // ISO timestamp
  updated_at: string | null;
}

interface LicenseDoc {
  state: string;
  type: string;
  is_compact: boolean;
  expiration: string | null;
  status: string | null;
  verified: boolean;
}

interface CertDoc {
  name: string;
  issuer: string | null;
  expiration: string | null;
  status: string | null;
}

interface AssignmentDoc {
  facility: string;
  city: string | null;
  state: string | null;
  start_date: string;
  end_date: string | null;
  status: string | null;
}

function buildDocument(c: CandidateRow, licenses: any[], certs: any[], assignments: any[], noteCount: number): CandidateDocument {
  return {
    id: c.id,
    resource_name: `candidates/${c.id}`,
    nova_id: c.nova_id,
    name: `${c.first_name} ${c.last_name}`,
    first_name: c.first_name,
    last_name: c.last_name,
    specialty: c.specialty,
    sub_specialty: c.sub_specialty,
    profession: c.profession,
    years_experience: c.years_experience,
    preferred_locations: c.preferred_locations ?? [],
    preferred_shift: c.preferred_shift,
    available_date: c.available_date,
    last_day_worked: c.ldw,
    pay_floor: c.pay_floor,
    housing_pref: c.housing_pref,
    time_off_requests: c.time_off_requests,
    communication_style: c.communication_style,
    summary: c.notes_summary,
    licenses: licenses.map((l: any) => ({
      state: l.state,
      type: l.license_type,
      is_compact: l.is_compact ?? false,
      expiration: l.expiration_date,
      status: l.status,
      verified: !!l.verified_at,
    })),
    certifications: certs.map((cert: any) => ({
      name: cert.name,
      issuer: cert.issuer,
      expiration: cert.expiration_date,
      status: cert.status,
    })),
    assignments: assignments.map((a: any) => ({
      facility: a.facilities?.name ?? "Unknown",
      city: a.facilities?.city ?? null,
      state: a.facilities?.state ?? null,
      start_date: a.start_date,
      end_date: a.end_date,
      status: a.status,
    })),
    notes_count: noteCount,
    schema_version: "v1",
    exported_at: new Date().toISOString(),
    updated_at: c.updated_at,
  };
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const candidateId = url.searchParams.get("candidate_id");
    const mode = url.searchParams.get("mode"); // "batch" for legacy NDJSON bulk

    let candidateQuery = supabase.from("candidates").select("*");
    if (candidateId) candidateQuery = candidateQuery.eq("id", candidateId);
    const { data: candidates, error: cErr } = await candidateQuery;
    if (cErr) throw cErr;
    if (!candidates || candidates.length === 0) {
      return new Response("No candidates found", { status: 404 });
    }

    const candidateIds = candidates.map((c: CandidateRow) => c.id);

    const [licRes, certRes, asgnRes, noteCountRes] = await Promise.all([
      supabase.from("licenses").select("*").in("candidate_id", candidateIds),
      supabase.from("certifications").select("*").in("candidate_id", candidateIds),
      supabase.from("assignments").select("*, facilities(name, city, state)").in("candidate_id", candidateIds).order("start_date", { ascending: false }),
      supabase.from("notes").select("candidate_id").in("candidate_id", candidateIds),
    ]);

    if (licRes.error) throw licRes.error;
    if (certRes.error) throw certRes.error;
    if (asgnRes.error) throw asgnRes.error;
    if (noteCountRes.error) throw noteCountRes.error;

    const groupBy = <T extends { candidate_id: string }>(arr: T[]) => {
      const map: Record<string, T[]> = {};
      for (const item of arr) {
        if (!map[item.candidate_id]) map[item.candidate_id] = [];
        map[item.candidate_id].push(item);
      }
      return map;
    };

    const licMap = groupBy(licRes.data || []);
    const certMap = groupBy(certRes.data || []);
    const asgnMap = groupBy(asgnRes.data || []);
    const noteCountMap: Record<string, number> = {};
    for (const n of (noteCountRes.data || [])) {
      noteCountMap[n.candidate_id] = (noteCountMap[n.candidate_id] || 0) + 1;
    }

    const docs: Record<string, CandidateDocument> = {};
    for (const c of candidates as CandidateRow[]) {
      docs[c.id] = buildDocument(c, licMap[c.id] || [], certMap[c.id] || [], asgnMap[c.id] || [], noteCountMap[c.id] || 0);
    }

    // Mode: batch → legacy NDJSON (for initial bulk import)
    if (mode === "batch") {
      const ndjson = Object.values(docs).map((d) => JSON.stringify(d)).join("\n") + "\n";
      return new Response(ndjson, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Content-Disposition": `attachment; filename="candidates-batch.ndjson"`,
          "X-Document-Count": String(Object.keys(docs).length),
          "X-Schema-Version": "v1",
          "Connection": "keep-alive",
        },
      });
    }

    // Single candidate → single JSON document
    if (candidateId && docs[candidateId]) {
      return new Response(JSON.stringify(docs[candidateId], null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `inline; filename="${candidateId}.json"`,
          "X-Resource-Name": `candidates/${candidateId}`,
          "X-Schema-Version": "v1",
          "Connection": "keep-alive",
        },
      });
    }

    // All candidates → manifest with per-candidate documents
    return new Response(JSON.stringify({
      schema_version: "v1",
      exported_at: new Date().toISOString(),
      count: Object.keys(docs).length,
      documents: docs,
    }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "X-Document-Count": String(Object.keys(docs).length),
        "X-Schema-Version": "v1",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
