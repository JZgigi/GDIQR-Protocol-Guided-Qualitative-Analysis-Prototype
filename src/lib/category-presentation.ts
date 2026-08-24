interface CategoryCardTextInput {
  assistantDefinition: string;
  assistantLabel: string;
  researcherDefinition: string;
  researcherTitle: string;
}

export function resolveCategoryCardText({
  assistantDefinition,
  assistantLabel,
  researcherDefinition,
  researcherTitle,
}: CategoryCardTextInput) {
  return {
    definition:
      assistantDefinition.trim() ||
      researcherDefinition.trim() ||
      "No shared-meaning definition was returned. Review this grouping before using it.",
    title:
      assistantLabel.trim() ||
      researcherTitle.trim() ||
      "Untitled provisional category",
  };
}
