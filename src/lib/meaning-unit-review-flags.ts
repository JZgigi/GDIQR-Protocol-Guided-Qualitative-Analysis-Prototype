import type { MeaningUnit } from "@/lib/types";

export const OPENING_BACKGROUND_REVIEW_WARNING =
  "Opening/icebreaker background suggestion: this participant material occurred before the first likely formal research question. It has still been delineated and summarised; the researcher decides whether to include or exclude it.";

export function isOpeningBackgroundCandidate(unit: MeaningUnit) {
  return (unit.reviewerWarnings ?? []).includes(
    OPENING_BACKGROUND_REVIEW_WARNING,
  );
}
