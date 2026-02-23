/**
 * POST /api/v1/prospects/search
 *
 * Strict-filter search. No freeform queries.
 * The LLM calls this through the search_prospects tool.
 *
 * Accepts:
 *   - specialty: string[]
 *   - status: string[]
 *   - stale_after_days: number
 *   - updated_after / updated_before: ISO datetime
 *   - name: string (ILIKE)
 *   - limit: number (max 100, default 20)
 *   - cursor: number (keyset pagination)
 *
 * Rejects unknown fields and wrong types at the boundary.
 */

import { NextRequest } from "next/server";
import { json, error, safe } from "../../../data/_shared";
import { SearchFiltersSchema } from "../schemas";
import { searchProspects } from "../service";

export const dynamic = "force-dynamic";

export const POST = safe(async (req: NextRequest) => {
  const body = await req.json();

  // Strict schema validation at the boundary
  const parsed = SearchFiltersSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    return error(`Invalid search filters: ${issues.join("; ")}`, 400);
  }

  const result = await searchProspects(parsed.data);

  if (result.error) {
    return error(result.error, 502);
  }

  return json(result.data);
});
