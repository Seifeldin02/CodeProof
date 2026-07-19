import type {
  AnalysisResult,
  JobRequirementMatch,
  ResumeClaimVerification,
} from "@/types/analysis";

function ResultSection({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="result-section">
      <div className="section-heading">
        <span>{number}</span>
        <div><h2>{title}</h2><p>{subtitle}</p></div>
      </div>
      {children}
    </section>
  );
}

function ClaimList({ claims }: { claims: ResumeClaimVerification[] }) {
  return <div className="match-list">{claims.map((claim) => (
    <article key={`${claim.claim}-${claim.support}`}>
      <div><strong>{claim.claim}</strong><span className="status-badge">{claim.support}</span></div>
      <small className="source-tag">{claim.source}</small>
      <p>{claim.explanation}</p>
      {claim.files.length > 0 && <code>{claim.files.join(" · ")}</code>}
    </article>
  ))}</div>;
}

function RequirementList({ items }: { items: JobRequirementMatch[] }) {
  return <div className="match-list">{items.map((item) => (
    <article key={`${item.requirement}-${item.support}`}>
      <div><strong>{item.requirement}</strong><span className="importance">{item.importance}</span></div>
      <small className="source-tag">{item.source}</small>
      <p>{item.explanation}</p>
      {item.files.length > 0 && <code>{item.files.join(" · ")}</code>}
    </article>
  ))}</div>;
}

