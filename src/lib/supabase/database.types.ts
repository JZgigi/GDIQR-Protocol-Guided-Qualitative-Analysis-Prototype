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
      benchmark_runs: {
        Row: {
          id: string;
          run_number: number;
          project_id: string;
          status: "running" | "completed_frozen" | "failed";
          current_stage: string;
          research_question: string;
          study_context: string;
          analytic_dataset_metadata: Json;
          transcript_snapshot: Json;
          speaker_roles_snapshot: Json;
          transcript_hash: string;
          translated_transcript_hash: string;
          methodological_protocol_version: string;
          methodological_protocol_snapshot: Json;
          methodological_protocol_hash: string;
          computational_config_version: string;
          computational_config_snapshot: Json;
          computational_config_hash: string;
          input_hash: string;
          application_version: string | null;
          git_commit: string | null;
          failure_summary: string | null;
          final_output_hash: string | null;
          mu_execution_started_at: string | null;
          started_at: string;
          completed_at: string | null;
          frozen_at: string | null;
        };
        Insert: {
          id?: string;
          run_number?: number;
          project_id: string;
          status?: "running" | "completed_frozen" | "failed";
          current_stage?: string;
          research_question: string;
          study_context: string;
          analytic_dataset_metadata: Json;
          transcript_snapshot: Json;
          speaker_roles_snapshot: Json;
          transcript_hash: string;
          translated_transcript_hash: string;
          methodological_protocol_version: string;
          methodological_protocol_snapshot: Json;
          methodological_protocol_hash: string;
          computational_config_version: string;
          computational_config_snapshot: Json;
          computational_config_hash: string;
          input_hash: string;
          application_version?: string | null;
          git_commit?: string | null;
          failure_summary?: string | null;
          final_output_hash?: string | null;
          mu_execution_started_at?: string | null;
          started_at?: string;
          completed_at?: string | null;
          frozen_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["benchmark_runs"]["Insert"]>;
        Relationships: [];
      };
      benchmark_stage_outputs: {
        Row: {
          id: string;
          run_id: string;
          stage: string;
          batch_id: string;
          stage_sequence: number;
          status: "completed" | "failed";
          schema_version: string;
          input_reference_hash: string;
          structured_output: Json | null;
          output_hash: string | null;
          validation_result: Json;
          error: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          run_id: string;
          stage: string;
          stage_sequence: number;
          status: "completed" | "failed";
          schema_version: string;
          input_reference_hash: string;
          structured_output?: Json | null;
          output_hash?: string | null;
          validation_result?: Json;
          error?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["benchmark_stage_outputs"]["Insert"]>;
        Relationships: [];
      };
      benchmark_model_attempts: {
        Row: {
          id: string;
          run_id: string;
          stage_output_id: string | null;
          stage: string;
          batch_id: string;
          attempt_number: number;
          attempt_type: "initial" | "technical_retry" | "json_repair";
          provider: string;
          model: string;
          model_digest: string | null;
          parameter_snapshot: Json;
          prompt_template_version: string;
          prompt_template_hash: string;
          request_hash: string;
          raw_response: string | null;
          parsed_response: Json | null;
          validation_status: "valid" | "invalid";
          failure_category: string | null;
          error: string | null;
          duration_ms: number | null;
          provider_generation_id: string | null;
          provider_response_model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          stage_output_id?: string | null;
          stage: string;
          batch_id: string;
          attempt_number: number;
          attempt_type: "initial" | "technical_retry" | "json_repair";
          provider: string;
          model: string;
          model_digest?: string | null;
          parameter_snapshot: Json;
          prompt_template_version: string;
          prompt_template_hash: string;
          request_hash: string;
          raw_response?: string | null;
          parsed_response?: Json | null;
          validation_status: "valid" | "invalid";
          failure_category?: string | null;
          error?: string | null;
          duration_ms?: number | null;
          provider_generation_id?: string | null;
          provider_response_model?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["benchmark_model_attempts"]["Insert"]>;
        Relationships: [];
      };
      benchmark_meaning_units: {
        Row: {
          id: string;
          run_id: string;
          mu_id: string;
          transcript_id: string;
          focus_group_id: string;
          speaker_id: string;
          speaker_role: "participant" | "facilitator" | "unknown";
          turn_ids: string[];
          source_start: number | null;
          source_end: number | null;
          source_text: string;
          source_span_hash: string;
          summary: string;
          uncertainty: string | null;
          source_draft_mu_ids: string[];
          applied_review_finding_ids: string[];
          review_action: "unchanged" | "revised" | "split" | "merged" | "added";
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["benchmark_meaning_units"]["Row"], "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["benchmark_meaning_units"]["Insert"]>;
        Relationships: [];
      };
      benchmark_categories: {
        Row: {
          id: string;
          run_id: string;
          category_id: string;
          name: string;
          description: string;
          rationale: string;
          source_draft_category_ids: string[];
          applied_review_finding_ids: string[];
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["benchmark_categories"]["Row"], "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["benchmark_categories"]["Insert"]>;
        Relationships: [];
      };
      benchmark_category_memberships: {
        Row: {
          run_id: string;
          category_id: string;
          meaning_unit_id: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["benchmark_category_memberships"]["Row"], "created_at"> & { created_at?: string };
        Update: Partial<Database["public"]["Tables"]["benchmark_category_memberships"]["Insert"]>;
        Relationships: [];
      };
      benchmark_integrated_narratives: {
        Row: {
          id: string;
          run_id: string;
          narrative: string;
          claims: Json;
          applied_review_finding_ids: string[];
          evidence_validation: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          narrative: string;
          claims?: Json;
          applied_review_finding_ids?: string[];
          evidence_validation?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["benchmark_integrated_narratives"]["Insert"]>;
        Relationships: [];
      };
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
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          mode?: "A" | "B" | "C";
          integrated_narrative?: string;
          created_at?: string;
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
        };
        Insert: {
          id?: string;
          category_system_id: string;
          parent_category_id?: string | null;
          name: string;
          definition?: string;
          included_unit_numbers?: number[];
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
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
        };
        Insert: {
          id?: string;
          project_id: string;
          event_timestamp?: string;
          actor: "AI" | "Researcher" | "Reviewer";
          action: string;
          target: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["audit_events"]["Insert"]
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
