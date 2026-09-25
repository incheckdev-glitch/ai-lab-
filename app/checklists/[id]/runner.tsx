"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AiFinding, ChecklistTemplate, RunAnswer } from "@/lib/types";

function compliance(question: ChecklistTemplate["sections"][number]["questions"][number], value: RunAnswer["value"]) {
  if (value === null || value === "") return null;
  if (question.response_type === "yes_no") return value === true || value === "yes";
  if (question.response_type === "number") {
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    if (question.min_value !== null && n < question.min_value) return false;
    if (question.max_value !== null && n > question.max_value) return false;
    return true;
  }
  return null;
}

export default function ChecklistRunner({ checklistId }: { checklistId: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, RunAnswer>>({});
  const [locationName, setLocationName] = useState("Test Kitchen");
  const [inspectorName, setInspectorName] = useState("Demo Inspector");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/checklists?id=${encodeURIComponent(checklistId)}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error || "Unable to load checklist");
        return r.json();
      })
      .then(data => setTemplate(data.template))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [checklistId]);

  const allQuestions = useMemo(() => template?.sections.flatMap(s => s.questions) ?? [], [template]);
  const scored = allQuestions.map(q => compliance(q, answers[q.id]?.value ?? null)).filter(v => v !== null) as boolean[];
  const score = scored.length ? Math.round((scored.filter(Boolean).length / scored.length) * 100) : 0;

  function setValue(questionId: string, value: RunAnswer["value"]) {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        question_id: questionId,
        value,
        photo_url: prev[questionId]?.photo_url ?? null,
        is_compliant: null,
        ai: prev[questionId]?.ai ?? null
      }
    }));
  }

  async function setPhoto(questionId: string, file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Unable to read image"));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to open image"));
      img.src = source;
    });

    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is unavailable");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL("image/jpeg", 0.78);

    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        question_id: questionId,
        value: prev[questionId]?.value ?? null,
        photo_url: compressed,
        is_compliant: prev[questionId]?.is_compliant ?? null,
        ai: prev[questionId]?.ai ?? null
      }
    }));
  }

  async function analyze(q: ChecklistTemplate["sections"][number]["questions"][number]) {
    const existing = answers[q.id];
    const response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: q.question,
        answer: existing?.value ?? null,
        instruction: q.ai_instruction,
        image: existing?.photo_url ?? null
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AI analysis failed");
    setAnswers(prev => ({
      ...prev,
      [q.id]: {
        question_id: q.id,
        value: prev[q.id]?.value ?? null,
        photo_url: prev[q.id]?.photo_url ?? null,
        is_compliant: prev[q.id]?.is_compliant ?? null,
        ai: data.finding as AiFinding
      }
    }));
  }

  async function submit() {
    if (!template) return;
    setSaving(true);
    setError(null);
    try {
      const normalized: RunAnswer[] = allQuestions.map(q => ({
        question_id: q.id,
        value: answers[q.id]?.value ?? null,
        photo_url: answers[q.id]?.photo_url ?? null,
        is_compliant: compliance(q, answers[q.id]?.value ?? null),
        ai: answers[q.id]?.ai ?? null
      }));

      const requiredMissing = allQuestions.some(q => q.required && (answers[q.id]?.value === undefined || answers[q.id]?.value === null || answers[q.id]?.value === ""));
      const evidenceMissing = allQuestions.some(q => q.requires_photo && !answers[q.id]?.photo_url);
      if (requiredMissing) throw new Error("Complete all required questions before submitting.");
      if (evidenceMissing) throw new Error("Add the required photo evidence before submitting.");

      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          template_name: template.name,
          location_name: locationName,
          inspector_name: inspectorName,
          answers: normalized,
          score
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save run");
      if (data.mode === "demo") {
        localStorage.setItem(`incheck360-run-${data.id}`, JSON.stringify({
          id: data.id,
          created_at: new Date().toISOString(),
          template_id: template.id,
          template_name: template.name,
          location_name: locationName,
          inspector_name: inspectorName,
          answers: normalized,
          score
        }));
      }
      router.push(`/reports/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="panel">Loading checklist…</div>;
  if (error && !template) return <div className="panel error-box">{error}</div>;
  if (!template) return <div className="panel">Checklist not found.</div>;

  return (
    <div className="stack-xl">
      <section className="page-heading">
        <div><span className="eyebrow">CHECKLIST TEST</span><h1>{template.name}</h1><p>{template.code} · Version {template.version}</p></div>
        <div className="score-card"><span>Live score</span><strong>{score}%</strong></div>
      </section>

      <section className="panel form-grid">
        <label>Location<input value={locationName} onChange={e => setLocationName(e.target.value)} /></label>
        <label>Inspector<input value={inspectorName} onChange={e => setInspectorName(e.target.value)} /></label>
      </section>

      {template.sections.map(section => (
        <section className="panel" key={section.id}>
          <div className="section-title"><div><span className="eyebrow">SECTION {section.sort_order}</span><h2>{section.title}</h2><p>{section.description}</p></div></div>
          <div className="questions">
            {section.questions.map(q => {
              const a = answers[q.id];
              return (
                <div className="question" key={q.id}>
                  <div className="question-head">
                    <div><span className="question-code">{q.code}</span><h3>{q.question}</h3></div>
                    <div className="badges">{q.required && <span>Required</span>}{q.critical && <span className="danger">Critical</span>}{q.ai_enabled && <span className="ai">AI</span>}</div>
                  </div>

                  {q.response_type === "yes_no" && (
                    <div className="choice-row">
                      <button type="button" className={a?.value === true ? "choice selected" : "choice"} onClick={() => setValue(q.id, true)}>Yes</button>
                      <button type="button" className={a?.value === false ? "choice selected negative" : "choice"} onClick={() => setValue(q.id, false)}>No</button>
                    </div>
                  )}
                  {q.response_type === "number" && (
                    <div className="number-wrap"><input type="number" step="0.1" value={a?.value === undefined || a?.value === null ? "" : String(a.value)} onChange={e => setValue(q.id, e.target.value === "" ? null : Number(e.target.value))} /><span>{q.unit}</span><small>Accepted: {q.min_value} – {q.max_value} {q.unit}</small></div>
                  )}
                  {q.response_type === "text" && <textarea rows={3} value={typeof a?.value === "string" ? a.value : ""} onChange={e => setValue(q.id, e.target.value)} placeholder="Enter observation…" />}
                  {(q.response_type === "photo" || q.requires_photo) && (
                    <div className="photo-row"><label className="upload">Add photo<input hidden type="file" accept="image/*" capture="environment" onChange={e => setPhoto(q.id, e.target.files?.[0])} /></label>{a?.photo_url && <img className="thumb" src={a.photo_url} alt="Evidence preview" />}</div>
                  )}
                  {q.ai_enabled && (
                    <div className="ai-row">
                      <button type="button" className="button small secondary" onClick={() => analyze(q)}>Run AI test</button>
                      {a?.ai && <div className={`ai-result ${a.ai.status}`}><strong>{a.ai.status.toUpperCase()} · {a.ai.confidence}%</strong><span>{a.ai.finding}</span><small>{a.ai.recommendation}</small></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {error && <div className="error-box">{error}</div>}
      <div className="submit-bar"><div><strong>Ready to generate report?</strong><span>The result will be stored in Supabase when configured, otherwise locally for demo.</span></div><button className="button primary" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Complete checklist"}</button></div>
    </div>
  );
}
