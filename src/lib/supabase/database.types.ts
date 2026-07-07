export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      audio_files: {
        Row: {
          id: string;
          project_id: string;
          storage_bucket: string;
          storage_path: string;
          original_filename: string;
          content_type: string;
          size_bytes: number;
          language: "English" | "Chinese";
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          storage_bucket?: string;
          storage_path: string;
          original_filename: string;
          content_type?: string;
          size_bytes?: number;
          language?: "English" | "Chinese";
          uploaded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audio_files"]["Insert"]>;
        Relationships: [];
      };
      transcription_jobs: {
        Row: {
          id: string;
          project_id: string;
          audio_file_id: string;
          status: "queued" | "processing" | "completed" | "failed";
          provider: string;
          language: "English" | "Chinese";
          transcript_id: string | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          audio_file_id: string;
          status?: "queued" | "processing" | "completed" | "failed";
          provider?: string;
          language?: "English" | "Chinese";
          transcript_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["transcription_jobs"]["Insert"]
        >;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          title: string;
          research_question: string;
          study_description: string;
          language: "English" | "Chinese";
          protocol: "GDIQR";
          light_interpretation: boolean;
          status: string;
          updated_at: string;
          dataset_type: "open" | "anonymised" | "identifiable_sensitive";
          data_source: "SMARTEN" | "photovoice" | "interview" | "other";
          data_suitability_confirmed: boolean;
          data_suitability_confirmed_at: string | null;
          researcher_notes: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          title: string;
          research_question?: string;
          study_description?: string;
          language?: "English" | "Chinese";
          protocol?: "GDIQR";
          light_interpretation?: boolean;
          status?: string;
          updated_at?: string;
          dataset_type?: "open" | "anonymised" | "identifiable_sensitive";
          data_source?: "SMARTEN" | "photovoice" | "interview" | "other";
          data_suitability_confirmed?: boolean;
          data_suitability_confirmed_at?: string | null;
          researcher_notes?: string;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      transcripts: {
        Row: {
          id: string;
          project_id: string;
          content: string;
          version_label: string;
          anonymisation_status: "not_reviewed" | "reviewed" | "confirmed";
          raw_transcript_retained: boolean;
          sensitive_items: unknown[];
          sensitive_items_reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at: string;
          interview_id?: string | null;
          status?: string;
          raw_content?: string | null;
          cleaned_content?: string | null;
          final_content?: string | null;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          content: string;
          version_label?: string;
          anonymisation_status?: "not_reviewed" | "reviewed" | "confirmed";
          raw_transcript_retained?: boolean;
          sensitive_items?: unknown[];
          sensitive_items_reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          interview_id?: string | null;
          status?: string;
          raw_content?: string | null;
          cleaned_content?: string | null;
          final_content?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transcripts"]["Insert"]>;
        Relationships: [];
      };
      segments: {
        Row: {
          id: string;
          project_id: string;
          case_id: string;
          segment_id: string;
          speaker_info: string;
          start_timestamp: string;
          end_timestamp: string;
          starting_mu_number: number;
          status: "Ready" | "Processed" | "Needs review";
          text: string;
          transcript_id?: string | null;
          segment_number?: number | null;
          topic_label?: string | null;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          case_id: string;
          segment_id: string;
          speaker_info?: string;
          start_timestamp?: string;
          end_timestamp?: string;
          starting_mu_number?: number;
          status?: "Ready" | "Processed" | "Needs review";
          text: string;
          transcript_id?: string | null;
          segment_number?: number | null;
          topic_label?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["segments"]["Insert"]>;
        Relationships: [];
      };
      meaning_units: {
        Row: {
          id: string;
          project_id: string;
          segment_id: string;
          case_id: string;
          speaker: string;
          unit_number: number;
          excerpt: string;
          ai_summary: string;
          human_summary: string;
          tentative_interpretation: string | null;
          uncertainty: string | null;
          human_status:
            | "Draft"
            | "Accepted"
            | "Edited"
            | "Needs review"
            | "Excluded";
          reviewer_status: "Not run" | "Pass" | "Warning" | "Major issue";
          analysis_excluded: boolean;
          exclusion_reason: string | null;
          updated_at: string;
          transcript_id?: string | null;
          light_interpretation?: boolean;
          uncertainty_note?: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          segment_id: string;
          case_id: string;
          speaker?: string;
          unit_number: number;
          excerpt: string;
          ai_summary?: string;
          human_summary?: string;
          tentative_interpretation?: string | null;
          uncertainty?: string | null;
          human_status?:
            | "Draft"
            | "Accepted"
            | "Edited"
            | "Needs review"
            | "Excluded";
          reviewer_status?: "Not run" | "Pass" | "Warning" | "Major issue";
          analysis_excluded?: boolean;
          exclusion_reason?: string | null;
          updated_at?: string;
          transcript_id?: string | null;
          light_interpretation?: boolean;
          uncertainty_note?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["meaning_units"]["Insert"]
        >;
        Relationships: [];
      };
      category_systems: {
        Row: {
          id: string;
          project_id: string;
          mode: "A" | "B" | "C";
          integrated_narrative: string;
          integration_memo: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          mode?: "A" | "B" | "C";
          integrated_narrative?: string;
          integration_memo?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["category_systems"]["Insert"]
        >;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          category_system_id: string;
          parent_category_id: string | null;
          name: string;
          definition: string;
          included_unit_numbers: number[];
          sort_order: number;
          memo: string;
          status:
            | "ai_draft"
            | "fallback_draft"
            | "needs_review"
            | "edited"
            | "confirmed"
            | "rejected";
          source: "ai" | "fallback" | "researcher_confirmed";
          intentionally_uncategorised_unit_numbers: number[];
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_system_id: string;
          parent_category_id?: string | null;
          name: string;
          definition?: string;
          included_unit_numbers?: number[];
          sort_order?: number;
          memo?: string;
          status?:
            | "ai_draft"
            | "fallback_draft"
            | "needs_review"
            | "edited"
            | "confirmed"
            | "rejected";
          source?: "ai" | "fallback" | "researcher_confirmed";
          intentionally_uncategorised_unit_numbers?: number[];
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      integration_relationships: {
        Row: {
          id: string;
          project_id: string;
          category_system_id: string | null;
          source_category_id: string;
          target_category_id: string;
          relationship_label:
            | "contributes to"
            | "contrasts with"
            | "supports"
            | "explains"
            | "is part of"
            | "leads to"
            | "contextualises"
            | "unclear relationship";
          memo: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          category_system_id?: string | null;
          source_category_id: string;
          target_category_id: string;
          relationship_label?:
            | "contributes to"
            | "contrasts with"
            | "supports"
            | "explains"
            | "is part of"
            | "leads to"
            | "contextualises"
            | "unclear relationship";
          memo?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["integration_relationships"]["Insert"]
        >;
        Relationships: [];
      };
      pre_analysis_notes: {
        Row: {
          id: string;
          project_id: string;
          research_question: string;
          study_description: string;
          researcher_position: string;
          contextual_notes: string;
          initial_sensitising_concepts: string;
          data_familiarisation_notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          research_question?: string;
          study_description?: string;
          researcher_position?: string;
          contextual_notes?: string;
          initial_sensitising_concepts?: string;
          data_familiarisation_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["pre_analysis_notes"]["Insert"]
        >;
        Relationships: [];
      };
      integrity_reviews: {
        Row: {
          id: string;
          project_id: string;
          overall_status:
            | "not_started"
            | "in_progress"
            | "issues_found"
            | "ready_for_export";
          reviewer_summary: string;
          researcher_response: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          overall_status?:
            | "not_started"
            | "in_progress"
            | "issues_found"
            | "ready_for_export";
          reviewer_summary?: string;
          researcher_response?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["integrity_reviews"]["Insert"]
        >;
        Relationships: [];
      };
      integrity_review_items: {
        Row: {
          id: string;
          project_id: string;
          review_id: string | null;
          check_key: string;
          prompt: string;
          status: "not_checked" | "pass" | "issue" | "resolved" | "dismissed";
          response: string;
          researcher_note: string;
          generated_from_state: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          review_id?: string | null;
          check_key: string;
          prompt: string;
          status?: "not_checked" | "pass" | "issue" | "resolved" | "dismissed";
          response?: string;
          researcher_note?: string;
          generated_from_state?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["integrity_review_items"]["Insert"]
        >;
        Relationships: [];
      };
      reviewer_comments: {
        Row: {
          id: string;
          project_id: string;
          agent: string;
          target: string;
          severity: "Pass" | "Warning" | "Major issue";
          comment: string;
          suggested_action: string;
          resolved: boolean;
          created_at: string;
          target_type?: string;
          target_id?: string | null;
          reviewer_agent_type?: string | null;
          issue_type?: string | null;
          issue_status?: string;
          resolved_at?: string | null;
          researcher_memo?: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          agent: string;
          target: string;
          severity?: "Pass" | "Warning" | "Major issue";
          comment: string;
          suggested_action?: string;
          resolved?: boolean;
          created_at?: string;
          target_type?: string;
          target_id?: string | null;
          reviewer_agent_type?: string | null;
          issue_type?: string | null;
          issue_status?: string;
          resolved_at?: string | null;
          researcher_memo?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["reviewer_comments"]["Insert"]
        >;
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          project_id: string;
          event_timestamp: string;
          actor: "AI" | "Researcher" | "Reviewer";
          action: string;
          target: string;
          created_at: string;
          step: string | null;
          action_type: string | null;
          target_type: string | null;
          target_id: string | null;
          previous_value: Json | null;
          new_value: Json | null;
          researcher_note: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          event_timestamp?: string;
          actor: "AI" | "Researcher" | "Reviewer";
          action: string;
          target: string;
          created_at?: string;
          step?: string | null;
          action_type?: string | null;
          target_type?: string | null;
          target_id?: string | null;
          previous_value?: Json | null;
          new_value?: Json | null;
          researcher_note?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["audit_events"]["Insert"]
        >;
        Relationships: [];
      };
      edit_logs: {
        Row: {
          id: string;
          project_id: string;
          interview_id: string | null;
          transcript_id: string | null;
          step: string;
          target_type: string;
          target_id: string;
          actor: "AI" | "Researcher" | "Reviewer";
          action_type: string;
          action: string;
          before_value: string | null;
          after_value: string | null;
          previous_value: Json | null;
          new_value: Json | null;
          researcher_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          interview_id?: string | null;
          transcript_id?: string | null;
          step?: string;
          target_type: string;
          target_id: string;
          actor?: "AI" | "Researcher" | "Reviewer";
          action_type?: string;
          action: string;
          before_value?: string | null;
          after_value?: string | null;
          previous_value?: Json | null;
          new_value?: Json | null;
          researcher_note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["edit_logs"]["Insert"]>;
        Relationships: [];
      };
      exports: {
        Row: {
          id: string;
          project_id: string;
          format: "json" | "csv" | "txt" | "docx" | "pdf";
          storage_bucket: string | null;
          storage_path: string | null;
          generated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          format: "json" | "csv" | "txt" | "docx" | "pdf";
          storage_bucket?: string | null;
          storage_path?: string | null;
          generated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["exports"]["Insert"]>;
        Relationships: [];
      };
      guidance_memos: {
        Row: {
          id: string;
          project_id: string;
          step: string;
          question: string;
          answer: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          step: string;
          question?: string;
          answer?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["guidance_memos"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
