// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_READONLY=1 runs only the steps that create no accounts, for production.
// A step's expected location is a prefix match, unless the step sets `exact: true`.
// A step may set `bodyIncludes` / `bodyExcludes` to assert the response body does / does not contain a string,
// and `cacheControlIncludes` to assert the Cache-Control header contains a string.

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
async function request(path, { method = "GET", form, json, rawBody, contentType } = {}) {
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
    },
    body,
  });
  storeCookies(response);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    body: await response.text(),
  };
}

const readonlySteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["profil redirects anonymous user", () => request("/profil"), { status: 302, location: "/auth/signin" }],
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
  // The density map is public: banded cells only, never a count or an id, and never cached as `public`.
  [
    "density map serves banded cells",
    () => request("/api/mapa"),
    { status: 200, bodyExcludes: "user_id", cacheControlIncludes: "private" },
  ],
  ["density map hides counts", () => request("/api/mapa"), { status: 200, bodyExcludes: '"count"' }],
  ["density map filters by category", () => request("/api/mapa?kategoria=medyczne"), { status: 200 }],
  ["density map rejects unknown category", () => request("/api/mapa?kategoria=nie-ma"), { status: 400 }],
];

const writeSteps = [
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin redirects new user to profil",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/profil", exact: true },
  ],
  ["profil renders for signed-in user", () => request("/profil"), { status: 200 }],
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
    { status: 302, location: "/profil?error=" },
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
    { status: 302, location: "/profil?error=" },
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
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
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
    { status: 302, location: "/profil?error=" },
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
    { status: 302, location: "/auth/signin?error=" },
  ],
];

const steps = READONLY ? readonlySteps : [...readonlySteps, ...writeSteps];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined ||
      (expected.exact ? actual.location === expected.location : actual.location.startsWith(expected.location))) &&
    (expected.bodyIncludes === undefined || actual.body.includes(expected.bodyIncludes)) &&
    (expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes)) &&
    (expected.cacheControlIncludes === undefined || actual.cacheControl.includes(expected.cacheControlIncludes));
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
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
