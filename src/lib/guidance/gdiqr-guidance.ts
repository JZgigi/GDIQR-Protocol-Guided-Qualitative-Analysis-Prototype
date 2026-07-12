import type { WorkflowStep } from "@/lib/types";

export type VoiceGuideBoundaryIntent =
  | "mu_split_decision"
  | "mu_accept_exclude_decision"
  | "category_correctness_decision"
  | "category_naming_request"
  | "category_definition_request"
  | "mu_assignment_request"
  | "integration_narrative_request"
  | "final_interpretation_request"
  | "step_readiness_decision";

export interface StepGuidanceSection {
  key: WorkflowStep;
  title: string;
  purpose: string;
  researcherActions: string[];
  guideMayHelpWith: string[];
  commonRisks: string[];
  reflectivePrompts: string[];
  criteriaForMovingNext: string[];
  decisionBoundary: string;
  allowedResponsePatterns: string[];
  disallowedResponsePatterns: string[];
}

export interface BoundaryRule {
  intent: VoiceGuideBoundaryIntent;
  patterns: RegExp[];
  principle: string;
  suggestedChecks: string[];
  documentationPrompt: string;
  boundaryReminder: string;
}

export const GLOBAL_VOICE_GUIDE_BOUNDARY =
  "The Voice Guide provides methodological reflection support only. Final analytic judgements belong to the researcher and should be checked against the qualitative evidence.";

const sharedDisallowed = [
  "Make a final coding or interpretation decision",
  "Claim that an analytic decision is correct",
  "Treat an AI suggestion as a finding",
];

