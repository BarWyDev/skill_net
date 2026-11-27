// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_READONLY=1 runs only the steps that create no accounts, for production.
// A step's expected location is a prefix match, unless the step sets `exact: true`.
// A step may set `bodyIncludes` / `bodyExcludes` to assert the response body does / does not contain a string,
// `cacheControlIncludes` to assert the Cache-Control header contains a string, and `header: [name, value]`
// to assert a response header equals a value.
// A step may set `flash: true` to assert the response leaves a one-shot error notice (src/lib/flash.ts)
// in the flash cookie, which is how endpoints report errors since security audit F-06.
// A step may set `sessionCookie: true` to assert the response sets the Supabase session cookie
// with HttpOnly, Secure, SameSite=Lax and at most 30 days of Max-Age (security audit S-01).
// A step may set `cookie: name` to assert the response sets a cookie of that name.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const READONLY = process.env.SMOKE_READONLY === "1";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();
// A valid activation body: the gates must refuse it before it reaches the RPC.
const CRISIS_FORM = { crisis_type: "awaria-pradu", location_source: "postcode", postcode: "31-001", radius_km: "5" };
// An unknown crisis: the gates must refuse the end request before it reaches the RPC.
const CRISIS_END_PATH = "/api/koordynator/kryzysy/00000000-0000-0000-0000-000000000000/zakoncz";
// The break-glass page: the gates must refuse both the reason form (GET) and the reveal (POST).
const REVEAL_PATH = "/koordynator/kryzys/00000000-0000-0000-0000-000000000000/kontakty";
const REVEAL_FORM = { reason: "Smoke test: brak potwierdzeń" };
// The auth throttle (src/lib/auth-throttle.ts) ignores loopback visitors, which is what local workerd
// reports, so the steps that exercise it claim a documentation address and a fresh email per run.
const THROTTLE_IP = `192.0.2.${Date.now() % 250}`;
const THROTTLE_EMAIL = `smoke-throttle-${Date.now()}@example.com`;
const throttledSignin = () =>
  request("/api/auth/signin", {
    method: "POST",
    form: { email: THROTTLE_EMAIL, password: "Wrong-Passw0rd" },
    headers: { "cf-connecting-ip": THROTTLE_IP },
  });
// The one-shot error notice cookie (src/lib/flash.ts).
const FLASH_COOKIE = "skillnet_flash";
// SESSION_MAX_AGE in src/lib/supabase.ts.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// True when the response sets at least one session cookie (`sb-*`) and every one it sets carries
// the S-01 flags. Deletions (Max-Age=0) are skipped.
function sessionCookieFlagsOk(setCookies) {
  const session = setCookies
    .map((raw) => raw.split(";").map((part) => part.trim()))
    .filter(([pair]) => pair.startsWith("sb-"))
    .filter((parts) => !parts.some((a) => /^max-age=0$/i.test(a)));
  return (
    session.length > 0 &&
    session.every((parts) => {
      const attrs = parts.slice(1).map((a) => a.toLowerCase());
      const maxAge = Number(attrs.find((a) => a.startsWith("max-age="))?.slice("max-age=".length));
      return (
        attrs.includes("httponly") &&
        attrs.includes("secure") &&
        attrs.includes("samesite=lax") &&
        maxAge > 0 &&
        maxAge <= SESSION_MAX_AGE
      );
    })
  );
}
const TEAMS_PATH = "/koordynator/kryzys/00000000-0000-0000-0000-000000000000/zespoly";

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

// `form` sends a urlencoded body, `json` a JSON body, and `rawBody` is sent as is with `contentType`.
async function request(path, { method = "GET", form, json, rawBody, contentType, headers: extra = {} } = {}) {
  let body;
  let type;
  if (form) {
    body = new URLSearchParams(form).toString();
    type = "application/x-www-form-urlencoded";
  } else if (json !== undefined) {
    body = JSON.stringify(json);
    type = "application/json";
  } else if (rawBody !== undefined) {
    body = rawBody;
    type = contentType;
  }
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(type ? { "Content-Type": type } : {}),
      ...extra,
    },
    body,
  });
  storeCookies(response);
  return {
    setCookieNames: response.headers.getSetCookie().map((raw) => raw.split("=")[0].trim()),
    setCookies: response.headers.getSetCookie(),
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    headers: response.headers,
    body: await response.text(),
  };
}

