import type {
  AuditEvent,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerComment,
  TranscriptSegment
} from "./types";

export const mockProject: Project = {
  id: "proj_student_wellbeing",
  title: "Student Well-being Interview Study",
  researchQuestion:
    "How do students describe their experiences of brief mindfulness practice and peer support?",
  studyDescription:
    "Prototype demo project using a short English interview excerpt for qualitative analysis.",
  language: "English",
  protocol: "GDIQR",
  lightInterpretation: false,
  status: "Mock workflow ready",
  updatedAt: "2026-05-29"
};

export const mockTranscript = `Interviewer: Can you tell me what it was like to try the brief mindfulness practice during the week?

Participant: At first I thought it would be a bit pointless because it was only five minutes. But when I did it before studying, it helped me pause instead of jumping straight into panic. I still got distracted, but I noticed it sooner.

Interviewer: What role did peer support play for you?

Participant: The group chat made it easier to actually do it. If someone posted that they had done the practice, I felt a little push to try as well. But sometimes it also felt like another thing I was failing at when I missed a day.

Interviewer: Did anything change by the end?

Participant: I would not say it fixed my stress. It was more like I had one small thing I could do before everything got too much. Talking to others helped me feel less weird about struggling.`;

export const mockSegments: TranscriptSegment[] = [
  {
    id: "seg_001",
    caseId: "CASE-001",
    segmentId: "SEG-001",
    speakerInfo: "Interviewer, Participant",
    startTimestamp: "00:00",
    endTimestamp: "02:14",
    startingMuNumber: 1,
    status: "Processed",
    text: mockTranscript
  }
];

export const mockMeaningUnits: MeaningUnit[] = [
  {
    id: "mu_001",
    segmentId: "SEG-001",
    caseId: "CASE-001",
    speaker: "Participant",
    number: 1,
    excerpt:
      "At first I thought it would be a bit pointless because it was only five minutes.",
    aiSummary: "initial doubt; five minutes seemed pointless",
    humanSummary: "initial doubt; five minutes seemed pointless",
    humanStatus: "Accepted",
    reviewerStatus: "Pass"
  },
  {
    id: "mu_002",
    segmentId: "SEG-001",
    caseId: "CASE-001",
    speaker: "Participant",
    number: 2,
    excerpt:
      "when I did it before studying, it helped me pause instead of jumping straight into panic",
    aiSummary: "used before studying; paused before panic",
    humanSummary: "used before studying; paused before panic",
    humanStatus: "Edited",
    reviewerStatus: "Pass"
  },
  {
    id: "mu_003",
    segmentId: "SEG-001",
    caseId: "CASE-001",
    speaker: "Participant",
    number: 3,
    excerpt: "I still got distracted, but I noticed it sooner.",
    aiSummary: "still distracted; noticed distraction sooner",
    humanSummary: "still distracted; noticed distraction sooner",
    humanStatus: "Accepted",
    reviewerStatus: "Pass"
  },
  {
    id: "mu_004",
    segmentId: "SEG-001",
    caseId: "CASE-001",
    speaker: "Participant",
    number: 4,
    excerpt:
      "The group chat made it easier to actually do it. If someone posted that they had done the practice, I felt a little push to try as well.",
    aiSummary: "group chat encouraged practice; others' posts gave a push",
    humanSummary: "group chat encouraged practice; others' posts gave a push",
    humanStatus: "Accepted",
    reviewerStatus: "Pass"
  },
  {
    id: "mu_005",
    segmentId: "SEG-001",
    caseId: "CASE-001",
    speaker: "Participant",
    number: 5,
    excerpt:
      "sometimes it also felt like another thing I was failing at when I missed a day.",
    aiSummary: "missed days felt like another failure",
    humanSummary: "missed days felt like another failure",
    uncertainty:
      "Check whether this refers to the practice itself or social comparison in the chat.",
    humanStatus: "Needs review",
    reviewerStatus: "Warning"
  },
  {
    id: "mu_006",
    segmentId: "SEG-001",
    caseId: "CASE-001",
    speaker: "Participant",
    number: 6,
    excerpt:
      "I would not say it fixed my stress. It was more like I had one small thing I could do before everything got too much.",
    aiSummary: "did not fix stress; small action before overwhelm",
    humanSummary: "did not fix stress; small action before overwhelm",
    humanStatus: "Accepted",
    reviewerStatus: "Pass"
  },
  {
    id: "mu_007",
    segmentId: "SEG-001",
    caseId: "CASE-001",
    speaker: "Participant",
    number: 7,
    excerpt: "Talking to others helped me feel less weird about struggling.",
    aiSummary: "talking to others normalised struggling",
    humanSummary: "talking to others helped struggling feel less unusual",
    humanStatus: "Edited",
    reviewerStatus: "Pass"
  }
];

