export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          age_source: string
          ai_summary_ar: string
          cf_scan_uuid: string | null
          created_at: string
          domain_age_days: number | null
          id: string
          impersonated_entity_id: string | null
          level: string
          link_id: string
          outgoing_domains: string[]
          page_title: string
          phones_found: string[]
          reasons_ar: string[]
          score: number
          signals: Json
        }
        Insert: {
          age_source?: string
          ai_summary_ar?: string
          cf_scan_uuid?: string | null
          created_at?: string
          domain_age_days?: number | null
          id?: string
          impersonated_entity_id?: string | null
          level?: string
          link_id: string
          outgoing_domains?: string[]
          page_title?: string
          phones_found?: string[]
          reasons_ar?: string[]
          score?: number
          signals?: Json
        }
        Update: {
          age_source?: string
          ai_summary_ar?: string
          cf_scan_uuid?: string | null
          created_at?: string
          domain_age_days?: number | null
          id?: string
          impersonated_entity_id?: string | null
          level?: string
          link_id?: string
          outgoing_domains?: string[]
          page_title?: string
          phones_found?: string[]
          reasons_ar?: string[]
          score?: number
          signals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analyses_impersonated_entity_id_fkey"
            columns: ["impersonated_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: true
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_cache: {
        Row: {
          expires_at: string
          key: string
          value: Json
        }
        Insert: {
          expires_at: string
          key: string
          value: Json
        }
        Update: {
          expires_at?: string
          key?: string
          value?: Json
        }
        Relationships: []
      }
      entities: {
        Row: {
          brand_keywords: string[]
          category: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
          official_domains: string[]
          official_phones: string[]
        }
        Insert: {
          brand_keywords?: string[]
          category: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          official_domains?: string[]
          official_phones?: string[]
        }
        Update: {
          brand_keywords?: string[]
          category?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          official_domains?: string[]
          official_phones?: string[]
        }
        Relationships: []
      }
      hunts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          phrase: string
          results_count: number
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          phrase: string
          results_count?: number
          source: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          phrase?: string
          results_count?: number
          source?: string
        }
        Relationships: []
      }
      links: {
        Row: {
          depth: number
          domain: string
          final_url: string | null
          first_seen_at: string
          hunt_id: string | null
          id: string
          is_ad: boolean
          maps_phone: string | null
          parent_link_id: string | null
          platform: string
          processing_started_at: string | null
          rank: number | null
          scan_error: string | null
          scan_started_at: string | null
          scan_uuid: string | null
          snippet: string
          status: string
          title: string
          url: string
        }
        Insert: {
          depth?: number
          domain: string
          final_url?: string | null
          first_seen_at?: string
          hunt_id?: string | null
          id?: string
          is_ad?: boolean
          maps_phone?: string | null
          parent_link_id?: string | null
          platform?: string
          processing_started_at?: string | null
          rank?: number | null
          scan_error?: string | null
          scan_started_at?: string | null
          scan_uuid?: string | null
          snippet?: string
          status?: string
          title?: string
          url: string
        }
        Update: {
          depth?: number
          domain?: string
          final_url?: string | null
          first_seen_at?: string
          hunt_id?: string | null
          id?: string
          is_ad?: boolean
          maps_phone?: string | null
          parent_link_id?: string | null
          platform?: string
          processing_started_at?: string | null
          rank?: number | null
          scan_error?: string | null
          scan_started_at?: string | null
          scan_uuid?: string | null
          snippet?: string
          status?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_parent_link_id_fkey"
            columns: ["parent_link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_gate: {
        Row: {
          id: boolean
          last_started_at: string | null
        }
        Insert: {
          id?: boolean
          last_started_at?: string | null
        }
        Update: {
          id?: boolean
          last_started_at?: string | null
        }
        Relationships: []
      }
      search_phrases: {
        Row: {
          active: boolean
          entity_id: string | null
          id: string
          phrase: string
        }
        Insert: {
          active?: boolean
          entity_id?: string | null
          id?: string
          phrase: string
        }
        Update: {
          active?: boolean
          entity_id?: string | null
          id?: string
          phrase?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_phrases_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_analysis: { Args: { _link_id: string }; Returns: boolean }
      claim_scan: { Args: { _link_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
