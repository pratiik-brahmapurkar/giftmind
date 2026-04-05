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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          has_completed_onboarding: boolean
          id: string
          referral_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          has_completed_onboarding?: boolean
          id?: string
          referral_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          has_completed_onboarding?: boolean
          id?: string
          referral_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipients: {
        Row: {
          age_range: Database["public"]["Enums"]["age_range"] | null
          created_at: string
          cultural_context:
            | Database["public"]["Enums"]["cultural_context"]
            | null
          gender: Database["public"]["Enums"]["gender_option"] | null
          id: string
          important_dates: Json | null
          interests: string[] | null
          last_gift_date: string | null
          name: string
          notes: string | null
          relationship_depth: Database["public"]["Enums"]["relationship_depth"]
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          age_range?: Database["public"]["Enums"]["age_range"] | null
          created_at?: string
          cultural_context?:
            | Database["public"]["Enums"]["cultural_context"]
            | null
          gender?: Database["public"]["Enums"]["gender_option"] | null
          id?: string
          important_dates?: Json | null
          interests?: string[] | null
          last_gift_date?: string | null
          name: string
          notes?: string | null
          relationship_depth?: Database["public"]["Enums"]["relationship_depth"]
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          age_range?: Database["public"]["Enums"]["age_range"] | null
          created_at?: string
          cultural_context?:
            | Database["public"]["Enums"]["cultural_context"]
            | null
          gender?: Database["public"]["Enums"]["gender_option"] | null
          id?: string
          important_dates?: Json | null
          interests?: string[] | null
          last_gift_date?: string | null
          name?: string
          notes?: string | null
          relationship_depth?: Database["public"]["Enums"]["relationship_depth"]
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      age_range: "under_18" | "18_25" | "25_35" | "35_50" | "50_65" | "65_plus"
      cultural_context:
        | "indian_hindu"
        | "indian_muslim"
        | "indian_christian"
        | "western"
        | "mixed"
        | "other"
      gender_option: "male" | "female" | "non_binary" | "prefer_not_to_say"
      relationship_depth: "very_close" | "close" | "acquaintance"
      relationship_type:
        | "partner"
        | "parent"
        | "sibling"
        | "close_friend"
        | "friend"
        | "colleague"
        | "boss"
        | "acquaintance"
        | "in_law"
        | "child"
        | "mentor"
        | "new_relationship"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      age_range: ["under_18", "18_25", "25_35", "35_50", "50_65", "65_plus"],
      cultural_context: [
        "indian_hindu",
        "indian_muslim",
        "indian_christian",
        "western",
        "mixed",
        "other",
      ],
      gender_option: ["male", "female", "non_binary", "prefer_not_to_say"],
      relationship_depth: ["very_close", "close", "acquaintance"],
      relationship_type: [
        "partner",
        "parent",
        "sibling",
        "close_friend",
        "friend",
        "colleague",
        "boss",
        "acquaintance",
        "in_law",
        "child",
        "mentor",
        "new_relationship",
      ],
    },
  },
} as const
