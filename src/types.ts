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