export const GDIQR_GUIDANCE: Record<WorkflowStep, StepGuidanceSection> = {
  "pre-analysis": {
    key: "pre-analysis",
    title: "Step 1 — Pre-analysis",
    purpose:
      "Clarify the open-ended research question, domains of investigation, researcher position, contextual assumptions, and readiness of the qualitative material.",
    researcherActions: [
      "Record an open-ended exploratory research question",
      "Record provisional domains of investigation",
      "Document researcher position, prior expectations, and contextual notes",
      "Prepare and confirm the transcript or other qualitative material",
    ],
    guideMayHelpWith: [
      "Explain the difference between a domain of investigation and a finding",
      "Offer reflexive prompts about assumptions and theoretical positioning",
      "Summarise the completion checks for this step",
    ],
    commonRisks: [
      "Treating a domain as a category or finding",
      "Using a closed or confirmatory research question",
      "Allowing prior theory to determine the data meaning in advance",
    ],
    reflectivePrompts: [
      "Is the research question open enough for participants' accounts to shape the analysis?",
      "Which assumptions or expectations may influence what you notice?",
      "Is the available material capable of addressing the research question?",
    ],
    criteriaForMovingNext: [
      "Research question recorded",
      "Initial domains recorded",
      "Researcher position or contextual notes drafted",
      "Qualitative material prepared and confirmed",
    ],
    decisionBoundary:
      "The guide may explain readiness criteria, but it cannot define the final research question or decide that the data are definitively suitable.",
    allowedResponsePatterns: ["Explain principles", "Offer checks", "Ask reflexive questions"],
    disallowedResponsePatterns: [...sharedDisallowed, "Define the final research question"],
  },
  understanding: {
    key: "understanding",
    title: "Step 2 — Understanding / Meaning Units",
    purpose:
      "Develop manageable, meaning-preserving units and researcher-reviewed summaries that remain close to participant accounts.",
    researcherActions: [
      "Generate or create draft meaning units",
      "Review excerpt boundaries and summaries",
      "Accept, edit, or exclude units and document reasons",
    ],
    guideMayHelpWith: [
      "Explain what makes a meaning unit coherent",
      "Prompt checks for meaning shifts, context loss, and over-interpretation",
      "Explain completion criteria",
    ],
    commonRisks: [
      "Splitting every sentence",
      "Creating units too short to communicate a clear meaning",
      "Combining multiple meaning shifts in one unit",
      "Treating interviewer-only material as participant evidence",
      "Adding motives, causes, or diagnoses not expressed in the excerpt",
    ],
    reflectivePrompts: [
      "Does the excerpt communicate one clear participant meaning?",
      "Is there a meaningful shift in topic, time, feeling, action, or evaluation?",
      "Would splitting remove necessary context?",
      "Does the summary remain close to the excerpt evidence?",
    ],
    criteriaForMovingNext: [
      "All non-excluded units reviewed",
      "Accepted units have clear excerpts and researcher-reviewed summaries",
      "Exclusions have reasons",
      "Interviewer-only material is not used as participant evidence",
    ],
    decisionBoundary:
      "The guide cannot decide whether a unit must be split, merged, accepted, or excluded.",
    allowedResponsePatterns: ["Explain MU principles", "Offer evidence checks", "Suggest a decision memo"],
    disallowedResponsePatterns: [...sharedDisallowed, "Say yes or no to a split/merge/accept/exclude decision"],
  },
  categorizing: {
    key: "categorizing",
    title: "Step 3 — Categorising",
    purpose:
      "Compare accepted meaning units and organise shared meanings into provisional, evidence-grounded categories.",
    researcherActions: [
      "Compare accepted meaning units",
      "Create, name, and define categories",
      "Assign units and review fit, overlap, exceptions, and tensions",
      "Confirm or revise categories",
    ],
    guideMayHelpWith: [
      "Explain the difference between a topic label and a shared-meaning category",
      "Offer coherence and evidence checks",
      "Provide a non-content writing scaffold",
    ],
    commonRisks: [
      "Using a domain or topic as a final category",
      "Including dissimilar units",
      "Accepting an AI draft without researcher review",
      "Creating unsupported or excessively broad categories",
    ],
    reflectivePrompts: [
      "What shared meaning is expressed across the included units?",
      "Does the definition cover every included unit?",
      "Which unit is the weakest fit or an important exception?",
      "Is the category too broad, narrow, overlapping, or interpretive?",
    ],
    criteriaForMovingNext: [
      "Categories derive from accepted units",
      "Each active category has evidence",
      "Names and definitions have researcher review",
      "Unassigned units are handled or documented",
    ],
    decisionBoundary:
      "The guide cannot choose the final category name, write the final definition, decide category correctness, or assign units.",
    allowedResponsePatterns: ["Explain category quality", "Offer coherence checks", "Provide a clearly labelled scaffold"],
    disallowedResponsePatterns: [...sharedDisallowed, "Write a final category name or definition", "Assign a unit to a category"],
  },
  integrating: {
    key: "integrating",
    title: "Step 4 — Integrating",
    purpose:
      "Develop a coherent, evidence-grounded account of relationships among categories rather than a simple category list.",
    researcherActions: [
      "Review category relationships",
      "Link relationship claims to meaning-unit evidence",
      "Draft and revise an integration narrative",
      "Check coherence, tensions, exceptions, and overclaiming",
    ],
    guideMayHelpWith: [
      "Explain possible relationship lenses such as context, process, tension, and implication",
      "Offer evidence and overclaiming checks",
      "Prompt attention to negative cases and limitations",
    ],
    commonRisks: [
      "Listing categories without explaining relationships",
      "Making unsupported causal or general claims",
      "Ignoring exceptions or tensions",
      "Treating an AI draft as the final account",
    ],
    reflectivePrompts: [
      "Which categories provide context, process, response, tension, or implication?",
      "What meaning-unit evidence supports each relationship?",
      "Where does the account need qualification or a negative case?",
      "Does the narrative go beyond what this dataset can support?",
    ],
    criteriaForMovingNext: [
      "Relationships reviewed by the researcher",
      "Narrative explains a category structure",
      "Claims can be traced to evidence",
      "Major integration decisions are documented",
    ],
    decisionBoundary:
      "The guide cannot organise the final category structure or generate the final integration narrative.",
    allowedResponsePatterns: ["Explain integration aims", "Offer relationship lenses", "Prompt evidence checks"],
    disallowedResponsePatterns: [...sharedDisallowed, "Write or complete the final integration narrative"],
  },
  integrity: {
    key: "integrity",
    title: "Step 5 — Methodological Integrity",
    purpose:
      "Review transparency, coherence, evidence grounding, reflexivity, and the researcher decision trail.",
    researcherActions: [
      "Review the transcript-to-MU-to-category-to-integration trail",
      "Complete checklist items and record resolutions",
      "Document unresolved issues or limitations",
    ],
    guideMayHelpWith: [
      "Explain methodological integrity dimensions",
      "Surface incomplete checks from project state",
      "Prompt documentation of limitations and resolutions",
    ],
    commonRisks: [
      "Keeping AI outputs without a researcher decision trail",
      "Allowing categories or narrative claims to detach from evidence",
      "Treating checklist completion as proof that analysis is correct",
    ],
    reflectivePrompts: [
      "Can each key claim be traced to reviewed evidence?",
      "Are exclusions, revisions, and unresolved issues documented?",
      "Are researcher assumptions and interpretations visible?",
    ],
    criteriaForMovingNext: [
      "Integrity checklist saved",
      "Major issues resolved, dismissed with a memo, or recorded as limitations",
      "Audit trail is suitable for supervision or review",
    ],
    decisionBoundary:
      "The guide may identify risks but cannot certify that the analysis is correct, complete, or publication-ready.",
    allowedResponsePatterns: ["Explain integrity checks", "Summarise unresolved state", "Prompt documentation"],
    disallowedResponsePatterns: [...sharedDisallowed, "Certify analysis quality or completion"],
  },
  export: {
    key: "export",
    title: "Export",
    purpose:
      "Export a transparent analysis record while checking sensitivity, draft status, AI assistance, and researcher decisions.",
    researcherActions: [
      "Choose an appropriate export format",
      "Review sensitive information and draft labels",
      "Confirm that the decision trail is represented",
    ],
    guideMayHelpWith: ["Offer an export checklist", "Explain what an auditable record should contain"],
    commonRisks: ["Exporting sensitive information", "Presenting AI-assisted drafts as final findings", "Omitting the decision trail"],
    reflectivePrompts: [
      "Can a reader see how the analysis moved from data to findings?",
      "Which elements remain draft or AI-assisted?",
      "Does the file contain information that should not be shared?",
    ],
    criteriaForMovingNext: ["Researcher has reviewed the export for sensitivity, status, and completeness"],
    decisionBoundary:
      "The guide cannot guarantee ethical, legal, journal, or publication compliance.",
    allowedResponsePatterns: ["Offer an export checklist", "Remind the researcher to review sensitive data"],
    disallowedResponsePatterns: [...sharedDisallowed, "Guarantee compliance or publication suitability"],
  },
};

