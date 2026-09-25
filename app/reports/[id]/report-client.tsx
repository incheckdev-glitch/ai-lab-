"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoTemplate } from "@/lib/mock-data";
import type { SavedChecklistRun } from "@/lib/types";

type RealAnswer = {
  id: string;
  question_id: string;
  value_json: unknown;
  photo_url?: string | null;
  is_compliant: boolean | null;
  checklist_questions?: { code?: string; question?: string; section_id?: string; checklist_sections?: { title?: string } | null } | null;
  ai_analysis?: Array<{ status: string; confidence: number; finding: string; recommendation: string; model?: string }>;
};

type ViewAnswer = {
  questionId: string;
  code: string;
  question: string;
  section: string;
  value: unknown;
  photoUrl?: string | null;
  isCompliant: boolean | null;
  ai?: { status: string; confidence: number; finding: string; recommendation: string } | null;
};

type ReportView = {
  id: string;
  templateName: string;
  templateCode?: string;
  locationName: string;
  inspectorName: string;
  score: number;
  createdAt: string;
  answers: ViewAnswer[];
};

function valueLabel(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function ReportClient({ reportId }: { reportId: string }) {
  const id = reportId;
  const [report, setReport] = useState<ReportView | null>(null);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (!id) return;
    fetch(`/api/runs/${encodeURIComponent(id)}`)
      .then(async r => {
        if (r.ok) return { ok: true, data: await r.json() };
        return { ok: false, data: await r.json() };
      })
      .then(result => {
        if (result.ok) {
          const run = result.data.run;
          const templateMeta = Array.isArray(run.checklist_templates) ? run.checklist_templates[0] : run.checklist_templates;
          const answers: ViewAnswer[] = (run.answers as RealAnswer[]).map(a => {
            const qRaw = a.checklist_questions as unknown;
            const q = (Array.isArray(qRaw) ? qRaw[0] : qRaw) as RealAnswer["checklist_questions"];
            const sectionRaw = q?.checklist_sections as unknown;
            const section = (Array.isArray(sectionRaw) ? sectionRaw[0] : sectionRaw) as { title?: string } | undefined;
            return {
              questionId: a.question_id,
              code: q?.code || "—",
              question: q?.question || "Question",
              section: section?.title || "Checklist",
              value: a.value_json,
              photoUrl: a.photo_url,
              isCompliant: a.is_compliant,
              ai: a.ai_analysis?.[0] ?? null
            };
          });
          setReport({
            id: run.id,
            templateName: templateMeta?.name || "Checklist",
            templateCode: templateMeta?.code,
            locationName: run.location_name,
            inspectorName: run.inspector_name,
            score: run.score,
            createdAt: run.completed_at || run.created_at,
            answers
          });
          return;
        }

        const stored = localStorage.getItem(`incheck360-run-${id}`);
        if (!stored) throw new Error(result.data.error || "Report not found");
        const run = JSON.parse(stored) as SavedChecklistRun;
        const qMap = new Map(demoTemplate.sections.flatMap(s => s.questions.map(q => [q.id, { q, section: s.title }] as const)));
        setReport({
          id: run.id,
          templateName: run.template_name || demoTemplate.name,
          templateCode: demoTemplate.code,
          locationName: run.location_name,
          inspectorName: run.inspector_name,
          score: run.score,
          createdAt: run.created_at,
          answers: run.answers.map(a => {
            const meta = qMap.get(a.question_id);
            return {
              questionId: a.question_id,
              code: meta?.q.code || "—",
              question: meta?.q.question || "Question",
              section: meta?.section || "Checklist",
              value: a.value,
              photoUrl: a.photo_url,
              isCompliant: a.is_compliant,
              ai: a.ai ?? null
            };
          })
        });
      })
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load report"));
  }, [id]);

  const grouped = useMemo(() => {
    const map = new Map<string, ViewAnswer[]>();
    report?.answers.forEach(a => map.set(a.section, [...(map.get(a.section) ?? []), a]));
    return [...map.entries()];
  }, [report]);

  if (error) return <div className="panel error-box">{error}</div>;
  if (!report) return <div className="panel">Loading report…</div>;

  const compliant = report.answers.filter(a => a.isCompliant === true).length;
  const failed = report.answers.filter(a => a.isCompliant === false).length;
  const aiFindings = report.answers.filter(a => a.ai).length;

  return (
    <div className="stack-xl report-page">
      <section className="report-hero panel">
        <div><span className="eyebrow">INCheck 360 · AI CHECKLIST REPORT</span><h1>{report.templateName}</h1><p>{report.templateCode} · {new Date(report.createdAt).toLocaleString()}</p></div>
        <div className="big-score"><strong>{report.score}%</strong><span>Compliance</span></div>
      </section>

      <section className="report-meta grid-3">
        <div className="panel"><span>Location</span><strong>{report.locationName}</strong></div>
        <div className="panel"><span>Inspector</span><strong>{report.inspectorName}</strong></div>
        <div className="panel"><span>Run ID</span><strong className="mono">{report.id}</strong></div>
      </section>

      <section className="summary-strip">
        <div><strong>{compliant}</strong><span>Compliant</span></div>
        <div><strong>{failed}</strong><span>Non-compliant</span></div>
        <div><strong>{aiFindings}</strong><span>AI findings</span></div>
        <div><strong>{report.answers.length}</strong><span>Total items</span></div>
      </section>

      {grouped.map(([section, answers]) => (
        <section className="panel" key={section}>
          <div className="section-title"><div><span className="eyebrow">SECTION</span><h2>{section}</h2></div></div>
          <div className="report-items">
            {answers.map(a => (
              <article className="report-item" key={a.questionId}>
                <div className="report-item-main">
                  <div className="question-code">{a.code}</div>
                  <h3>{a.question}</h3>
                  <div className="answer-line"><span>Answer</span><strong>{valueLabel(a.value)}</strong></div>
                  {a.ai && <div className={`ai-result ${a.ai.status}`}><strong>AI: {a.ai.status.toUpperCase()} · {a.ai.confidence}%</strong><span>{a.ai.finding}</span><small>{a.ai.recommendation}</small></div>}
                </div>
                <div className="report-side">
                  <span className={a.isCompliant === true ? "status pass" : a.isCompliant === false ? "status fail" : "status neutral"}>{a.isCompliant === true ? "PASS" : a.isCompliant === false ? "FAIL" : "INFO"}</span>
                  {a.photoUrl && <img className="report-photo" src={a.photoUrl} alt="Checklist evidence" />}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="actions no-print"><Link className="button secondary" href="/">Back to dashboard</Link><button className="button primary" onClick={() => window.print()}>Print / Save PDF</button></div>
    </div>
  );
}