export const mockCategories: CategoryNode[] = [
  {
    id: "cat_001",
    name: "Small practices as interruption before overwhelm",
    definition:
      "Participants describe brief practice as a modest, practical pause rather than a complete solution.",
    includedUnitIds: [1, 2, 3, 6],
    subcategories: [
      {
        id: "cat_001_a",
        name: "Initial doubt about usefulness",
        definition:
          "The practice initially appears too brief to be meaningful.",
        includedUnitIds: [1]
      },
      {
        id: "cat_001_b",
        name: "Pause and noticing",
        definition:
          "The practice supports pausing and earlier noticing of distraction or panic.",
        includedUnitIds: [2, 3, 6]
      }
    ]
  },
  {
    id: "cat_002",
    name: "Peer contact as encouragement and pressure",
    definition:
      "Peer interaction supports practice and normalises difficulty, while also creating possible pressure.",
    includedUnitIds: [4, 5, 7],
    subcategories: [
      {
        id: "cat_002_a",
        name: "Encouragement through shared action",
        definition:
          "Seeing others participate makes it easier to attempt the practice.",
        includedUnitIds: [4]
      },
      {
        id: "cat_002_b",
        name: "Pressure when missing practice",
        definition:
          "Missed practice can be experienced as another failure.",
        includedUnitIds: [5]
      },
      {
        id: "cat_002_c",
        name: "Normalising struggle",
        definition:
          "Talking with peers makes stress feel less isolating or unusual.",
        includedUnitIds: [7]
      }
    ]
  }
];

export const mockReviewerComments: ReviewerComment[] = [
  {
    id: "rev_001",
    agent: "GDIQR Rule Compliance Reviewer",
    target: "Meaning Units + Summaries",
    severity: "Pass",
    comment:
      "The output stays within meaning unit and summary work without creating categories.",
    suggestedAction: "No change needed.",
    resolved: true
  },
  {
    id: "rev_002",
    agent: "Coverage Reviewer",
    target: "MU 5",
    severity: "Warning",
    comment:
      "The emotional shift around missing a day may need a separate researcher check.",
    suggestedAction:
      "Review the original transcript around MU 5 before accepting the summary.",
    resolved: false
  },
  {
    id: "rev_003",
    agent: "Interpretation Boundary Reviewer",
    target: "Category narrative",
    severity: "Pass",
    comment:
      "The draft avoids diagnostic language and does not claim a causal mechanism.",
    suggestedAction: "Keep integrated narrative labelled as draft for review.",
    resolved: true
  },
  {
    id: "rev_004",
    agent: "Category Coherence Reviewer",
    target: "Current category system",
    severity: "Warning",
    comment:
      "The peer support category contains both encouragement and pressure; this is coherent if kept as a tension.",
    suggestedAction:
      "Make the tension explicit in Mode C rather than splitting too aggressively.",
    resolved: false
  }
];

export const mockAuditEvents: AuditEvent[] = [
  {
    id: "audit_001",
    timestamp: "2026-05-29 18:40",
    actor: "Researcher",
    action: "Created project using GDIQR method",
    target: "Project setup"
  },
  {
    id: "audit_002",
    timestamp: "2026-05-29 18:44",
    actor: "AI",
    action: "Generated draft meaning units and concise summaries",
    target: "SEG-001"
  },
  {
    id: "audit_003",
    timestamp: "2026-05-29 18:47",
    actor: "Reviewer",
    action: "Flagged uncertainty around MU 5",
    target: "MU 5"
  },
  {
    id: "audit_004",
    timestamp: "2026-05-29 18:49",
    actor: "Researcher",
    action: "Edited human summary for MU 7",
    target: "MU 7"
  }
];

export const integratedNarrative =
  "Draft integrated narrative for researcher review: In this case, brief mindfulness practice is described as a small but usable interruption before stress escalates, rather than as a complete solution. Peer support appears to make practice more likely and helps the participant feel less alone in struggling, but it can also introduce pressure when practice is missed. The central tension is that shared accountability can be supportive and burdensome at the same time. Interpretation is limited by the short excerpt and should be checked against the full transcript.";
