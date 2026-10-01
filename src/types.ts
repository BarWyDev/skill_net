// Shared entity and DTO types for the page, the API and the React islands.

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
  matchable: boolean;
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
}

export interface CrisisDTO {
  id: string;
  typeName: string;
  radiusKm: number;
  activatedAt: string;
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
}
