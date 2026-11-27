// Every catalogue in messages/ and the formatter (interface-language-switch, Phase 1). The type
// check already refuses a missing or extra key; this refuses an empty string and a placeholder that
// one language has and another lacks. Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";

import { format, placeholders, plural } from "./format.ts";
import { LOCALES } from "./locale.ts";

const MESSAGES_DIR = new URL("./messages/", import.meta.url);
const files = readdirSync(MESSAGES_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

/** Every string in a catalogue, by its dotted path. */
function leaves(value: unknown, path: string, out: Map<string, string>): Map<string, string> {
  if (typeof value === "string") {
    out.set(path, value);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) leaves(child, path ? `${path}.${key}` : key, out);
  } else {
    assert.fail(`${path} is ${typeof value}; a catalogue holds only strings`);
  }
  return out;
}

test("messages/ holds at least the common catalogue", () => {
  assert.ok(files.includes("common.ts"), files.join(", "));
});

for (const file of files) {
  test(`${file}: every language has the same keys, no empty text and the same placeholders`, async () => {
    const module = (await import(new URL(file, MESSAGES_DIR).href)) as Record<string, unknown>;
    const polish = leaves(module.pl, "", new Map());
    assert.ok(polish.size > 0, "the Polish catalogue is empty");

    for (const locale of LOCALES) {
      assert.ok(module[locale], `no "${locale}" export`);
      const messages = leaves(module[locale], "", new Map());
      assert.deepEqual([...messages.keys()].sort(), [...polish.keys()].sort(), `${locale}: keys differ from Polish`);
      for (const [key, text] of messages) {
        assert.notEqual(text.trim(), "", `${locale}.${key} is empty`);
        assert.deepEqual(
          placeholders(text),
          placeholders(polish.get(key) ?? ""),
          `${locale}.${key}: placeholders differ from Polish`,
        );
      }
    }
  });
}

test("format fills {name} placeholders and leaves unknown ones", () => {
  assert.equal(format("Witaj, {name}!", { name: "Ola" }), "Witaj, Ola!");
  assert.equal(format("{count} z {total}, {count}", { count: 2, total: 5 }), "2 z 5, 2");
  assert.equal(format("Bez zmian", {}), "Bez zmian");
  assert.equal(format("{missing} i {name}", { name: "x" }), "{missing} i x");
  assert.equal(format("{toString}", {}), "{toString}");
  assert.deepEqual(placeholders("{b} {a} {b}"), ["a", "b"]);
});

test("plural picks the Polish and Ukrainian forms", () => {
  const forms = { one: "znak", few: "znaki", many: "znaków", other: "znaku" };
  for (const locale of ["pl", "uk"] as const) {
    assert.equal(plural(locale, 1, forms), "znak");
    assert.equal(plural(locale, 2, forms), "znaki");
    assert.equal(plural(locale, 5, forms), "znaków");
    assert.equal(plural(locale, 12, forms), "znaków");
    assert.equal(plural(locale, 22, forms), "znaki");
    assert.equal(plural(locale, 0, forms), "znaków");
  }
  assert.equal(plural("pl", 1.5, forms), "znaku");
});

test("plural picks the English forms, and falls back to `other` for a form left out", () => {
  const forms = { one: "character", other: "characters" };
  assert.equal(plural("en", 1, forms), "character");
  assert.equal(plural("en", 2, forms), "characters");
  assert.equal(plural("en", 0, forms), "characters");
  assert.equal(plural("pl", 5, forms), "characters");
});
