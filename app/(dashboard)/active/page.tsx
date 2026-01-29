import ActiveAssignmentsDashboard from '../../../src/components/ActiveAssignmentsDashboard';
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ActivePage() {
    // Validate env vars on the server to fail fast if missing
    await createServerSupabaseClient();

    return <ActiveAssignmentsDashboard />;
}
