// Names of the six skill categories and of every skill, by slug (the slugs come from the taxonomy
// migration, and taxonomy.test.ts checks this file against it). The database holds only Polish
// names (`name_pl`); crisis types and team templates wait for S-20. Polish is the shape; `en` and
// `uk` are typed as it. Relative imports only, so `node:test` loads it. The Ukrainian text waits
// for a native reader.

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
  skills: {
    "ratownik-medyczny": "Ratownik medyczny",
    lekarz: "Lekarz",
    pielegniarka: "Pielęgniarka / pielęgniarz",
    "pierwsza-pomoc": "Kurs pierwszej pomocy",
    "ratownik-wodny": "Ratownik wodny",
    psycholog: "Psycholog",
    "opiekun-osob-starszych": "Opiekun osób starszych",
    elektryk: "Elektryk",
    informatyk: "Informatyk",
    radioamator: "Radioamator",
    "kierowca-kat-b": "Kierowca kat. B",
    "kierowca-kat-c": "Kierowca kat. C",
    sternik: "Sternik (łódź)",
    logistyk: "Logistyk",
    "osoba-silna-fizycznie": "Osoba silna fizycznie",
    "tlumacz-angielski": "Język angielski",
    "tlumacz-ukrainski": "Język ukraiński",
    "tlumacz-niemiecki": "Język niemiecki",
    "tlumacz-migowy": "Polski język migowy",
    rezerwista: "Rezerwista",
    "zolnierz-wot": "Żołnierz WOT",
    "strazak-osp": "Strażak / OSP",
    "agregat-pradotworczy": "Agregat prądotwórczy",
    "ups-magazyn-energii": "UPS / magazyn energii",
    pompa: "Pompa do wody",
    "pila-lancuchowa": "Piła łańcuchowa",
    "narzedzia-reczne": "Narzędzia ręczne (siekiera, łom)",
    lodz: "Łódź / ponton",
    "samochod-terenowy": "Samochód terenowy",
    "lokal-ogrzewany-klimatyzowany": "Lokal ogrzewany / klimatyzowany",
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
  skills: {
    "ratownik-medyczny": "Paramedic",
    lekarz: "Doctor",
    pielegniarka: "Nurse",
    "pierwsza-pomoc": "First aid course",
    "ratownik-wodny": "Lifeguard",
    psycholog: "Psychologist",
    "opiekun-osob-starszych": "Carer for older people",
    elektryk: "Electrician",
    informatyk: "IT specialist",
    radioamator: "Amateur radio operator",
    "kierowca-kat-b": "Driver, category B (car)",
    "kierowca-kat-c": "Driver, category C (lorry)",
    sternik: "Helmsman (boat)",
    logistyk: "Logistics specialist",
    "osoba-silna-fizycznie": "Physically strong person",
    "tlumacz-angielski": "English language",
    "tlumacz-ukrainski": "Ukrainian language",
    "tlumacz-niemiecki": "German language",
    "tlumacz-migowy": "Polish Sign Language",
    rezerwista: "Reservist",
    "zolnierz-wot": "Territorial Defence Force (WOT) soldier",
    "strazak-osp": "Firefighter / volunteer fire brigade (OSP)",
    "agregat-pradotworczy": "Power generator",
    "ups-magazyn-energii": "UPS / energy storage",
    pompa: "Water pump",
    "pila-lancuchowa": "Chainsaw",
    "narzedzia-reczne": "Hand tools (axe, crowbar)",
    lodz: "Boat / inflatable boat",
    "samochod-terenowy": "Off-road vehicle",
    "lokal-ogrzewany-klimatyzowany": "Heated / air-conditioned premises",
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
  skills: {
    "ratownik-medyczny": "Парамедик",
    lekarz: "Лікар",
    pielegniarka: "Медсестра / медбрат",
    "pierwsza-pomoc": "Курс першої допомоги",
    "ratownik-wodny": "Рятувальник на воді",
    psycholog: "Психолог",
    "opiekun-osob-starszych": "Доглядальник за літніми людьми",
    elektryk: "Електрик",
    informatyk: "ІТ-фахівець",
    radioamator: "Радіоаматор",
    "kierowca-kat-b": "Водій кат. B",
    "kierowca-kat-c": "Водій кат. C",
    sternik: "Стерновий (човен)",
    logistyk: "Логіст",
    "osoba-silna-fizycznie": "Фізично сильна людина",
    "tlumacz-angielski": "Англійська мова",
    "tlumacz-ukrainski": "Українська мова",
    "tlumacz-niemiecki": "Німецька мова",
    "tlumacz-migowy": "Польська жестова мова",
    rezerwista: "Резервіст",
    "zolnierz-wot": "Військовослужбовець WOT (територіальна оборона)",
    "strazak-osp": "Пожежник / OSP (добровільна пожежна охорона)",
    "agregat-pradotworczy": "Електрогенератор",
    "ups-magazyn-energii": "ДБЖ / накопичувач енергії",
    pompa: "Водяна помпа",
    "pila-lancuchowa": "Бензопила",
    "narzedzia-reczne": "Ручні інструменти (сокира, лом)",
    lodz: "Човен / понтон",
    "samochod-terenowy": "Позашляховик",
    "lokal-ogrzewany-klimatyzowany": "Приміщення з опаленням / кондиціонером",
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

/** A skill's name in the request's language, by the same rules as `categoryName`. */
export function skillName(locale: Locale, slug: string, databaseName: string): string {
  if (locale === "pl") return databaseName;
  const names: Record<string, string | undefined> = taxonomy[locale].skills;
  return (Object.hasOwn(names, slug) ? names[slug] : undefined) ?? databaseName;
}
