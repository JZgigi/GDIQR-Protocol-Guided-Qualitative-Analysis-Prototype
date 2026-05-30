import { GdiqrWorkspace } from "@/components/gdiqr-workspace";
import {
  integratedNarrative,
  mockAuditEvents,
  mockCategories,
  mockMeaningUnits,
  mockProject,
  mockReviewerComments,
  mockSegments,
  mockTranscript
} from "@/lib/mock-data";

export default function Home() {
  return (
    <GdiqrWorkspace
      auditEvents={mockAuditEvents}
      categories={mockCategories}
      integratedNarrative={integratedNarrative}
      meaningUnits={mockMeaningUnits}
      project={mockProject}
      reviewerComments={mockReviewerComments}
      segments={mockSegments}
      transcript={mockTranscript}
    />
  );
}