export const BOUNDARY_RULES: BoundaryRule[] = [
  {
    intent: "mu_split_decision",
    patterns: [/should i split/i, /do i need to split/i, /要不要拆/i, /是否.*拆分/i, /该不该.*拆/i],
    principle: "A meaning unit should be large enough to communicate one clear meaning while retaining necessary context.",
    suggestedChecks: [
      "Check for a clear shift in topic, time, feeling, action, or evaluation.",
      "Check whether one summary can accurately cover the whole excerpt.",
      "Check whether splitting would remove context needed to understand either part.",
    ],
    documentationPrompt: "Record the evidence you used and a brief reason for keeping or changing the boundary.",
    boundaryReminder: "I cannot decide whether this meaning unit should be split; that judgement belongs to you as the researcher.",
  },
  {
    intent: "mu_accept_exclude_decision",
    patterns: [/should i (accept|exclude)/i, /要不要(接受|排除)/i, /是否应该(接受|排除)/i],
    principle: "Acceptance or exclusion should follow relevance to the research question, evidence quality, and a transparent researcher rationale.",
    suggestedChecks: ["Check relevance to the research question.", "Check whether the excerpt contains participant evidence rather than interviewer-only context.", "Document an exclusion reason when applicable."],
    documentationPrompt: "Record the rationale for acceptance or exclusion.",
    boundaryReminder: "I cannot accept or exclude the unit for you.",
  },
  {
    intent: "category_correctness_decision",
    patterns: [/is this category (correct|right|good)/i, /这个类别.*(对|正确|合适)/i, /category 是否.*(正确|合适)/i],
    principle: "Category quality depends on shared meaning, evidence fit, coherence, and transparency rather than a single correct answer.",
    suggestedChecks: ["Compare the definition with every included unit.", "Identify the weakest-fitting unit or exception.", "Check overlap with neighbouring categories."],
    documentationPrompt: "Record any revision, exception, or rationale for retaining the category.",
    boundaryReminder: "I cannot certify that a category is correct.",
  },
  {
    intent: "category_naming_request",
    patterns: [/name this category/i, /give.*category name/i, /帮我.*类别.*命名/i, /类别.*叫什么/i],
    principle: "A category name should concisely represent the shared meaning across included units, not merely repeat a topic.",
    suggestedChecks: ["Identify the shared meaning across all included units.", "Check whether the proposed name is more than a broad topic label.", "Check whether the name overstates interpretation."],
    documentationPrompt: "Record why the chosen name fits the included evidence.",
    boundaryReminder: "I cannot choose the final category name for you.",
  },
  {
    intent: "category_definition_request",
    patterns: [/write.*category definition/i, /define this category for me/i, /帮我.*写.*类别.*定义/i, /代写.*category definition/i],
    principle: "A category definition should describe the shared meaning across included units and acknowledge important variation or tension.",
    suggestedChecks: ["Check that the definition covers every included unit.", "Identify exceptions or variation.", "Avoid adding claims not supported by the summaries."],
    documentationPrompt: "Draft the definition in your own words and record any unresolved fit issues.",
    boundaryReminder: "I cannot write the final category definition for you.",
  },
  {
    intent: "mu_assignment_request",
    patterns: [/which category.*(mu|meaning unit)/i, /assign.*(mu|meaning unit)/i, /把.*(MU|meaning unit).*(放|分配).*类别/i],
    principle: "Unit assignment requires researcher comparison of the unit meaning with category definitions and neighbouring evidence.",
    suggestedChecks: ["Compare the unit summary with each candidate definition.", "Check whether it is a better fit elsewhere or represents an exception.", "Consider leaving it unassigned while revising the category system."],
    documentationPrompt: "Record ambiguous assignments or reasons for intentional non-assignment.",
    boundaryReminder: "I cannot assign the meaning unit to a category for you.",
  },
  {
    intent: "integration_narrative_request",
    patterns: [/write.*integration narrative/i, /organize.*integration narrative/i, /帮我.*(写|组织).*整合/i, /生成.*integration narrative/i],
    principle: "Integration should explain evidence-grounded relationships among categories, including context, process, tension, variation, and limits.",
    suggestedChecks: ["Identify what relationship each category has to the others.", "Trace each relationship to meaning-unit evidence.", "Check for exceptions, tensions, and overclaiming."],
    documentationPrompt: "Record the relationship choices and the evidence supporting them.",
    boundaryReminder: "I cannot produce the final integration narrative for you.",
  },
  {
    intent: "final_interpretation_request",
    patterns: [/what is the final interpretation/i, /tell me the finding/i, /最终结论是什么/i, /帮我得出结论/i],
    principle: "Final interpretation is a situated researcher account that must remain transparent, tentative, and grounded in reviewed evidence.",
    suggestedChecks: ["Trace claims to accepted units and confirmed categories.", "Separate participant account from researcher interpretation.", "State limitations and alternative readings."],
    documentationPrompt: "Record how the interpretation was developed and where uncertainty remains.",
    boundaryReminder: "I cannot determine the final findings or interpretation.",
  },
  {
    intent: "step_readiness_decision",
    patterns: [/can i move to step/i, /am i ready for step/i, /能不能进入.*step/i, /可以进入第.*步吗/i],
    principle: "Step readiness is assessed by checking completion criteria and unresolved issues, not by an AI declaration.",
    suggestedChecks: ["Compare current project state with the step completion criteria.", "Review unresolved or unreviewed items.", "Document any limitation you choose to carry forward."],
    documentationPrompt: "Record your decision to proceed and any unresolved limitation.",
    boundaryReminder: "I can show the readiness checks, but I cannot decide that you are ready to proceed.",
  },
];

export function getGuidanceForStep(step: WorkflowStep): StepGuidanceSection {
  return GDIQR_GUIDANCE[step];
}

export function detectBoundaryIntent(question: string): BoundaryRule | null {
  const normalized = question.trim();
  return BOUNDARY_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized))) ?? null;
}

export function buildBoundaryReminder(step: WorkflowStep): string {
  return `${GDIQR_GUIDANCE[step].decisionBoundary} ${GLOBAL_VOICE_GUIDE_BOUNDARY}`;
}
