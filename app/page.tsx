import Link from "next/link";
import { demoTemplate, DEMO_TEMPLATE_ID } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <div className="stack-xl">
      <section className="hero">
        <div>
          <span className="eyebrow">TEST ENVIRONMENT</span>
          <h1>Checklist data → AI review → minimal report</h1>
          <p className="hero-copy">
            A lightweight InCheck 360 sandbox for validating checklist structure, evidence capture,
            compliance scoring and AI findings before integration into the production platform.
          </p>
          <div className="actions">
            <Link className="button primary" href={`/checklists/${DEMO_TEMPLATE_ID}`}>Run sample checklist</Link>
            <a className="button secondary" href="#architecture">View architecture</a>
          </div>
        </div>
        <div className="hero-card">
          <div className="metric-label">Sample checklist</div>
          <div className="metric-value">{demoTemplate.sections.reduce((n, s) => n + s.questions.length, 0)}</div>
          <div className="metric-caption">structured questions</div>
          <div className="mini-grid">
            <div><strong>2</strong><span>sections</span></div>
            <div><strong>4</strong><span>AI-ready items</span></div>
            <div><strong>1</strong><span>temperature rule</span></div>
          </div>
        </div>
      </section>

      <section className="grid-3">
        <article className="panel"><span className="step">01</span><h2>Structured checklist</h2><p>Templates, sections and questions are stored as real database records instead of PDF pages.</p></article>
        <article className="panel"><span className="step">02</span><h2>AI analysis</h2><p>Selected answers and evidence can be sent to the AI endpoint for pass, fail or review findings.</p></article>
        <article className="panel"><span className="step">03</span><h2>Web report</h2><p>Each completed run produces a clean browser report with score, failures and AI recommendations.</p></article>
      </section>

      <section id="architecture" className="panel architecture">
        <div>
          <span className="eyebrow">ARCHITECTURE</span>
          <h2>Minimal by design</h2>
          <p>No production InCheck 360 dependency. Add Supabase and OpenAI keys only when you are ready.</p>
        </div>
        <div className="flow">
          <span>GitHub</span><b>→</b><span>Vercel / Next.js</span><b>→</b><span>Supabase</span><b>→</b><span>AI</span><b>→</b><span>Report</span>
        </div>
      </section>
    </div>
  );
}
