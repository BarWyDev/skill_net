// Filling a catalogue message: `{name}` placeholders and plural forms. Relative imports only, so
// `node:test` loads it.

import type { Locale } from "./locale.ts";

const PLACEHOLDER = /\{(\w+)\}/g;

/** Replaces each `{name}` with its value. A placeholder with no value is left as it is. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

/** The placeholder names a message uses, sorted and without repeats. */
export function placeholders(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]))].sort();
}

/**
 * The forms of one countable phrase. Polish and Ukrainian need `one` (1), `few` (2–4, 22–24, …) and
 * `many` (0, 5–21, …); English needs `one` and `other`. `other` is required: it is the fallback for
 * a form a language leaves out, and what fractions use.
 */
export interface PluralForms {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

const rules = new Map<Locale, Intl.PluralRules>();

/** Picks the form for `count` by the language's plural rule. */
export function plural(locale: Locale, count: number, forms: PluralForms): string {
  let rule = rules.get(locale);
  if (!rule) {
    rule = new Intl.PluralRules(locale);
    rules.set(locale, rule);
  }
  const category = rule.select(count);
  return (category === "one" || category === "few" || category === "many" ? forms[category] : undefined) ?? forms.other;
}
