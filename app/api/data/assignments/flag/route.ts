/**
 * POST /api/data/assignments/flag
 *
 * Replaces useToggleAssignmentFlag RPC call.
 * Calls toggle_assignment_flag with the provided id, flagName, and flagValue.
 *
 * Body: { id: number, flagName: "looking" | "exiting", flagValue: boolean }
 */

import { NextRequest } from "next/server";
import { db, json, error, safe } from "../../_shared";

export const POST = safe(async (req: NextRequest) => {
    const body = await req.json();
    const { id, flagName, flagValue } = body;

    if (!id || !flagName || flagValue === undefined) {
        return error("Missing id, flagName, or flagValue", 400);
    }

    if (flagName !== "looking" && flagName !== "exiting") {
        return error("flagName must be 'looking' or 'exiting'", 400);
    }

    const { data, error: rpcError } = await db().rpc("toggle_assignment_flag", {
        p_id: id,
        p_flag_name: flagName,
        p_flag_value: flagValue,
    });

    if (rpcError) {
        return error(rpcError.message, 502);
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
        return error(`No assignment found with ID ${id}`, 404);
    }

    return json({ success: true, data: data[0] });
});
