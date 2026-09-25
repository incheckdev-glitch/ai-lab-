import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const [{ data: sources, error: sourceError }, { data: recent, error: recentError }] = await Promise.all([
      supabase
        .from("ai_report_sources")
        .select("id,client_name,location_name,report_date,source_filename,record_count")
        .order("client_name", { ascending: true })
        .order("location_name", { ascending: true })
        .order("report_date", { ascending: false }),
      supabase
        .from("ai_location_reports")
        .select("id,client_name,location_name,report_date,priority,management_attention,generated_at")
        .order("generated_at", { ascending: false })
        .limit(8),
    ]);

    if (sourceError) throw sourceError;
    if (recentError) throw recentError;

    return NextResponse.json({ sources: sources ?? [], recent: recent ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load report options";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
