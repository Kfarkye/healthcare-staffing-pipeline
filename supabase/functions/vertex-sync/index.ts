import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * vertex-sync v2 — Orchestrator Edge Function
 *
 * Fixes applied from review:
 *   1. Grounding: documents datastore path, not engine path
 *   2. Incremental sync: per-candidate files (structured/{id}.json + unstructured/{id}.html)
 *   3. Keyless auth: supports GOOGLE_APPLICATION_CREDENTIALS or falls back to SA JSON key
 *      (recommend Workload Identity Federation or Cloud Run attached SA in production)
 *   4. Schema contract: all exports include schema_version="v1" marker
 *
 * Quick wins:
 *   - UUID filenames (no PII in bucket paths)
 *   - Metadata meta tags on HTML for unstructured filtering
 *   - resource_name (candidates/{uuid}) as join key across both stores
 *
 * Env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set)
 *   GCS_BUCKET              — e.g. "my-project-vertex-candidates"
 *   GCS_SERVICE_ACCOUNT     — JSON string of GCP SA key (fallback; prefer keyless)
 *   VERTEX_DATASTORE_ID     — for reference in responses
 *
 * Params:
 *   ?candidate_id=<uuid>    — sync single candidate (incremental)
 *   ?dry_run=true           — return manifest without uploading
 *   ?mode=initial           — bulk NDJSON export for first-time import
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GCS_BUCKET = Deno.env.get("GCS_BUCKET") || "";
const GCS_SA_JSON = Deno.env.get("GCS_SERVICE_ACCOUNT") || "";
const VERTEX_DATASTORE_ID = Deno.env.get("VERTEX_DATASTORE_ID") || "<your-datastore-id>";

