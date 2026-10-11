// One-shot error notices (security audit F-06). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { AstroCookies } from "astro";
import { FLASH_COOKIE, decodeFlash, encodeFlash, redirectWithError, takeFlashError } from "./flash.ts";

interface SetCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

// Just enough of AstroCookies for the helpers: get, set and delete.
function fakeCookies(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const sets: SetCall[] = [];
  const deletes: { name: string; options: Record<string, unknown> }[] = [];
  const cookies = {
    get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      store.set(name, value);
      sets.push({ name, value, options });
    },
    delete: (name: string, options: Record<string, unknown>) => {
      store.delete(name);
      deletes.push({ name, options });
    },
  } as unknown as AstroCookies;
  return { cookies, store, sets, deletes };
}

test("a notice round-trips for the page it is meant for", () => {
  assert.equal(decodeFlash(encodeFlash("/profil", "Zapisz ponownie."), "/profil"), "Zapisz ponownie.");
});

test("a notice for another page is not shown", () => {
  assert.equal(decodeFlash(encodeFlash("/profil", "Zapisz ponownie."), "/zgoda"), null);
  assert.equal(decodeFlash(encodeFlash("/koordynator", "Błąd."), "/koordynator/kryzys/abc"), null);
});

test("malformed values are dropped", () => {
  for (const raw of ["", "Konto zablokowane", "{", "null", "42", '"tekst"', "[]", '{"p":"/profil"}']) {
    assert.equal(decodeFlash(raw, "/profil"), null, raw);
  }
  assert.equal(decodeFlash(JSON.stringify({ p: "/profil", m: 42 }), "/profil"), null);
  assert.equal(decodeFlash(JSON.stringify({ p: "/profil", m: "" }), "/profil"), null);
  assert.equal(decodeFlash(JSON.stringify({ p: "/profil", m: "x".repeat(501) }), "/profil"), null);
});

test("redirectWithError sets an httpOnly, short-lived cookie scoped to the target path", () => {
  const { cookies, sets } = fakeCookies();
  const response = redirectWithError(
    {
      url: new URL("https://skillnet.example/api/auth/signin"),
      cookies,
      redirect: (path) => new Response(null, { status: 302, headers: { location: path } }),
    },
    "/auth/signin?niepotwierdzony=1",
    "Nieprawidłowy e-mail lub hasło.",
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/auth/signin?niepotwierdzony=1");
  assert.equal(sets.length, 1);
  assert.equal(sets[0].name, FLASH_COOKIE);
  assert.equal(decodeFlash(sets[0].value, "/auth/signin"), "Nieprawidłowy e-mail lub hasło.");
  assert.deepEqual(sets[0].options, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 });
});

test("the cookie is not Secure on plain-HTTP local development", () => {
  const { cookies, sets } = fakeCookies();
  redirectWithError(
    { url: new URL("http://localhost:4321/api/profile"), cookies, redirect: () => new Response(null) },
    "/profil",
    "Błąd.",
  );
  assert.equal(sets[0].options.secure, false);
});

test("takeFlashError returns the notice once and deletes the cookie", () => {
  const { cookies, store, deletes } = fakeCookies({ [FLASH_COOKIE]: encodeFlash("/profil", "Błąd zapisu.") });
  const context = { url: new URL("https://skillnet.example/profil"), cookies };

  assert.equal(takeFlashError(context), "Błąd zapisu.");
  assert.deepEqual(deletes, [{ name: FLASH_COOKIE, options: { path: "/" } }]);
  assert.equal(store.has(FLASH_COOKIE), false);
  assert.equal(takeFlashError(context), null);
});

test("takeFlashError deletes a notice meant for another page without showing it", () => {
  const { cookies, store } = fakeCookies({ [FLASH_COOKIE]: encodeFlash("/profil", "Błąd zapisu.") });
  assert.equal(takeFlashError({ url: new URL("https://skillnet.example/zgoda"), cookies }), null);
  assert.equal(store.has(FLASH_COOKIE), false);
});

test("takeFlashError ignores the query string, so ?error= text never shows", () => {
  const { cookies, deletes } = fakeCookies();
  const url = new URL("https://skillnet.example/auth/signin?error=Konto%20zablokowane");
  assert.equal(takeFlashError({ url, cookies }), null);
  assert.equal(deletes.length, 0);
});
