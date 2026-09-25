import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CHUNK_EXTRACTION_PROMPT, LOCATION_REPORT_ANALYST_PROMPT } from "@/lib/report-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ReportRecord = {
  checklist_title: string;
  display_at_text: string | null;
  due_at_text: string | null;
  expiry_at_text: string | null;
  completion_at_text: string | null;
  submitted_by: string | null;
  instance_status: string | null;
  start_page: number;
  end_page: number;
  raw_text: string;
};

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(text: string) {
  // Conservative estimate for mixed checklist/table text.
  return Math.ceil(text.length / 3.3);
}

async function callOpenAI(instructions: string, inputText: string, maxOutputTokens = 3500) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured in Vercel.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        instructions,
        input: inputText,
        reasoning: { effort: "low" },
        max_output_tokens: maxOutputTokens,
      }),
    });

    const payload = await response.json();

    if (response.ok) {
      const text = extractOutputText(payload);
      if (!text) throw new Error("OpenAI returned an empty report.");
      return text;
    }

    console.error("OpenAI response error", payload);

    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after") || "0");
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 20_000);
      continue;
    }

    throw new Error(payload?.error?.message || "OpenAI analysis request failed.");
  }

  throw new Error("OpenAI analysis request failed after retries.");
}

function recordBlock(record: ReportRecord, index: number) {
  return [
    `--- DATABASE RECORD ${index + 1} ---`,
    `Checklist title: ${record.checklist_title}`,
    `Displayed date/time: ${record.display_at_text || "not supplied"}`,
    `Due date/time: ${record.due_at_text || "not supplied"}`,
    `Expiry date/time: ${record.expiry_at_text || "not supplied"}`,
    `Completion date/time: ${record.completion_at_text || "not supplied"}`,
    `Submitted by: ${record.submitted_by || "not supplied"}`,
    `Instance status: ${record.instance_status || "not supplied"}`,
    `PDF page${record.start_page === record.end_page ? "" : "s"}: ${record.start_page}${record.start_page === record.end_page ? "" : `-${record.end_page}`}`,
    "Extracted report text:",
    record.raw_text,
  ].join("\n");
}

