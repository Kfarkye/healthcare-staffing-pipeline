/**
 * Import Working Candidates CSV to Supabase (Node.js version)
 * Usage: npx tsx supabase/scripts/import_working_csv_node.ts "/path/to/csv"
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || "https://hixjxztrblfjbwavyyph.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse date from MM/DD/YY or MM/DD/YYYY format
function parseDate(dateStr: string): string | null {
    if (!dateStr || dateStr === "12/31/69" || dateStr === "9/9/99") return null;
    try {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return null;
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        const month = parseInt(parts[0]).toString().padStart(2, "0");
        const day = parseInt(parts[1]).toString().padStart(2, "0");
        return `${year}-${month}-${day}`;
    } catch {
        return null;
    }
}

// Parse margin
function parseMargin(marginStr: string): number | null {
    if (!marginStr) return null;
    const parsed = parseInt(marginStr.replace(/,/g, ""), 10);
    return isNaN(parsed) ? null : parsed;
}

// Parse alerts
function parseAlerts(alertStr: string): boolean {
    return alertStr?.toLowerCase() === "yes";
}

// Simple CSV parser
function parseCSV(csvText: string): Record<string, string>[] {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const records: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const record: Record<string, string> = {};
        headers.forEach((header, idx) => {
            record[header] = (values[idx] || '').trim();
        });
        records.push(record);
    }

    return records;
}

async function main() {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.error("Usage: npx tsx import_working_csv_node.ts <path_to_csv>");
        process.exit(1);
    }

    console.log(`📂 Reading CSV: ${csvPath}`);
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const records = parseCSV(csvText);

    let travelCount = 0;
    let skippedCount = 0;
    const travelRows: any[] = [];

    for (const row of records) {
        const contractType = (row["Contract Type"] || "").trim();

        // Skip Per Diem
        if (contractType === "Per Diem") {
            skippedCount++;
            continue;
        }

        travelCount++;

        travelRows.push({
            candidate_id: parseInt(row["Id"], 10),
            candidate_name: row["Candidate Name"],
            email: row["Email"] || null,
            day_phone: row["Day Phone"] || null,
            evening_phone: row["Evening Phone"] || null,
            cell_phone: row["Cell Phone"] || null,
            start_date: parseDate(row["Start Date"]),
            end_date: parseDate(row["End Date"]),
            contract_status: row["Contract"] || null,
            facility: row["Facility"],
            margin: parseMargin(row["Margin"]),
            docs_due: parseDate(row["Docs Due"]),
            documents_missing: parseInt(row["Documents Missing"], 10) || 0,
            cleared_status: row["Cleared"] || null,
            first_day_info: row["First Day Info"] || null,
            benefits_date: parseDate(row["Benefits"]),
            recruiter: row["Recruiter"] || null,
            am_ac: row["AM/AC"] || null,
            cs: row["CS"] || null,
            cl: row["CL"] || null,
            alerts: parseAlerts(row["Alerts"]),
        });
    }

    console.log(`📊 Found ${travelCount} Travel candidates, skipped ${skippedCount} Per Diem.`);

    // Upsert in batches
    const BATCH_SIZE = 50;
    let upserted = 0;

    for (let i = 0; i < travelRows.length; i += BATCH_SIZE) {
        const batch = travelRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from("travel_candidates")
            .upsert(batch, { onConflict: "candidate_id, facility" });

        if (error) {
            console.error(`❌ Upsert error at batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
        } else {
            upserted += batch.length;
            console.log(`✅ Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(travelRows.length / BATCH_SIZE)}`);
        }
    }

    console.log(`\n🎉 Import complete. ${upserted}/${travelCount} Travel candidates loaded.`);
}

main();
