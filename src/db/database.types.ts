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
      consent_events: {
        Row: {
          id: number
          occurred_at: string
          source: string
          user_id: string
          version: string
        }
        ComputedFields: never
        Insert: {
          id?: never
          occurred_at?: string
          source: string
          user_id: string
          version: string
        }
        Update: {
          id?: never
          occurred_at?: string
          source?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "consent_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      consent_versions: {
        Row: {
          published_at: string
          version: string
        }
        ComputedFields: never
        Insert: {
          published_at?: string
          version: string
        }
        Update: {
          published_at?: string
          version?: string
        }
        Relationships: []
      }
      contact_reveal_events: {
        Row: {
          crisis_id: string
          id: number
          occurred_at: string
          reason: string
          revealed_by: string
          revealed_count: number
        }
        ComputedFields: never
        Insert: {
          crisis_id: string
          id?: never
          occurred_at?: string
          reason: string
          revealed_by: string
          revealed_count?: number
        }
        Update: {
          crisis_id?: string
          id?: never
          occurred_at?: string
          reason?: string
          revealed_by?: string
          revealed_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "contact_reveal_events_crisis_id_fkey"
            columns: ["crisis_id"]
            isOneToOne: false
            referencedRelation: "crises"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_reveal_subjects: {
        Row: {
          event_id: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          event_id: number
          user_id: string
        }
        Update: {
          event_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_reveal_subjects_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "contact_reveal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinator_role_events: {
        Row: {
          action: string
          id: number
          note: string
          occurred_at: string
          user_id: string
        }
        ComputedFields: never
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
      course_signups: {
        Row: {
          course_id: string
          signed_up_at: string
          user_id: string
          withdrawn_at: string | null
        }
        ComputedFields: never
        Insert: {
          course_id: string
          signed_up_at?: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          course_id?: string
          signed_up_at?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_signups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_signups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      courses: {
        Row: {
          capacity: number | null
          created_at: string
          description: string
          duration_minutes: number
          id: string
          is_open: boolean
          meeting_details: string | null
          opened_at: string
          organiser_id: string
          skill_slug: string
          title: string
          course_hidden_reason: string | null
        }
        ComputedFields: "course_hidden_reason"
        Insert: {
          capacity?: number | null
          created_at?: string
          description: string
          duration_minutes: number
          id?: string
          is_open?: boolean
          meeting_details?: string | null
          opened_at?: string
          organiser_id: string
          skill_slug: string
          title: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string
          duration_minutes?: number
          id?: string
          is_open?: boolean
          meeting_details?: string | null
          opened_at?: string
          organiser_id?: string
          skill_slug?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "courses_skill_slug_fkey"
            columns: ["skill_slug"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["slug"]
          },
        ]
      }
      crises: {
        Row: {
          activated_at: string
          activated_by: string
          crisis_type_slug: string
          ended_at: string | null
          ended_by: string | null
          epicentre: unknown
          epicentre_postcode: string | null
          id: string
          is_exercise: boolean
          match_count: number
          radius_m: number
          reason: string | null
          status: string
          reveal_declined_count: number | null
          visible_match_count: number | null
        }
        ComputedFields: "reveal_declined_count" | "visible_match_count"
        Insert: {
          activated_at?: string
          activated_by: string
          crisis_type_slug: string
          ended_at?: string | null
          ended_by?: string | null
          epicentre: unknown
          epicentre_postcode?: string | null
          id?: string
          is_exercise?: boolean
          match_count?: number
          radius_m: number
          reason?: string | null
          status?: string
        }
        Update: {
          activated_at?: string
          activated_by?: string
          crisis_type_slug?: string
          ended_at?: string | null
          ended_by?: string | null
          epicentre?: unknown
          epicentre_postcode?: string | null
          id?: string
          is_exercise?: boolean
          match_count?: number
          radius_m?: number
          reason?: string | null
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
      crisis_list_views: {
        Row: {
          crisis_id: string
          id: number
          list: string
          returned_count: number
          viewed_at: string
          viewed_by: string
        }
        ComputedFields: never
        Insert: {
          crisis_id: string
          id?: never
          list: string
          returned_count: number
          viewed_at?: string
          viewed_by: string
        }
        Update: {
          crisis_id?: string
          id?: never
          list?: string
          returned_count?: number
          viewed_at?: string
          viewed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "crisis_list_views_crisis_id_fkey"
            columns: ["crisis_id"]
            isOneToOne: false
            referencedRelation: "crises"
            referencedColumns: ["id"]
          },
        ]
      }
      crisis_matches: {
        Row: {
          crisis_id: string
          distance_m: number
          matched_skills: NonNullable<Json>
          position: number
          rank: number
          score: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          crisis_id: string
          distance_m: number
          matched_skills: NonNullable<Json>
          position: number
          rank: number
          score: number
          user_id: string
        }
        Update: {
          crisis_id?: string
          distance_m?: number
          matched_skills?: NonNullable<Json>
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
      crisis_scenarios: {
        Row: {
          crisis_type_slug: string
          name_pl: string
          postcode: string
          radius_km: number
          reason: string
          slug: string
          sort: number
        }
        ComputedFields: never
        Insert: {
          crisis_type_slug: string
          name_pl: string
          postcode: string
          radius_km: number
          reason: string
          slug: string
          sort: number
        }
        Update: {
          crisis_type_slug?: string
          name_pl?: string
          postcode?: string
          radius_km?: number
          reason?: string
          slug?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "crisis_scenarios_crisis_type_slug_fkey"
            columns: ["crisis_type_slug"]
            isOneToOne: false
            referencedRelation: "crisis_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "crisis_scenarios_postcode_fkey"
            columns: ["postcode"]
            isOneToOne: false
            referencedRelation: "postcodes"
            referencedColumns: ["postcode"]
          },
        ]
      }
      crisis_type_skills: {
        Row: {
          crisis_type_slug: string
          skill_slug: string
          tier: string
        }
        ComputedFields: never
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
        ComputedFields: never
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
        ComputedFields: never
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
      profile_contacts: {
        Row: {
          phone: string
          phone_verified_at: string | null
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          phone: string
          phone_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          phone?: string
          phone_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profile_skills: {
        Row: {
          level: number | null
          skill_slug: string
          use_in_crisis: boolean
          user_id: string
        }
        ComputedFields: never
        Insert: {
          level?: number | null
          skill_slug: string
          use_in_crisis?: boolean
          user_id: string
        }
        Update: {
          level?: number | null
          skill_slug?: string
          use_in_crisis?: boolean
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
          allow_contact_reveal: boolean
          availability_slots: number | null
          created_at: string
          location: unknown
          location_changed_at: string | null
          location_source: string | null
          paused_at: string | null
          paused_until: string | null
          postcode: string | null
          show_availability_in_crisis: boolean
          show_on_map: boolean
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          allow_contact_reveal?: boolean
          availability_slots?: number | null
          created_at?: string
          location?: unknown
          location_changed_at?: string | null
          location_source?: string | null
          paused_at?: string | null
          paused_until?: string | null
          postcode?: string | null
          show_availability_in_crisis?: boolean
          show_on_map?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_contact_reveal?: boolean
          availability_slots?: number | null
          created_at?: string
          location?: unknown
          location_changed_at?: string | null
          location_source?: string | null
          paused_at?: string | null
          paused_until?: string | null
          postcode?: string | null
          show_availability_in_crisis?: boolean
          show_on_map?: boolean
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
        ComputedFields: never
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
        ComputedFields: never
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
      skills_density_cells: {
        Row: {
          band: number
          category: string
          cell: NonNullable<Json>
          sx: number
          sy: number
        }
        ComputedFields: never
        Insert: {
          band: number
          category: string
          cell: NonNullable<Json>
          sx: number
          sy: number
        }
        Update: {
          band?: number
          category?: string
          cell?: NonNullable<Json>
          sx?: number
          sy?: number
        }
        Relationships: []
      }
      skills_density_config: {
        Row: {
          id: boolean
          noise_amplitude: number
          salt: string
        }
        ComputedFields: never
        Insert: {
          id?: boolean
          noise_amplitude?: number
          salt?: string
        }
        Update: {
          id?: boolean
          noise_amplitude?: number
          salt?: string
        }
        Relationships: []
      }
      skills_density_refreshes: {
        Row: {
          category: string
          refreshed_at: string
        }
        ComputedFields: never
        Insert: {
          category: string
          refreshed_at: string
        }
        Update: {
          category?: string
          refreshed_at?: string
        }
        Relationships: []
      }
      team_role_skills: {
        Row: {
          role_slug: string
          skill_slug: string
          template_slug: string
        }
        ComputedFields: never
        Insert: {
          role_slug: string
          skill_slug: string
          template_slug: string
        }
        Update: {
          role_slug?: string
          skill_slug?: string
          template_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_role_skills_skill_slug_fkey"
            columns: ["skill_slug"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "team_role_skills_template_slug_role_slug_fkey"
            columns: ["template_slug", "role_slug"]
            isOneToOne: false
            referencedRelation: "team_template_roles"
            referencedColumns: ["template_slug", "role_slug"]
          },
        ]
      }
      team_template_roles: {
        Row: {
          name_pl: string
          role_slug: string
          slots: number
          sort: number
          template_slug: string
        }
        ComputedFields: never
        Insert: {
          name_pl: string
          role_slug: string
          slots: number
          sort: number
          template_slug: string
        }
        Update: {
          name_pl?: string
          role_slug?: string
          slots?: number
          sort?: number
          template_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_template_roles_template_slug_fkey"
            columns: ["template_slug"]
            isOneToOne: false
            referencedRelation: "team_templates"
            referencedColumns: ["slug"]
          },
        ]
      }
      team_templates: {
        Row: {
          name_pl: string
          slug: string
          sort: number
        }
        ComputedFields: never
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
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string
          role: string
          user_id: string
        }
        ComputedFields: never
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
          p_exercise?: boolean
          p_lat: number
          p_lng: number
          p_location_source: string
          p_postcode: string
          p_radius_km: number
          p_reason?: string
        }
        Returns: string
      }
      availability_covers: {
        Args: { p_at: string; p_slots: number }
        Returns: boolean
      }
      check_course_text: {
        Args: { p_field: string; p_max: number; p_min: number; p_text: string }
        Returns: string
      }
      check_reason: { Args: { p_reason: string }; Returns: string }
      coarsen_point: { Args: { p: unknown }; Returns: unknown }
      course_active_signups: { Args: { p_course_id: string }; Returns: number }
      course_eligible_on: { Args: { p_user_id: string }; Returns: string }
      course_hidden_reason: {
        Args: {
          p_course: Omit<
            Database["public"]["Tables"]["courses"]["Row"],
            Database["public"]["Tables"]["courses"]["ComputedFields"]
          >
        }
        Returns: string
      }
      course_open_count: { Args: { p_organiser_id: string }; Returns: number }
      course_resident_eligible: { Args: { p_user_id: string }; Returns: string }
      course_visible_to: {
        Args: {
          p_course: Omit<
            Database["public"]["Tables"]["courses"]["Row"],
            Database["public"]["Tables"]["courses"]["ComputedFields"]
          >
          p_viewer: string
        }
        Returns: boolean
      }
      create_course: {
        Args: {
          p_capacity: number
          p_description: string
          p_duration_minutes: number
          p_meeting_details: string
          p_skill_slug: string
          p_title: string
        }
        Returns: string
      }
      crisis_visible_skills: {
        Args: { p_matched: Json; p_user_id: string }
        Returns: Json
      }
      delete_course: { Args: { p_id: string }; Returns: undefined }
      density_block_geojson: {
        Args: { p_n: number; p_sx: number; p_sy: number }
        Returns: Json
      }
      density_noise: {
        Args: { p_category: string; p_day: string; p_sx: number; p_sy: number }
        Returns: number
      }
      density_square: {
        Args: { p_location: unknown }
        Returns: {
          sx: number
          sy: number
        }[]
      }
      end_crisis: { Args: { p_crisis_id: string }; Returns: boolean }
      ensure_skills_density_fresh: {
        Args: { p_category: string }
        Returns: undefined
      }
      get_course_area: {
        Args: Record<PropertyKey, never>
        Returns: {
          block: Json
          eligibility: string
          eligible_on: string
        }[]
      }
      get_crisis_coverage: {
        Args: { p_crisis_id: string }
        Returns: {
          available_now: number
          people: number
          skill_slug: string
          tier: string
        }[]
      }
      get_crisis_matches: {
        Args: { p_crisis_id: string; p_limit?: number }
        Returns: {
          availability_slots: number
          available_now: boolean
          distance_km_rounded: number
          has_phone: boolean
          matched_skills: Json
          position: number
          rank: number
        }[]
      }
      get_my_course_signups: {
        Args: Record<PropertyKey, never>
        Returns: {
          available: boolean
          category_name: string
          description: string
          duration_minutes: number
          id: string
          meeting_details: string
          skill_name: string
          title: string
        }[]
      }
      get_my_courses: {
        Args: Record<PropertyKey, never>
        Returns: {
          capacity: number
          description: string
          duration_minutes: number
          expires_on: string
          hidden_reason: string
          id: string
          is_open: boolean
          meeting_details: string
          signup_count: number
          skill_slug: string
          title: string
        }[]
      }
      get_my_number_reveals: {
        Args: Record<PropertyKey, never>
        Returns: {
          crisis_type: string
          epicentre_postcode: string
          revealed_at: string
        }[]
      }
      get_my_profile: { Args: Record<PropertyKey, never>; Returns: Json }
      get_nearby_courses: {
        Args: Record<PropertyKey, never>
        Returns: {
          category_name: string
          cell: Json
          description: string
          duration_minutes: number
          id: string
          is_full: boolean
          places_left: number
          signed_up: boolean
          skill_name: string
          title: string
        }[]
      }
      get_skills_density: {
        Args: { p_category?: string }
        Returns: {
          band: number
          cell: Json
        }[]
      }
      get_team_candidates: {
        Args: { p_crisis_id: string; p_teams: number; p_template: string }
        Returns: {
          availability_slots: number
          available_now: boolean
          distance_km_rounded: number
          has_phone: boolean
          position: number
          rank: number
          role_skills: Json
        }[]
      }
      grant_coordinator: {
        Args: { p_email: string; p_note: string }
        Returns: undefined
      }
      is_coordinator: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_in_poland: { Args: { p_lat: number; p_lng: number }; Returns: boolean }
      lookup_postcode: {
        Args: { p_postcode: string }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      my_latest_consent_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      pause_active: {
        Args: { p_at: string; p_paused_at: string; p_paused_until: string }
        Returns: boolean
      }
      pause_my_availability: { Args: { p_until: string }; Returns: undefined }
      profile_counts_on_map: { Args: { p_user_id: string }; Returns: boolean }
      profile_is_complete: { Args: { p_user_id: string }; Returns: boolean }
      profile_is_matchable: { Args: { p_user_id: string }; Returns: boolean }
      record_my_consent: { Args: { p_version: string }; Returns: undefined }
      refresh_skills_density: {
        Args: { p_category: string }
        Returns: undefined
      }
      renew_course: { Args: { p_id: string }; Returns: undefined }
      resume_my_availability: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      reveal_crisis_contacts: {
        Args: { p_crisis_id: string; p_reason: string }
        Returns: {
          availability_slots: number
          available_now: boolean
          distance_km_rounded: number
          matched_skills: Json
          phone: string
          phone_verified: boolean
          position: number
          rank: number
        }[]
      }
      reveal_declined_count: {
        Args: { "": Database["public"]["Tables"]["crises"]["Row"] }
        Returns: {
          error: true
        } & "the function public.reveal_declined_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
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
          p_allow_contact_reveal?: boolean
          p_availability_slots: number
          p_lat: number
          p_lng: number
          p_location_source: string
          p_phone: string
          p_postcode: string
          p_show_availability_in_crisis?: boolean
          p_show_on_map?: boolean
          p_skills: Json
        }
        Returns: undefined
      }
      set_course_open: {
        Args: { p_id: string; p_open: boolean }
        Returns: undefined
      }
      sign_up_for_course: { Args: { p_id: string }; Returns: undefined }
      unregister_me: { Args: Record<PropertyKey, never>; Returns: undefined }
      update_course: {
        Args: {
          p_capacity: number
          p_description: string
          p_duration_minutes: number
          p_id: string
          p_meeting_details: string
          p_title: string
        }
        Returns: undefined
      }
      visible_match_count: {
        Args: { "": Database["public"]["Tables"]["crises"]["Row"] }
        Returns: {
          error: true
        } & "the function public.visible_match_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      withdraw_from_course: { Args: { p_id: string }; Returns: undefined }
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
