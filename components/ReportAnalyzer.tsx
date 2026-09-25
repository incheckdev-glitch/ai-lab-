"use client";

import { useEffect, useMemo, useState } from "react";

type SourceOption = {
  id: string;
  client_name: string;
  location_name: string;
  report_date: string;
  source_filename: string;
  record_count: number;
};

type RecentReport = {
  id: string;
  client_name: string;
  location_name: string;
  report_date: string;
  summary?: string;
  priority: string;
  management_attention: string;
  model?: string;
  record_count?: number;
  generated_at: string;
};


function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function ReportDocument({ summary }: { summary: string }) {
  const lines = summary.replace(/\r/g, "").split("\n");
  const detailLabels = new Set([
    "Client",
    "Location",
    "Reporting date",
    "Scope",
    "Provisional risk",
    "Needs attention",
    "Report accuracy",
  ]);

  const details: Array<{ label: string; value: string }> = [];
  const contentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match && detailLabels.has(match[1].trim())) {
      details.push({ label: match[1].trim(), value: match[2].trim() });
    } else {
      contentLines.push(line);
    }
  }

  let currentSection = "";
  const rendered = contentLines.map((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return <div className="report-spacer" key={index} />;

    if (line.startsWith("# ")) {
      return <h1 className="document-title" key={index}>{line.slice(2)}</h1>;
    }

    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
      return <h2 className="document-section-title" key={index}>{currentSection}</h2>;
    }

    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      const isIssue = currentSection === "Material issues found" || currentSection === "Top issues";
      return (
        <div className={isIssue ? "report-numbered-item report-issue-item" : "report-numbered-item"} key={index}>
          <span className="report-number">{numbered[1]}</span>
          <div>{renderInlineMarkdown(numbered[2])}</div>
        </div>
      );
    }

    if (line.startsWith("- ")) {
      const referenceItem = currentSection === "References";
      return (
        <div className={referenceItem ? "report-bullet-item report-reference-item" : "report-bullet-item"} key={index}>
          <span className="report-bullet">•</span>
          <div>{renderInlineMarkdown(line.slice(2))}</div>
        </div>
      );
    }

    return <p className="report-paragraph" key={index}>{renderInlineMarkdown(line)}</p>;
  });

  return (
    <article className="report-document">
      <div className="document-brand-row">
        <div className="document-brand-mark">I360</div>
        <div>
          <div className="document-brand-name">InCheck 360</div>
          <div className="document-brand-subtitle">AI Location Issue Report</div>
        </div>
      </div>

      {rendered.find((node) => node && typeof node === "object")}

      {details.length > 0 && (
        <div className="report-detail-grid">
          {details.map((item) => {
            const important = item.label === "Provisional risk" || item.label === "Needs attention";
            return (
              <div className={item.label === "Scope" || item.label === "Report accuracy" ? "report-detail full" : "report-detail"} key={item.label}>
                <span>{item.label}</span>
                <strong className={important ? "report-detail-value emphasized" : "report-detail-value"}>{item.value}</strong>
              </div>
            );
          })}
        </div>
      )}

      <div className="report-content">
        {rendered.filter((_, index) => {
          const line = contentLines[index]?.trim() || "";
          return !line.startsWith("# ");
        })}
      </div>
    </article>
  );
}

