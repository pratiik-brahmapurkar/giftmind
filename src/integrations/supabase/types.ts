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
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          post_count: number | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          post_count?: number | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          post_count?: number | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      blog_media: {
        Row: {
          alt_text: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          canonical_url: string | null
          category_id: string | null
          content: string
          created_at: string | null
          cta_click_count: number | null
          cta_occasion: string | null
          cta_text: string | null
          cta_type: string | null
          cta_url: string | null
          excerpt: string | null
          featured_image_alt: string | null
          featured_image_url: string | null
          focus_keyword: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          scheduled_at: string | null
          seo_score: number | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content: string
          created_at?: string | null
          cta_click_count?: number | null
          cta_occasion?: string | null
          cta_text?: string | null
          cta_type?: string | null
          cta_url?: string | null
          excerpt?: string | null
          featured_image_alt?: string | null
          featured_image_url?: string | null
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          seo_score?: number | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: string
          created_at?: string | null
          cta_click_count?: number | null
          cta_occasion?: string | null
          cta_text?: string | null
          cta_type?: string | null
          cta_url?: string | null
          excerpt?: string | null
          featured_image_alt?: string | null
          featured_image_url?: string | null
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          seo_score?: number | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_batches: {
        Row: {
          created_at: string | null
          credits_purchased: number
          credits_remaining: number
          currency: string | null
          expires_at: string
          id: string
          is_expired: boolean | null
          package_name: string
          payment_id: string | null
          payment_provider: string | null
          price_paid: number | null
          purchased_at: string | null
          user_id: string
          warning_sent: boolean | null
        }
        Insert: {
          created_at?: string | null
          credits_purchased: number
          credits_remaining: number
          currency?: string | null
          expires_at: string
          id?: string
          is_expired?: boolean | null
          package_name: string
          payment_id?: string | null
          payment_provider?: string | null
          price_paid?: number | null
          purchased_at?: string | null
          user_id: string
          warning_sent?: boolean | null
        }
        Update: {
          created_at?: string | null
          credits_purchased?: number
          credits_remaining?: number
          currency?: string | null
          expires_at?: string
          id?: string
          is_expired?: boolean | null
          package_name?: string
          payment_id?: string | null
          payment_provider?: string | null
          price_paid?: number | null
          purchased_at?: string | null
          user_id?: string
          warning_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          badge: string | null
          created_at: string | null
          credits: number
          features: string[] | null
          has_batch_mode: boolean | null
          has_history_export: boolean | null
          has_priority_ai: boolean | null
          has_signal_check: boolean | null
          id: string
          is_active: boolean | null
          max_recipients: number | null
          max_regenerations: number | null
          max_reminders: number | null
          name: string
          per_credit_cost: number | null
          price_aed: number | null
          price_aud: number | null
          price_cad: number | null
          price_eur: number | null
          price_gbp: number | null
          price_inr: number
          price_sgd: number | null
          price_usd: number | null
          savings_percent: number | null
          slug: string
          sort_order: number | null
          stores_level: string | null
          validity_days: number
        }
        Insert: {
          badge?: string | null
          created_at?: string | null
          credits: number
          features?: string[] | null
          has_batch_mode?: boolean | null
          has_history_export?: boolean | null
          has_priority_ai?: boolean | null
          has_signal_check?: boolean | null
          id?: string
          is_active?: boolean | null
          max_recipients?: number | null
          max_regenerations?: number | null
          max_reminders?: number | null
          name: string
          per_credit_cost?: number | null
          price_aed?: number | null
          price_aud?: number | null
          price_cad?: number | null
          price_eur?: number | null
          price_gbp?: number | null
          price_inr: number
          price_sgd?: number | null
          price_usd?: number | null
          savings_percent?: number | null
          slug: string
          sort_order?: number | null
          stores_level?: string | null
          validity_days: number
        }
        Update: {
          badge?: string | null
          created_at?: string | null
          credits?: number
          features?: string[] | null
          has_batch_mode?: boolean | null
          has_history_export?: boolean | null
          has_priority_ai?: boolean | null
          has_signal_check?: boolean | null
          id?: string
          is_active?: boolean | null
          max_recipients?: number | null
          max_regenerations?: number | null
          max_reminders?: number | null
          name?: string
          per_credit_cost?: number | null
          price_aed?: number | null
          price_aud?: number | null
          price_cad?: number | null
          price_eur?: number | null
          price_gbp?: number | null
          price_inr?: number
          price_sgd?: number | null
          price_usd?: number | null
          savings_percent?: number | null
          slug?: string
          sort_order?: number | null
          stores_level?: string | null
          validity_days?: number
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          batch_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          payment_id: string | null
          payment_provider: string | null
          session_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          payment_id?: string | null
          payment_provider?: string | null
          session_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          payment_id?: string | null
          payment_provider?: string | null
          session_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "credit_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_feedback: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          recipient_reaction: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          recipient_reaction?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          recipient_reaction?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cultural_rules: {
        Row: {
          avoid_examples: string[]
          confidence: number
          context_tags: string[]
          created_at: string
          embedding: string | null
          embedding_model: string | null
          id: string
          is_active: boolean
          notes: string | null
          rule_text: string
          rule_type: string
          source: string
          suggest_instead: string[]
          updated_at: string
        }
        Insert: {
          avoid_examples?: string[]
          confidence?: number
          context_tags?: string[]
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          rule_text: string
          rule_type?: string
          source?: string
          suggest_instead?: string[]
          updated_at?: string
        }
        Update: {
          avoid_examples?: string[]
          confidence?: number
          context_tags?: string[]
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          rule_text?: string
          rule_type?: string
          source?: string
          suggest_instead?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      gift_embeddings: {
        Row: {
          created_at: string
          embedding: string
          embedding_model: string
          gift_description: string | null
          gift_name: string
          id: string
          occasion: string | null
          price_anchor: number | null
          product_category: string | null
          reaction: string | null
          recipient_id: string
          session_id: string
          source_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding: string
          embedding_model?: string
          gift_description?: string | null
          gift_name: string
          id?: string
          occasion?: string | null
          price_anchor?: number | null
          product_category?: string | null
          reaction?: string | null
          recipient_id: string
          session_id: string
          source_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string
          embedding_model?: string
          gift_description?: string | null
          gift_name?: string
          id?: string
          occasion?: string | null
          price_anchor?: number | null
          product_category?: string | null
          reaction?: string | null
          recipient_id?: string
          session_id?: string
          source_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_embeddings_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_embeddings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_embeddings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_sessions: {
        Row: {
          ai_attempt_number: number | null
          ai_latency_ms: number | null
          ai_model_used: string | null
          ai_provider_used: string | null
          ai_prompt_used: string | null
          ai_response: Json | null
          ai_tokens_input: number | null
          ai_tokens_output: number | null
          budget_max: number | null
          budget_min: number | null
          confidence_score: number | null
          context_tags: string[] | null
          cultural_rules_applied: number
          created_at: string | null
          credits_used: number | null
          currency: string | null
          engine_version: string
          feedback_cultural_fit: number | null
          feedback_cultural_note: string | null
          graph_state: Json | null
          id: string
          node_timings: Json | null
          occasion: string
          occasion_date: string | null
          past_gifts_checked: number
          personalization_scores: Json | null
          product_results: Json | null
          recipient_country: string | null
          recipient_id: string | null
          regeneration_count: number | null
          relationship_stage: string | null
          selected_gift_index: number | null
          selected_gift_name: string | null
          special_context: string | null
          status: string | null
          urgency: string | null
          user_id: string
        }
        Insert: {
          ai_attempt_number?: number | null
          ai_latency_ms?: number | null
          ai_model_used?: string | null
          ai_provider_used?: string | null
          ai_prompt_used?: string | null
          ai_response?: Json | null
          ai_tokens_input?: number | null
          ai_tokens_output?: number | null
          budget_max?: number | null
          budget_min?: number | null
          confidence_score?: number | null
          context_tags?: string[] | null
          cultural_rules_applied?: number
          created_at?: string | null
          credits_used?: number | null
          currency?: string | null
          engine_version?: string
          feedback_cultural_fit?: number | null
          feedback_cultural_note?: string | null
          graph_state?: Json | null
          id?: string
          node_timings?: Json | null
          occasion: string
          occasion_date?: string | null
          past_gifts_checked?: number
          personalization_scores?: Json | null
          product_results?: Json | null
          recipient_country?: string | null
          recipient_id?: string | null
          regeneration_count?: number | null
          relationship_stage?: string | null
          selected_gift_index?: number | null
          selected_gift_name?: string | null
          special_context?: string | null
          status?: string | null
          urgency?: string | null
          user_id: string
        }
        Update: {
          ai_attempt_number?: number | null
          ai_latency_ms?: number | null
          ai_model_used?: string | null
          ai_provider_used?: string | null
          ai_prompt_used?: string | null
          ai_response?: Json | null
          ai_tokens_input?: number | null
          ai_tokens_output?: number | null
          budget_max?: number | null
          budget_min?: number | null
          confidence_score?: number | null
          context_tags?: string[] | null
          cultural_rules_applied?: number
          created_at?: string | null
          credits_used?: number | null
          currency?: string | null
          engine_version?: string
          feedback_cultural_fit?: number | null
          feedback_cultural_note?: string | null
          graph_state?: Json | null
          id?: string
          node_timings?: Json | null
          occasion?: string
          occasion_date?: string | null
          past_gifts_checked?: number
          personalization_scores?: Json | null
          product_results?: Json | null
          recipient_country?: string | null
          recipient_id?: string | null
          regeneration_count?: number | null
          relationship_stage?: string | null
          selected_gift_index?: number | null
          selected_gift_name?: string | null
          special_context?: string | null
          status?: string | null
          urgency?: string | null
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
          {
            foreignKeyName: "gift_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_config: {
        Row: {
          affiliate_param: string | null
          brand_color: string | null
          categories: string[] | null
          country_code: string
          created_at: string | null
          domain: string
          id: string
          is_active: boolean | null
          priority: number | null
          search_url: string
          store_id: string
          store_name: string
        }
        Insert: {
          affiliate_param?: string | null
          brand_color?: string | null
          categories?: string[] | null
          country_code: string
          created_at?: string | null
          domain: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          search_url: string
          store_id: string
          store_name: string
        }
        Update: {
          affiliate_param?: string | null
          brand_color?: string | null
          categories?: string[] | null
          country_code?: string
          created_at?: string | null
          domain?: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          search_url?: string
          store_id?: string
          store_name?: string
        }
        Relationships: []
      }
      product_clicks: {
        Row: {
          clicked_at: string | null
          country: string | null
          gift_concept_name: string | null
          id: string
          is_search_link: boolean | null
          product_title: string | null
          product_url: string | null
          session_id: string | null
          store: string | null
          user_id: string | null
        }
        Insert: {
          clicked_at?: string | null
          country?: string | null
          gift_concept_name?: string | null
          id?: string
          is_search_link?: boolean | null
          product_title?: string | null
          product_url?: string | null
          session_id?: string | null
          store?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_at?: string | null
          country?: string | null
          gift_concept_name?: string | null
          id?: string
          is_search_link?: boolean | null
          product_title?: string | null
          product_url?: string | null
          session_id?: string | null
          store?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_clicks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_clicks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipient_embeddings: {
        Row: {
          created_at: string
          embedding: string
          embedding_model: string
          embedding_version: number
          id: string
          recipient_id: string
          source_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding: string
          embedding_model?: string
          embedding_version?: number
          id?: string
          recipient_id: string
          source_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string
          embedding_model?: string
          embedding_version?: number
          id?: string
          recipient_id?: string
          source_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipient_embeddings_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipient_embeddings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipients: {
        Row: {
          age_range: string | null
          country: string | null
          created_at: string | null
          cultural_context: string | null
          gender: string | null
          gift_count_cached: number
          id: string
          is_archived: boolean
          important_dates: Json | null
          interests: string[] | null
          last_gift_date: string | null
          name: string
          notes: string | null
          relationship: string | null
          relationship_depth: string | null
          session_count: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_range?: string | null
          country?: string | null
          created_at?: string | null
          cultural_context?: string | null
          gender?: string | null
          gift_count_cached?: number
          id?: string
          is_archived?: boolean
          important_dates?: Json | null
          interests?: string[] | null
          last_gift_date?: string | null
          name: string
          notes?: string | null
          relationship?: string | null
          relationship_depth?: string | null
          session_count?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_range?: string | null
          country?: string | null
          created_at?: string | null
          cultural_context?: string | null
          gender?: string | null
          gift_count_cached?: number
          id?: string
          is_archived?: boolean
          important_dates?: Json | null
          interests?: string[] | null
          last_gift_date?: string | null
          name?: string
          notes?: string | null
          relationship?: string | null
          relationship_depth?: string | null
          session_count?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          credits_awarded: boolean | null
          id: string
          referral_code: string | null
          referred_id: string | null
          referrer_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          credits_awarded?: boolean | null
          id?: string
          referral_code?: string | null
          referred_id?: string | null
          referrer_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          credits_awarded?: boolean | null
          id?: string
          referral_code?: string | null
          referred_id?: string | null
          referrer_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_checks: {
        Row: {
          created_at: string
          credits_used: number
          follow_up_prompt: string | null
          gift_name: string
          id: string
          parent_signal_check_id: string | null
          result_payload: Json
          revision_number: number
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          follow_up_prompt?: string | null
          gift_name: string
          id?: string
          parent_signal_check_id?: string | null
          result_payload?: Json
          revision_number?: number
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          follow_up_prompt?: string | null
          gift_name?: string
          id?: string
          parent_signal_check_id?: string | null
          result_payload?: Json
          revision_number?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_checks_parent_signal_check_id_fkey"
            columns: ["parent_signal_check_id"]
            isOneToOne: false
            referencedRelation: "signal_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_checks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active_plan: string | null
          avatar_url: string | null
          birthday: string | null
          country: string | null
          created_at: string | null
          credits_balance: number | null
          email: string
          full_name: string | null
          has_completed_onboarding: boolean | null
          id: string
          language: string | null
          last_active_at: string | null
          notification_prefs: Json | null
          onboarding_bonus_granted: boolean | null
          onboarding_state: Json | null
          profile_completion_percentage: number
          referral_code: string | null
          referred_by: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          active_plan?: string | null
          avatar_url?: string | null
          birthday?: string | null
          country?: string | null
          created_at?: string | null
          credits_balance?: number | null
          email: string
          full_name?: string | null
          has_completed_onboarding?: boolean | null
          id: string
          language?: string | null
          last_active_at?: string | null
          notification_prefs?: Json | null
          onboarding_bonus_granted?: boolean | null
          onboarding_state?: Json | null
          profile_completion_percentage?: number
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          active_plan?: string | null
          avatar_url?: string | null
          birthday?: string | null
          country?: string | null
          created_at?: string | null
          credits_balance?: number | null
          email?: string
          full_name?: string | null
          has_completed_onboarding?: boolean | null
          id?: string
          language?: string | null
          last_active_at?: string | null
          notification_prefs?: Json | null
          onboarding_bonus_granted?: boolean | null
          onboarding_state?: Json | null
          profile_completion_percentage?: number
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_profile_completion: {
        Args: {
          p_user_id: string
        }
        Returns: number
      }
      get_recent_past_gifts: {
        Args: {
          p_limit?: number
          p_recipient_id: string
        }
        Returns: {
          created_at: string
          gift_name: string
          occasion: string
        }[]
      }
      match_cultural_rules: {
        Args: {
          filter_tags?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          avoid_examples: string[]
          confidence: number
          context_tags: string[]
          id: string
          rule_text: string
          rule_type: string
          similarity: number
          suggest_instead: string[]
        }[]
      }
      match_past_gifts: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_recipient_id: string
          query_embedding: string
        }
        Returns: {
          gift_description: string
          gift_name: string
          gifted_at: string
          occasion: string
          reaction: string
          similarity: number
        }[]
      }
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
    Enums: {},
  },
} as const
