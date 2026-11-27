// Language resolution and the `?lang=` link (interface-language-switch, Phase 1). Run with
// `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  langRedirectTarget,
  langSwitchHref,
  parseEnabledLocales,
  requestedLocale,
  resolveLocale,
  type Locale,
} from "./locale.ts";

const ALL: Locale[] = ["pl", "en", "uk"];
const POLISH_ONLY: Locale[] = ["pl"];

const fromHeader = (acceptLanguage: string | null, enabled: Locale[] = ALL) =>
  resolveLocale({ cookie: undefined, acceptLanguage, enabled });

test("the supported languages are Polish, English and Ukrainian, and Polish is the default", () => {
  assert.deepEqual([...LOCALES], ["pl", "en", "uk"]);
  assert.equal(DEFAULT_LOCALE, "pl");
  assert.equal(isLocale("uk"), true);
  for (const value of ["ua", "PL", "", "pl-PL", undefined, null, 1]) assert.equal(isLocale(value), false);
});

test("parseEnabledLocales fails closed to Polish only", () => {
  assert.deepEqual(parseEnabledLocales(undefined), ["pl"]);
  assert.deepEqual(parseEnabledLocales(""), ["pl"]);
  assert.deepEqual(parseEnabledLocales(" , ,"), ["pl"]);
  assert.deepEqual(parseEnabledLocales("de,ru,xx"), ["pl"]);
  assert.deepEqual(parseEnabledLocales("pl;en;uk"), ["pl"]);
});

test("parseEnabledLocales reads the list, ignores unknown entries and spaces, and always keeps Polish", () => {
  assert.deepEqual(parseEnabledLocales("pl,en,uk"), ["pl", "en", "uk"]);
  assert.deepEqual(parseEnabledLocales(" pl , EN ,uk "), ["pl", "en", "uk"]);
  assert.deepEqual(parseEnabledLocales("uk,de,en"), ["pl", "en", "uk"]);
  assert.deepEqual(parseEnabledLocales("en"), ["pl", "en"]);
  assert.deepEqual(parseEnabledLocales("uk,uk"), ["pl", "uk"]);
});

test("the cookie wins over the browser's languages", () => {
  assert.equal(resolveLocale({ cookie: "uk", acceptLanguage: "pl", enabled: ALL }), "uk");
  assert.equal(resolveLocale({ cookie: "pl", acceptLanguage: "en-GB, en", enabled: ALL }), "pl");
  assert.equal(resolveLocale({ cookie: "en", acceptLanguage: null, enabled: ALL }), "en");
});

test("a cookie naming a disabled or unknown language is ignored", () => {
  assert.equal(resolveLocale({ cookie: "uk", acceptLanguage: "pl", enabled: POLISH_ONLY }), "pl");
  assert.equal(resolveLocale({ cookie: "en", acceptLanguage: "uk", enabled: ["pl", "uk"] }), "uk");
  assert.equal(resolveLocale({ cookie: "de", acceptLanguage: "uk", enabled: ALL }), "uk");
  assert.equal(resolveLocale({ cookie: "", acceptLanguage: undefined, enabled: ALL }), "pl");
});

test("a missing, empty or wildcard header gives Polish", () => {
  assert.equal(fromHeader(null), "pl");
  assert.equal(fromHeader(""), "pl");
  assert.equal(fromHeader("   "), "pl");
  // What Node's fetch sends: the smoke test stays on Polish.
  assert.equal(fromHeader("*"), "pl");
  assert.equal(fromHeader("*;q=0.5"), "pl");
});

test("the header is walked by descending quality", () => {
  assert.equal(fromHeader("uk-UA"), "uk");
  assert.equal(fromHeader("UK-ua,uk;q=0.9"), "uk");
  assert.equal(fromHeader("en-GB;q=0.9, pl;q=0.8"), "en");
  assert.equal(fromHeader("pl;q=0.8, en-GB;q=0.9"), "en");
  assert.equal(fromHeader("ru, pl;q=0.5"), "pl");
  assert.equal(fromHeader("de-DE, de;q=0.9, uk;q=0.2, en;q=0.1"), "uk");
});

