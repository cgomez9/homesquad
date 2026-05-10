export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          id: string
          photo_url: string | null
          rejection_reason: string | null
          stars_awarded: number | null
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
          id?: string
          photo_url?: string | null
          rejection_reason?: string | null
          stars_awarded?: number | null
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
          id?: string
          photo_url?: string | null
          rejection_reason?: string | null
          stars_awarded?: number | null
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
          description: string | null
          family_id: string
          id: string
          next_due_at: string | null
          recurrence: Json
          star_value: number
          title: string
          verification_mode: string
        }
        Insert: {
          active?: boolean
          assignee_profile_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          id?: string
          next_due_at?: string | null
          recurrence: Json
          star_value: number
          title: string
          verification_mode: string
        }
        Update: {
          active?: boolean
          assignee_profile_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          id?: string
          next_due_at?: string | null
          recurrence?: Json
          star_value?: number
          title?: string
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
          subscription_expires_at: string | null
          subscription_tier: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          subscription_expires_at?: string | null
          subscription_tier?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          subscription_expires_at?: string | null
          subscription_tier?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_id: number
          created_at: string
          display_name: string
          family_id: string
          id: string
          pin_hash: string | null
          push_token: string | null
          type: Database["public"]["Enums"]["profile_type"]
          user_id: string | null
        }
        Insert: {
          avatar_id: number
          created_at?: string
          display_name: string
          family_id: string
          id?: string
          pin_hash?: string | null
          push_token?: string | null
          type: Database["public"]["Enums"]["profile_type"]
          user_id?: string | null
        }
        Update: {
          avatar_id?: number
          created_at?: string
          display_name?: string
          family_id?: string
          id?: string
          pin_hash?: string | null
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
      approve_chore: { Args: { instance_id: string }; Returns: undefined }
      approve_redemption: {
        Args: { redemption_id: string }
        Returns: undefined
      }
      archive_chore: { Args: { chore_id: string }; Returns: undefined }
      archive_reward: { Args: { reward_id: string }; Returns: undefined }
      complete_chore: {
        Args: {
          instance_id: string
          kid_profile_id: string
          photo_url?: string
        }
        Returns: undefined
      }
      create_chore: {
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
      create_family: {
        Args: {
          family_name: string
          parent_avatar: number
          parent_name: string
        }
        Returns: string
      }
      create_kid_profile: {
        Args: { avatar: number; kid_name: string; pin_hash?: string }
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
      current_family_id: { Args: never; Returns: string }
      current_streak: { Args: { p: string }; Returns: number }
      deny_redemption: {
        Args: { parent_note?: string; redemption_id: string }
        Returns: undefined
      }
      ensure_today_instance: {
        Args: { p_chore_id: string }
        Returns: undefined
      }
      fulfill_redemption: {
        Args: { redemption_id: string }
        Returns: undefined
      }
      next_occurrence: { Args: { after: string; rec: Json }; Returns: string }
      reject_chore: {
        Args: { instance_id: string; reason?: string }
        Returns: undefined
      }
      request_redemption: {
        Args: { kid_profile_id: string; reward_id: string }
        Returns: string
      }
      seed_starter_chores: { Args: { family_id: string }; Returns: number }
      update_chore: {
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