function chunkBlocks(blocks: string[], maxChars = 320_000) {
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current);
      current = block;
    } else {
      current += `${current ? "\n\n" : ""}${block}`;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function pickEnum(summary: string, label: string, allowed: string[], fallback: string) {
  const match = summary.match(new RegExp(`${label}:\\s*([^\\n\\r]+)`, "i"));
  if (!match) return fallback;
  const value = match[1].trim().toUpperCase();
  return allowed.includes(value) ? value : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client = String(body?.client || "").trim();
    const location = String(body?.location || "").trim();
    const reportDate = String(body?.reportDate || "").trim();

    if (!client || !location || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return NextResponse.json({ error: "Client, location and reporting date are required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: sources, error: sourceError } = await supabase
      .from("ai_report_sources")
      .select("id,client_name,location_name,report_date,source_filename")
      .eq("client_name", client)
      .eq("location_name", location)
      .eq("report_date", reportDate);

    if (sourceError) throw sourceError;
    if (!sources?.length) {
      return NextResponse.json({ error: "No Supabase report data was found for that client, location and date." }, { status: 404 });
    }

    const sourceIds = sources.map((source) => source.id);
    const { data: records, error: recordError } = await supabase
      .from("ai_report_records")
      .select("checklist_title,display_at_text,due_at_text,expiry_at_text,completion_at_text,submitted_by,instance_status,start_page,end_page,raw_text")
      .in("source_id", sourceIds)
      .order("start_page", { ascending: true });

    if (recordError) throw recordError;
    if (!records?.length) {
      return NextResponse.json({ error: "The source exists, but it has no checklist records." }, { status: 404 });
    }

    // Reports can contain duplicate "SL - ..." / "SL-..." checklist instances.
    // Keep them stored for source fidelity, but never send them to the AI analyst.
    const allRecords = records as ReportRecord[];
    const nonSlRecords = allRecords.filter(
      (record) => !/^SL\s*-\s*/i.test(record.checklist_title.trim()),
    );
    const ignoredSlDuplicates = allRecords.length - nonSlRecords.length;

    const analysisRecords = nonSlRecords;

    if (!analysisRecords.length) {
      return NextResponse.json(
        { error: "All matching records were SL-prefixed duplicates and were excluded from analysis." },
        { status: 404 },
      );
    }

    const reviewedTitles = Array.from(
      new Set(analysisRecords.map((record) => record.checklist_title.trim())),
    );

    const contextHeader = [
      "EXPLICIT REPORT REQUEST",
      `Client: ${client}`,
      `Location: ${location}`,
      `Requested reporting date: ${reportDate}`,
      `Source file(s): ${sources.map((source) => source.source_filename).join(", ")}`,
      `Exported checklist entries supplied for review after SL-duplicate exclusion: ${analysisRecords.length}`,
      `Distinct checklist titles supplied: ${reviewedTitles.length}`,
      `Checklist titles in scope: ${reviewedTitles.join(" | ")}`,
      "The database records below were extracted from the original report. [PDF PAGE N] markers are source page references.",
      "Review the complete supplied scope before finalizing. Include incomplete/late records when relevant under the analyst instructions.",
    ].join("\n");

    const blocks = analysisRecords.map(recordBlock);
    const chunks = chunkBlocks(blocks);
    let summary: string;

    if (chunks.length === 1) {
      summary = await callOpenAI(
        LOCATION_REPORT_ANALYST_PROMPT,
        `${contextHeader}\n\n${chunks[0]}`,
        3500,
      );
    } else {
      // Large reports (for example BOS CPU) can exceed the model's TPM limit if
      // chunk calls are launched together. Process chunks sequentially and pace
      // request starts to stay comfortably below the 500k TPM organization cap.
      const candidateNotes: string[] = [];
      const targetTpm = 350_000;

      for (let index = 0; index < chunks.length; index++) {
        const chunkInput = `${contextHeader}\nEvidence chunk ${index + 1} of ${chunks.length}.\n\n${chunks[index]}`;
        const requestStartedAt = Date.now();

        const note = await callOpenAI(
          CHUNK_EXTRACTION_PROMPT,
          chunkInput,
          3000,
        );
        candidateNotes.push(note);

        if (index < chunks.length - 1) {
          const estimatedRequestTokens = estimateTokens(chunkInput) + 3000;
          const targetSpacingMs = Math.ceil((estimatedRequestTokens / targetTpm) * 60_000);
          const elapsedMs = Date.now() - requestStartedAt;
          if (elapsedMs < targetSpacingMs) {
            await sleep(targetSpacingMs - elapsedMs);
          }
        }
      }

      summary = await callOpenAI(
        LOCATION_REPORT_ANALYST_PROMPT,
        [
          contextHeader,
          "The full source was too large for one request. The following issue-evidence notes were extracted from disjoint source chunks. Cross-check the notes against each other for hidden contradictions, repeated issues and conflicting standards. Preserve only supported facts and references.",
          ...candidateNotes.map((note, index) => `\n--- SOURCE CHUNK ${index + 1} ISSUE EVIDENCE ---\n${note}`),
        ].join("\n\n"),
        3500,
      );
    }

    const priority =
      pickEnum(summary, "Provisional risk", ["LOW", "MEDIUM", "HIGH", "NOT ASSESSED"], "NOT ASSESSED") !== "NOT ASSESSED"
        ? pickEnum(summary, "Provisional risk", ["LOW", "MEDIUM", "HIGH", "NOT ASSESSED"], "NOT ASSESSED")
        : pickEnum(summary, "Priority", ["LOW", "MEDIUM", "HIGH", "NOT ASSESSED"], "NOT ASSESSED");

    const newAttention = pickEnum(
      summary,
      "Needs attention",
      ["YES", "NO IDENTIFIED NEED", "UNABLE TO DETERMINE"],
      "UNABLE TO DETERMINE",
    );
    const managementAttention =
      newAttention !== "UNABLE TO DETERMINE"
        ? newAttention
        : pickEnum(
            summary,
            "Management attention",
            ["YES", "NO IDENTIFIED NEED", "UNABLE TO DETERMINE"],
            "UNABLE TO DETERMINE",
          );
    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

    const { data: saved, error: saveError } = await supabase
      .from("ai_location_reports")
      .insert({
        client_name: client,
        location_name: location,
        report_date: reportDate,
        summary,
        priority,
        management_attention: managementAttention,
        model,
        record_count: analysisRecords.length,
        source_ids: sourceIds,
      })
      .select("id,generated_at")
      .single();

    if (saveError) throw saveError;

    return NextResponse.json({
      summary,
      priority,
      managementAttention,
      model,
      recordCount: analysisRecords.length,
      ignoredSlDuplicates,
      chunkCount: chunks.length,
      reportId: saved?.id,
      generatedAt: saved?.generated_at,
    });
  } catch (error) {
    console.error("Location report generation failed", error);
    const message = error instanceof Error ? error.message : "Location report generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
