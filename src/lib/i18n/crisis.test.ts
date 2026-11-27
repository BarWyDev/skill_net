// Names of crisis types, team templates, team roles and ready exercises by slug
// (coordinator-area-translations, Phase 1). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { crisisTypeName, pl, scenarioName, teamRoleName, teamTemplateName } from "./messages/crisis.ts";

const read = (path: string) => readFileSync(new URL(`../../../supabase/${path}`, import.meta.url), "utf8");

/** The part of a SQL file after `insert into public.<table> (`, up to the statement's end. */
function insertInto(sql: string, table: string): string {
  const start = sql.indexOf(`insert into public.${table} (`);
  assert.ok(start >= 0, `no insert into ${table}`);
  return sql.slice(start, sql.indexOf(";", start));
}

test("Polish shows the database's own name", () => {
  assert.equal(crisisTypeName("pl", "powodz", "Powódź"), "Powódź");
  assert.equal(crisisTypeName("pl", "powodz", "Wielka woda"), "Wielka woda");
  assert.equal(teamRoleName("pl", "techniczny", "kierowca", "Kierowca"), "Kierowca");
});

test("English and Ukrainian come from the catalogue", () => {
  assert.equal(crisisTypeName("en", "awaria-pradu", "Awaria prądu"), "Power outage");
  assert.equal(crisisTypeName("uk", "pozar", "Pożar"), "Пожежа");
  assert.equal(teamTemplateName("en", "punkt-medyczny", "Punkt medyczny"), "Medical point");
  assert.equal(teamRoleName("en", "ewakuacyjny", "kierowca", "Kierowca z pojazdem"), "Driver with a vehicle");
  assert.equal(teamRoleName("en", "techniczny", "kierowca", "Kierowca"), "Driver");
  assert.equal(scenarioName("uk", "upaly-krakow", "Fala upałów w Krakowie"), "Хвиля спеки в Кракові");
});

test("a slug the catalogue does not have falls back to the Polish name, never a key", () => {
  assert.equal(crisisTypeName("en", "susza", "Susza"), "Susza");
  assert.equal(teamTemplateName("uk", "constructor", "Coś"), "Coś");
  assert.equal(teamRoleName("en", "ewakuacyjny", "nowa-rola", "Nowa rola"), "Nowa rola");
  assert.equal(teamRoleName("en", "__proto__", "x", "Coś"), "Coś");
  assert.equal(scenarioName("en", "toString", "Ćwiczenie"), "Ćwiczenie");
});

test("the catalogue holds exactly the seeded crisis types, with their Polish names", () => {
  const sql = insertInto(read("migrations/20261001120100_seed_crisis_matrix.sql"), "crisis_types");
  const types = Object.fromEntries(Array.from(sql.matchAll(/\('([a-z-]+)', '([^']+)', \d+,/g), (r) => [r[1], r[2]]));
  assert.equal(Object.keys(types).length, 6);
  assert.deepEqual(pl.names.crisisTypes, types);
});

test("the catalogue holds exactly the seeded team templates and roles, with their Polish names", () => {
  const seed = read("migrations/20261004140100_seed_team_templates.sql");
  const templates = Object.fromEntries(
    Array.from(insertInto(seed, "team_templates").matchAll(/\('([a-z-]+)', '([^']+)', \d+\)/g), (r) => [r[1], r[2]]),
  );
  const roles = Object.fromEntries(
    Array.from(
      insertInto(seed, "team_template_roles").matchAll(/\('([a-z-]+)', '([a-z-]+)', '([^']+)', \d+, \d+\)/g),
      (r) => [`${r[1]}/${r[2]}`, r[3]],
    ),
  );
  assert.equal(Object.keys(templates).length, 4);
  assert.equal(Object.keys(roles).length, 11);
  assert.deepEqual(pl.names.teamTemplates, templates);
  assert.deepEqual(pl.names.teamRoles, roles);
});

test("the catalogue holds exactly the seeded exercises, with their Polish names", () => {
  const sql = insertInto(read("seed.sql"), "crisis_scenarios");
  const scenarios = Object.fromEntries(
    Array.from(sql.matchAll(/\('([a-z-]+)', '([^']+)', '[a-z-]+', '\d{2}-\d{3}'/g), (r) => [r[1], r[2]]),
  );
  assert.equal(Object.keys(scenarios).length, 5);
  assert.deepEqual(pl.names.scenarios, scenarios);
});