// ── GCS Auth ─────────────────────────────────────────────
async function getGcsAccessToken(): Promise<string> {
  // Option A: Metadata server (Cloud Run / GCE with attached SA)
  // This is the keyless path — no long-lived secrets.
  try {
    const metaRes = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (metaRes.ok) {
      const data = await metaRes.json();
      if (data.access_token) return data.access_token;
    }
  } catch {
    // Not on GCE/Cloud Run — fall through to SA key
  }

  // Option B: Service account JSON key (fallback for Supabase Edge Functions)
  if (!GCS_SA_JSON) {
    throw new Error(
      "No GCS auth available. Set GCS_SERVICE_ACCOUNT, or run on Cloud Run with an attached service account."
    );
  }

  const sa = JSON.parse(GCS_SA_JSON);
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header + payload (base64url)
  const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_write",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const signInput = new TextEncoder().encode(`${header}.${payload}`);

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signInput);
  const sig = b64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`GCS auth failed: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function uploadToGcs(
  token: string,
  path: string,
  content: string,
  contentType: string
): Promise<{ name: string; size: string; md5: string }> {
  const encodedPath = encodeURIComponent(path);
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodedPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body: content,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GCS upload failed for ${path}: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return { name: data.name, size: data.size, md5: data.md5Hash || "" };
}

// ── Main ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const started = Date.now();

  try {
    const url = new URL(req.url);
    const candidateId = url.searchParams.get("candidate_id");
    const dryRun = url.searchParams.get("dry_run") === "true";
    const mode = url.searchParams.get("mode"); // "initial" for first bulk import

    const baseUrl = SUPABASE_URL + "/functions/v1";
    const authHeader = { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
    const qs = candidateId ? `?candidate_id=${candidateId}` : "";
    const ndjsonQs = mode === "initial" ? (qs ? `${qs}&mode=batch` : "?mode=batch") : qs;

    // Call both export functions in parallel
    const [ndjsonRes, htmlRes] = await Promise.all([
      fetch(`${baseUrl}/export-ndjson${ndjsonQs}`, { headers: authHeader }),
      fetch(`${baseUrl}/export-html${qs}`, { headers: authHeader }),
    ]);

    if (!ndjsonRes.ok) throw new Error(`export-ndjson failed: ${ndjsonRes.status} ${await ndjsonRes.text()}`);
    if (!htmlRes.ok) throw new Error(`export-html failed: ${htmlRes.status} ${await htmlRes.text()}`);

    // Parse structured data
    const ndjsonContentType = ndjsonRes.headers.get("Content-Type") || "";
    let structuredFiles: Record<string, string> = {};

    if (mode === "initial" || ndjsonContentType.includes("ndjson")) {
      // Bulk NDJSON mode
      const ndjsonContent = await ndjsonRes.text();
      structuredFiles["structured/candidates.ndjson"] = ndjsonContent;
    } else if (candidateId) {
      // Single candidate JSON document
      const jsonContent = await ndjsonRes.text();
      structuredFiles[`structured/candidates/${candidateId}.json`] = jsonContent;
    } else {
      // Multi-candidate manifest
      const json = await ndjsonRes.json();
      for (const [id, doc] of Object.entries(json.documents || {})) {
        structuredFiles[`structured/candidates/${id}.json`] = JSON.stringify(doc, null, 2);
      }
    }

    // Parse HTML pages
    let htmlFiles: Record<string, string> = {};
    const htmlContentType = htmlRes.headers.get("Content-Type") || "";

    if (htmlContentType.includes("text/html")) {
      const htmlContent = await htmlRes.text();
      const resourceName = htmlRes.headers.get("X-Resource-Name") || `candidates/${candidateId}`;
      const fileId = resourceName.replace("candidates/", "");
      htmlFiles[`unstructured/${fileId}.html`] = htmlContent;
    } else {
      const json = await htmlRes.json();
      for (const [filename, html] of Object.entries(json.pages || {})) {
        htmlFiles[`unstructured/${filename}`] = html as string;
      }
    }

    // Build manifest
    const manifest = {
      sync_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      schema_version: "v1",
      dry_run: dryRun,
      mode: mode || (candidateId ? "incremental" : "full"),
      candidate_filter: candidateId || "all",
      structured: {
        file_count: Object.keys(structuredFiles).length,
        paths: Object.keys(structuredFiles),
        total_bytes: Object.values(structuredFiles).reduce((s, c) => s + new TextEncoder().encode(c).length, 0),
      },
      unstructured: {
        file_count: Object.keys(htmlFiles).length,
        paths: Object.keys(htmlFiles),
        total_bytes: Object.values(htmlFiles).reduce((s, c) => s + new TextEncoder().encode(c).length, 0),
      },
      uploads: [] as any[],
    };

    // Upload to GCS
    if (!dryRun && GCS_BUCKET) {
      const token = await getGcsAccessToken();

      // Upload structured files
      for (const [path, content] of Object.entries(structuredFiles)) {
        const result = await uploadToGcs(token, path, content, 
          path.endsWith(".ndjson") ? "application/x-ndjson" : "application/json");
        manifest.uploads.push({ type: "structured", ...result });
      }

      // Upload HTML files (batch of 5 for concurrency)
      const htmlEntries = Object.entries(htmlFiles);
      for (let i = 0; i < htmlEntries.length; i += 5) {
        const batch = htmlEntries.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(([path, html]) => uploadToGcs(token, path, html, "text/html"))
        );
        manifest.uploads.push(...results.map((r) => ({ type: "html", ...r })));
      }

      // Upload manifest for audit trail
      const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      await uploadToGcs(token, `manifests/sync-${ts}.json`, JSON.stringify(manifest, null, 2), "application/json");

    } else if (!dryRun && !GCS_BUCKET) {
      return new Response(JSON.stringify({
        ...manifest,
        note: "GCS_BUCKET not configured. Data returned inline.",
        data: { structured: structuredFiles, html: htmlFiles },
      }, null, 2), {
        headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
      });
    }

    const elapsed = Date.now() - started;

    return new Response(JSON.stringify({
      status: "ok",
      ...manifest,
      elapsed_ms: elapsed,
      grounding_config: {
        note: "Use datastore path (not engine/app path) for Gemini grounding",
        resource: `projects/PROJECT_ID/locations/global/collections/default_collection/dataStores/${VERTEX_DATASTORE_ID}`,
        example: {
          python: `tool = Tool(retrieval=Retrieval(source=VertexAISearch(datastore=\"projects/PROJECT_ID/locations/global/collections/default_collection/dataStores/${VERTEX_DATASTORE_ID}\")))`,
        },
      },
      bucket_layout: {
        structured_per_candidate: `gs://${GCS_BUCKET || "BUCKET"}/structured/candidates/{uuid}.json`,
        structured_bulk: `gs://${GCS_BUCKET || "BUCKET"}/structured/candidates.ndjson`,
        unstructured: `gs://${GCS_BUCKET || "BUCKET"}/unstructured/{uuid}.html`,
        manifests: `gs://${GCS_BUCKET || "BUCKET"}/manifests/sync-{timestamp}.json`,
      },
    }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Id": manifest.sync_id,
        "X-Schema-Version": "v1",
        "X-Elapsed-Ms": String(elapsed),
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({
      status: "error",
      error: message,
      elapsed_ms: Date.now() - started,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
