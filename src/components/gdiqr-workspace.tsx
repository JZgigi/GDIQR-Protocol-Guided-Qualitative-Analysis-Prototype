"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  Bot,
  Check,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  FileAudio,
  FileText,
  FolderKanban,
  GitBranch,
  Layers3,
  MessageSquareWarning,
  Pencil,
  Play,
  RefreshCcw,
  SearchCheck,
  Settings2,
  ShieldCheck,
  Upload
} from "lucide-react";
import type {
  AuditEvent,
  CategoryMode,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerComment,
  TranscriptSegment,
  WorkflowStep
} from "@/lib/types";
import type { WorkspaceData } from "@/lib/gdiqr-repository";

const steps: Array<{
  id: WorkflowStep;
  label: string;
  icon: typeof FolderKanban;
}> = [
  { id: "setup", label: "Project Setup", icon: Settings2 },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "transcript", label: "Transcript", icon: FileText },
  { id: "segments", label: "Segments", icon: GitBranch },
  { id: "meaning-units", label: "Meaning Units", icon: Layers3 },
  { id: "categories", label: "Categories", icon: FolderKanban },
  { id: "reviewers", label: "Reviewers", icon: SearchCheck },
  { id: "export", label: "Export", icon: Download }
];

interface GdiqrWorkspaceProps {
  project: Project;
  transcript: string;
  segments: TranscriptSegment[];
  meaningUnits: MeaningUnit[];
  categories: CategoryNode[];
  reviewerComments: ReviewerComment[];
  auditEvents: AuditEvent[];
  integratedNarrative: string;
  dataSource?: WorkspaceData["dataSource"];
  supabaseConfigured?: boolean;
}

