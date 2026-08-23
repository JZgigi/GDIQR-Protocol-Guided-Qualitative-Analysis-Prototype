"use client";

import type { DatasetType, Project } from "@/lib/types";
import { formatTime } from "@/lib/date-format";

interface ProjectBarProps {
  availableProjects: Project[];
  currentProject: Project;
  createProjectExpanded: boolean;
  dataSuitabilityConfirmed: boolean;
  datasetType: DatasetType;
  isCreatingProject: boolean;
  isLocalOnlyMode: boolean;
  isSavingProject: boolean;
  newDataSuitabilityConfirmed: boolean;
  newDatasetType: DatasetType;
  newProjectTitle: string;
  newResearchQuestion: string;
  newResearcherNotes: string;
  newStudyDescription: string;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onSaveProject: () => void;
  onSetCreateProjectExpanded: (expanded: boolean) => void;
  onSetDataSuitabilityConfirmed: (confirmed: boolean) => void;
  onSetDatasetType: (datasetType: DatasetType) => void;
  onSetNewDataSuitabilityConfirmed: (confirmed: boolean) => void;
  onSetNewDatasetType: (datasetType: DatasetType) => void;
  onSetNewProjectTitle: (title: string) => void;
  onSetNewResearchQuestion: (question: string) => void;
  onSetNewResearcherNotes: (notes: string) => void;
  onSetNewStudyDescription: (description: string) => void;
  onSetProjectResearcherNotes: (notes: string) => void;
  onSetProjectTitle: (title: string) => void;
  projectResearcherNotes: string;
  projectSetupSavedAt?: string;
  projectTitle: string;
}

