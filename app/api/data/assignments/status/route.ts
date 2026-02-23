/**
 * POST /api/data/assignments/status
 *
 * Replaces useUpdateAssignmentStatus direct Supabase update.
 * Updates the status of an engagement.
 *
 * Body: { id: number, newStatus: string }
 */

import { NextRequest } from "next/server";
import { db, json, error, safe } from "../../_shared";

export const POST = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { id, newStatus } = body;

    if (!id || !newStatus) {
        return error("Missing id or newStatus", 400);
    }

    const validStatuses = ["Active", "Accepted", "Completed", "Cancelled"];
    if (!validStatuses.includes(newStatus)) {
        return error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
    }

    const { error: updateError } = await db()
        .from("engagements")
        .update({
            status: newStatus,
            ...(newStatus === "Accepted" ? { extension_stage: "signed" } : {}),
        })
        .eq("id", id);

    if (updateError) {
        return error(updateError.message, 502);
    }

    return json({ success: true });
});