export default function ReportAnalyzer() {
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [recent, setRecent] = useState<RecentReport[]>([]);
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [summary, setSummary] = useState("");
  const [meta, setMeta] = useState<{ model?: string; recordCount?: number; generatedAt?: string; chunkCount?: number }>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/report-options", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load report data");
        return payload;
      })
      .then((payload) => {
        const loaded = (payload.sources || []) as SourceOption[];
        setSources(loaded);
        setRecent((payload.recent || []) as RecentReport[]);
        if (loaded[0]) {
          setClient(loaded[0].client_name);
          setLocation(loaded[0].location_name);
          setReportDate(loaded[0].report_date);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const clients = useMemo(() => Array.from(new Set(sources.map((source) => source.client_name))), [sources]);
  const locations = useMemo(
    () => Array.from(new Set(sources.filter((source) => source.client_name === client).map((source) => source.location_name))),
    [sources, client],
  );
  const dates = useMemo(
    () => Array.from(new Set(sources.filter((source) => source.client_name === client && source.location_name === location).map((source) => source.report_date))).sort().reverse(),
    [sources, client, location],
  );

  function onClientChange(value: string) {
    setClient(value);
    const first = sources.find((source) => source.client_name === value);
    setLocation(first?.location_name || "");
    setReportDate(first?.report_date || "");
    setSummary("");
  }

  function onLocationChange(value: string) {
    setLocation(value);
    const first = sources.find((source) => source.client_name === client && source.location_name === value);
    setReportDate(first?.report_date || "");
    setSummary("");
  }

  async function generateReport() {
    setGenerating(true);
    setError("");
    setSummary("");
    setMeta({});
    try {
      const response = await fetch("/api/location-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, location, reportDate }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to generate AI report");
      setSummary(payload.summary || "");
      setMeta({
        model: payload.model,
        recordCount: payload.recordCount,
        generatedAt: payload.generatedAt,
        chunkCount: payload.chunkCount,
      });
      setRecent((items) => [
        {
          id: payload.reportId || String(Date.now()),
          client_name: client,
          location_name: location,
          report_date: reportDate,
          summary: payload.summary || "",
          priority: payload.priority,
          management_attention: payload.managementAttention,
          model: payload.model,
          record_count: payload.recordCount,
          generated_at: payload.generatedAt || new Date().toISOString(),
        },
        ...items,
      ].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate AI report");
    } finally {
      setGenerating(false);
    }
  }

  function openSavedReport(item: RecentReport) {
    setClient(item.client_name);
    setLocation(item.location_name);
    setReportDate(item.report_date);
    setSummary(item.summary || "");
    setMeta({
      model: item.model,
      recordCount: item.record_count,
      generatedAt: item.generated_at,
    });
    setError("");
    window.scrollTo({ top: 250, behavior: "smooth" });
  }

  async function copyReport() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="analyzer-layout">
      <section className="panel analyzer-card">
        <div className="section-kicker">DATABASE REPORT CHECK</div>
        <h1>AI Location Report</h1>
        <p className="lead">
          Select a client, location and reporting date. The analyzer reads the stored checklist report records from Supabase and returns only substantive QA, food-safety, hygiene, equipment, traceability and control issues that need attention.
        </p>

        {loading ? (
          <div className="status-box">Loading Supabase report data…</div>
        ) : sources.length === 0 && !error ? (
          <div className="status-box warning">No report source data is available in Supabase yet.</div>
        ) : (
          <div className="selector-grid">
            <label>
              <span>Client</span>
              <select value={client} onChange={(event) => onClientChange(event.target.value)}>
                {clients.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Location</span>
              <select value={location} onChange={(event) => onLocationChange(event.target.value)}>
                {locations.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Reporting date</span>
              <select value={reportDate} onChange={(event) => setReportDate(event.target.value)}>
                {dates.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button className="button primary generate" disabled={!client || !location || !reportDate || generating} onClick={generateReport}>
              {generating ? "Analyzing checklist data…" : "Generate AI Report"}
            </button>
          </div>
        )}

        {error && <div className="status-box error">{error}</div>}
      </section>

      <section className="panel report-card">
        <div className="report-head">
          <div>
            <div className="section-kicker">DAILY LOCATION ISSUE REPORT</div>
            <h2>{summary ? location : "Ready for analysis"}</h2>
          </div>
          {summary && (
            <div className="report-actions no-print">
              <button className="button secondary small" onClick={copyReport}>{copied ? "Copied" : "Copy"}</button>
              <button className="button secondary small" onClick={() => window.print()}>Print / PDF</button>
            </div>
          )}
        </div>

        {generating ? (
          <div className="analysis-progress">
            <div className="spinner" />
            <div><strong>Reviewing stored checklist records</strong><span>Large daily reports may be analyzed in evidence chunks before the final management summary.</span></div>
          </div>
        ) : summary ? (
          <>
            <ReportDocument summary={summary} />
            <div className="report-meta">
              <span>{meta.recordCount ?? 0} checklist instances reviewed</span>
              <span>{meta.model}</span>
              {meta.chunkCount && meta.chunkCount > 1 ? <span>{meta.chunkCount} evidence chunks</span> : null}
              {meta.generatedAt ? <span>{new Date(meta.generatedAt).toLocaleString()}</span> : null}
            </div>
          </>
        ) : (
          <div className="empty-report">
            <div className="empty-icon">AI</div>
            <h3>No report generated yet</h3>
            <p>The result will appear here. No PDF upload is required; the source is Supabase.</p>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="panel recent-card no-print">
          <div className="section-kicker">SAVED REPORTS</div>
          <div className="recent-list">
            {recent.map((item) => (
              <div className="recent-row" key={`${item.id}-${item.generated_at}`}>
                <div>
                  <strong>{item.location_name}</strong>
                  <span>{item.client_name} · {item.report_date} · {new Date(item.generated_at).toLocaleString()}</span>
                </div>
                <div className="saved-report-actions">
                  <div className={`priority priority-${String(item.priority || "").toLowerCase().replaceAll(" ", "-")}`}>{item.priority}</div>
                  <button className="button secondary small" onClick={() => openSavedReport(item)} disabled={!item.summary}>Open</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
