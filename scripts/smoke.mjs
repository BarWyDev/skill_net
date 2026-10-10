// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_READONLY=1 runs only the steps that create no accounts, for production.
// A step's expected location is a prefix match, unless the step sets `exact: true`.
// A step may set `bodyIncludes` / `bodyExcludes` to assert the response body does / does not contain a string,
// `cacheControlIncludes` to assert the Cache-Control header contains a string, and `header: [name, value]`
// to assert a response header equals a value.

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
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    headers: response.headers,
    body: await response.text(),
  };
}

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
  ["density map page renders", () => request("/mapa"), { status: 200, cacheControlIncludes: "private" }],
  [
    "density map serves banded cells",
    () => request("/api/mapa"),
    { status: 200, bodyExcludes: "user_id", cacheControlIncludes: "private" },
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
  [
    "confirm with bogus token redirects to link error",
    () => request("/auth/confirm?token_hash=smoke-not-a-token&type=email"),
    { status: 302, location: "/auth/link-wygasl" },
  ],
  [
    "throttle page answers 429",
    () => request("/auth/zbyt-wiele-prob"),
    { status: 429, bodyIncludes: "Zbyt wiele prób", header: ["retry-after", "60"] },
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
    { status: 302, location: "/auth/link-wygasl?error=" },
  ],
];

const writeSteps = [
  // Refused before GoTrue is called, so no account is created.
  [
    "signup rejects missing consent",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/signup?error=" },
  ],
  // Refused before GoTrue is called, so no account is created.
  [
    "signup rejects a weak password",
    () => request("/api/auth/signup", { method: "POST", form: { email, password: "123456", consent: "on" } }),
    { status: 302, location: "/auth/signup?error=" },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password, consent: "on" } }),
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
    { status: 302, location: "/zgoda?error=" },
  ],
  [
    "unregister ignores foreign return path",
    () =>
      request("/api/auth/unregister", {
        method: "POST",
        form: { password: "wrong", return_to: "https://example.com" },
      }),
    { status: 302, location: "/profil?error=" },
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
  // Five attempts per account per minute, then the throttle page; the account never exists.
  ...[1, 2, 3, 4, 5].map((n) => [
    `throttle allows sign-in attempt ${n}`,
    throttledSignin,
    { status: 302, location: "/auth/signin?error=" },
  ]),
  ["throttle stops the 6th attempt", throttledSignin, { status: 303, location: "/auth/zbyt-wiele-prob", exact: true }],
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
    (expected.cacheControlIncludes === undefined || actual.cacheControl.includes(expected.cacheControlIncludes)) &&
    (expected.header === undefined || actual.headers.get(expected.header[0]) === expected.header[1]);
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
    if (expected.header !== undefined)
      console.log(
        `      expected ${expected.header[0]}: ${expected.header[1]}, got "${actual.headers.get(expected.header[0])}"`,
      );
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
