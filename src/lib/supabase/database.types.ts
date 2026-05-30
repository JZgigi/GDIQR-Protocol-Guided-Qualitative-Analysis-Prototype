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
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          content: string;
          version_label?: string;
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
          human_status: "Draft" | "Accepted" | "Edited" | "Needs review";
          reviewer_status: "Not run" | "Pass" | "Warning" | "Major issue";
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
          human_status?: "Draft" | "Accepted" | "Edited" | "Needs review";
          reviewer_status?: "Not run" | "Pass" | "Warning" | "Major issue";
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
