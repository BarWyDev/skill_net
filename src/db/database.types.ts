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
      coordinator_role_events: {
        Row: {
          action: string
          id: number
          note: string
          occurred_at: string
          user_id: string
        }
        Insert: {
          action: string
          id?: never
          note: string
          occurred_at?: string
          user_id: string
        }
        Update: {
          action?: string
          id?: never
          note?: string
          occurred_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crises: {
        Row: {
          activated_at: string
          activated_by: string
          crisis_type_slug: string
          ended_at: string | null
          ended_by: string | null
          epicentre: unknown
          id: string
          match_count: number
          radius_m: number
          status: string
        }
        Insert: {
          activated_at?: string
          activated_by: string
          crisis_type_slug: string
          ended_at?: string | null
          ended_by?: string | null
          epicentre: unknown
          id?: string
          match_count?: number
          radius_m: number
          status?: string
        }
        Update: {
          activated_at?: string
          activated_by?: string
          crisis_type_slug?: string
          ended_at?: string | null
          ended_by?: string | null
          epicentre?: unknown
          id?: string
          match_count?: number
          radius_m?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crises_crisis_type_slug_fkey"
            columns: ["crisis_type_slug"]
            isOneToOne: false
            referencedRelation: "crisis_types"
            referencedColumns: ["slug"]
          },
        ]
      }
      crisis_matches: {
        Row: {
          crisis_id: string
          distance_m: number
          matched_skills: Json
          position: number
          rank: number
          score: number
          user_id: string
        }
        Insert: {
          crisis_id: string
          distance_m: number
          matched_skills: Json
          position: number
          rank: number
          score: number
          user_id: string
        }
        Update: {
          crisis_id?: string
          distance_m?: number
          matched_skills?: Json
          position?: number
          rank?: number
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crisis_matches_crisis_id_fkey"
            columns: ["crisis_id"]
            isOneToOne: false
            referencedRelation: "crises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crisis_matches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crisis_type_skills: {
        Row: {
          crisis_type_slug: string
          skill_slug: string
          tier: string
        }
        Insert: {
          crisis_type_slug: string
          skill_slug: string
          tier: string
        }
        Update: {
          crisis_type_slug?: string
          skill_slug?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "crisis_type_skills_crisis_type_slug_fkey"
            columns: ["crisis_type_slug"]
            isOneToOne: false
            referencedRelation: "crisis_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "crisis_type_skills_skill_slug_fkey"
            columns: ["skill_slug"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["slug"]
          },
        ]
      }
      crisis_types: {
        Row: {
          name_pl: string
          slug: string
          sort: number
          w_availability: number
          w_distance: number
          w_level: number
          w_skill: number
        }
        Insert: {
          name_pl: string
          slug: string
          sort: number
          w_availability: number
          w_distance: number
          w_level: number
          w_skill: number
        }
        Update: {
          name_pl?: string
          slug?: string
          sort?: number
          w_availability?: number
          w_distance?: number
          w_level?: number
          w_skill?: number
        }
        Relationships: []
      }
      postcodes: {
        Row: {
          address_count: number
          centroid: unknown
          postcode: string
        }
        Insert: {
          address_count: number
          centroid: unknown
          postcode: string
        }
        Update: {
          address_count?: number
          centroid?: unknown
          postcode?: string
        }
        Relationships: []
      }
      profile_skills: {
        Row: {
          level: number | null
          skill_slug: string
          user_id: string
        }
        Insert: {
          level?: number | null
          skill_slug: string
          user_id: string
        }
        Update: {
          level?: number | null
          skill_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_skills_skill_slug_fkey"
            columns: ["skill_slug"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "profile_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          location: unknown
          location_source: string | null
          postcode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          location?: unknown
          location_source?: string | null
          postcode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          location?: unknown
          location_source?: string | null
          postcode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skill_categories: {
        Row: {
          name_pl: string
          slug: string
          sort: number
        }
        Insert: {
          name_pl: string
          slug: string
          sort: number
        }
        Update: {
          name_pl?: string
          slug?: string
          sort?: number
        }
        Relationships: []
      }
      skills: {
        Row: {
          category_slug: string
          has_level: boolean
          name_pl: string
          slug: string
          sort: number
        }
        Insert: {
          category_slug: string
          has_level: boolean
          name_pl: string
          slug: string
          sort: number
        }
        Update: {
          category_slug?: string
          has_level?: boolean
          name_pl?: string
          slug?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "skills_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "skill_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_crisis: {
        Args: {
          p_crisis_type: string
          p_lat: number
          p_lng: number
          p_location_source: string
          p_postcode: string
          p_radius_km: number
        }
        Returns: string
      }
      coarsen_point: { Args: { p: unknown }; Returns: unknown }
      end_crisis: { Args: { p_crisis_id: string }; Returns: boolean }
      get_crisis_matches: {
        Args: { p_crisis_id: string; p_limit?: number }
        Returns: {
          distance_km_rounded: number
          matched_skills: Json
          position: number
          rank: number
        }[]
      }
      get_my_profile: { Args: never; Returns: Json }
      grant_coordinator: {
        Args: { p_email: string; p_note: string }
        Returns: undefined
      }
      is_coordinator: { Args: never; Returns: boolean }
      lookup_postcode: {
        Args: { p_postcode: string }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      profile_is_matchable: { Args: { p_user_id: string }; Returns: boolean }
      revoke_coordinator: {
        Args: { p_email: string; p_note: string }
        Returns: undefined
      }
      role_change_target: {
        Args: { p_email: string; p_note: string }
        Returns: string
      }
      save_my_profile: {
        Args: {
          p_lat: number
          p_lng: number
          p_location_source: string
          p_postcode: string
          p_skills: Json
        }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

