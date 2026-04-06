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
      blog_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      blog_media: {
        Row: {
          alt_text: string | null
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          uploaded_by: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
          uploaded_by: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string
          category_id: string | null
          content: string | null
          created_at: string
          cta_clicks: number
          excerpt: string | null
          featured_image: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          scheduled_at: string | null
          slug: string
          status: Database["public"]["Enums"]["blog_post_status"]
          tags: string[] | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          author_id: string
          category_id?: string | null
          content?: string | null
          created_at?: string
          cta_clicks?: number
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          author_id?: string
          category_id?: string | null
          content?: string | null
          created_at?: string
          cta_clicks?: number
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          badge_text: string | null
          created_at: string
          credits: number
          features: string[] | null
          id: string
          is_active: boolean
          name: string
          price_inr: number
          price_usd: number
          sort_order: number
          updated_at: string
          validity_days: number
        }
        Insert: {
          badge_text?: string | null
          created_at?: string
          credits: number
          features?: string[] | null
          id?: string
          is_active?: boolean
          name: string
          price_inr?: number
          price_usd?: number
          sort_order?: number
          updated_at?: string
          validity_days?: number
        }
        Update: {
          badge_text?: string | null
          created_at?: string
          credits?: number
          features?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          price_inr?: number
          price_usd?: number
          sort_order?: number
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          details: string | null
          id: string
          payment_id: string | null
          provider: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          details?: string | null
          id?: string
          payment_id?: string | null
          provider?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          details?: string | null
          id?: string
          payment_id?: string | null
          provider?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      gift_sessions: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          chosen_gift: Json | null
          context_tags: string[] | null
          created_at: string
          currency: string
          extra_notes: string | null
          feedback_notes: string | null
          feedback_rating: string | null
          id: string
          occasion: string | null
          occasion_date: string | null
          recipient_country: string | null
          recipient_id: string | null
          results: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          chosen_gift?: Json | null
          context_tags?: string[] | null
          created_at?: string
          currency?: string
          extra_notes?: string | null
          feedback_notes?: string | null
          feedback_rating?: string | null
          id?: string
          occasion?: string | null
          occasion_date?: string | null
          recipient_country?: string | null
          recipient_id?: string | null
          results?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          chosen_gift?: Json | null
          context_tags?: string[] | null
          created_at?: string
          currency?: string
          extra_notes?: string | null
          feedback_notes?: string | null
          feedback_rating?: string | null
          id?: string
          occasion?: string | null
          occasion_date?: string | null
          recipient_country?: string | null
          recipient_id?: string | null
          results?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_sessions_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_config: {
        Row: {
          affiliate_tag: string | null
          brand_color: string | null
          categories: string[] | null
          country: string
          created_at: string
          domain: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          priority: number | null
          search_url_pattern: string | null
          store_name: string
          updated_at: string
        }
        Insert: {
          affiliate_tag?: string | null
          brand_color?: string | null
          categories?: string[] | null
          country?: string
          created_at?: string
          domain: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          priority?: number | null
          search_url_pattern?: string | null
          store_name: string
          updated_at?: string
        }
        Update: {
          affiliate_tag?: string | null
          brand_color?: string | null
          categories?: string[] | null
          country?: string
          created_at?: string
          domain?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          priority?: number | null
          search_url_pattern?: string | null
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_clicks: {
        Row: {
          clicked_at: string
          country: string | null
          gift_concept_name: string
          id: string
          is_search_link: boolean | null
          product_url: string
          session_id: string | null
          store: string
          user_id: string
        }
        Insert: {
          clicked_at?: string
          country?: string | null
          gift_concept_name: string
          id?: string
          is_search_link?: boolean | null
          product_url: string
          session_id?: string | null
          store: string
          user_id: string
        }
        Update: {
          clicked_at?: string
          country?: string | null
          gift_concept_name?: string
          id?: string
          is_search_link?: boolean | null
          product_url?: string
          session_id?: string | null
          store?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_clicks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gift_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          credits: number
          currency_preference: string | null
          full_name: string | null
          has_completed_onboarding: boolean
          id: string
          language: string | null
          notify_credit_expiry: boolean | null
          notify_gift_reminders: boolean | null
          notify_tips: boolean | null
          referral_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          credits?: number
          currency_preference?: string | null
          full_name?: string | null
          has_completed_onboarding?: boolean
          id?: string
          language?: string | null
          notify_credit_expiry?: boolean | null
          notify_gift_reminders?: boolean | null
          notify_tips?: boolean | null
          referral_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          credits?: number
          currency_preference?: string | null
          full_name?: string | null
          has_completed_onboarding?: boolean
          id?: string
          language?: string | null
          notify_credit_expiry?: boolean | null
          notify_gift_reminders?: boolean | null
          notify_tips?: boolean | null
          referral_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipients: {
        Row: {
          age_range: Database["public"]["Enums"]["age_range"] | null
          country: string | null
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
          country?: string | null
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
          country?: string | null
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
      referrals: {
        Row: {
          created_at: string
          credits_awarded: number | null
          id: string
          referred_email: string
          referrer_id: string
          status: string
        }
        Insert: {
          created_at?: string
          credits_awarded?: number | null
          id?: string
          referred_email: string
          referrer_id: string
          status?: string
        }
        Update: {
          created_at?: string
          credits_awarded?: number | null
          id?: string
          referred_email?: string
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_post_views: { Args: { post_slug: string }; Returns: undefined }
    }
    Enums: {
      age_range: "under_18" | "18_25" | "25_35" | "35_50" | "50_65" | "65_plus"
      app_role: "superadmin" | "admin" | "user"
      blog_post_status: "draft" | "published" | "scheduled" | "archived"
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
      app_role: ["superadmin", "admin", "user"],
      blog_post_status: ["draft", "published", "scheduled", "archived"],
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
