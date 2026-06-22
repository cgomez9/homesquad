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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          achievement_key: string
          family_id: string
          id: string
          profile_id: string
          unlocked_at: string
        }
        Insert: {
          achievement_key: string
          family_id: string
          id?: string
          profile_id: string
          unlocked_at?: string
        }
        Update: {
          achievement_key?: string
          family_id?: string
          id?: string
          profile_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_instances: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assignee_profile_id: string | null
          chore_id: string
          completed_at: string | null
          completed_by: string | null
          due_at: string
          family_id: string
          finished_at: string | null
          id: string
          photo_url: string | null
          rejection_reason: string | null
          stars_awarded: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assignee_profile_id?: string | null
          chore_id: string
          completed_at?: string | null
          completed_by?: string | null
          due_at: string
          family_id: string
          finished_at?: string | null
          id?: string
          photo_url?: string | null
          rejection_reason?: string | null
          stars_awarded?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assignee_profile_id?: string | null
          chore_id?: string
          completed_at?: string | null
          completed_by?: string | null
          due_at?: string
          family_id?: string
          finished_at?: string | null
          id?: string
          photo_url?: string | null
          rejection_reason?: string | null
          stars_awarded?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_instances_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_instances_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_instances_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_instances_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_instances_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      chores: {
        Row: {
          active: boolean
          assignee_profile_id: string | null
          created_at: string
          created_by: string
          current_skill_streak: number
          description: string | null
          family_id: string
          id: string
          kind: string
          last_skill_date: string | null
          longest_skill_streak: number
          next_due_at: string | null
          recurrence: Json
          star_value: number | null
          title: string
          token_value: number | null
          verification_mode: string
        }
        Insert: {
          active?: boolean
          assignee_profile_id?: string | null
          created_at?: string
          created_by: string
          current_skill_streak?: number
          description?: string | null
          family_id: string
          id?: string
          kind?: string
          last_skill_date?: string | null
          longest_skill_streak?: number
          next_due_at?: string | null
          recurrence: Json
          star_value?: number | null
          title: string
          token_value?: number | null
          verification_mode: string
        }
        Update: {
          active?: boolean
          assignee_profile_id?: string | null
          created_at?: string
          created_by?: string
          current_skill_streak?: number
          description?: string | null
          family_id?: string
          id?: string
          kind?: string
          last_skill_date?: string | null
          longest_skill_streak?: number
          next_due_at?: string | null
          recurrence?: Json
          star_value?: number | null
          title?: string
          token_value?: number | null
          verification_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "chores_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chores_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          id: string
          name: string
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          subscription_expires_at: string | null
          subscription_tier: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          subscription_expires_at?: string | null
          subscription_tier?: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          subscription_expires_at?: string | null
          subscription_tier?: string
          timezone?: string
        }
        Relationships: []
      }
      family_goals: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          id: string
          status: string
          target_stars: number
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          id?: string
          status?: string
          target_stars: number
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          id?: string
          status?: string
          target_stars?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_goals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          family_id: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          family_id: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          family_id?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_devices: {
        Row: {
          device_name: string
          family_id: string
          id: string
          kid_id: string
          last_seen_at: string
          paired_at: string
          push_token: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          device_name: string
          family_id: string
          id?: string
          kid_id: string
          last_seen_at?: string
          paired_at?: string
          push_token?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          device_name?: string
          family_id?: string
          id?: string
          kid_id?: string
          last_seen_at?: string
          paired_at?: string
          push_token?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_devices_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_devices_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_pairing_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          family_id: string
          issued_by: string
          kid_id: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          family_id: string
          issued_by: string
          kid_id: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          family_id?: string
          issued_by?: string
          kid_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_pairing_codes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_pairing_codes_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_redeem_attempts: {
        Row: {
          attempted_at: string
          ip: unknown
        }
        Insert: {
          attempted_at?: string
          ip: unknown
        }
        Update: {
          attempted_at?: string
          ip?: unknown
        }
        Relationships: []
      }
      privilege_redemptions: {
        Row: {
          family_id: string
          id: string
          kid_profile_id: string
          parent_note: string | null
          privilege_id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          token_cost_snapshot: number
        }
        Insert: {
          family_id: string
          id?: string
          kid_profile_id: string
          parent_note?: string | null
          privilege_id: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          token_cost_snapshot: number
        }
        Update: {
          family_id?: string
          id?: string
          kid_profile_id?: string
          parent_note?: string | null
          privilege_id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          token_cost_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "privilege_redemptions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privilege_redemptions_kid_profile_id_fkey"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privilege_redemptions_privilege_id_fkey"
            columns: ["privilege_id"]
            isOneToOne: false
            referencedRelation: "privileges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privilege_redemptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privilege_token_ledger: {
        Row: {
          created_at: string
          delta: number
          family_id: string
          id: string
          profile_id: string
          reason: string
          source_id: string | null
        }
        Insert: {
          created_at?: string
          delta: number
          family_id: string
          id?: string
          profile_id: string
          reason: string
          source_id?: string | null
        }
        Update: {
          created_at?: string
          delta?: number
          family_id?: string
          id?: string
          profile_id?: string
          reason?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "privilege_token_ledger_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privilege_token_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privileges: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          icon_id: number
          id: string
          title: string
          token_cost: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          icon_id: number
          id?: string
          title: string
          token_cost: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          icon_id?: number
          id?: string
          title?: string
          token_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "privileges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privileges_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_id: number
          celebrations_seen_at: string | null
          created_at: string
          display_name: string
          family_id: string
          id: string
          pin_hash: string | null
          push_prefs: Json
          push_token: string | null
          type: Database["public"]["Enums"]["profile_type"]
          user_id: string | null
        }
        Insert: {
          avatar_id: number
          celebrations_seen_at?: string | null
          created_at?: string
          display_name: string
          family_id: string
          id?: string
          pin_hash?: string | null
          push_prefs?: Json
          push_token?: string | null
          type: Database["public"]["Enums"]["profile_type"]
          user_id?: string | null
        }
        Update: {
          avatar_id?: number
          celebrations_seen_at?: string | null
          created_at?: string
          display_name?: string
          family_id?: string
          id?: string
          pin_hash?: string | null
          push_prefs?: Json
          push_token?: string | null
          type?: Database["public"]["Enums"]["profile_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          attempts: number
          enqueued_at: string
          event_type: string
          family_id: string
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          recipient_id: string
          scheduled_for: string
          sending_since: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          enqueued_at?: string
          event_type: string
          family_id: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload: Json
          recipient_id: string
          scheduled_for: string
          sending_since?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          enqueued_at?: string
          event_type?: string
          family_id?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          recipient_id?: string
          scheduled_for?: string
          sending_since?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          family_id: string
          id: string
          kid_profile_id: string
          parent_note: string | null
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          reward_id: string
          star_cost_snapshot: number
          status: string
        }
        Insert: {
          family_id: string
          id?: string
          kid_profile_id: string
          parent_note?: string | null
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          reward_id: string
          star_cost_snapshot: number
          status?: string
        }
        Update: {
          family_id?: string
          id?: string
          kid_profile_id?: string
          parent_note?: string | null
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          reward_id?: string
          star_cost_snapshot?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_kid_profile_id_fkey"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          icon_id: number
          id: string
          star_cost: number
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          icon_id: number
          id?: string
          star_cost: number
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          icon_id?: number
          id?: string
          star_cost?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      star_ledger: {
        Row: {
          created_at: string
          delta: number
          family_id: string
          id: string
          profile_id: string
          reason: string
          source_id: string | null
        }
        Insert: {
          created_at?: string
          delta: number
          family_id: string
          id?: string
          profile_id: string
          reason: string
          source_id?: string | null
        }
        Update: {
          created_at?: string
          delta?: number
          family_id?: string
          id?: string
          profile_id?: string
          reason?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "star_ledger_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "star_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      streaks: {
        Row: {
          current_count: number
          family_id: string
          last_completion_date: string | null
          longest_count: number
          profile_id: string
        }
        Insert: {
          current_count?: number
          family_id: string
          last_completion_date?: string | null
          longest_count?: number
          profile_id: string
        }
        Update: {
          current_count?: number
          family_id?: string
          last_completion_date?: string | null
          longest_count?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { avatar_id: number; code: string; display_name: string }
        Returns: string
      }
      apply_drain_result: {
        Args: { p_error?: string; p_outcome: string; p_row_id: string }
        Returns: undefined
      }
      approve_chore: { Args: { instance_id: string }; Returns: undefined }
      approve_privilege_redemption: {
        Args: { redemption_id: string }
        Returns: undefined
      }
      approve_redemption: {
        Args: { redemption_id: string }
        Returns: undefined
      }
      archive_chore: { Args: { chore_id: string }; Returns: undefined }
      archive_privilege: { Args: { privilege_id: string }; Returns: undefined }
      archive_reward: { Args: { reward_id: string }; Returns: undefined }
      bump_skill_streak: { Args: { p_chore_id: string }; Returns: undefined }
      cancel_family_goal: { Args: { p_goal_id: string }; Returns: undefined }
      check_achievements: { Args: { p_profile_id: string }; Returns: string[] }
      claim_chore: {
        Args: { actor_profile_id: string; instance_id: string }
        Returns: undefined
      }
      cleanup_pairing_redeem_attempts: { Args: never; Returns: undefined }
      create_chore:
        | {
            Args: {
              assignee_profile_id: string
              description: string
              family_id: string
              recurrence: Json
              star_value: number
              title: string
              verification_mode: string
            }
            Returns: string
          }
        | {
            Args: {
              assignee_profile_id: string
              description: string
              family_id: string
              kind?: string
              recurrence: Json
              star_value: number
              title: string
              token_value?: number
              verification_mode: string
            }
            Returns: string
          }
      create_family: {
        Args: {
          family_name: string
          parent_avatar: number
          parent_name: string
        }
        Returns: string
      }
      create_family_goal: {
        Args: {
          p_description?: string
          p_target_stars: number
          p_title: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          id: string
          status: string
          target_stars: number
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "family_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_family_invite: { Args: never; Returns: string }
      create_kid_profile: {
        Args: { avatar: number; kid_name: string; pin_hash?: string }
        Returns: string
      }
      create_privilege: {
        Args: {
          description: string
          family_id: string
          icon_id: number
          title: string
          token_cost: number
        }
        Returns: string
      }
      create_reward: {
        Args: {
          description: string
          family_id: string
          icon_id: number
          star_cost: number
          title: string
        }
        Returns: string
      }
      credit_family_pool: {
        Args: { p_amount: number; p_family_id: string; p_profile_id: string }
        Returns: undefined
      }
      current_family_id: { Args: never; Returns: string }
      current_kid_id: { Args: never; Returns: string }
      current_streak: { Args: { p: string }; Returns: number }
      delete_account: { Args: never; Returns: undefined }
      deny_privilege_redemption: {
        Args: { parent_note?: string; redemption_id: string }
        Returns: undefined
      }
      deny_redemption: {
        Args: { parent_note?: string; redemption_id: string }
        Returns: undefined
      }
      drain_push_outbox: { Args: never; Returns: undefined }
      ensure_today_instance: {
        Args: { p_chore_id: string }
        Returns: undefined
      }
      finish_chore: {
        Args: {
          actor_profile_id: string
          instance_id: string
          photo_url?: string
        }
        Returns: undefined
      }
      fulfill_privilege_redemption: {
        Args: { redemption_id: string }
        Returns: undefined
      }
      fulfill_redemption: {
        Args: { redemption_id: string }
        Returns: undefined
      }
      get_active_goal: {
        Args: { p_family_id: string }
        Returns: {
          completed_at: string
          created_at: string
          created_by: string
          description: string
          family_id: string
          id: string
          progress_stars: number
          status: string
          target_stars: number
          title: string
        }[]
      }
      get_leaderboard: {
        Args: { p_family_id: string }
        Returns: {
          all_time_rank: number
          all_time_stars: number
          avatar_id: number
          display_name: string
          profile_id: string
          week_rank: number
          week_stars: number
        }[]
      }
      mark_celebrations_seen: {
        Args: { p_profile_id: string; p_seen_at: string }
        Returns: undefined
      }
      next_occurrence: {
        Args: { after: string; family_tz?: string; rec: Json }
        Returns: string
      }
      redeem_device_pairing: {
        Args: { device_name: string; pair_code: string }
        Returns: string
      }
      reject_chore: {
        Args: { instance_id: string; reason?: string }
        Returns: undefined
      }
      release_chore: {
        Args: { actor_profile_id: string; instance_id: string }
        Returns: undefined
      }
      request_privilege_redemption: {
        Args: { kid_profile_id: string; privilege_id: string }
        Returns: string
      }
      request_redemption: {
        Args: { kid_profile_id: string; reward_id: string }
        Returns: string
      }
      resolve_actor_profile_id: {
        Args: { p_actor_profile_id: string }
        Returns: string
      }
      revoke_kid_device: { Args: { device_id: string }; Returns: undefined }
      seed_starter_chores: { Args: { family_id: string }; Returns: number }
      send_push: {
        Args: { p_event_type: string; p_family_id: string; p_payload: Json }
        Returns: number
      }
      set_push_pref: {
        Args: { p_enabled: boolean; p_event_type: string }
        Returns: Json
      }
      set_push_token: { Args: { token: string }; Returns: undefined }
      set_quiet_hours: {
        Args: {
          p_enabled: boolean
          p_end: string
          p_start: string
          p_timezone: string
        }
        Returns: undefined
      }
      start_chore: {
        Args: { actor_profile_id: string; instance_id: string }
        Returns: undefined
      }
      start_device_pairing: {
        Args: { target_kid_id: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      update_chore:
        | {
            Args: {
              assignee_profile_id?: string
              chore_id: string
              clear_assignee?: boolean
              description?: string
              recurrence?: Json
              star_value?: number
              title?: string
              verification_mode?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              assignee_profile_id?: string
              chore_id: string
              clear_assignee?: boolean
              description?: string
              recurrence?: Json
              star_value?: number
              title?: string
              token_value?: number
              verification_mode?: string
            }
            Returns: undefined
          }
      update_privilege: {
        Args: {
          description?: string
          icon_id?: number
          privilege_id: string
          title?: string
          token_cost?: number
        }
        Returns: undefined
      }
      update_reward: {
        Args: {
          description?: string
          icon_id?: number
          reward_id: string
          star_cost?: number
          title?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      profile_type: "parent" | "kid"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      profile_type: ["parent", "kid"],
    },
  },
} as const
