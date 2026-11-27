// Auth error messages per language (roadmap S-05, S-18). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { authErrorMessage } from "./auth-errors.ts";
import { LOCALES } from "./i18n/locale.ts";

const GENERIC = {
  pl: "Coś poszło nie tak. Spróbuj ponownie za chwilę.",
  en: "Something went wrong. Try again in a moment.",
  uk: "Щось пішло не так. Спробуйте ще раз за хвилину.",
};

const CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "weak_password",
  "over_email_send_rate_limit",
  "validation_failed",
  "captcha_failed",
];

test("the Polish messages are the ones residents have always seen", () => {
  assert.equal(authErrorMessage("invalid_credentials", "pl"), "Nieprawidłowy e-mail lub hasło.");
  assert.equal(authErrorMessage("user_already_exists", "pl"), "Konto z tym adresem e-mail już istnieje. Zaloguj się.");
  assert.equal(
    authErrorMessage("weak_password", "pl"),
    "Hasło jest za słabe. Użyj co najmniej 10 znaków, w tym małej litery, wielkiej litery i cyfry.",
  );
});

for (const locale of LOCALES) {
  test(`${locale}: maps every known code to its own message`, () => {
    const messages = CODES.map((code) => authErrorMessage(code, locale));
    for (const [index, message] of messages.entries()) {
      assert.notEqual(message, GENERIC[locale], CODES[index]);
      assert.ok(message.length > 0, CODES[index]);
    }
    assert.equal(new Set(messages).size, CODES.length);
  });

  test(`${locale}: both duplicate-account codes share one message`, () => {
    assert.equal(authErrorMessage("email_exists", locale), authErrorMessage("user_already_exists", locale));
  });

  test(`${locale}: unknown and missing codes fall back to the generic message`, () => {
    assert.equal(authErrorMessage("something_new", locale), GENERIC[locale]);
    assert.equal(authErrorMessage("", locale), GENERIC[locale]);
    assert.equal(authErrorMessage(undefined, locale), GENERIC[locale]);
  });

  test(`${locale}: an inherited object key is not a known code`, () => {
    assert.equal(authErrorMessage("toString", locale), GENERIC[locale]);
  });
}

test("a known code reads differently in each language", () => {
  assert.equal(new Set(LOCALES.map((locale) => authErrorMessage("invalid_credentials", locale))).size, LOCALES.length);
  assert.equal(authErrorMessage("invalid_credentials", "en"), "Incorrect email or password.");
  assert.equal(authErrorMessage("invalid_credentials", "uk"), "Неправильна електронна адреса або пароль.");
});
