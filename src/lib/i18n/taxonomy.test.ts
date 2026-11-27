// Category names by slug (interface-language-switch, Phase 2). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { categoryName } from "./messages/taxonomy.ts";

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
