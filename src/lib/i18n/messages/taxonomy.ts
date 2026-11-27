// Names of the six skill categories, by slug (the slugs come from the taxonomy migration). The
// database holds only Polish names (`skill_categories.name_pl`); skills, crisis types and team
// templates wait for S-19 and S-20. Polish is the shape; `en` and `uk` are typed as it. Relative
// imports only, so `node:test` loads it. The Ukrainian text waits for a native reader.

import type { Locale } from "../locale.ts";

export const pl = {
  categories: {
    medyczne: "Medyczne",
    techniczne: "Techniczne",
    logistyczne: "Logistyczne",
    jezykowe: "Językowe",
    wojskowe: "Wojskowe / rezerwa",
    sprzet: "Narzędzia i sprzęt",
  },
};

export type TaxonomyMessages = typeof pl;

export const en: TaxonomyMessages = {
  categories: {
    medyczne: "Medical",
    techniczne: "Technical",
    logistyczne: "Logistics",
    jezykowe: "Languages",
    wojskowe: "Military / reserve",
    sprzet: "Tools and equipment",
  },
};

export const uk: TaxonomyMessages = {
  categories: {
    medyczne: "Медичні",
    techniczne: "Технічні",
    logistyczne: "Логістичні",
    jezykowe: "Мовні",
    wojskowe: "Військові / резерв",
    sprzet: "Інструменти та спорядження",
  },
};

export const taxonomy: Record<Locale, TaxonomyMessages> = { pl, en, uk };

/**
 * A category's name in the request's language. Polish always shows the database's own name, the
 * source of truth. In another language a slug the catalogue does not have (a category added by a
 * later migration) falls back to that Polish name, so it never shows blank.
 */
export function categoryName(locale: Locale, slug: string, databaseName: string): string {
  if (locale === "pl") return databaseName;
  const names: Record<string, string | undefined> = taxonomy[locale].categories;
  return (Object.hasOwn(names, slug) ? names[slug] : undefined) ?? databaseName;
}
