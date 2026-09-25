import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { hasSupabaseConfig } from "@/lib/mode";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ChecklistRunPayload, RunAnswer } from "@/lib/types";

async function uploadDataUrl(supabase: ReturnType<typeof getSupabaseAdmin>, dataUrl: string, runId: string, questionId: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return dataUrl;
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${runId}/${questionId}-${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("checklist-evidence").upload(path, buffer, { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = body as ChecklistRunPayload & { template_name?: string };
    if (!payload.template_id || !payload.location_name || !payload.inspector_name || !Array.isArray(payload.answers)) {
      return NextResponse.json({ error: "Missing checklist run fields" }, { status: 400 });
    }

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ id: `demo-${randomUUID()}`, mode: "demo" });
    }

    const supabase = getSupabaseAdmin();
    const runId = randomUUID();
    const { error: runError } = await supabase.from("checklist_runs").insert({
      id: runId,
      template_id: payload.template_id,
      location_name: payload.location_name,
      inspector_name: payload.inspector_name,
      score: payload.score,
      status: "completed",
      completed_at: new Date().toISOString()
    });
    if (runError) throw runError;

    for (const answer of payload.answers as RunAnswer[]) {
      const photoPath = answer.photo_url?.startsWith("data:image/")
        ? await uploadDataUrl(supabase, answer.photo_url, runId, answer.question_id)
        : answer.photo_url ?? null;

      const answerId = randomUUID();
      const { error: answerError } = await supabase.from("checklist_answers").insert({
        id: answerId,
        run_id: runId,
        question_id: answer.question_id,
        value_json: answer.value,
        photo_path: photoPath,
        is_compliant: answer.is_compliant
      });
      if (answerError) throw answerError;

      if (answer.ai) {
        const { error: aiError } = await supabase.from("ai_analysis").insert({
          run_id: runId,
          answer_id: answerId,
          question_id: answer.question_id,
          status: answer.ai.status,
          confidence: answer.ai.confidence,
          finding: answer.ai.finding,
          recommendation: answer.ai.recommendation,
          model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || "gpt-5.6-luna") : "demo"
        });
        if (aiError) throw aiError;
      }
    }

    return NextResponse.json({ id: runId, mode: "supabase" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to save checklist run" }, { status: 500 });
  }
}