// The interface language (src/lib/i18n/locale.ts). These requests carry their own headers and never
// touch the shared jar: a language cookie there would turn every later Polish assertion English.
const LANG_COOKIE = "skillnet_lang";
async function langRequest(path, { acceptLanguage, cookie } = {}) {
  const response = await fetch(BASE_URL + path, {
    redirect: "manual",
    headers: {
      ...(acceptLanguage ? { "Accept-Language": acceptLanguage } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  return {
    setCookieNames: response.headers.getSetCookie().map((raw) => raw.split("=")[0].trim()),
    setCookies: response.headers.getSetCookie(),
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    headers: response.headers,
    body: await response.text(),
  };
}
// The `name=value` pair the `?lang=en` step received, for the step after it.
let languageCookie = "";

const readonlySteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["home forbids framing", () => request("/"), { status: 200, header: ["x-frame-options", "DENY"] }],
  [
    "sign-in page forbids framing",
    () => request("/auth/signin"),
    { status: 200, header: ["content-security-policy", "frame-ancestors 'none'"] },
  ],
  [
    "unknown path renders the Polish 404",
    () => request("/nieistnieje"),
    { status: 404, bodyIncludes: "Nie znaleziono strony" },
  ],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "sign-in page drops a return path that normalises to another site",
    () => request("/auth/signin?powrot=/.//evil.example/login"),
    { status: 200, bodyExcludes: "evil.example" },
  ],
  [
    "protected page remembers where the visitor was going",
    () => request("/profil"),
    { status: 302, location: "/auth/signin?powrot=%2Fprofil", exact: true },
  ],
  ["profil redirects anonymous user", () => request("/profil"), { status: 302, location: "/auth/signin" }],
  ["zgoda redirects anonymous user", () => request("/zgoda"), { status: 302, location: "/auth/signin" }],
  [
    "consent accept redirects anonymous user",
    () => request("/api/zgoda", { method: "POST", form: { consent: "on" } }),
    { status: 302, location: "/auth/signin" },
  ],
  ["koordynator redirects anonymous user", () => request("/koordynator"), { status: 302, location: "/auth/signin" }],
  [
    "koordynator crisis page redirects anonymous user",
    () => request("/koordynator/kryzys/00000000-0000-0000-0000-000000000000"),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "crisis activation redirects anonymous user",
    () => request("/api/koordynator/kryzysy", { method: "POST", form: CRISIS_FORM }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "crisis end redirects anonymous user",
    () => request(CRISIS_END_PATH, { method: "POST" }),
    { status: 302, location: "/auth/signin" },
  ],
  ["reveal form redirects anonymous user", () => request(REVEAL_PATH), { status: 302, location: "/auth/signin" }],
  [
    "reveal redirects anonymous user",
    () => request(REVEAL_PATH, { method: "POST", form: REVEAL_FORM }),
    { status: 302, location: "/auth/signin" },
  ],
  ["teams page redirects anonymous user", () => request(TEAMS_PATH), { status: 302, location: "/auth/signin" }],
  ["kursy redirects anonymous user", () => request("/kursy"), { status: 302, location: "/auth/signin" }],
  [
    "course sign-up redirects anonymous user",
    () => request("/api/kursy/zapisz", { method: "POST", form: { id: "00000000-0000-0000-0000-000000000000" } }),
    { status: 302, location: "/auth/signin" },
  ],
  // The lookup takes the postcode in a POST body, so it never appears in a request URL.
  [
    "postcode lookup finds known code",
    () => request("/api/kody-pocztowe", { method: "POST", json: { postcode: "31-001" } }),
    { status: 200, bodyIncludes: '"lat"' },
  ],
  [
    "postcode lookup rejects unknown code",
    () => request("/api/kody-pocztowe", { method: "POST", json: { postcode: "00-000" } }),
    { status: 404 },
  ],
  [
    "postcode lookup rejects malformed body",
    () => request("/api/kody-pocztowe", { method: "POST", rawBody: '{"postcode":', contentType: "application/json" }),
    { status: 400 },
  ],
  // The density map is public: banded cells only, never a count or an id. The page runs the auth
  // middleware, so it is never cached as `public`; the data endpoint skips it and is (F-03).
  ["density map page renders", () => request("/mapa"), { status: 200, cacheControlIncludes: "private" }],
  [
    "density map data is publicly cacheable",
    () => request("/api/mapa"),
    { status: 200, header: ["cache-control", "public, max-age=3600"] },
  ],
  [
    "density map serves banded cells",
    () => request("/api/mapa"),
    { status: 200, bodyExcludes: "user_id", cacheControlIncludes: "public" },
  ],
  ["density map hides counts", () => request("/api/mapa"), { status: 200, bodyExcludes: '"count"' }],
  ["density map filters by category", () => request("/api/mapa?kategoria=medyczne"), { status: 200 }],
  ["density map rejects unknown category", () => request("/api/mapa?kategoria=nie-ma"), { status: 400 }],
  ["privacy page renders", () => request("/prywatnosc"), { status: 200, cacheControlIncludes: "private" }],
  [
    "confirm without token redirects to link error",
    () => request("/auth/confirm"),
    { status: 302, location: "/auth/link-wygasl", cacheControlIncludes: "no-store" },
  ],
  // S-16: a link's GET only shows the button, so a mail scanner cannot spend the token.
  [
    "confirm link shows a button and spends nothing",
    () => request("/auth/confirm?token_hash=smoke-not-a-token&type=email"),
    { status: 200, bodyIncludes: 'method="POST"', cacheControlIncludes: "no-store" },
  ],
  [
    "confirm link of an unsupported type redirects to link error",
    () => request("/auth/confirm?token_hash=smoke-not-a-token&type=recovery"),
    { status: 302, location: "/auth/link-wygasl" },
  ],
  [
    "confirm button with bogus token redirects to link error",
    () => request("/auth/confirm", { method: "POST", form: { token_hash: "smoke-not-a-token", type: "email" } }),
    { status: 302, location: "/auth/link-wygasl", cacheControlIncludes: "no-store" },
  ],
  [
    "throttle page answers 429",
    () => request("/auth/zbyt-wiele-prob"),
    { status: 429, bodyIncludes: "Zbyt wiele prób", header: ["retry-after", "60"] },
  ],
  // F-06: a link cannot put its own text in the alert box.
  [
    "sign-in page ignores error text in the URL",
    () => request("/auth/signin?error=Konto%20zablokowane.%20Zadzwo%C5%84%20pod%20%2B48%20600%20000%20000"),
    { status: 200, bodyExcludes: "Konto zablokowane" },
  ],
  ["link error page renders", () => request("/auth/link-wygasl"), { status: 200, cacheControlIncludes: "no-store" }],
  // An unregistered address gets the same answer as a registered one, and no email is sent.
  [
    "resend answers neutrally",
    () => request("/api/auth/resend", { method: "POST", form: { email: `smoke-nobody-${Date.now()}@example.com` } }),
    { status: 302, location: "/auth/confirm-email?ponownie=1", exact: true },
  ],
  [
    "resend rejects malformed email",
    () => request("/api/auth/resend", { method: "POST", form: { email: "not-an-email" } }),
    { status: 302, location: "/auth/link-wygasl", flash: true },
  ],
  // A `?lang=` link is always stripped with a redirect, whether or not the environment offers the
  // language, so this holds on production too (Polish only).
  [
    "lang link is stripped with a redirect",
    () => langRequest("/?lang=en"),
    { status: 303, location: `${BASE_URL}/`, exact: true },
  ],
];

// The language rules, on an environment that offers all three (ENABLED_LOCALES=pl,en,uk: local,
// CI, previews, staging). Skipped with SMOKE_READONLY=1, because production offers Polish only.
const languageSteps = [
  // Node's fetch sends `Accept-Language: *`, which names no language.
  ["no language preference reads in Polish", () => langRequest("/"), { status: 200, bodyIncludes: '<html lang="pl"' }],
  [
    "a Ukrainian browser reads in Ukrainian",
    () => langRequest("/", { acceptLanguage: "uk" }),
    { status: 200, bodyIncludes: '<html lang="uk"' },
  ],
  [
    "a browser in an unsupported language reads in English",
    () => langRequest("/", { acceptLanguage: "de" }),
    { status: 200, bodyIncludes: '<html lang="en"' },
  ],
  [
    "lang link sets the language cookie",
    async () => {
      const response = await langRequest("/mapa?lang=en");
      languageCookie = response.setCookies.find((raw) => raw.startsWith(`${LANG_COOKIE}=`))?.split(";")[0] ?? "";
      return response;
    },
    { status: 303, location: `${BASE_URL}/mapa`, exact: true, cookie: LANG_COOKIE },
  ],
  [
    "the language cookie holds on the next request",
    () => langRequest("/mapa", { cookie: languageCookie }),
    { status: 200, bodyIncludes: '<html lang="en"' },
  ],
  // /api/mapa is cached as `public`, so it must not vary by language.
  [
    "density map is the same in every language",
    async () => {
      const plain = await langRequest("/api/mapa");
      const english = await langRequest("/api/mapa", { cookie: `${LANG_COOKIE}=en`, acceptLanguage: "uk" });
      return { ...english, body: plain.body === english.body ? "same body" : "different body" };
    },
    { status: 200, bodyIncludes: "same body", cacheControlIncludes: "public" },
  ],
];

const writeSteps = [
  // Refused before GoTrue is called, so no account is created.
  [
    "signup rejects missing consent",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/signup", flash: true },
  ],
  // Refused before GoTrue is called, so no account is created.
  [
    "signup rejects a weak password",
    () => request("/api/auth/signup", { method: "POST", form: { email, password: "123456", consent: "on" } }),
    { status: 302, location: "/auth/signup", flash: true },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password, consent: "on" } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin", flash: true },
  ],
  [
    "sign-in page shows the flashed error",
    () => request("/auth/signin"),
    { status: 200, bodyIncludes: "Nieprawidłowy e-mail lub hasło." },
  ],
  [
    "the flashed error shows only once",
    () => request("/auth/signin"),
    { status: 200, bodyExcludes: "Nieprawidłowy e-mail lub hasło." },
  ],
  [
    "signin redirects new user to profil",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/profil", exact: true, sessionCookie: true },
  ],
  ["profil renders for signed-in user", () => request("/profil"), { status: 200 }],
  // A signed-in visitor's session never reaches the publicly cached map data (lessons.md).
  [
    "density map data sets no cookie when signed in",
    () => request("/api/mapa"),
    { status: 200, header: ["set-cookie", null] },
  ],
  // The account consented at sign-up, so the gate lets it through and /zgoda has nothing to ask.
  ["zgoda sends consented user home", () => request("/zgoda"), { status: 302, location: "/", exact: true }],
  [
    "consent accept skips consented user",
    () => request("/api/zgoda", { method: "POST", form: { consent: "on" } }),
    { status: 302, location: "/", exact: true },
  ],
  [
    "unregister error returns to zgoda",
    () => request("/api/auth/unregister", { method: "POST", form: { password: "wrong", return_to: "/zgoda" } }),
    { status: 302, location: "/zgoda", flash: true },
  ],
  [
    "unregister ignores foreign return path",
    () =>
      request("/api/auth/unregister", {
        method: "POST",
        form: { password: "wrong", return_to: "https://example.com" },
      }),
    { status: 302, location: "/profil", flash: true },
  ],
  // A fresh account is a resident. The positive coordinator path needs a grant, so pgTAP covers it.
  [
    "koordynator denies resident",
    () => request("/koordynator"),
    { status: 403, bodyIncludes: "Brak dostępu", cacheControlIncludes: "no-store" },
  ],
  [
    "crisis activation denies resident",
    () => request("/api/koordynator/kryzysy", { method: "POST", form: CRISIS_FORM }),
    { status: 403, cacheControlIncludes: "no-store" },
  ],
  [
    "crisis end denies resident",
    () => request(CRISIS_END_PATH, { method: "POST" }),
    { status: 403, cacheControlIncludes: "no-store" },
  ],
  [
    "crisis page denies resident",
    () => request("/koordynator/kryzys/00000000-0000-0000-0000-000000000000"),
    { status: 403, bodyIncludes: "Brak dostępu", cacheControlIncludes: "no-store" },
  ],
  [
    "reveal form denies resident",
    () => request(REVEAL_PATH),
    { status: 403, bodyIncludes: "Brak dostępu", cacheControlIncludes: "no-store" },
  ],
  [
    "reveal denies resident",
    () => request(REVEAL_PATH, { method: "POST", form: REVEAL_FORM }),
    { status: 403, bodyIncludes: "Brak dostępu", cacheControlIncludes: "no-store" },
  ],
  [
    "teams page denies resident",
    () => request(`${TEAMS_PATH}?szablon=ewakuacyjny&liczba=3`),
    { status: 403, bodyIncludes: "Brak dostępu", cacheControlIncludes: "no-store" },
  ],
  // Security audit 2026-11-23: a signed-in browser never spends a link's token, so a link sent by
  // someone else cannot swap the session for another account.
  [
    "confirm link asks a signed-in user to sign out first",
    () => request("/auth/confirm?token_hash=smoke-not-a-token&type=magiclink"),
    { status: 200, bodyIncludes: 'action="/api/auth/signout"', bodyExcludes: 'action="/auth/confirm"' },
  ],
  [
    "confirm button spends nothing for a signed-in user",
    () => request("/auth/confirm", { method: "POST", form: { token_hash: "smoke-not-a-token", type: "magiclink" } }),
    { status: 200, bodyIncludes: 'action="/api/auth/signout"', cacheControlIncludes: "no-store" },
  ],
  [
    "profil hides koordynator link from resident",
    () => request("/profil"),
    { status: 200, bodyExcludes: 'href="/koordynator"' },
  ],
  [
    "profile save rejects bad level",
    () =>
      request("/api/profile", {
        method: "POST",
        form: [
          ["location_source", "pin"],
          ["lat", "52.2297"],
          ["lng", "21.0122"],
          ["skill", "elektryk:5"],
        ],
      }),
    { status: 302, location: "/profil", flash: true },
  ],
  [
    "profile save accepts pin and skill",
    () =>
      request("/api/profile", {
        method: "POST",
        form: [
          ["location_source", "pin"],
          ["lat", "52.2297"],
          ["lng", "21.0122"],
          ["skill", "elektryk:2"],
        ],
      }),
    { status: 302, location: "/profil?zapisano=1", exact: true },
  ],
  [
    "profile save rejects landline",
    () =>
      request("/api/profile", {
        method: "POST",
        form: [
          ["location_source", "pin"],
          ["lat", "52.2297"],
          ["lng", "21.0122"],
          ["skill", "elektryk:2"],
          ["phone", "12 345 67 89"],
        ],
      }),
    { status: 302, location: "/profil", flash: true },
  ],
  [
    "profile save accepts phone and availability",
    () =>
      request("/api/profile", {
        method: "POST",
        form: [
          ["location_source", "pin"],
          ["lat", "52.2297"],
          ["lng", "21.0122"],
          ["skill", "elektryk:2"],
          ["phone", "600 000 000"],
          ["availability", "16"],
          ["availability", "20"],
        ],
      }),
    { status: 302, location: "/profil?zapisano=1", exact: true },
  ],
  // The number is shown back only to its owner, on a no-store page.
  ["profil shows own phone", () => request("/profil"), { status: 200, bodyIncludes: "+48600000000" }],
  [
    "profile save clears phone",
    () =>
      request("/api/profile", {
        method: "POST",
        form: [
          ["location_source", "pin"],
          ["lat", "52.2297"],
          ["lng", "21.0122"],
          ["skill", "elektryk:2"],
          ["phone", ""],
        ],
      }),
    { status: 302, location: "/profil?zapisano=1", exact: true },
  ],
  ["profil no longer shows phone", () => request("/profil"), { status: 200, bodyExcludes: "+48600000000" }],
  [
    "profile save accepts postcode",
    () =>
      request("/api/profile", {
        method: "POST",
        form: [
          ["location_source", "postcode"],
          ["postcode", "31-001"],
          ["skill", "elektryk:2"],
        ],
      }),
    { status: 302, location: "/profil?zapisano=1", exact: true },
  ],
  // The postcode is never stored, so the page (including serialised island props) cannot echo it.
  ["profil does not echo the postcode", () => request("/profil"), { status: 200, bodyExcludes: "31-001" }],
  [
    "profile re-save keeps postcode location",
    () =>
      request("/api/profile", {
        method: "POST",
        form: [
          ["location_source", "postcode"],
          ["postcode", ""],
          ["skill", "elektryk:3"],
        ],
      }),
    { status: 302, location: "/profil?zapisano=1", exact: true },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "signin redirects complete user home",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/", exact: true },
  ],
  [
    "signin returns to the requested page",
    () => request("/api/auth/signin", { method: "POST", form: { email, password, powrot: "/mapa" } }),
    { status: 302, location: "/mapa", exact: true },
  ],
  [
    "signin ignores a return path to another site",
    () => request("/api/auth/signin", { method: "POST", form: { email, password, powrot: "//evil.example/" } }),
    { status: 302, location: "/", exact: true },
  ],
  [
    "signin ignores a dot-segment return path to another site",
    () => request("/api/auth/signin", { method: "POST", form: { email, password, powrot: "/.//evil.example/" } }),
    { status: 302, location: "/", exact: true },
  ],
  [
    "dashboard sends signed-in user to profile",
    () => request("/dashboard"),
    { status: 302, location: "/profil", exact: true },
  ],
  ["profile renders for signed-in user", () => request("/profil"), { status: 200 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  // Unregistering last also removes the account this run created.
  [
    "signin before unregister",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/", exact: true },
  ],
  [
    "unregister rejects wrong password",
    () => request("/api/auth/unregister", { method: "POST", form: { password: "wrong" } }),
    { status: 302, location: "/profil", flash: true },
  ],
  [
    "unregister erases account",
    () => request("/api/auth/unregister", { method: "POST", form: { password } }),
    { status: 302, location: "/?konto-usuniete=1", exact: true },
  ],
  ["profil redirects after unregister", () => request("/profil"), { status: 302, location: "/auth/signin" }],
  [
    "signin rejects erased account",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/signin", flash: true },
  ],
  // Five attempts per account per minute, then the throttle page; the account never exists.
  ...[1, 2, 3, 4, 5].map((n) => [
    `throttle allows sign-in attempt ${n}`,
    throttledSignin,
    { status: 302, location: "/auth/signin", flash: true },
  ]),
  ["throttle stops the 6th attempt", throttledSignin, { status: 303, location: "/auth/zbyt-wiele-prob", exact: true }],
];

// HTTPS only (security audit F-10). Local servers have no TLS and stay on plain HTTP, so these run
// only against an HTTPS BASE_URL, i.e. production: right after a deploy, with SMOKE_READONLY=1.
const httpsSteps = BASE_URL.startsWith("https://")
  ? [
      [
        "https responses carry HSTS",
        () => request("/"),
        { status: 200, header: ["strict-transport-security", "max-age=63072000; includeSubDomains"] },
      ],
      [
        "plain http redirects to https",
        async () => {
          const response = await fetch(`${BASE_URL.replace(/^https:/, "http:")}/mapa?x=1`, { redirect: "manual" });
          return {
            status: response.status,
            location: response.headers.get("location") ?? "",
            cacheControl: "",
            headers: response.headers,
            body: await response.text(),
          };
        },
        { status: 308, location: `${BASE_URL}/mapa?x=1`, exact: true },
      ],
      // A path starting with `//` must not turn the `?lang=` redirect into one to another host
      // (security audit F-01 class). Deployed hosts only: a local server reads `//example.com/` as
      // the request's host, so there the plain-HTTP redirect above answers before the language code.
      [
        "lang link on a // path stays on this origin",
        () => langRequest("//example.com/?lang=en"),
        // A prefix match: the trailing slash ends the host, so a look-alike host cannot pass.
        { status: 303, location: `${BASE_URL}/` },
      ],
    ]
  : [];

// One production address (src/lib/canonical-host.ts). Only against production on its own domain:
// the old workers.dev host and www must send every request there, keeping the path and query.
const CANONICAL_ORIGIN = "https://skillnet.org.pl";
const redirectFrom = (origin) => async () => {
  const response = await fetch(`${origin}/mapa?x=1`, { redirect: "manual" });
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: "",
    headers: response.headers,
    body: await response.text(),
  };
};
const canonicalSteps =
  BASE_URL === CANONICAL_ORIGIN
    ? [
        [
          "old workers.dev host redirects to the apex",
          redirectFrom("https://skillnet.barwy.workers.dev"),
          { status: 301, location: `${CANONICAL_ORIGIN}/mapa?x=1`, exact: true },
        ],
        [
          "www redirects to the apex",
          redirectFrom("https://www.skillnet.org.pl"),
          { status: 301, location: `${CANONICAL_ORIGIN}/mapa?x=1`, exact: true },
        ],
      ]
    : [];

const steps = READONLY
  ? [...readonlySteps, ...httpsSteps, ...canonicalSteps]
  : [...readonlySteps, ...httpsSteps, ...canonicalSteps, ...languageSteps, ...writeSteps];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined ||
      (expected.exact ? actual.location === expected.location : actual.location.startsWith(expected.location))) &&
    (expected.bodyIncludes === undefined || actual.body.includes(expected.bodyIncludes)) &&
    (expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes)) &&
    (expected.cacheControlIncludes === undefined || actual.cacheControl.includes(expected.cacheControlIncludes)) &&
    (expected.header === undefined || actual.headers.get(expected.header[0]) === expected.header[1]) &&
    (expected.flash === undefined || actual.setCookieNames.includes(FLASH_COOKIE) === expected.flash) &&
    (expected.cookie === undefined || actual.setCookieNames.includes(expected.cookie)) &&
    (expected.sessionCookie === undefined || sessionCookieFlagsOk(actual.setCookies) === expected.sessionCookie);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
    if (expected.bodyIncludes !== undefined) console.log(`      expected body to include ${expected.bodyIncludes}`);
    if (expected.bodyExcludes !== undefined) console.log(`      expected body to exclude ${expected.bodyExcludes}`);
    if (expected.cacheControlIncludes !== undefined)
      console.log(
        `      expected Cache-Control to include ${expected.cacheControlIncludes}, got "${actual.cacheControl}"`,
      );
    if (expected.flash !== undefined) console.log(`      expected a ${FLASH_COOKIE} cookie: ${expected.flash}`);
    if (expected.cookie !== undefined) console.log(`      expected a ${expected.cookie} cookie`);
    if (expected.sessionCookie !== undefined)
      // Names and attributes only: the values are session tokens.
      console.log(
        `      expected session cookie flags (S-01), got ${JSON.stringify(
          actual.setCookies.map((raw) => raw.replace(/=[^;]*/, "=…")),
        )}`,
      );
    if (expected.header !== undefined)
      console.log(
        `      expected ${expected.header[0]}: ${expected.header[1]}, got "${actual.headers.get(expected.header[0])}"`,
      );
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
