// Shared entity and DTO types for the page, the API and the React islands.

import type { Polygon } from "geojson";

export type SkillLevel = 1 | 2 | 3;
export type LocationSource = "postcode" | "pin";

export interface SkillCategoryDTO {
  slug: string;
  name: string;
}

export interface SkillDTO {
  slug: string;
  categorySlug: string;
  name: string;
  hasLevel: boolean;
}

export interface ProfileSkillDTO {
  slug: string;
  level: SkillLevel | null;
}

/** The caller's profile. The postcode is never stored, so it is never returned. */
export interface MyProfileDTO {
  locationSource: LocationSource | null;
  lat: number | null;
  lng: number | null;
  skills: ProfileSkillDTO[];
  /** Complete and not paused: the resident can appear in a crisis ranking. */
  matchable: boolean;
  /** A location and at least one skill, whether paused or not. */
  complete: boolean;
  /** A pause is in effect now. */
  paused: boolean;
  /** Last paused day (`YYYY-MM-DD`, inclusive, Warsaw calendar); null when indefinite or not paused. */
  pausedUntil: string | null;
  /** Normalised `+48XXXXXXXXX`. Only ever returned to its owner. */
  phone: string | null;
  phoneVerified: boolean;
  /** 28-bit mask, see `src/lib/availability.ts`; null = not declared. */
  availabilitySlots: number | null;
}

export interface TaxonomyDTO {
  categories: SkillCategoryDTO[];
  skills: SkillDTO[];
}

/** Parsed profile form, ready for the `save_my_profile` RPC. */
export interface SaveProfileInput {
  locationSource: LocationSource | null;
  /** With `locationSource: "postcode"`, null means "keep the stored location". */
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  skills: ProfileSkillDTO[];
  /** Normalised `+48XXXXXXXXX`; null deletes the stored number. */
  phone: string | null;
  /** Non-zero 28-bit mask; null = not declared. */
  availabilitySlots: number | null;
}

export interface CrisisTypeDTO {
  slug: string;
  name: string;
}

export type RadiusKm = 1 | 2 | 5 | 10 | 20;

/** Parsed crisis activation form, ready for the `activate_crisis` RPC. */
export interface ActivateCrisisInput {
  crisisType: string;
  locationSource: LocationSource;
  /** Set for `locationSource: "postcode"`; the server resolves the raw centroid from it. */
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: RadiusKm;
  /** Why the crisis is activated, trimmed. Stored with the crisis (security audit F-02). */
  reason: string;
}

export interface CrisisDTO {
  id: string;
  typeName: string;
  radiusKm: number;
  /** The typed postcode, or the one nearest to a pinned epicentre: a place label, not an address. */
  epicentrePostcode: string | null;
  activatedAt: string;
  endedAt: string | null;
  /**
   * For an active crisis, the residents the coordinator can currently see in its list (paused and
   * erased residents excluded). For an ended crisis, the frozen count from activation.
   */
  matchCount: number;
  status: "active" | "ended";
}

export type CrisisSkillTier = "priority" | "supporting";

/** One ranked row. No identity, no coordinates and no score: only what the coordinator needs. */
export interface CrisisMatchDTO {
  rank: number;
  /** The stable per-crisis order behind the "Osoba #N" pseudonym. */
  position: number;
  /** Rounded to 0.5 km in the database. */
  distanceKm: number;
  skills: { slug: string; name: string; tier: CrisisSkillTier; level: SkillLevel | null }[];
  /** Whether the resident left a phone number. The number itself never reaches the coordinator. */
  hasPhone: boolean;
  /** The resident's current declaration (see src/lib/availability.ts); null = not declared. */
  availabilitySlots: number | null;
  /** The declaration checked against the Warsaw clock when the page is viewed; null = not declared. */
  availableNow: boolean | null;
}

/**
 * One row of a break-glass reveal. It exists only in the response to a reveal that wrote an audit
 * row; it is never stored, cached or put in a URL.
 */
export interface CrisisContactDTO extends Omit<CrisisMatchDTO, "hasPhone"> {
  /** The resident's current number, normalised `+48XXXXXXXXX`. */
  phone: string;
  phoneVerified: boolean;
}

/** A predefined crisis team template (S-10). Templates change only by migration. */
export interface TeamTemplateDTO {
  slug: string;
  name: string;
  /** In template order; `slots` is how many people the role needs per team. */
  roles: { slug: string; name: string; slots: number }[];
}

/** One team member. No identity, like CrisisMatchDTO; `skills` are the ones that qualify them for the role. */
export interface TeamMemberDTO {
  rank: number;
  /** The stable per-crisis order behind the "Osoba #N" pseudonym. */
  position: number;
  /** Rounded to 0.5 km in the database. */
  distanceKm: number;
  /** The member's current skills that qualify them for their role, best level first. */
  skills: { slug: string; name: string; level: SkillLevel | null }[];
  hasPhone: boolean;
  availabilitySlots: number | null;
  availableNow: boolean | null;
}

/** An assembled team. It is computed per request and never stored. */
export interface CrisisTeamDTO {
  /** 1-based, in output order: complete teams first, then the partial one. */
  number: number;
  complete: boolean;
  /** One entry per slot, in template role order; `member` is null for an unfilled slot. */
  slots: { roleSlug: string; roleName: string; member: TeamMemberDTO | null }[];
}

/** 1: 5–9, 2: 10–24, 3: 25 or more distinct residents. Cells with fewer than 5 are never returned. */
export type DensityBand = 1 | 2 | 3;

/** One public 2 km cell of the skills-density map (S-11). No count, no id, no sub-cell coordinate. */
export interface DensityCellDTO {
  cell: Polygon;
  band: DensityBand;
}