test("a header naming only unsupported languages gives English, or Polish where English is off", () => {
  assert.equal(fromHeader("de"), "en");
  assert.equal(fromHeader("ru-RU, ru;q=0.9"), "en");
  assert.equal(fromHeader("*, de"), "en");
  assert.equal(fromHeader("de", POLISH_ONLY), "pl");
  assert.equal(fromHeader("en", POLISH_ONLY), "pl");
  assert.equal(fromHeader("de", ["pl", "uk"]), "pl");
});

test("q=0 drops a language, and equal qualities keep the header's order", () => {
  assert.equal(fromHeader("pl;q=0, en"), "en");
  assert.equal(fromHeader("uk;q=0.0, pl;q=0.1"), "pl");
  assert.equal(fromHeader("uk, en"), "uk");
  assert.equal(fromHeader("en, uk"), "en");
  assert.equal(fromHeader("en;q=0.7, uk;q=0.7, pl;q=0.3"), "en");
});

test("a quality that cannot be read counts as 1, and broken entries are skipped", () => {
  assert.equal(fromHeader("uk;q=abc, en;q=0.9"), "uk");
  assert.equal(fromHeader("en;q=0.9, uk;q=7"), "uk");
  assert.equal(fromHeader("pl;q=, en;q=0.5"), "pl");
  assert.equal(fromHeader(";q=0.9, , uk"), "uk");
  assert.equal(fromHeader("<script>, ???"), "pl");
  assert.equal(fromHeader(`${"x".repeat(5000)}, uk`), "pl");
});

test("requestedLocale accepts only an enabled language", () => {
  assert.equal(requestedLocale(new URL("https://skillnet.org.pl/mapa?lang=uk"), ALL), "uk");
  assert.equal(requestedLocale(new URL("https://skillnet.org.pl/mapa?lang=uk"), POLISH_ONLY), null);
  assert.equal(requestedLocale(new URL("https://skillnet.org.pl/mapa?lang=de"), ALL), null);
  assert.equal(requestedLocale(new URL("https://skillnet.org.pl/mapa?lang="), ALL), null);
  assert.equal(requestedLocale(new URL("https://skillnet.org.pl/mapa"), ALL), null);
});

test("the ?lang= redirect removes the parameter and keeps the others", () => {
  assert.equal(langRedirectTarget(new URL("https://skillnet.org.pl/?lang=en")), "https://skillnet.org.pl/");
  assert.equal(
    langRedirectTarget(new URL("https://skillnet.org.pl/mapa?kategoria=medyczne&lang=uk&kod=00-001")),
    "https://skillnet.org.pl/mapa?kategoria=medyczne&kod=00-001",
  );
  assert.equal(
    langRedirectTarget(new URL("http://localhost:4321/profil?lang=xx&lang=en")),
    "http://localhost:4321/profil",
  );
  assert.equal(langRedirectTarget(new URL("https://skillnet.org.pl/mapa?kategoria=medyczne")), null);
  assert.equal(langRedirectTarget(new URL("https://skillnet.org.pl/")), null);
});

test("the ?lang= redirect stays on the request's origin for a path that starts with //", () => {
  for (const address of [
    "https://skillnet.org.pl//evil.example?lang=en",
    "https://skillnet.org.pl//evil.example/?lang=en",
    "https://skillnet.org.pl/\\evil.example?lang=en",
    "https://skillnet.org.pl/.//evil.example?lang=en",
    "https://skillnet.org.pl///evil.example/%2e%2e?lang=en",
  ]) {
    const target = langRedirectTarget(new URL(address));
    assert.ok(target, address);
    // Absolute, so a browser cannot read the path as a host.
    assert.match(target, /^https:\/\/skillnet\.org\.pl\//, address);
    assert.equal(new URL(target).origin, "https://skillnet.org.pl", address);
    assert.equal(new URL(target).searchParams.has("lang"), false, address);
  }
});

test("the switcher's link is a query string that keeps the other parameters", () => {
  assert.equal(langSwitchHref(new URL("https://skillnet.org.pl/"), "en"), "?lang=en");
  assert.equal(
    langSwitchHref(new URL("https://skillnet.org.pl/mapa?kategoria=medyczne"), "uk"),
    "?kategoria=medyczne&lang=uk",
  );
  assert.equal(langSwitchHref(new URL("https://skillnet.org.pl/mapa?lang=en&x=1"), "pl"), "?lang=pl&x=1");
  assert.equal(langSwitchHref(new URL("https://skillnet.org.pl//evil.example"), "en"), "?lang=en");
});
