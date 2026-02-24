import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * export-html v2
 *
 * Fixes applied:
 *   - UUID filenames (privacy: no name leakage in bucket paths)
 *   - Metadata <meta> tags for unstructured filtering (candidateId, specialty, states)
 *   - resource_name (candidates/{uuid}) as canonical join key across stores
 *   - schema_version marker for migration tracking
 *   - Email/phone excluded from JSON-LD (structured store handles contact separately)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Helpers ──────────────────────────────────────────────────
const esc = (s: string | null | undefined): string =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (d: string | null): string => {
  if (!d) return "\u2014";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const fmtMonthYear = (d: string | null): string => {
  if (!d) return "\u2014";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const asgnStatusClass = (s: string | null): string => {
  switch (s) {
    case "active": return "asgn-status--working";
    case "completed": case "extended": return "asgn-status--completed";
    case "cancelled": return "asgn-status--cancelled";
    case "terminated": return "asgn-status--rejected";
    case "pending_start": return "asgn-status--working";
    default: return "asgn-status--completed";
  }
};

const asgnStatusLabel = (s: string | null): string => {
  switch (s) {
    case "active": return "Working";
    case "completed": return "Completed";
    case "extended": return "Extended";
    case "cancelled": return "Cancelled";
    case "terminated": return "Terminated";
    case "pending_start": return "Pre-Start";
    default: return s ?? "Unknown";
  }
};

const credBorderClass = (status: string | null, expDate: string | null): string => {
  if (status === "expired") return "cred--expired";
  if (expDate) {
    const days = (new Date(expDate).getTime() - Date.now()) / 86400000;
    if (days < 0) return "cred--expired";
    if (days < 60) return "cred--warn";
  }
  return "";
};

// ── HTML Template ────────────────────────────────────────────
function buildPage(c: any, licenses: any[], certs: any[], assignments: any[], notes: any[]): string {
  const name = `${c.first_name} ${c.last_name}`;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const resourceName = `candidates/${c.id}`;

  // Active assignment
  const activeAsgn = assignments.find((a: any) => a.status === "active" || a.status === "pending_start");

  // Derive filterable states from licenses + assignments
  const activeStates = new Set<string>();
  for (const l of licenses) if (l.state) activeStates.add(l.state);
  for (const a of assignments) if (a.facilities?.state) activeStates.add(a.facilities.state);
  const statesStr = Array.from(activeStates).sort().join(",");

  // JSON-LD (no PII: email/phone excluded)
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    identifier: resourceName,
    jobTitle: c.sub_specialty || c.specialty,
    hasCredential: [
      ...licenses.map((l: any) => ({
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "License",
        name: `${l.state} ${l.license_type}`,
      })),
      ...certs.map((cert: any) => ({
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "Professional Certification",
        name: cert.name,
        recognizedBy: cert.issuer ? { "@type": "Organization", name: cert.issuer } : undefined,
      })),
    ],
    hasOccupation: {
      "@type": "Occupation",
      name: c.specialty,
    },
  });

  // Status badges
  const badges: string[] = [];
  if (activeAsgn) badges.push(`<span class="status status--blue">${asgnStatusLabel(activeAsgn.status)}</span>`);
  const expiredCerts = certs.filter((cert: any) => cert.status === "expired");
  if (expiredCerts.length > 0) badges.push(`<span class="status status--amber">${expiredCerts.length} Cert${expiredCerts.length > 1 ? "s" : ""} Expired</span>`);
  const expiringLicenses = licenses.filter((l: any) => {
    if (!l.expiration_date) return false;
    const days = (new Date(l.expiration_date).getTime() - Date.now()) / 86400000;
    return days > 0 && days < 60;
  });
  if (expiringLicenses.length > 0) badges.push(`<span class="status status--amber">License Expiring</span>`);

  // Section HTML builders
  const licensesHtml = licenses.map((l: any) => {
    const cls = credBorderClass(l.status, l.expiration_date);
    const verifiedTag = l.verified_at ? "Verified" : "Not verified";
    const compactTag = l.is_compact ? " \u00b7 Compact" : "";
    return `<div class="cred ${cls}"><div class="cred-title">${esc(l.state)} ${esc(l.license_type)}</div><div class="cred-detail">#${esc(l.license_number || "\u2014")}${compactTag}</div><div class="cred-sub">${l.expiration_date ? "Exp " + fmtDate(l.expiration_date) : "No expiration"} \u00b7 ${verifiedTag}</div></div>`;
  }).join("");

  const certsHtml = certs.map((cert: any) => {
    const cls = credBorderClass(cert.status, cert.expiration_date);
    return `<div class="cred ${cls}"><div class="cred-title">${esc(cert.name)}</div><div class="cred-detail">${esc(cert.issuer || "")}</div><div class="cred-sub">${cert.expiration_date ? "Exp " + fmtDate(cert.expiration_date) : "No expiration"} \u00b7 ${esc(cert.status || "active")}</div></div>`;
  }).join("");

  const assignmentsHtml = assignments.map((a: any) => {
    const facName = a.facilities?.name ?? "Unknown Facility";
    const loc = [a.facilities?.city, a.facilities?.state].filter(Boolean).join(", ");
    const dates = `${fmtMonthYear(a.start_date)}${a.end_date ? " \u2013 " + fmtMonthYear(a.end_date) : " \u2013 Present"}`;
    const detail = a.end_notes ? `<div class="asgn-detail">${esc(a.end_notes)}</div>` : "";
    return `<div class="asgn"><div><div class="asgn-fac">${esc(facName)}</div><div class="asgn-dates">${dates}${loc ? " \u00b7 " + esc(loc) : ""}${detail}</div></div><div class="asgn-status ${asgnStatusClass(a.status)}">${asgnStatusLabel(a.status)}</div></div>`;
  }).join("");

  const notesHtml = notes.map((n: any) => {
    const typeLabel = n.note_type ? `<span class="tag tag--${n.note_type === "red_flag" ? "amber" : "blue"}">${esc(n.note_type)}</span> ` : "";
    return `<p>${typeLabel}${esc(n.content)}</p>`;
  }).join("");

  const completedCount = assignments.filter((a: any) => a.status === "completed").length;
  const cancelledCount = assignments.filter((a: any) => a.status === "cancelled").length;

  // ── METADATA META TAGS ──
  const metaTags = [
    `<meta name="candidate-id" content="${esc(c.id)}">`,
    `<meta name="resource-name" content="${esc(resourceName)}">`,
    `<meta name="specialty" content="${esc(c.specialty)}">`,
    c.sub_specialty ? `<meta name="sub-specialty" content="${esc(c.sub_specialty)}">` : "",
    c.profession ? `<meta name="profession" content="${esc(c.profession)}">` : "",
    c.years_experience ? `<meta name="years-experience" content="${c.years_experience}">` : "",
    c.available_date ? `<meta name="available-date" content="${esc(c.available_date)}">` : "",
    c.preferred_shift ? `<meta name="preferred-shift" content="${esc(c.preferred_shift)}">` : "",
    statesStr ? `<meta name="active-states" content="${esc(statesStr)}">` : "",
    (c.preferred_locations && c.preferred_locations.length > 0) ? `<meta name="preferred-locations" content="${esc(c.preferred_locations.join(","))}">` : "",
    c.nova_id ? `<meta name="nova-id" content="${esc(c.nova_id)}">` : "",
    `<meta name="schema-version" content="v1">`,
    `<meta name="exported-at" content="${new Date().toISOString()}">`,
  ].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(name)} \u2014 ${esc(c.specialty)}. ${c.years_experience || ""} years experience. ${assignments.length} assignments. ${(c.preferred_locations || []).length} preferred locations.">
