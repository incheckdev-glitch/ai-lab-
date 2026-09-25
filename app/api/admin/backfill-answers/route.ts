import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ADMIN_TOKEN = "eOLQIiE9ThserlN4ZJIsLNQBcqDtLPFUYfIwznBmo8Q";
const PARSER_VERSION = "fixed-width-v2";

const isoRe = /20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const pageRe = /^\[PDF PAGE (\d+)\]\s*$/gm;

function splitPages(raw: string) {
  const matches = Array.from(raw.matchAll(pageRe));
  if (!matches.length) return [{ page: null as number | null, text: raw }];
  return matches.map((m, i) => ({
    page: Number(m[1]),
    text: raw.slice(
      (m.index ?? 0) + m[0].length,
      i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length,
    ),
  }));
}

function mode(values: number[]) {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function clean(parts: string[]) {
  const out: string[] = [];
  const noise = new Set(["TOTAL", "SCORE", "PERCENTAGE", "COMPLETED", "BY", "SCORE PERCENTAGE"]);
  for (let value of parts) {
    value = value.replace(/\s+/g, " ").trim();
    if (!value || noise.has(value)) continue;
    if (!out.length || out[out.length - 1] !== value) out.push(value);
  }
  return out.join(" ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

function stripSubmitter(answer: string, submitter: string | null) {
  if (!answer || !submitter) return answer.trim();
  let value = answer.replace(new RegExp("\\b" + escapeRegex(submitter) + "\\b", "gi"), " ");
  for (const token of submitter.split(/\s+/).filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) {
    value = value.replace(new RegExp("\\b" + escapeRegex(token) + "\\b", "gi"), " ");
  }
  return value.replace(/\s+/g, " ").trim();
}

function parseNumeric(question: string, answer: string) {
  if (/\bdate\b/i.test(question)) return { numeric_value: null, unit: null };
  const match = answer.match(
    /(?<![\w.])(-?\d+(?:\.\d+)?)\s*(Degree\s*Celsius|Celsius|°C|°c|kg|Kilograms?|grams?|g|AED|%|PPM)?/i,
  );
  if (!match) return { numeric_value: null, unit: null };
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return { numeric_value: null, unit: null };
  let unit = match[2] ?? null;
  if (unit && /^Degree\s*Celsius$/i.test(unit)) unit = "°C";
  return { numeric_value: numeric, unit };
}

function parseRecord(raw: string, submitter: string | null) {
  const answers: Array<Record<string, unknown>> = [];
  let ordinal = 0;

  for (const page of splitPages(raw)) {
    const lines = page.text.split(/\r?\n/);
    let headerIndex = -1;
    let header = "";

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("ITEM") && lines[i].includes("RESULT") && lines[i].includes("COMPLETION TIME")) {
        headerIndex = i;
        header = lines[i];
        break;
      }
    }

    if (headerIndex < 0) continue;

    const resultHeader = header.indexOf("RESULT");
    let scorePos = header.indexOf("SCORE", resultHeader + 1);
    const tagsPos = header.indexOf("TAGS");
    const body = lines.slice(headerIndex + 1);

    const candidateStarts: number[] = [];
    for (const line of body) {
      if (!line.includes("--") || !/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(line)) continue;
      const pre = line.split("--", 1)[0].replace(/\s+$/, "");
      const pieces = pre.trim().split(/\s{2,}/);
      if (!pieces.length) continue;
      const last = pieces[pieces.length - 1];
      const pos = pre.lastIndexOf(last);
      if (pos >= 8) candidateStarts.push(pos);
    }

    const resultStart = mode(candidateStarts);
    if (resultStart === null) continue;

    if (scorePos <= resultStart) {
      const dashes = body
        .map((line) => line.indexOf("--"))
        .filter((pos) => pos > resultStart)
        .sort((a, b) => a - b);
      scorePos = dashes.length ? dashes[Math.floor(dashes.length / 2)] : resultStart + 34;
    }

    const blocks: string[][] = [];
    let current: string[] = [];
    for (const line of body) {
      if (!line.trim()) {
        if (current.length) {
          blocks.push(current);
          current = [];
        }
      } else {
        current.push(line);
      }
    }
    if (current.length) blocks.push(current);

    for (const block of blocks) {
      const joined = block.join("\n");
      const times = Array.from(joined.matchAll(isoRe)).map((m) => m[0]);
      isoRe.lastIndex = 0;
      if (!times.length) continue;

      const qParts: string[] = [];
      const aParts: string[] = [];
      const tagParts: string[] = [];

      for (const line of block) {
        let left = line.length > scorePos ? line.slice(0, scorePos) : line;
        if (left.includes("--")) left = left.split("--", 1)[0];

        const question = left.slice(0, resultStart).trim();
        const answer = left.length > resultStart ? left.slice(resultStart).trim() : "";

        if (question) qParts.push(question);
        if (answer && answer !== "--") aParts.push(answer);

        const timeMatch = line.match(/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
        if (timeMatch && tagsPos >= 0 && line.length > tagsPos) {
          const tail = line.slice(tagsPos).trim();
          if (tail && tail !== "--") tagParts.push(tail);
        }
      }

      const questionText = clean(qParts);
      if (!questionText) continue;

      const answerText = stripSubmitter(clean(aParts), submitter);
      const parsed = parseNumeric(questionText, answerText);
      ordinal += 1;

      answers.push({
        ordinal,
        section_title: null,
        question_text: questionText,
        answer_text: answerText || null,
        answer_json: { parser_version: PARSER_VERSION },
        numeric_value: parsed.numeric_value,
        unit: parsed.unit,
        tag: clean(tagParts) || null,
        completed_by: submitter,
        completion_time_text: times[0],
        source_page: page.page,
        evidence_text: joined,
        is_blank: !answerText || answerText === "--",
        is_compliant: null,
      });
    }
  }

  return answers;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "40"), 1), 60);
  const supabase = getSupabaseAdmin();

  const { data: runs, error: runError } = await supabase
    .from("ai_checklist_runs")
    .select("id,source_record_id,submitted_by")
    .eq("extraction_status", "pending")
    .limit(limit);

  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  let processed = 0;
  let answersInserted = 0;
  const failures: Array<{ runId: string; error: string }> = [];

  for (const run of runs ?? []) {
    try {
      await supabase
        .from("ai_checklist_runs")
        .update({ extraction_status: "processing", extraction_error: null })
        .eq("id", run.id);

      const { data: record, error: recordError } = await supabase
        .from("ai_report_records")
        .select("raw_text")
        .eq("id", run.source_record_id)
        .single();

      if (recordError) throw recordError;

      const answers = parseRecord(record.raw_text, run.submitted_by);

      const { error: deleteError } = await supabase
        .from("ai_checklist_answers")
        .delete()
        .eq("run_id", run.id);
      if (deleteError) throw deleteError;

      for (let i = 0; i < answers.length; i += 250) {
        const rows = answers.slice(i, i + 250).map((answer) => ({
          ...answer,
          run_id: run.id,
          source_record_id: run.source_record_id,
        }));

        const { error: insertError } = await supabase.from("ai_checklist_answers").insert(rows);
        if (insertError) throw insertError;
      }

      const { error: updateError } = await supabase
        .from("ai_checklist_runs")
        .update({
          extraction_status: "completed",
          extracted_answer_count: answers.length,
          parser_version: PARSER_VERSION,
          extracted_at: new Date().toISOString(),
          extraction_error: null,
        })
        .eq("id", run.id);
      if (updateError) throw updateError;

      processed += 1;
      answersInserted += answers.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ runId: run.id, error: message });
      await supabase
        .from("ai_checklist_runs")
        .update({
          extraction_status: "failed",
          extraction_error: message.slice(0, 2000),
          parser_version: PARSER_VERSION,
          extracted_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
  }

  const [{ count: pending }, { count: completed }, { count: failed }] = await Promise.all([
    supabase.from("ai_checklist_runs").select("id", { count: "exact", head: true }).eq("extraction_status", "pending"),
    supabase.from("ai_checklist_runs").select("id", { count: "exact", head: true }).eq("extraction_status", "completed"),
    supabase.from("ai_checklist_runs").select("id", { count: "exact", head: true }).eq("extraction_status", "failed"),
  ]);

  return NextResponse.json({
    parserVersion: PARSER_VERSION,
    processed,
    answersInserted,
    failures,
    pending,
    completed,
    failed,
  });
}
