import { NextRequest, NextResponse } from "next/server";
import type { AiFinding } from "@/lib/types";

function mockFinding(answer: unknown): AiFinding {
  const failed = answer === false || answer === "no";
  return {
    status: failed ? "fail" : answer === null || answer === "" ? "review" : "pass",
    confidence: failed ? 96 : 91,
    finding: failed
      ? "The submitted response indicates a non-compliant condition that requires follow-up."
      : answer === null || answer === ""
        ? "Not enough evidence was supplied for a reliable decision."
        : "No obvious issue was identified from the supplied test response.",
    recommendation: failed
      ? "Assign a corrective action, resolve the condition and verify closure."
      : "Keep the evidence with the checklist record and verify again if conditions change."
  };
}

function parseFinding(text: string): AiFinding | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!["pass", "fail", "review"].includes(parsed.status)) return null;
    return {
      status: parsed.status,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      finding: String(parsed.finding || ""),
      recommendation: String(parsed.recommendation || "")
    };
  } catch {
    return null;
  }
}

function extractText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, answer, instruction, image } = body;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ finding: mockFinding(answer), mode: "demo" });
    }

    const content: Array<Record<string, unknown>> = [
      {
        type: "input_text",
        text: [
          "You are the InCheck 360 checklist analysis test service.",
          "Return ONLY valid JSON with exactly: status (pass|fail|review), confidence (0-100 integer), finding (short), recommendation (short).",
          `Question: ${question}`,
          `Submitted answer: ${JSON.stringify(answer)}`,
          instruction ? `Checklist-specific instruction: ${instruction}` : ""
        ].filter(Boolean).join("\n")
      }
    ];

    if (typeof image === "string" && image.startsWith("data:image/")) {
      content.push({ type: "input_image", image_url: image, detail: "auto" });
    }

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        input: [{ role: "user", content }]
      })
    });

    const payload = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error("OpenAI error", payload);
      return NextResponse.json({ error: "AI provider request failed" }, { status: 502 });
    }

    const text = extractText(payload);
    const finding = parseFinding(text) ?? {
      status: "review",
      confidence: 0,
      finding: text.slice(0, 500) || "AI returned an unreadable result.",
      recommendation: "Review this item manually."
    };

    return NextResponse.json({ finding, mode: "openai" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