${metaTags}
<title>${esc(name)} \u2014 ${esc(c.specialty)}</title>
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#09090B;--s1:#111113;--s2:#18181B;--s3:#1F1F23;--bd:rgba(255,255,255,.06);--bd2:rgba(255,255,255,.09);--t1:#FAFAFA;--t2:rgba(250,250,250,.5);--t3:rgba(250,250,250,.28);--blue:#3B82F6;--green:#22C55E;--amber:#EAB308;--red:#EF4444;--r:10px}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{font-family:'Inter',-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--t1);-webkit-font-smoothing:antialiased;font-size:14px;line-height:1.6}
body{min-height:100vh;padding:0 0 96px}
.mono{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:-.01em}
.label{font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--t3)}
.page{max-width:720px;margin:0 auto;padding:0 20px}
.fade{opacity:0;animation:enter .5s ease forwards}@keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--bd);margin-bottom:48px}
.topbar-label{font-size:12px;font-weight:500;color:var(--t3);letter-spacing:.04em;text-transform:uppercase}
.status-row{display:flex;gap:6px;flex-wrap:wrap}
.status{padding:4px 10px;border-radius:100px;font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.status--green{background:rgba(34,197,94,.1);color:var(--green)}
.status--blue{background:rgba(59,130,246,.1);color:var(--blue)}
.status--amber{background:rgba(234,179,8,.1);color:var(--amber)}
.hero{margin-bottom:56px}
.hero h1{font-size:40px;font-weight:700;letter-spacing:-.035em;line-height:1.05;color:var(--t1);margin-bottom:8px}
.hero-sub{font-size:16px;color:var(--t2);letter-spacing:-.01em;margin-bottom:4px}
.hero-sub strong{color:var(--t1);font-weight:600}
.hero-tertiary{font-size:13px;color:var(--t3);margin-bottom:20px}
.hero-meta{display:flex;flex-wrap:wrap;gap:20px;margin-bottom:20px}
.meta{font-size:13px;color:var(--t2)}.meta-dim{font-size:12px;color:var(--t3)}
.section{margin-bottom:44px}
.section-header{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--bd);margin-bottom:14px}
.section-count{font-size:11px;color:var(--t3);font-weight:500}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:16px 18px;transition:border-color .15s}
.card:hover{border-color:var(--bd2)}
.cred-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}@media(max-width:480px){.cred-grid{grid-template-columns:1fr}}
.cred{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:14px 16px;border-left:2px solid var(--green);transition:border-color .15s}
.cred:hover{border-color:var(--bd2);border-left-color:var(--green)}
.cred--warn{border-left-color:var(--amber)}.cred--warn:hover{border-left-color:var(--amber)}
.cred--expired{border-left-color:var(--red)}.cred--expired:hover{border-left-color:var(--red)}
.cred-title{font-size:13px;font-weight:600;color:var(--t1);margin-bottom:4px}
.cred-detail{font-size:12px;color:var(--t2)}
.cred-sub{font-size:11px;color:var(--t3);margin-top:4px}
.kv{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--bd)}
.kv:last-child{border-bottom:none}
.kv-label{font-size:13px;color:var(--t3)}
.kv-value{font-size:13px;color:var(--t1);font-weight:500;text-align:right;max-width:55%}
.tag{display:inline-block;padding:3px 9px;border-radius:5px;font-size:11px;font-weight:500;background:rgba(255,255,255,.04);color:var(--t3);border:1px solid var(--bd);margin:2px}
.tag--green{background:rgba(34,197,94,.08);color:var(--green);border-color:transparent}
.tag--blue{background:rgba(59,130,246,.08);color:var(--blue);border-color:transparent}
.tag--amber{background:rgba(234,179,8,.08);color:var(--amber);border-color:transparent}
.asgn{display:grid;grid-template-columns:1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);align-items:start}
.asgn:last-child{border-bottom:none}
.asgn-fac{font-size:13px;font-weight:500;color:var(--t1)}
.asgn-dates{font-size:12px;color:var(--t3);margin-top:1px}
.asgn-detail{font-size:11px;color:var(--t3);margin-top:2px;font-style:italic}
.asgn-status{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.02em}
.asgn-status--working{color:var(--blue)}.asgn-status--completed{color:var(--green)}.asgn-status--cancelled{color:var(--amber)}.asgn-status--rejected{color:var(--red)}
.note-text{font-size:13px;color:var(--t2);line-height:1.65}
.note-text p+p{margin-top:10px}
.footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center}
.footer span{font-size:11px;color:var(--t3)}
@media print{html{background:#fff;color:#111;font-size:12px}.card,.cred{border-color:#E5E7EB;background:#F9FAFB}.hero h1{color:#111}.section{break-inside:avoid}}
</style>
</head>
<body>
<div class="page">

<div class="topbar fade" style="animation-delay:.05s">
  <span class="topbar-label">Candidate</span>
  <div class="status-row">${badges.join("")}</div>
</div>

<div class="hero fade" style="animation-delay:.1s">
  <h1>${esc(name)}</h1>
  <p class="hero-sub"><strong>${esc(c.sub_specialty || c.specialty)}</strong>${c.profession ? " \u00b7 " + esc(c.profession) : ""}</p>
  <p class="hero-tertiary">${c.years_experience ? c.years_experience + " yrs experience" : ""}${assignments.length ? " \u00b7 " + assignments.length + " assignments" : ""}</p>
  <div class="hero-meta">
    ${c.available_date ? `<span class="meta">Available ${fmtDate(c.available_date)}</span>` : ""}
    ${c.preferred_shift ? `<span class="meta">${esc(c.preferred_shift)}</span>` : ""}
    ${c.nova_id ? `<span class="meta-dim mono">Nova #${esc(c.nova_id)}</span>` : ""}
  </div>
</div>

${(licenses.length > 0 || certs.length > 0) ? `
<section id="credentials" class="section fade" style="animation-delay:.14s">
  <div class="section-header">
    <span class="label">Credentials</span>
    <span class="section-count">${licenses.length} license${licenses.length !== 1 ? "s" : ""} \u00b7 ${certs.length} cert${certs.length !== 1 ? "s" : ""}</span>
  </div>
  <div class="cred-grid">
    ${licensesHtml}
    ${certsHtml}
  </div>
</section>` : ""}

<section id="preferences" class="section fade" style="animation-delay:.17s">
  <div class="section-header"><span class="label">Preferences</span></div>
  <div class="card">
    <div class="kv"><span class="kv-label">Specialty</span><span class="kv-value">${esc(c.specialty)}</span></div>
    ${c.preferred_shift ? `<div class="kv"><span class="kv-label">Shift</span><span class="kv-value">${esc(c.preferred_shift)}</span></div>` : ""}
    ${c.available_date ? `<div class="kv"><span class="kv-label">Available</span><span class="kv-value">${fmtDate(c.available_date)}</span></div>` : ""}
    ${c.pay_floor ? `<div class="kv"><span class="kv-label">Pay Floor</span><span class="kv-value">$${Number(c.pay_floor).toLocaleString()}/wk</span></div>` : ""}
    ${c.housing_pref ? `<div class="kv"><span class="kv-label">Housing</span><span class="kv-value">${esc(c.housing_pref)}</span></div>` : ""}
    ${c.time_off_requests ? `<div class="kv"><span class="kv-label">Time Off</span><span class="kv-value">${esc(c.time_off_requests)}</span></div>` : ""}
    ${(c.preferred_locations && c.preferred_locations.length > 0) ? `<div class="kv"><span class="kv-label">Locations</span><span class="kv-value" style="font-size:11px;max-width:60%;line-height:1.5">${esc(c.preferred_locations.join(", "))}</span></div>` : ""}
  </div>
</section>

${assignments.length > 0 ? `
<section id="assignments" class="section fade" style="animation-delay:.2s">
  <div class="section-header">
    <span class="label">Assignments</span>
    <span class="section-count">${completedCount} completed \u00b7 ${cancelledCount} cancelled</span>
  </div>
  <div class="card">${assignmentsHtml}</div>
</section>` : ""}

${notes.length > 0 ? `
<section id="notes" class="section fade" style="animation-delay:.23s">
  <div class="section-header">
    <span class="label">Notes</span>
    <span class="section-count">${notes.length} entries</span>
  </div>
  <div class="card"><div class="note-text">${notesHtml}</div></div>
</section>` : ""}

${c.notes_summary ? `
<section id="summary" class="section fade" style="animation-delay:.26s">
  <div class="section-header"><span class="label">Summary</span></div>
  <div class="card"><div class="note-text"><p>${esc(c.notes_summary)}</p></div></div>
</section>` : ""}

<div class="footer fade" style="animation-delay:.29s">
  <span>Internal \u00b7 Updated ${today}</span>
  <span class="mono">${esc(resourceName)}</span>
</div>

</div>
</body>
</html>`;
}

// ── Handler ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const candidateId = url.searchParams.get("candidate_id");

    let candidateQuery = supabase.from("candidates").select("*");
    if (candidateId) candidateQuery = candidateQuery.eq("id", candidateId);
    const { data: candidates, error: cErr } = await candidateQuery;
    if (cErr) throw cErr;
    if (!candidates || candidates.length === 0) {
      return new Response("No candidates found", { status: 404 });
    }

    const candidateIds = candidates.map((c: any) => c.id);

    const [licRes, certRes, asgnRes, noteRes] = await Promise.all([
      supabase.from("licenses").select("*").in("candidate_id", candidateIds),
      supabase.from("certifications").select("*").in("candidate_id", candidateIds),
      supabase.from("assignments").select("*, facilities(name, city, state)").in("candidate_id", candidateIds).order("start_date", { ascending: false }),
      supabase.from("notes").select("*").in("candidate_id", candidateIds).order("created_at", { ascending: false }),
    ]);

    if (licRes.error) throw licRes.error;
    if (certRes.error) throw certRes.error;
    if (asgnRes.error) throw asgnRes.error;
    if (noteRes.error) throw noteRes.error;

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
    const noteMap = groupBy(noteRes.data || []);

    // Single candidate → return HTML directly
    // FIX: UUID filename (privacy — no name leakage in bucket path)
    if (candidateId || candidates.length === 1) {
      const c = candidates[0];
      const html = buildPage(c, licMap[c.id] || [], certMap[c.id] || [], asgnMap[c.id] || [], noteMap[c.id] || []);
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="${c.id}.html"`,
          "X-Resource-Name": `candidates/${c.id}`,
          "X-Schema-Version": "v1",
          "Connection": "keep-alive",
        },
      });
    }

    // Multiple candidates → JSON manifest, UUID-keyed pages
    const pages: Record<string, string> = {};
    for (const c of candidates) {
      pages[`${c.id}.html`] = buildPage(c, licMap[c.id] || [], certMap[c.id] || [], asgnMap[c.id] || [], noteMap[c.id] || []);
    }

    return new Response(JSON.stringify({
      schema_version: "v1",
      exported_at: new Date().toISOString(),
      count: Object.keys(pages).length,
      files: Object.keys(pages),
      pages,
    }), {
      headers: {
        "Content-Type": "application/json",
        "X-Document-Count": String(Object.keys(pages).length),
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
