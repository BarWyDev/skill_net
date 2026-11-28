// Category and skill names by slug (interface-language-switch, Phase 2; resident-area-translations,
// Phase 1). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";

import { categoryName, pl, skillName } from "./messages/taxonomy.ts";

test("Polish shows the database's own name", () => {
  assert.equal(categoryName("pl", "medyczne", "Medyczne"), "Medyczne");
  assert.equal(categoryName("pl", "medyczne", "Zdrowie"), "Zdrowie");
});

test("English and Ukrainian come from the catalogue", () => {
  assert.equal(categoryName("en", "medyczne", "Medyczne"), "Medical");
  assert.equal(categoryName("uk", "sprzet", "Narzędzia i sprzęt"), "Інструменти та спорядження");
});

test("a slug the catalogue does not have falls back to the Polish name, never blank", () => {
  assert.equal(categoryName("en", "nowa-kategoria", "Nowa kategoria"), "Nowa kategoria");
  assert.equal(categoryName("uk", "toString", "Coś"), "Coś");
  assert.equal(categoryName("en", "__proto__", "Coś"), "Coś");
});

test("skill names follow the same rules as category names", () => {
  assert.equal(skillName("pl", "lekarz", "Lekarz"), "Lekarz");
  assert.equal(skillName("pl", "lekarz", "Medyk"), "Medyk");
  assert.equal(skillName("en", "lekarz", "Lekarz"), "Doctor");
  assert.equal(skillName("uk", "lekarz", "Lekarz"), "Лікар");
  assert.equal(skillName("en", "nowa-umiejetnosc", "Nowa umiejętność"), "Nowa umiejętność");
  assert.equal(skillName("uk", "constructor", "Coś"), "Coś");
});

test("the catalogue holds exactly the seeded categories and skills, with their Polish names", () => {
  const seed = readFileSync(
    new URL("../../../supabase/migrations/20260927120100_seed_skills_taxonomy.sql", import.meta.url),
    "utf8",
  );
  const [categoriesSql, skillsSql] = seed.split("insert into public.skills ");
  const categories = Object.fromEntries(
    Array.from(categoriesSql.matchAll(/\('([a-z-]+)', '([^']+)', \d+\)/g), (row) => [row[1], row[2]]),
  );
  const skills = Object.fromEntries(
    Array.from(skillsSql.matchAll(/\('([a-z-]+)', '[a-z-]+', '([^']+)', (?:true|false), \d+\)/g), (row) => [
      row[1],
      row[2],
    ]),
  );
  assert.equal(Object.keys(categories).length, 6);
  assert.equal(Object.keys(skills).length, 30);
  assert.deepEqual(pl.categories, categories);
  assert.deepEqual(pl.skills, skills);
});
