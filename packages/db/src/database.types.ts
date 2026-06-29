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
      agent_knowledge: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: number
          is_active: boolean
          metadata: Json
          tenant_id: number
          title: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: number
          is_active?: boolean
          metadata?: Json
          tenant_id: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: number
          is_active?: boolean
          metadata?: Json
          tenant_id?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_keywords: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          pattern: string
          tenant_id: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          pattern: string
          tenant_id: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          pattern?: string
          tenant_id?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_keywords_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_accounts: {
        Row: {
          channel_kind: Database["public"]["Enums"]["channel_type"] | null
          created_at: string
          description: string | null
          external_calendar_id: string
          ghl_metadata: Json | null
          id: number
          integration_account_id: number
          is_active: boolean
          is_default: boolean
          name: string
          provider: string
          slug: string | null
          tenant_id: number
          updated_at: string
          widget_base_url: string | null
        }
        Insert: {
          channel_kind?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          description?: string | null
          external_calendar_id: string
          ghl_metadata?: Json | null
          id?: number
          integration_account_id: number
          is_active?: boolean
          is_default?: boolean
          name: string
          provider?: string
          slug?: string | null
          tenant_id: number
          updated_at?: string
          widget_base_url?: string | null
        }
        Update: {
          channel_kind?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          description?: string | null
          external_calendar_id?: string
          ghl_metadata?: Json | null
          id?: number
          integration_account_id?: number
          is_active?: boolean
          is_default?: boolean
          name?: string
          provider?: string
          slug?: string | null
          tenant_id?: number
          updated_at?: string
          widget_base_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_accounts_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_appointments: {
        Row: {
          appointment_status: string
          assigned_user_external_id: string | null
          calendar_account_id: number
          conversation_id: number | null
          end_at: string
          external_appointment_id: string
          external_contact_id: string | null
          id: number
          lead_id: number | null
          match_confidence: number | null
          match_method: string | null
          notes: string | null
          payload: Json
          received_at: string
          source: string | null
          start_at: string
          tenant_id: number
          title: string | null
          updated_at: string
        }
        Insert: {
          appointment_status?: string
          assigned_user_external_id?: string | null
          calendar_account_id: number
          conversation_id?: number | null
          end_at: string
          external_appointment_id: string
          external_contact_id?: string | null
          id?: number
          lead_id?: number | null
          match_confidence?: number | null
          match_method?: string | null
          notes?: string | null
          payload?: Json
          received_at?: string
          source?: string | null
          start_at: string
          tenant_id: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          appointment_status?: string
          assigned_user_external_id?: string | null
          calendar_account_id?: number
          conversation_id?: number | null
          end_at?: string
          external_appointment_id?: string
          external_contact_id?: string | null
          id?: number
          lead_id?: number | null
          match_confidence?: number | null
          match_method?: string | null
          notes?: string | null
          payload?: Json
          received_at?: string
          source?: string | null
          start_at?: string
          tenant_id?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_appointments_calendar_account_id_fkey"
            columns: ["calendar_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_labels: {
        Row: {
          applied_at: string
          applied_by: number | null
          applied_via: string
          conversation_id: number
          label_id: number
          tenant_id: number
        }
        Insert: {
          applied_at?: string
          applied_by?: number | null
          applied_via: string
          conversation_id: number
          label_id: number
          tenant_id: number
        }
        Update: {
          applied_at?: string
          applied_by?: number | null
          applied_via?: string
          conversation_id?: number
          label_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_labels_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "tenant_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          audio_url: string | null
          content: string
          content_type: Database["public"]["Enums"]["message_content_type"]
          conversation_id: number
          created_at: string
          external_msg_id: string | null
          id: number
          media_mime: string | null
          metadata: Json
          role: Database["public"]["Enums"]["message_role"]
          tenant_id: number
          transcription: string | null
        }
        Insert: {
          audio_url?: string | null
          content: string
          content_type?: Database["public"]["Enums"]["message_content_type"]
          conversation_id: number
          created_at?: string
          external_msg_id?: string | null
          id?: number
          media_mime?: string | null
          metadata?: Json
          role: Database["public"]["Enums"]["message_role"]
          tenant_id: number
          transcription?: string | null
        }
        Update: {
          audio_url?: string | null
          content?: string
          content_type?: Database["public"]["Enums"]["message_content_type"]
          conversation_id?: number
          created_at?: string
          external_msg_id?: string | null
          id?: number
          media_mime?: string | null
          metadata?: Json
          role?: Database["public"]["Enums"]["message_role"]
          tenant_id?: number
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          author_email: string | null
          author_user_id: number | null
          content: string
          conversation_id: number
          created_at: string
          id: number
          tenant_id: number
        }
        Insert: {
          author_email?: string | null
          author_user_id?: number | null
          content: string
          conversation_id: number
          created_at?: string
          id?: number
          tenant_id: number
        }
        Update: {
          author_email?: string | null
          author_user_id?: number | null
          content?: string
          conversation_id?: number
          created_at?: string
          id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused_until: string | null
          appointment_scheduled_at: string | null
          assigned_user_id: number | null
          channel: Database["public"]["Enums"]["channel_type"]
          conversation_source: string | null
          created_at: string
          current_context: string | null
          current_phase: number
          custom_fields: Json
          direction: Database["public"]["Enums"]["conversation_direction"]
          emotion: string | null
          first_ai_message_at: string | null
          first_lead_response_at: string | null
          general_context: string | null
          general_motivation: string | null
          ghl_contact_id: string | null
          ghl_conversation_id: string | null
          ghl_opportunity_id: string | null
          ghl_opportunity_status: string | null
          goal: string | null
          handoff_at: string | null
          handoff_cause: Database["public"]["Enums"]["handoff_cause"] | null
          handoff_reason: string | null
          id: number
          is_blocked: boolean
          is_handoff_to_human: boolean
          is_qualified: boolean | null
          is_scheduling_link_sent: boolean
          is_unread: boolean
          last_message_at: string | null
          lead_id: number
          next_action: string | null
          phase_message_count: number
          priority: Database["public"]["Enums"]["conversation_priority"] | null
          problem: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          tenant_id: number
          updated_at: string
          urgency: string | null
        }
        Insert: {
          ai_paused_until?: string | null
          appointment_scheduled_at?: string | null
          assigned_user_id?: number | null
          channel: Database["public"]["Enums"]["channel_type"]
          conversation_source?: string | null
          created_at?: string
          current_context?: string | null
          current_phase?: number
          custom_fields?: Json
          direction?: Database["public"]["Enums"]["conversation_direction"]
          emotion?: string | null
          first_ai_message_at?: string | null
          first_lead_response_at?: string | null
          general_context?: string | null
          general_motivation?: string | null
          ghl_contact_id?: string | null
          ghl_conversation_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_opportunity_status?: string | null
          goal?: string | null
          handoff_at?: string | null
          handoff_cause?: Database["public"]["Enums"]["handoff_cause"] | null
          handoff_reason?: string | null
          id?: number
          is_blocked?: boolean
          is_handoff_to_human?: boolean
          is_qualified?: boolean | null
          is_scheduling_link_sent?: boolean
          is_unread?: boolean
          last_message_at?: string | null
          lead_id: number
          next_action?: string | null
          phase_message_count?: number
          priority?: Database["public"]["Enums"]["conversation_priority"] | null
          problem?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tenant_id: number
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          ai_paused_until?: string | null
          appointment_scheduled_at?: string | null
          assigned_user_id?: number | null
          channel?: Database["public"]["Enums"]["channel_type"]
          conversation_source?: string | null
          created_at?: string
          current_context?: string | null
          current_phase?: number
          custom_fields?: Json
          direction?: Database["public"]["Enums"]["conversation_direction"]
          emotion?: string | null
          first_ai_message_at?: string | null
          first_lead_response_at?: string | null
          general_context?: string | null
          general_motivation?: string | null
          ghl_contact_id?: string | null
          ghl_conversation_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_opportunity_status?: string | null
          goal?: string | null
          handoff_at?: string | null
          handoff_cause?: Database["public"]["Enums"]["handoff_cause"] | null
          handoff_reason?: string | null
          id?: number
          is_blocked?: boolean
          is_handoff_to_human?: boolean
          is_qualified?: boolean | null
          is_scheduling_link_sent?: boolean
          is_unread?: boolean
          last_message_at?: string | null
          lead_id?: number
          next_action?: string | null
          phase_message_count?: number
          priority?: Database["public"]["Enums"]["conversation_priority"] | null
          problem?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tenant_id?: number
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_templates: {
        Row: {
          ai_guide: string | null
          ai_personalize: boolean
          body: string | null
          category: string | null
          channel_kind: Database["public"]["Enums"]["channel_type"]
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          language: string | null
          name: string
          provider: string
          provider_metadata: Json
          provider_template_id: string | null
          status: string
          tenant_id: number
          updated_at: string
          variables: Json
        }
        Insert: {
          ai_guide?: string | null
          ai_personalize?: boolean
          body?: string | null
          category?: string | null
          channel_kind: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: number
          language?: string | null
          name: string
          provider?: string
          provider_metadata?: Json
          provider_template_id?: string | null
          status?: string
          tenant_id: number
          updated_at?: string
          variables?: Json
        }
        Update: {
          ai_guide?: string | null
          ai_personalize?: boolean
          body?: string | null
          category?: string | null
          channel_kind?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: number
          language?: string | null
          name?: string
          provider?: string
          provider_metadata?: Json
          provider_template_id?: string | null
          status?: string
          tenant_id?: number
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "followup_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ignored_users: {
        Row: {
          channel: Database["public"]["Enums"]["channel_type"] | null
          created_at: string
          external_user_id: string
          id: number
          reason: string | null
          tenant_id: number
        }
        Insert: {
          channel?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          external_user_id: string
          id?: number
          reason?: string | null
          tenant_id: number
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          external_user_id?: string
          id?: number
          reason?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ignored_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          active: boolean
          connection_config: Json
          created_at: string
          credentials_encrypted: Json | null
          display_name: string
          id: number
          last_webhook_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          tenant_id: number
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          active?: boolean
          connection_config?: Json
          created_at?: string
          credentials_encrypted?: Json | null
          display_name: string
          id?: number
          last_webhook_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          tenant_id: number
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          active?: boolean
          connection_config?: Json
          created_at?: string
          credentials_encrypted?: Json | null
          display_name?: string
          id?: number
          last_webhook_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          tenant_id?: number
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      label_automation_rules: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          label_id: number
          tenant_id: number
          trigger_type: string
          trigger_value: Json
          trigger_who: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          label_id: number
          tenant_id: number
          trigger_type: string
          trigger_value?: Json
          trigger_who: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          label_id?: number
          tenant_id?: number
          trigger_type?: string
          trigger_value?: Json
          trigger_who?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_automation_rules_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "tenant_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_preferences: {
        Row: {
          created_at: string
          features_required: Json
          id: number
          lead_id: number
          m2_min: number | null
          motives: string | null
          neighborhoods: string[] | null
          price_max_eur: number | null
          price_min_eur: number | null
          rooms_min: number | null
          tenant_id: number
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          urgency: string | null
        }
        Insert: {
          created_at?: string
          features_required?: Json
          id?: number
          lead_id: number
          m2_min?: number | null
          motives?: string | null
          neighborhoods?: string[] | null
          price_max_eur?: number | null
          price_min_eur?: number | null
          rooms_min?: number | null
          tenant_id: number
          type: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          created_at?: string
          features_required?: Json
          id?: number
          lead_id?: number
          m2_min?: number | null
          motives?: string | null
          neighborhoods?: string[] | null
          price_max_eur?: number | null
          price_min_eur?: number | null
          rooms_min?: number | null
          tenant_id?: number
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_preferences_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_property_interest: {
        Row: {
          created_at: string
          id: number
          lead_id: number
          notes: string | null
          property_id: number
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          lead_id: number
          notes?: string | null
          property_id: number
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          lead_id?: number
          notes?: string | null
          property_id?: number
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_property_interest_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interest_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interest_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to_user_id: number | null
          channel: Database["public"]["Enums"]["channel_type"]
          created_at: string
          current_phase: number
          deleted_at: string | null
          email: string | null
          external_id: string | null
          full_name: string | null
          id: number
          intent: Database["public"]["Enums"]["lead_intent"]
          last_message_at: string | null
          location: string | null
          office_id: number | null
          phone: string
          source_notes: string | null
          status: Database["public"]["Enums"]["lead_status"]
          tenant_id: number
          timezone: string | null
          tracking_uuid: string | null
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: number | null
          channel: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          current_phase?: number
          deleted_at?: string | null
          email?: string | null
          external_id?: string | null
          full_name?: string | null
          id?: number
          intent?: Database["public"]["Enums"]["lead_intent"]
          last_message_at?: string | null
          location?: string | null
          office_id?: number | null
          phone: string
          source_notes?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id: number
          timezone?: string | null
          tracking_uuid?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: number | null
          channel?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          current_phase?: number
          deleted_at?: string | null
          email?: string | null
          external_id?: string | null
          full_name?: string | null
          id?: number
          intent?: Database["public"]["Enums"]["lead_intent"]
          last_message_at?: string | null
          location?: string | null
          office_id?: number | null
          phone?: string
          source_notes?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id?: number
          timezone?: string | null
          tracking_uuid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          conversation_id: number | null
          cost: number | null
          created_at: string
          error_message: string | null
          id: number
          latency_ms: number | null
          model: string
          provider: Database["public"]["Enums"]["llm_provider"]
          request_payload: Json | null
          response_payload: Json | null
          role: Database["public"]["Enums"]["llm_role"]
          status: Database["public"]["Enums"]["llm_call_status"]
          tenant_id: number
          tokens_in: number | null
          tokens_in_cached: number | null
          tokens_out: number | null
        }
        Insert: {
          conversation_id?: number | null
          cost?: number | null
          created_at?: string
          error_message?: string | null
          id?: number
          latency_ms?: number | null
          model: string
          provider: Database["public"]["Enums"]["llm_provider"]
          request_payload?: Json | null
          response_payload?: Json | null
          role: Database["public"]["Enums"]["llm_role"]
          status: Database["public"]["Enums"]["llm_call_status"]
          tenant_id: number
          tokens_in?: number | null
          tokens_in_cached?: number | null
          tokens_out?: number | null
        }
        Update: {
          conversation_id?: number | null
          cost?: number | null
          created_at?: string
          error_message?: string | null
          id?: number
          latency_ms?: number | null
          model?: string
          provider?: Database["public"]["Enums"]["llm_provider"]
          request_payload?: Json | null
          response_payload?: Json | null
          role?: Database["public"]["Enums"]["llm_role"]
          status?: Database["public"]["Enums"]["llm_call_status"]
          tenant_id?: number
          tokens_in?: number | null
          tokens_in_cached?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_configs: {
        Row: {
          api_key_encrypted: string | null
          created_at: string
          id: number
          is_active: boolean
          model: string
          price_cached_input_per_1m: number | null
          price_input_per_1m: number | null
          price_output_per_1m: number | null
          provider: Database["public"]["Enums"]["llm_provider"]
          role: Database["public"]["Enums"]["llm_role"]
          tenant_id: number
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string
          id?: number
          is_active?: boolean
          model: string
          price_cached_input_per_1m?: number | null
          price_input_per_1m?: number | null
          price_output_per_1m?: number | null
          provider?: Database["public"]["Enums"]["llm_provider"]
          role?: Database["public"]["Enums"]["llm_role"]
          tenant_id: number
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string
          id?: number
          is_active?: boolean
          model?: string
          price_cached_input_per_1m?: number | null
          price_input_per_1m?: number | null
          price_output_per_1m?: number | null
          provider?: Database["public"]["Enums"]["llm_provider"]
          role?: Database["public"]["Enums"]["llm_role"]
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_schedules: {
        Row: {
          ai_guide: string | null
          ai_personalize: boolean
          attachment_url: string | null
          attempts: number
          auto_cancel_on_reply: boolean
          channel: Database["public"]["Enums"]["channel_type"]
          conversation_id: number
          created_at: string
          created_by_user_id: number | null
          error_message: string | null
          has_attachment: boolean
          id: number
          integration_account_id: number | null
          message: string | null
          message_type: Database["public"]["Enums"]["schedule_message_kind"]
          resource_id: number | null
          resource_type: Database["public"]["Enums"]["resource_type"] | null
          scheduled_for: string
          sent_at: string | null
          sequence_index: number | null
          status: Database["public"]["Enums"]["schedule_status"]
          step_number: number
          template_id: number | null
          tenant_id: number
          triggered_by: string
          updated_at: string
        }
        Insert: {
          ai_guide?: string | null
          ai_personalize?: boolean
          attachment_url?: string | null
          attempts?: number
          auto_cancel_on_reply?: boolean
          channel: Database["public"]["Enums"]["channel_type"]
          conversation_id: number
          created_at?: string
          created_by_user_id?: number | null
          error_message?: string | null
          has_attachment?: boolean
          id?: number
          integration_account_id?: number | null
          message?: string | null
          message_type?: Database["public"]["Enums"]["schedule_message_kind"]
          resource_id?: number | null
          resource_type?: Database["public"]["Enums"]["resource_type"] | null
          scheduled_for: string
          sent_at?: string | null
          sequence_index?: number | null
          status?: Database["public"]["Enums"]["schedule_status"]
          step_number: number
          template_id?: number | null
          tenant_id: number
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          ai_guide?: string | null
          ai_personalize?: boolean
          attachment_url?: string | null
          attempts?: number
          auto_cancel_on_reply?: boolean
          channel?: Database["public"]["Enums"]["channel_type"]
          conversation_id?: number
          created_at?: string
          created_by_user_id?: number | null
          error_message?: string | null
          has_attachment?: boolean
          id?: number
          integration_account_id?: number | null
          message?: string | null
          message_type?: Database["public"]["Enums"]["schedule_message_kind"]
          resource_id?: number | null
          resource_type?: Database["public"]["Enums"]["resource_type"] | null
          scheduled_for?: string
          sent_at?: string | null
          sequence_index?: number | null
          status?: Database["public"]["Enums"]["schedule_status"]
          step_number?: number
          template_id?: number | null
          tenant_id?: number
          triggered_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_schedules_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "followup_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_whatsapp_outbox: {
        Row: {
          conversation_id: number
          created_at: string
          delivered_at: string | null
          id: number
          parts: Json
          status: string
          tenant_id: number
        }
        Insert: {
          conversation_id: number
          created_at?: string
          delivered_at?: string | null
          id?: number
          parts?: Json
          status?: string
          tenant_id: number
        }
        Update: {
          conversation_id?: number
          created_at?: string
          delivered_at?: string | null
          id?: number
          parts?: Json
          status?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "mock_whatsapp_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_whatsapp_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          active: boolean
          address: string
          city: string
          created_at: string
          id: number
          name: string
          phone: string | null
          slug: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          address: string
          city?: string
          created_at?: string
          id?: number
          name: string
          phone?: string | null
          slug: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          city?: string
          created_at?: string
          id?: number
          name?: string
          phone?: string | null
          slug?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: number | null
          created_at: string
          email: string
          expires_at: string
          id: number
          invited_by: number
          office_id: number | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: number
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: number | null
          created_at?: string
          email: string
          expires_at: string
          id?: number
          invited_by: number
          office_id?: number | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: number
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: number | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: number
          invited_by?: number
          office_id?: number | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: number
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions_matrix: {
        Row: {
          created_at: string
          granted: boolean
          id: number
          permission_key: string
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: number
          permission_key: string
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: number
          permission_key?: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_matrix_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          description: string | null
          id: number
          intent_track: string
          max_messages: number
          name: string
          number: number
        }
        Insert: {
          description?: string | null
          id?: number
          intent_track?: string
          max_messages?: number
          name: string
          number: number
        }
        Update: {
          description?: string | null
          id?: number
          intent_track?: string
          max_messages?: number
          name?: string
          number?: number
        }
        Relationships: []
      }
      pipeline_events: {
        Row: {
          conversation_id: number
          event_type: string
          from_value: string | null
          id: number
          occurred_at: string
          source: string
          tenant_id: number
          to_value: string
        }
        Insert: {
          conversation_id: number
          event_type: string
          from_value?: string | null
          id?: number
          occurred_at?: string
          source: string
          tenant_id: number
          to_value: string
        }
        Update: {
          conversation_id?: number
          event_type?: string
          from_value?: string | null
          id?: number
          occurred_at?: string
          source?: string
          tenant_id?: number
          to_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          conversation_id: number | null
          correlation_id: string
          created_at: string
          duration_ms: number | null
          ended_at: string | null
          error_message: string | null
          generator_cost_usd: number | null
          generator_model: string | null
          generator_tokens_in: number | null
          generator_tokens_out: number | null
          id: number
          judge_cost_usd: number | null
          judge_decision: string | null
          judge_model: string | null
          judge_tokens_in: number | null
          judge_tokens_out: number | null
          outcome: string
          splitter_cost_usd: number | null
          splitter_model: string | null
          splitter_parts: number | null
          splitter_tokens_in: number | null
          splitter_tokens_out: number | null
          started_at: string
          tenant_id: number
          total_cost_usd: number | null
          total_tokens_in: number | null
          total_tokens_out: number | null
          validator_violations: Json | null
        }
        Insert: {
          conversation_id?: number | null
          correlation_id: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          generator_cost_usd?: number | null
          generator_model?: string | null
          generator_tokens_in?: number | null
          generator_tokens_out?: number | null
          id?: number
          judge_cost_usd?: number | null
          judge_decision?: string | null
          judge_model?: string | null
          judge_tokens_in?: number | null
          judge_tokens_out?: number | null
          outcome?: string
          splitter_cost_usd?: number | null
          splitter_model?: string | null
          splitter_parts?: number | null
          splitter_tokens_in?: number | null
          splitter_tokens_out?: number | null
          started_at?: string
          tenant_id: number
          total_cost_usd?: number | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          validator_violations?: Json | null
        }
        Update: {
          conversation_id?: number | null
          correlation_id?: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          generator_cost_usd?: number | null
          generator_model?: string | null
          generator_tokens_in?: number | null
          generator_tokens_out?: number | null
          id?: number
          judge_cost_usd?: number | null
          judge_decision?: string | null
          judge_model?: string | null
          judge_tokens_in?: number | null
          judge_tokens_out?: number | null
          outcome?: string
          splitter_cost_usd?: number | null
          splitter_model?: string | null
          splitter_parts?: number | null
          splitter_tokens_in?: number | null
          splitter_tokens_out?: number | null
          started_at?: string
          tenant_id?: number
          total_cost_usd?: number | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          validator_violations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_block_drafts: {
        Row: {
          base_version: number
          block_key: string
          content: string
          created_at: string
          id: number
          owner_user_id: number
          tenant_id: number | null
          updated_at: string
        }
        Insert: {
          base_version: number
          block_key: string
          content: string
          created_at?: string
          id?: number
          owner_user_id: number
          tenant_id?: number | null
          updated_at?: string
        }
        Update: {
          base_version?: number
          block_key?: string
          content?: string
          created_at?: string
          id?: number
          owner_user_id?: number
          tenant_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_block_drafts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_block_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_block_versions: {
        Row: {
          change_summary: string | null
          changed_at: string
          changed_by: number | null
          content: string
          id: number
          prompt_block_id: number
          version_number: number
          was_applied: boolean
        }
        Insert: {
          change_summary?: string | null
          changed_at?: string
          changed_by?: number | null
          content: string
          id?: number
          prompt_block_id: number
          version_number: number
          was_applied?: boolean
        }
        Update: {
          change_summary?: string | null
          changed_at?: string
          changed_by?: number | null
          content?: string
          id?: number
          prompt_block_id?: number
          version_number?: number
          was_applied?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prompt_block_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_block_versions_prompt_block_id_fkey"
            columns: ["prompt_block_id"]
            isOneToOne: false
            referencedRelation: "prompt_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_blocks: {
        Row: {
          block_key: string
          content: string
          created_at: string
          id: number
          is_active: boolean
          sort_order: number
          tenant_id: number | null
          updated_at: string
          version: number
        }
        Insert: {
          block_key: string
          content: string
          created_at?: string
          id?: number
          is_active?: boolean
          sort_order?: number
          tenant_id?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          block_key?: string
          content?: string
          created_at?: string
          id?: number
          is_active?: boolean
          sort_order?: number
          tenant_id?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address_short: string | null
          assigned_to_user_id: number | null
          bathrooms: number
          created_at: string
          deleted_at: string | null
          description: string | null
          features: Json
          id: number
          m2_built: number
          m2_useful: number | null
          monthly_rent_eur: number | null
          neighborhood: string
          office_id: number
          price_eur: number | null
          rooms: number
          status: Database["public"]["Enums"]["property_status"]
          tenant_id: number
          title: string
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          year_built: number | null
        }
        Insert: {
          address_short?: string | null
          assigned_to_user_id?: number | null
          bathrooms?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json
          id?: number
          m2_built: number
          m2_useful?: number | null
          monthly_rent_eur?: number | null
          neighborhood: string
          office_id: number
          price_eur?: number | null
          rooms?: number
          status?: Database["public"]["Enums"]["property_status"]
          tenant_id: number
          title: string
          type: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          year_built?: number | null
        }
        Update: {
          address_short?: string | null
          assigned_to_user_id?: number | null
          bathrooms?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json
          id?: number
          m2_built?: number
          m2_useful?: number | null
          monthly_rent_eur?: number | null
          neighborhood?: string
          office_id?: number
          price_eur?: number | null
          rooms?: number
          status?: Database["public"]["Enums"]["property_status"]
          tenant_id?: number
          title?: string
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owners: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: number
          notes: string | null
          phone: string | null
          property_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: number
          notes?: string | null
          phone?: string | null
          property_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: number
          notes?: string | null
          phone?: string | null
          property_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      property_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: number
          property_id: number
          sort_order: number
          tenant_id: number
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: number
          property_id: number
          sort_order?: number
          tenant_id: number
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: number
          property_id?: number
          sort_order?: number
          tenant_id?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_photos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          mime_type: string | null
          name: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          storage_path: string | null
          tenant_id: number
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          mime_type?: string | null
          name: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          storage_path?: string | null
          tenant_id: number
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          mime_type?: string | null
          name?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          storage_path?: string | null
          tenant_id?: number
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_configs: {
        Row: {
          active_conversation_delay_seconds: number
          created_at: string
          debounce_window_seconds: number
          default_audio_language: string
          health_threshold_hours_amber: number
          health_threshold_hours_red: number
          idle_conversation_delay_seconds: number
          max_messages_per_conversation: number
          tenant_id: number
          timezone: string
          updated_at: string
          welcome_template_id: number | null
        }
        Insert: {
          active_conversation_delay_seconds?: number
          created_at?: string
          debounce_window_seconds?: number
          default_audio_language?: string
          health_threshold_hours_amber?: number
          health_threshold_hours_red?: number
          idle_conversation_delay_seconds?: number
          max_messages_per_conversation?: number
          tenant_id: number
          timezone?: string
          updated_at?: string
          welcome_template_id?: number | null
        }
        Update: {
          active_conversation_delay_seconds?: number
          created_at?: string
          debounce_window_seconds?: number
          default_audio_language?: string
          health_threshold_hours_amber?: number
          health_threshold_hours_red?: number
          idle_conversation_delay_seconds?: number
          max_messages_per_conversation?: number
          tenant_id?: number
          timezone?: string
          updated_at?: string
          welcome_template_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configs_welcome_template_id_fkey"
            columns: ["welcome_template_id"]
            isOneToOne: false
            referencedRelation: "followup_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_followup_config: {
        Row: {
          created_at: string
          enabled: boolean
          intervals_hours: number[]
          max_followups_per_lead: number
          tenant_id: number
          updated_at: string
          window_end_hour: number
          window_start_hour: number
          window_timezone: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          intervals_hours?: number[]
          max_followups_per_lead?: number
          tenant_id: number
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
          window_timezone?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          intervals_hours?: number[]
          max_followups_per_lead?: number
          tenant_id?: number
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
          window_timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_followup_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_labels: {
        Row: {
          auto_assign_to: number | null
          color: string
          created_at: string
          created_by: number | null
          description: string | null
          destination_bucket: string | null
          id: number
          is_system: boolean
          name: string
          pause_ai_on_apply: boolean
          resume_ai_on_apply: boolean
          tenant_id: number
          updated_at: string
        }
        Insert: {
          auto_assign_to?: number | null
          color?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          destination_bucket?: string | null
          id?: number
          is_system?: boolean
          name: string
          pause_ai_on_apply?: boolean
          resume_ai_on_apply?: boolean
          tenant_id: number
          updated_at?: string
        }
        Update: {
          auto_assign_to?: number | null
          color?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          destination_bucket?: string | null
          id?: number
          is_system?: boolean
          name?: string
          pause_ai_on_apply?: boolean
          resume_ai_on_apply?: boolean
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_labels_auto_assign_to_fkey"
            columns: ["auto_assign_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_labels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_tokens: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          purpose: string
          revoked_at: string | null
          tenant_id: number
          token: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          purpose?: string
          revoked_at?: string | null
          tenant_id: number
          token?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          purpose?: string
          revoked_at?: string | null
          tenant_id?: number
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          onboarded_at: string | null
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          name: string
          onboarded_at?: string | null
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          name?: string
          onboarded_at?: string | null
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_office_assignments: {
        Row: {
          created_at: string
          id: number
          is_primary: boolean
          office_id: number
          tenant_id: number
          updated_at: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          is_primary?: boolean
          office_id: number
          tenant_id: number
          updated_at?: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          is_primary?: boolean
          office_id?: number
          tenant_id?: number
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_office_assignments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_office_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_office_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean
          auth_user_id: string
          created_at: string
          email: string
          full_name: string
          id: number
          is_agency_admin: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id: string
          created_at?: string
          email: string
          full_name: string
          id?: number
          is_agency_admin?: boolean
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: number
          is_agency_admin?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          calendar_appointment_id: number | null
          comercial_user_id: number
          created_at: string
          id: number
          is_tasation: boolean
          lead_feedback: string | null
          lead_id: number
          outcome_notes: string | null
          property_id: number | null
          scheduled_for: string
          status: Database["public"]["Enums"]["visit_status"]
          tenant_id: number
          updated_at: string
        }
        Insert: {
          calendar_appointment_id?: number | null
          comercial_user_id: number
          created_at?: string
          id?: number
          is_tasation?: boolean
          lead_feedback?: string | null
          lead_id: number
          outcome_notes?: string | null
          property_id?: number | null
          scheduled_for: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id: number
          updated_at?: string
        }
        Update: {
          calendar_appointment_id?: number | null
          comercial_user_id?: number
          created_at?: string
          id?: number
          is_tasation?: boolean
          lead_feedback?: string | null
          lead_id?: number
          outcome_notes?: string | null
          property_id?: number | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_calendar_appointment_id_fkey"
            columns: ["calendar_appointment_id"]
            isOneToOne: false
            referencedRelation: "calendar_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_comercial_user_id_fkey"
            columns: ["comercial_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_calls: {
        Row: {
          conversation_id: number | null
          created_at: string
          direction: string
          duration_seconds: number | null
          elevenlabs_conversation_id: string | null
          ended_at: string | null
          id: number
          lead_id: number | null
          outcome: string | null
          recording_url: string | null
          started_at: string | null
          status: string
          tenant_id: number
          zadarma_call_id: string | null
        }
        Insert: {
          conversation_id?: number | null
          created_at?: string
          direction: string
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: number
          lead_id?: number | null
          outcome?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          tenant_id: number
          zadarma_call_id?: string | null
        }
        Update: {
          conversation_id?: number | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: number
          lead_id?: number | null
          outcome?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: number
          zadarma_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_transcripts: {
        Row: {
          call_id: number
          created_at: string
          id: number
          offset_ms: number | null
          role: Database["public"]["Enums"]["message_role"]
          tenant_id: number
          text: string
        }
        Insert: {
          call_id: number
          created_at?: string
          id?: number
          offset_ms?: number | null
          role: Database["public"]["Enums"]["message_role"]
          tenant_id: number
          text: string
        }
        Update: {
          call_id?: number
          created_at?: string
          id?: number
          offset_ms?: number | null
          role?: Database["public"]["Enums"]["message_role"]
          tenant_id?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "voice_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_transcripts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_invite: {
        Args: { p_token: string }
        Returns: {
          role: Database["public"]["Enums"]["user_role"]
          status: string
          tenant_id: number
        }[]
      }
      current_tenant: { Args: never; Returns: number }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      channel_type: "whatsapp" | "voice" | "web_form" | "meta_ads" | "other"
      conversation_direction: "inbound" | "outbound" | "untagged"
      conversation_priority: "alta" | "media" | "baja"
      conversation_status:
        | "active"
        | "qualified"
        | "disqualified"
        | "handoff"
        | "paused"
      handoff_cause:
        | "A_agenda"
        | "B_derivacion"
        | "C_descualificado"
        | "D_espera"
        | "E_error"
      integration_provider:
        | "ycloud"
        | "zadarma"
        | "elevenlabs"
        | "deepgram"
        | "composio"
        | "meta_ads"
        | "ghl"
        | "cal_com"
      lead_intent: "buyer" | "tenant" | "seller" | "landlord" | "unknown"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "scheduled_visit"
        | "visited"
        | "offer_made"
        | "closed_won"
        | "closed_lost"
        | "cold"
      llm_call_status: "success" | "error" | "fallback"
      llm_provider:
        | "anthropic"
        | "openai"
        | "google"
        | "azure_openai"
        | "custom"
      llm_role: "generator" | "judge" | "splitter" | "transcriber" | "embedder"
      message_content_type:
        | "text"
        | "audio"
        | "image"
        | "video"
        | "file"
        | "mixed"
      message_role: "lead" | "agent" | "human" | "system"
      property_status: "available" | "reserved" | "sold" | "rented" | "inactive"
      property_type: "sale" | "rent"
      resource_type:
        | "pdf"
        | "video"
        | "image"
        | "audio"
        | "link"
        | "document"
        | "other"
      schedule_message_kind: "message" | "follow_up" | "resource"
      schedule_status:
        | "pending"
        | "processing"
        | "sent"
        | "failed"
        | "cancelled"
      user_role:
        | "admin"
        | "director_general"
        | "director_oficina"
        | "comercial"
        | "asistente_captador"
      visit_status:
        | "scheduled"
        | "done"
        | "noshow"
        | "cancelled"
        | "rescheduled"
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
      channel_type: ["whatsapp", "voice", "web_form", "meta_ads", "other"],
      conversation_direction: ["inbound", "outbound", "untagged"],
      conversation_priority: ["alta", "media", "baja"],
      conversation_status: [
        "active",
        "qualified",
        "disqualified",
        "handoff",
        "paused",
      ],
      handoff_cause: [
        "A_agenda",
        "B_derivacion",
        "C_descualificado",
        "D_espera",
        "E_error",
      ],
      integration_provider: [
        "ycloud",
        "zadarma",
        "elevenlabs",
        "deepgram",
        "composio",
        "meta_ads",
        "ghl",
        "cal_com",
      ],
      lead_intent: ["buyer", "tenant", "seller", "landlord", "unknown"],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "scheduled_visit",
        "visited",
        "offer_made",
        "closed_won",
        "closed_lost",
        "cold",
      ],
      llm_call_status: ["success", "error", "fallback"],
      llm_provider: ["anthropic", "openai", "google", "azure_openai", "custom"],
      llm_role: ["generator", "judge", "splitter", "transcriber", "embedder"],
      message_content_type: [
        "text",
        "audio",
        "image",
        "video",
        "file",
        "mixed",
      ],
      message_role: ["lead", "agent", "human", "system"],
      property_status: ["available", "reserved", "sold", "rented", "inactive"],
      property_type: ["sale", "rent"],
      resource_type: [
        "pdf",
        "video",
        "image",
        "audio",
        "link",
        "document",
        "other",
      ],
      schedule_message_kind: ["message", "follow_up", "resource"],
      schedule_status: ["pending", "processing", "sent", "failed", "cancelled"],
      user_role: [
        "admin",
        "director_general",
        "director_oficina",
        "comercial",
        "asistente_captador",
      ],
      visit_status: ["scheduled", "done", "noshow", "cancelled", "rescheduled"],
    },
  },
} as const
