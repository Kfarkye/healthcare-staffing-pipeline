/**
 * POST /api/data/assignments/stage
 *
 * Replaces useUpdateExtensionStage RPC call.
 * Calls bulk_update_extension_stage with the provided id and newStage.
 *
 * Body: { id: number, newStage: string }
 */

import { NextRequest } from "next/server";
import { db, json, error, safe } from "../../_shared";

export const POST = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { id, newStage } = body;

    if (!id || !newStage) {
        return error("Missing id or newStage", 400);
    }

    const { data, error: rpcError } = await db().rpc("bulk_update_extension_stage", {
        p_ids: [id],
        p_new_stage: newStage,
    });

    if (rpcError) {
        return error(rpcError.message, 502);
    }

    if (!Array.isArray(data) || data.length === 0) {
        return error(`No engagement found with ID ${id}`, 404);
    }

    return json({ success: true, data: data[0] });
});