export function AnalysisResults({ result }: { result: AnalysisResult }) {
  const languageTotal = Object.values(result.languages).reduce((total, amount) => total + amount, 0);
  return (
    <div className="results" id="results">
      <section className="repository-summary">
        <div>
          <span className="summary-label">Analysis dossier</span>
          <h2>{result.repository.owner}<span>/</span>{result.repository.name}</h2>
          <p>{result.repository.description ?? "No repository description provided."}</p>
          <a href={result.repository.url} target="_blank" rel="noreferrer">View source repository ↗</a>
        </div>
        <dl>
          <div><dt>Project type</dt><dd>{result.projectType}</dd></div>
          <div><dt>Commit</dt><dd><code>{result.repository.commitSha.slice(0, 9)}</code></dd></div>
          <div><dt>Evidence files</dt><dd>{result.metadata.selectedFileCount} / {result.metadata.inspectedTreeFileCount}</dd></div>
          <div><dt>Analysis mode</dt><dd>{result.metadata.aiProvider ? `${result.metadata.aiProvider} + deterministic` : "Deterministic"}</dd></div>
        </dl>
      </section>

      {result.metadata.warnings.length > 0 && (
        <div className="warning-panel">
          <strong>Analysis notes</strong>
          {result.metadata.warnings.map((warning) => <p key={warning.code}>{warning.message}</p>)}
        </div>
      )}

      {result.metadata.aiStatus !== "completed" && (
        <div className="availability-panel">
          <strong>Deep AI evidence analysis unavailable</strong>
          <span>Showing deterministic repository signals only.</span>
          {result.metadata.aiUnavailableReason && <small>{result.metadata.aiUnavailableReason}</small>}
        </div>
      )}

      <ResultSection number="01" title="Repository signals" subtitle="Factual signals derived before AI interpretation.">
        <div className="signal-layout">
          <div className="technology-grid">
            {result.technologies.map((technology) => (
              <article key={technology.name}>
                <span>{technology.category}</span>
                <strong>{technology.name}</strong>
                <small className="source-tag">{technology.source}</small>
                <small>{technology.evidence.slice(0, 2).join(" · ")}</small>
              </article>
            ))}
          </div>
          <div className="language-panel">
            <h3>Language composition</h3>
            {Object.entries(result.languages).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([language, bytes]) => (
              <div className="language-row" key={language}>
                <span>{language}</span>
                <div><i style={{ width: `${languageTotal ? Math.max(2, (bytes / languageTotal) * 100) : 0}%` }} /></div>
                <b>{languageTotal ? Math.round((bytes / languageTotal) * 100) : 0}%</b>
              </div>
            ))}
          </div>
        </div>
      </ResultSection>

      <ResultSection number="02" title="Architecture reading" subtitle={`${result.architecture.origin === "ai_interpretation" ? "AI interpretation" : "Deterministic summary"}, bounded by the selected evidence.`}>
        <div className="architecture-grid">
          <article className="architecture-lead"><span>Purpose</span><h3>{result.architecture.purpose}</h3><p>{result.architecture.overview}</p></article>
          <article><span>Major modules</span><ul>{result.architecture.majorModules.map((item) => <li key={item}>{item}</li>)}</ul></article>
          <article><span>Engineering decisions</span><ul>{result.architecture.engineeringDecisions.map((item) => <li key={item}>{item}</li>)}</ul></article>
          {result.architecture.dataFlow.length > 0 && <article><span>Data flow</span><ul>{result.architecture.dataFlow.map((item) => <li key={item}>{item}</li>)}</ul></article>}
        </div>
      </ResultSection>

      <ResultSection number="03" title="Verified skill evidence" subtitle="Categorical strength backed by specific implementation evidence, never dependency-only percentages.">
        <div className="skills-list">
          {result.skills.map((skill) => (
            <article className="skill-card" key={skill.skill}>
              <div className="skill-title"><h3>{skill.skill}</h3><span>{skill.level}</span></div>
              <small className="source-tag skill-source">{skill.source}</small>
              <p>{skill.explanation}</p>
              <div className="evidence-list">
                {skill.evidence.map((evidence, index) => (
                  <div key={`${evidence.file}-${index}`}><code>{evidence.file}</code><strong>{evidence.summary}</strong><p>{evidence.implementationExample}</p></div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </ResultSection>

      {result.resumeVerification && (
        <ResultSection number="04" title="Résumé verification" subtitle={`${result.resumeVerification.disclaimer} Claims were extracted using ${result.resumeVerification.extractionMethod === "ai" ? "AI structured extraction" : "the deterministic fallback"}.`}>
          <ClaimList claims={result.resumeVerification.claims} />
        </ResultSection>
      )}

      {result.jobMatch && (
        <ResultSection number={result.resumeVerification ? "05" : "04"} title="Job requirement match" subtitle={`${result.jobMatch.summary} Requirements were extracted using ${result.jobMatch.extractionMethod === "ai" ? "AI structured extraction" : "the deterministic fallback"}.`}>
          <p className="scoring-note">{result.jobMatch.scoringMethod}</p>
          {result.jobMatch.strongMatches.length > 0 && <><h3 className="match-heading">Strong matches</h3><RequirementList items={result.jobMatch.strongMatches} /></>}
          {result.jobMatch.partialMatches.length > 0 && <><h3 className="match-heading">Partial matches</h3><RequirementList items={result.jobMatch.partialMatches} /></>}
          {result.jobMatch.unsupportedRequirements.length > 0 && <><h3 className="match-heading">No repository evidence</h3><RequirementList items={result.jobMatch.unsupportedRequirements} /></>}
        </ResultSection>
      )}

      <ResultSection number={String(4 + Number(Boolean(result.resumeVerification)) + Number(Boolean(result.jobMatch))).padStart(2, "0")} title="Evidence gaps" subtitle="Areas where the selected repository evidence is limited, not claims about the candidate's ability.">
        <div className="gap-grid">{result.gaps.map((gap) => <article key={gap.area}><span>Limited evidence · {gap.source}</span><h3>{gap.area}</h3><p>{gap.explanation}</p></article>)}</div>
      </ResultSection>

      <ResultSection number={String(5 + Number(Boolean(result.resumeVerification)) + Number(Boolean(result.jobMatch))).padStart(2, "0")} title="Code-specific interview" subtitle="Questions point back to the implementation that made them relevant.">
        <ol className="question-list">{result.interviewQuestions.map((question, index) => (
          <li key={`${question.question}-${index}`}>
            <div><span>{question.difficulty}</span><span>{question.relatedSkill}</span><span>{question.source}</span></div>
            <h3>{question.question}</h3><p>{question.relevance}</p><code>{question.files.join(" · ")}</code>
          </li>
        ))}</ol>
      </ResultSection>

      <details className="audit-trail">
        <summary>Selected evidence audit trail <span>{result.selectedFiles.length} files</span></summary>
        <div>{result.selectedFiles.map((file) => (
          <p key={file.path}><code>{file.path}</code><span>{file.selectionReason} · {file.size.toLocaleString()} bytes{file.truncated ? " · truncated for analysis" : ""}</span></p>
        ))}</div>
      </details>

      <footer className="result-footer">
        <span>Analysis {result.metadata.analysisId.slice(0, 8)}</span>
        <span>{result.metadata.cacheHit ? "Reused commit analysis" : `Completed in ${(result.metadata.durationMs / 1000).toFixed(1)}s`}</span>
        <span>Engine {result.metadata.engineVersion} · {result.metadata.cacheStorage} cache</span>
        <span>{new Date(result.metadata.analyzedAt).toLocaleString()}</span>
      </footer>
    </div>
  );
}
