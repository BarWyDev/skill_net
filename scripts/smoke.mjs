// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_READONLY=1 runs only the steps that create no accounts, for production.
// A step's expected location is a prefix match, unless the step sets `exact: true`.
// A step may set `bodyExcludes` to assert the response body does not contain a string.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const READONLY = process.env.SMOKE_READONLY === "1";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

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

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

const readonlySteps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["profil redirects anonymous user", () => request("/profil"), { status: 302, location: "/auth/signin" }],
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
];

const steps = READONLY ? readonlySteps : [...readonlySteps, ...writeSteps];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined ||
      (expected.exact ? actual.location === expected.location : actual.location.startsWith(expected.location))) &&
    (expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
