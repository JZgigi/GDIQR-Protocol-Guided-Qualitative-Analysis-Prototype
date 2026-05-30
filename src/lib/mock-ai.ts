import {
  integratedNarrative,
  mockCategories,
  mockMeaningUnits,
  mockReviewerComments
} from "./mock-data";

export function runMockMeaningUnits() {
  return {
    caseId: "CASE-001",
    segmentId: "SEG-001",
    lightInterpretation: false,
    meaningUnits: mockMeaningUnits,
    uncertainties: [
      {
        unit: 5,
        note: "Check whether the failure feeling comes from the practice itself or comparison in the group chat."
      }
    ],
    nextInstruction: "Send the next segment."
  };
}

export function runMockCategories(mode: "A" | "B" | "C") {
  return {
    caseId: "CASE-001",
    researchQuestion:
      "How do students describe their experiences of brief mindfulness practice and peer support?",
    mode,
    categories: mockCategories,
    categoryRevisions:
      mode === "B"
        ? [
            "Kept peer encouragement and peer pressure under one category to preserve the tension.",
            "Revised category definition to avoid overstating effectiveness."
          ]
        : [],
    structuralModel:
      mode === "C"
        ? "Brief practice works as a modest pause; peer contact creates both encouragement and pressure."
        : "",
    integratedNarrative: mode === "C" ? integratedNarrative : "",
    uncertainties: [
      "MU 5 needs researcher review before final inclusion language is fixed."
    ]
  };
}

export function runMockReviewer() {
  return {
    status: "completed",
    comments: mockReviewerComments
  };
}