export function ProjectBar({
  availableProjects,
  currentProject,
  createProjectExpanded,
  dataSuitabilityConfirmed,
  datasetType,
  isCreatingProject,
  isLocalOnlyMode,
  isSavingProject,
  newDataSuitabilityConfirmed,
  newDatasetType,
  newProjectTitle,
  newResearchQuestion,
  newResearcherNotes,
  newStudyDescription,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  onSetCreateProjectExpanded,
  onSetDataSuitabilityConfirmed,
  onSetDatasetType,
  onSetNewDataSuitabilityConfirmed,
  onSetNewDatasetType,
  onSetNewProjectTitle,
  onSetNewResearchQuestion,
  onSetNewResearcherNotes,
  onSetNewStudyDescription,
  onSetProjectResearcherNotes,
  onSetProjectTitle,
  projectResearcherNotes,
  projectSetupSavedAt,
  projectTitle,
}: ProjectBarProps) {
  const suitabilityBlocked =
    datasetType === "identifiable_sensitive" && !isLocalOnlyMode;

  return (
    <section className="project-bar" aria-label="Current project">
      <div className="project-bar-summary">
        <div>
          <span className="badge">Current project</span>
          <h2 className="project-bar-title">
            {projectTitle || "Untitled GDI-QR project"}
          </h2>
          <p className="small">
            {dataSuitabilityConfirmed
              ? "Data suitability confirmed"
              : "Data suitability needs confirmation"}
            {projectSetupSavedAt
              ? ` · saved ${formatTime(projectSetupSavedAt)}`
              : ""}
          </p>
        </div>
        <div className="project-bar-actions">
          <label className="sr-only" htmlFor="project-switcher">
            Open project
          </label>
          <select
            className="select compact-select"
            id="project-switcher"
            onChange={(event) => onOpenProject(event.target.value)}
            value={currentProject.id}
          >
            {availableProjects.length === 0 && (
              <option value={currentProject.id}>{currentProject.title}</option>
            )}
            {availableProjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || "Untitled GDI-QR project"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="project-bar-disclosures">
        <details className="workbook-details project-settings-details">
          <summary>Project settings</summary>
          <div className="grid two">
            <div>
              <label className="label" htmlFor="project-title">
                Project title
              </label>
              <input
                className="field"
                id="project-title"
                onChange={(event) => onSetProjectTitle(event.target.value)}
                value={projectTitle}
              />
            </div>
            <div>
              <label className="label" htmlFor="project-dataset-type">
                Dataset sensitivity
              </label>
              <select
                className="select"
                id="project-dataset-type"
                onChange={(event) =>
                  onSetDatasetType(event.target.value as DatasetType)
                }
                value={datasetType}
              >
                <option value="open">Open / public dataset</option>
                <option value="anonymised">
                  Anonymised or de-identified dataset
                </option>
                <option value="identifiable_sensitive">
                  Identifiable sensitive data
                </option>
              </select>
            </div>
          </div>

          <label className="label" htmlFor="project-researcher-notes">
            Dataset/source note
          </label>
          <textarea
            className="textarea"
            id="project-researcher-notes"
            onChange={(event) =>
              onSetProjectResearcherNotes(event.target.value)
            }
            placeholder="Record the dataset/source label, material type, de-identification status, and any project-level notes that should appear in the export."
            value={projectResearcherNotes}
          />

          <div
            className={
              suitabilityBlocked ? "mini-card warning-card" : "mini-card soft"
            }
          >
            <span className="label">Data suitability</span>
            <p className="small">
              This release is intended for open, public, anonymised, or
              otherwise approved data.
            </p>
            {suitabilityBlocked && (
              <p className="small strong-warning">
                Identifiable sensitive data is blocked in cloud-assisted mode.
                Use an approved secure/local deployment.
              </p>
            )}
            <label className="scope-option">
              <input
                checked={dataSuitabilityConfirmed}
                disabled={suitabilityBlocked}
                onChange={(event) =>
                  onSetDataSuitabilityConfirmed(event.target.checked)
                }
                type="checkbox"
              />
              I confirm this project uses data suitable for this release.
            </label>
          </div>

          <div className="button-row">
            <button
              className="button primary"
              disabled={isSavingProject}
              onClick={onSaveProject}
              type="button"
            >
              {isSavingProject ? "Saving project..." : "Save project settings"}
            </button>
          </div>
        </details>

        <details
          className="workbook-details create-project-details"
          open={createProjectExpanded}
          onToggle={(event) =>
            onSetCreateProjectExpanded(event.currentTarget.open)
          }
        >
          <summary>Create new project</summary>
          <div className="grid two">
            <div>
              <label className="label" htmlFor="new-project-title">
                Project title
              </label>
              <input
                className="field"
                id="new-project-title"
                onChange={(event) => onSetNewProjectTitle(event.target.value)}
                value={newProjectTitle}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-dataset-type">
                Dataset sensitivity
              </label>
              <select
                className="select"
                id="new-dataset-type"
                onChange={(event) =>
                  onSetNewDatasetType(event.target.value as DatasetType)
                }
                value={newDatasetType}
              >
                <option value="open">Open / public dataset</option>
                <option value="anonymised">
                  Anonymised or de-identified dataset
                </option>
                <option value="identifiable_sensitive">
                  Identifiable sensitive data
                </option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-research-question">
                Research question
              </label>
              <textarea
                className="textarea"
                id="new-research-question"
                onChange={(event) =>
                  onSetNewResearchQuestion(event.target.value)
                }
                value={newResearchQuestion}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-study-description">
                Domains of investigation
              </label>
              <textarea
                className="textarea"
                id="new-study-description"
                onChange={(event) =>
                  onSetNewStudyDescription(event.target.value)
                }
                value={newStudyDescription}
              />
            </div>
          </div>
          <label className="label" htmlFor="new-researcher-notes">
            Dataset/source note
          </label>
          <textarea
            className="textarea"
            id="new-researcher-notes"
            onChange={(event) => onSetNewResearcherNotes(event.target.value)}
            placeholder="Record source label, material type, de-identification status, and project notes."
            value={newResearcherNotes}
          />
          <div className="mini-card soft">
            <label className="scope-option">
              <input
                checked={newDataSuitabilityConfirmed}
                disabled={
                  newDatasetType === "identifiable_sensitive" &&
                  !isLocalOnlyMode
                }
                onChange={(event) =>
                  onSetNewDataSuitabilityConfirmed(event.target.checked)
                }
                type="checkbox"
              />
              I confirm the dataset is suitable for this release.
            </label>
          </div>
          <button
            className="button primary"
            disabled={isCreatingProject}
            onClick={onCreateProject}
            type="button"
          >
            {isCreatingProject ? "Creating project..." : "Create project"}
          </button>
        </details>
      </div>
    </section>
  );
}