export function GdiqrWorkspace({
  project,
  transcript,
  segments,
  meaningUnits,
  categories,
  reviewerComments,
  auditEvents,
  integratedNarrative,
  dataSource = "mock",
  supabaseConfigured = false
}: GdiqrWorkspaceProps) {
  const [activeStep, setActiveStep] = useState<WorkflowStep>("setup");
  const [mode, setMode] = useState<CategoryMode>("A");
  const [lightInterpretation, setLightInterpretation] = useState(
    project.lightInterpretation
  );
  const [editableTranscript, setEditableTranscript] = useState(transcript);
  const [displaySegments, setDisplaySegments] = useState(segments);
  const [units, setUnits] = useState(meaningUnits);
  const [displayCategories, setDisplayCategories] = useState(categories);
  const [reviewerOutputs, setReviewerOutputs] = useState(reviewerComments);
  const [displayAuditEvents, setDisplayAuditEvents] = useState(auditEvents);
  const [narrative, setNarrative] = useState(integratedNarrative);
  const [apiDataSource, setApiDataSource] = useState(dataSource);
  const [apiStatus, setApiStatus] = useState(
    supabaseConfigured
      ? `Loaded from ${dataSource}`
      : "Supabase env missing; using mock data"
  );
  const [reviewerHasRun, setReviewerHasRun] = useState(true);

  const completedSteps = useMemo(
    () =>
      new Set<WorkflowStep>([
        "setup",
        "upload",
        "transcript",
        "segments",
        "meaning-units",
        "categories",
        "reviewers"
      ]),
    []
  );

  const selectedTitle = steps.find((step) => step.id === activeStep)?.label;

  function applyWorkspace(workspace: WorkspaceData) {
    setEditableTranscript(workspace.transcript);
    setDisplaySegments(workspace.segments);
    setUnits(workspace.meaningUnits);
    setDisplayCategories(workspace.categories);
    setReviewerOutputs(workspace.reviewerComments);
    setDisplayAuditEvents(workspace.auditEvents);
    setNarrative(workspace.integratedNarrative);
    setApiDataSource(workspace.dataSource);
    setApiStatus(`Loaded from ${workspace.dataSource}`);
  }

  async function refreshWorkspace() {
    setApiStatus("Loading workspace API...");
    const response = await fetch(`/api/workspace?projectId=${project.id}`, {
      cache: "no-store"
    });
    const workspace = (await response.json()) as WorkspaceData;
    applyWorkspace(workspace);
  }

  async function saveTranscriptVersion() {
    setApiStatus("Saving transcript version...");
    const response = await fetch("/api/transcript-versions", {
      body: JSON.stringify({
        content: editableTranscript,
        projectId: project.id
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as {
      saved?: boolean;
      reason?: string;
      error?: string;
    };
    setApiStatus(
      result.saved
        ? "Transcript version saved"
        : result.reason ?? result.error ?? "Transcript save failed"
    );
  }

  async function generateMeaningUnits() {
    setApiStatus("Calling meaning-unit API...");
    const response = await fetch("/api/ai/meaning-units", {
      body: JSON.stringify({
        lightInterpretation,
        projectId: project.id,
        transcript: editableTranscript
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { meaningUnits?: MeaningUnit[] };
    if (result.meaningUnits) {
      setUnits(result.meaningUnits);
      setApiStatus("Meaning-unit API response applied");
    }
  }

  async function runCategories() {
    setApiStatus(`Calling category API Mode ${mode}...`);
    const response = await fetch("/api/ai/categories", {
      body: JSON.stringify({ mode, projectId: project.id, units }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as {
      categories?: CategoryNode[];
      integratedNarrative?: string;
    };
    if (result.categories) {
      setDisplayCategories(result.categories);
    }
    setNarrative(result.integratedNarrative ?? "");
    setApiStatus(`Category API Mode ${mode} response applied`);
  }

  async function runReviewer() {
    setApiStatus("Calling reviewer API...");
    const response = await fetch("/api/ai/reviewer", {
      body: JSON.stringify({ projectId: project.id, units }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as {
      comments?: ReviewerComment[];
    };
    setReviewerOutputs(result.comments ?? []);
    setReviewerHasRun(true);
    setApiStatus("Reviewer API response applied");
  }

  function updateHumanSummary(unitId: string, value: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? { ...unit, humanSummary: value, humanStatus: "Edited" }
          : unit
      )
    );
  }

  async function markAccepted(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId ? { ...unit, humanStatus: "Accepted" } : unit
      )
    );
    setApiStatus("Saving meaning-unit decision...");

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        humanStatus: "Accepted",
        humanSummary: unit?.humanSummary
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const result = (await response.json()) as {
      saved?: boolean;
      reason?: string;
      error?: string;
      meaningUnit?: MeaningUnit;
    };

    if (result.meaningUnit) {
      setUnits((current) =>
        current.map((item) =>
          item.id === result.meaningUnit?.id ? result.meaningUnit : item
        )
      );
    }

    setApiStatus(
      result.saved
        ? "Meaning-unit decision saved"
        : result.reason ?? result.error ?? "Meaning-unit save skipped"
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="GDIQR Analysis Assistant">
          <div className="brand-mark">G</div>
          <div>
            <h1 className="brand-title">GDIQR Analysis Assistant</h1>
            <p className="brand-subtitle">
              Protocol-guided qualitative analysis prototype
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="badge blue">AI provider: mock</span>
          <span className="badge">
            Data: {apiDataSource === "supabase" ? "Supabase" : "Mock"}
          </span>
          <button
            className="button soft"
            onClick={refreshWorkspace}
            type="button"
            title="Reload workspace data"
          >
            <RefreshCcw size={18} />
            Refresh API
          </button>
          <button
            className="button soft"
            onClick={generateMeaningUnits}
            type="button"
            title="Run mock AI"
          >
            <Bot size={18} />
            Run mock AI
          </button>
          <button className="button primary" type="button" title="Export demo">
            <Download size={18} />
            Export demo
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Workflow navigation">
          <div className="progress-strip" aria-label="Workflow progress">
            {steps.map((step) => (
              <span
                className={`progress-cell ${
                  completedSteps.has(step.id) ? "complete" : ""
                }`}
                key={step.id}
              />
            ))}
          </div>
          <div style={{ height: 12 }} />
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                className={`nav-button ${
                  activeStep === step.id ? "active" : ""
                } ${completedSteps.has(step.id) ? "complete" : ""}`}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <Icon size={18} />
                <span className="nav-label">{step.label}</span>
                <span className="nav-status" />
              </button>
            );
          })}
        </aside>

        <main className="main">
          <section className="section">
            <div className="section-header">
              <div>
                <span className="badge">Current view</span>
                <h2 className="section-title">{selectedTitle}</h2>
                <p className="section-copy">
                  This mock prototype keeps GDIQR stages separate: transcript
                  work, meaning unit summaries, category construction, reviewer
                  checks, and audit export.
                </p>
                <p className="small">{apiStatus}</p>
              </div>
              <button
                className="button"
                onClick={() => {
                  const currentIndex = steps.findIndex(
                    (step) => step.id === activeStep
                  );
                  setActiveStep(steps[(currentIndex + 1) % steps.length].id);
                }}
                type="button"
                title="Go to next workflow step"
              >
                <ChevronRight size={18} />
                Next
              </button>
            </div>

            {activeStep === "setup" && (
              <div className="section-body grid">
                <div className="grid two">
                  <div>
                    <label className="label" htmlFor="project-title">
                      Project title
                    </label>
                    <input
                      className="field"
                      defaultValue={project.title}
                      id="project-title"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="protocol">
                      Protocol
                    </label>
                    <input
                      className="field"
                      defaultValue={`${project.protocol} only`}
                      id="protocol"
                      readOnly
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="research-question">
                    Research question
                  </label>
                  <textarea
                    className="textarea"
                    defaultValue={project.researchQuestion}
                    id="research-question"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="study-description">
                    Study description
                  </label>
                  <textarea
                    className="textarea"
                    defaultValue={project.studyDescription}
                    id="study-description"
                  />
                </div>
                <div className="grid three">
                  <div className="mini-card soft">
                    <span className="label">Interview language</span>
                    <strong>{project.language}</strong>
                  </div>
                  <div className="mini-card soft">
                    <span className="label">Light interpretation</span>
                    <button
                      className={`button ${
                        lightInterpretation ? "primary" : ""
                      }`}
                      onClick={() => setLightInterpretation((value) => !value)}
                      type="button"
                    >
                      <Pencil size={16} />
                      {lightInterpretation ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="mini-card soft">
                    <span className="label">Reviewer strictness</span>
                    <strong>Medium</strong>
                  </div>
                </div>
              </div>
            )}

            {activeStep === "upload" && (
              <div className="section-body grid">
                <div className="grid two">
                  <div className="mini-card">
                    <FileAudio size={28} />
                    <h3>Audio upload</h3>
                    <p className="small">
                      Phase 1 uses a demo transcript. Phase 2 will store audio
                      in Supabase Storage and attach transcription status.
                    </p>
                    <button className="button primary" type="button">
                      <Upload size={18} />
                      Mock upload complete
                    </button>
                  </div>
                  <div className="mini-card">
                    <Database size={28} />
                    <h3>Storage target</h3>
                    <p className="small">
                      Planned buckets: interview-audio, exports, transcript
                      versions. Demo mode keeps all data local in the app.
                    </p>
                    <span className="badge blue">Supabase in next phase</span>
                  </div>
                </div>
              </div>
            )}

            {activeStep === "transcript" && (
              <div className="section-body grid">
                <div className="button-row">
                  <button className="button soft" type="button">
                    <Play size={18} />
                    Audio preview
                  </button>
                  <button className="button" type="button">
                    <RefreshCcw size={18} />
                    Clean transcript
                  </button>
                  <button
                    className="button"
                    onClick={saveTranscriptVersion}
                    type="button"
                  >
                    <Archive size={18} />
                    Save version
                  </button>
                </div>
                <label className="label" htmlFor="transcript-editor">
                  Editable transcript
                </label>
                <textarea
                  className="textarea transcript"
                  id="transcript-editor"
                  onChange={(event) => setEditableTranscript(event.target.value)}
                  value={editableTranscript}
                />
              </div>
            )}

            {activeStep === "segments" && (
              <div className="section-body grid">
                {displaySegments.map((segment) => (
                  <div className="mini-card" key={segment.id}>
                    <div className="category-header">
                      <div>
                        <span className="badge">{segment.caseId}</span>
                        <h3>{segment.segmentId}</h3>
                      </div>
                      <span className="badge blue">{segment.status}</span>
                    </div>
                    <div className="grid three">
                      <p className="small">
                        <strong>Timestamp:</strong> {segment.startTimestamp} to{" "}
                        {segment.endTimestamp}
                      </p>
                      <p className="small">
                        <strong>Speakers:</strong> {segment.speakerInfo}
                      </p>
                      <p className="small">
                        <strong>Starting MU:</strong>{" "}
                        {segment.startingMuNumber}
                      </p>
                    </div>
                    <p className="small">{segment.text.slice(0, 380)}...</p>
                  </div>
                ))}
              </div>
            )}

            {activeStep === "meaning-units" && (
              <div className="section-body grid">
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={generateMeaningUnits}
                    type="button"
                  >
                    <Bot size={18} />
                    Generate draft MUs
                  </button>
                  <button
                    className="button"
                    onClick={runReviewer}
                    type="button"
                  >
                    <ShieldCheck size={18} />
                    Run reviewer
                  </button>
                  <span className="badge">
                    Light interpretation: {lightInterpretation ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>MU</th>
                        <th>Speaker</th>
                        <th>Excerpt</th>
                        <th>AI summary</th>
                        <th>Human summary</th>
                        <th>Status</th>
                        <th>Review</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((unit) => (
                        <tr key={unit.id}>
                          <td className="mono">#{unit.number}</td>
                          <td>{unit.speaker}</td>
                          <td>{unit.excerpt}</td>
                          <td>{unit.aiSummary}</td>
                          <td>
                            <textarea
                              className="field"
                              onChange={(event) =>
                                updateHumanSummary(unit.id, event.target.value)
                              }
                              value={unit.humanSummary}
                            />
                            {unit.uncertainty && (
                              <p className="small">{unit.uncertainty}</p>
                            )}
                          </td>
                          <td>
                            <StatusBadge label={unit.humanStatus} />
                          </td>
                          <td>
                            <StatusBadge label={unit.reviewerStatus} />
                          </td>
                          <td>
                            <button
                              className="button icon"
                              onClick={() => markAccepted(unit.id)}
                              title="Accept meaning unit"
                              type="button"
                            >
                              <Check size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeStep === "categories" && (
              <div className="section-body grid">
                <div className="mode-selector">
                  <ModeButton
                    active={mode === "A"}
                    description="Initial category construction"
                    label="Mode A"
                    onClick={() => setMode("A")}
                  />
                  <ModeButton
                    active={mode === "B"}
                    description="Expansion and refinement"
                    label="Mode B"
                    onClick={() => setMode("B")}
                  />
                  <ModeButton
                    active={mode === "C"}
                    description="Final integration after confirmation"
                    label="Mode C"
                    onClick={() => setMode("C")}
                  />
                </div>
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={runCategories}
                    type="button"
                  >
                    <Bot size={18} />
                    Run Mode {mode}
                  </button>
                  {mode === "C" && (
                    <span className="badge warning">
                      Confirmation required: all batches processed
                    </span>
                  )}
                </div>
                <div className="grid">
                  {displayCategories.map((category) => (
                    <CategoryBlock category={category} key={category.id} />
                  ))}
                </div>
                {mode === "C" && (
                  <div className="mini-card soft">
                    <span className="label">Integrated narrative</span>
                    <p>{narrative}</p>
                  </div>
                )}
              </div>
            )}

            {activeStep === "reviewers" && (
              <div className="section-body grid">
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={runReviewer}
                    type="button"
                  >
                    <SearchCheck size={18} />
                    Run reviewer agents
                  </button>
                  <span className="badge">
                    {reviewerHasRun ? "Reviewer output ready" : "Not run"}
                  </span>
                </div>
                <div className="grid two">
                  {reviewerOutputs.map((comment) => (
                    <div className="mini-card" key={comment.id}>
                      <div className="category-header">
                        <div>
                          <span className="label">{comment.agent}</span>
                          <h3>{comment.target}</h3>
                        </div>
                        <StatusBadge label={comment.severity} />
                      </div>
                      <p>{comment.comment}</p>
                      <p className="small">{comment.suggestedAction}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeStep === "export" && (
              <div className="section-body grid">
                <div className="grid three">
                  {["XLSX", "DOCX", "JSON"].map((format) => (
                    <div className="mini-card" key={format}>
                      <Download size={26} />
                      <h3>{format} export</h3>
                      <p className="small">
                        Includes transcript, meaning units, categories,
                        reviewer notes, and audit trail.
                      </p>
                      <button className="button" type="button">
                        <Download size={18} />
                        Mock export
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mini-card soft">
                  <span className="label">Audit trail</span>
                  <div className="timeline">
                    {displayAuditEvents.map((event) => (
                      <div className="timeline-item" key={event.id}>
                        <span className="mono small">{event.timestamp}</span>
                        <div>
                          <strong>
                            {event.actor}: {event.action}
                          </strong>
                          <p className="small">{event.target}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  const lowered = label.toLowerCase();
  const className = lowered.includes("warning")
    ? "badge warning"
    : lowered.includes("major") || lowered.includes("needs")
      ? "badge danger"
      : lowered.includes("pass") || lowered.includes("accepted")
        ? "badge"
        : "badge blue";
  return <span className={className}>{label}</span>;
}

function ModeButton({
  active,
  description,
  label,
  onClick
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`mode-button ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <strong>{label}</strong>
      <span className="small">{description}</span>
    </button>
  );
}

function CategoryBlock({ category }: { category: CategoryNode }) {
  return (
    <article className="category">
      <div className="category-header">
        <div>
          <h3 className="category-title">{category.name}</h3>
          <p className="small">{category.definition}</p>
        </div>
        <span className="badge">
          Units {category.includedUnitIds.join(", ")}
        </span>
      </div>
      {category.subcategories && category.subcategories.length > 0 && (
        <div className="subcategories">
          {category.subcategories.map((subcategory) => (
            <div key={subcategory.id}>
              <strong>{subcategory.name}</strong>
              <p className="small">{subcategory.definition}</p>
              <span className="badge blue">
                Units {subcategory.includedUnitIds.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
