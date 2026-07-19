"use client";

import { FormEvent, useState } from "react";
import type { AnalysisResult, AnalysisStage } from "@/types/analysis";
import { AnalysisResults } from "./analysis-results";

const STAGE_LABELS: Record<AnalysisStage, string> = {
  fetching_repository: "Fetching repository",
  detecting_technologies: "Detecting technologies",
  selecting_files: "Selecting important files",
  analyzing_architecture: "Analyzing architecture",
  verifying_evidence: "Verifying skill evidence",
  generating_interview: "Generating interview questions",
  completed: "Analysis complete",
};

interface StreamError {
  code: string;
  message: string;
  status?: number;
}

type StreamEvent =
  | { type: "stage"; stage: AnalysisStage }
  | { type: "result"; result: AnalysisResult }
  | { type: "error"; error: StreamError };

async function readAnalysisStream(response: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  if (!response.ok) {
    const payload = (await response.json()) as { error?: StreamError };
    throw new Error(payload.error?.message ?? `Request failed with HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("The analysis response did not include a readable stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    }
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}

export function AnalysisWorkspace() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);

  const isLoading = stage !== null && stage !== "completed";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setStage("fetching_repository");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl,
          ...(resumeText.trim() ? { resumeText } : {}),
          ...(jobDescription.trim() ? { jobDescription } : {}),
        }),
      });
      await readAnalysisStream(response, (streamEvent) => {
        if (streamEvent.type === "stage") setStage(streamEvent.stage);
        if (streamEvent.type === "result") setResult(streamEvent.result);
        if (streamEvent.type === "error") throw new Error(streamEvent.error.message);
      });
    } catch (caught) {
      setStage(null);
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CodeProof home">
          <span className="brand-mark" aria-hidden="true">CP</span>
          <span>CodeProof</span>
        </a>
        <span className="header-label">Developer evidence intelligence</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> Repository intelligence</div>
        <h1>Hiring evidence,<br /><em>not résumé inference.</em></h1>
        <p className="hero-copy">
          Inspect real implementation decisions, verify technical skills against source files, and generate interviews that start from the candidate&apos;s code.
        </p>

        <form className="analysis-form" onSubmit={handleSubmit}>
          <label htmlFor="repository-url">Public GitHub repository</label>
          <div className="url-row">
            <input
              id="repository-url"
              type="url"
              required
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              autoComplete="url"
              disabled={isLoading}
            />
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "Analyzing" : "Analyze evidence"}
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <button className="context-toggle" type="button" onClick={() => setShowContext((visible) => !visible)} aria-expanded={showContext}>
            <span>{showContext ? "−" : "+"}</span> Add candidate context <small>optional</small>
          </button>

          {showContext && (
            <div className="context-grid">
              <label>
                <span>Résumé or CV text</span>
                <textarea value={resumeText} onChange={(event) => setResumeText(event.target.value)} maxLength={50_000} placeholder="Paste the candidate's résumé text…" disabled={isLoading} />
              </label>
              <label>
                <span>Job description</span>
                <textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} maxLength={50_000} placeholder="Paste required and preferred qualifications…" disabled={isLoading} />
              </label>
            </div>
          )}

          {stage && (
            <div className={`stage-status ${stage === "completed" ? "is-complete" : ""}`} role="status" aria-live="polite">
              <span className="stage-pulse" />
              <strong>{STAGE_LABELS[stage]}</strong>
              <span>{stage === "completed" ? "Evidence trail ready" : "Working from live repository data"}</span>
            </div>
          )}
          {error && <div className="form-error" role="alert"><strong>Analysis stopped.</strong> {error}</div>}
        </form>

        <div className="trust-row">
          <span>Selective source inspection</span>
          <span>Grounded file citations</span>
          <span>Code is never executed</span>
        </div>
      </section>

      {result ? <AnalysisResults result={result} /> : (
        <section className="process-strip" aria-label="Analysis method">
          <div><b>01</b><strong>Inspect</strong><span>Metadata, tree, manifests and high-value source files</span></div>
          <div><b>02</b><strong>Verify</strong><span>Implementation evidence tied to exact repository paths</span></div>
          <div><b>03</b><strong>Interview</strong><span>Questions shaped around actual engineering decisions</span></div>
        </section>
      )}
    </main>
  );
}
