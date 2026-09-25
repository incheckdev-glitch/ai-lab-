import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/mode";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Demo runs are stored in this browser." }, { status: 404 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: run, error: runError } = await supabase
      .from("checklist_runs")
      .select("id,template_id,location_name,inspector_name,score,status,created_at,completed_at,checklist_templates(name,code,version)")
      .eq("id", id)
      .single();
    if (runError) throw runError;

    const { data: answers, error: answerError } = await supabase
      .from("checklist_answers")
      .select("id,question_id,value_json,photo_path,is_compliant,checklist_questions(code,question,section_id,checklist_sections(title)),ai_analysis(status,confidence,finding,recommendation,model)")
      .eq("run_id", id);
    if (answerError) throw answerError;

    const hydrated = await Promise.all((answers ?? []).map(async (answer) => {
      if (!answer.photo_path) return { ...answer, photo_url: null };
      const { data } = await supabase.storage.from("checklist-evidence").createSignedUrl(answer.photo_path, 3600);
      return { ...answer, photo_url: data?.signedUrl ?? null };
    }));

    return NextResponse.json({ run: { ...run, answers: hydrated }, mode: "supabase" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
}
