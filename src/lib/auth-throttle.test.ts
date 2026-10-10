// The auth form throttle (security audit F-09). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { type RateLimiter, accountKey, authThrottled } from "./auth-throttle.ts";

// A counting limiter like Cloudflare's: `limit` calls per key, then refusals.
function fakeLimiter(limit: number) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const limiter: RateLimiter = {
    limit: ({ key }) => {
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return Promise.resolve({ success: n <= limit });
    },
  };
  return { limiter, keys };
}

function post(path: string, form: Record<string, string>, ip: string | null = "203.0.113.7") {
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if (ip) headers.set("cf-connecting-ip", ip);
  return new Request(`https://skillnet.example${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(form).toString(),
  });
}

test("only POSTs to the auth endpoints are counted", async () => {
  const ip = fakeLimiter(0);
  const limiters = { ip: ip.limiter };
  assert.equal(
    await authThrottled(new Request("https://skillnet.example/api/auth/signin"), "/api/auth/signin", limiters),
    false,
  );
  assert.equal(await authThrottled(post("/api/profile", {}), "/api/profile", limiters), false);
  assert.equal(await authThrottled(post("/api/auth/signout", {}), "/api/auth/signout", limiters), false);
  assert.equal(ip.keys.length, 0);
});

test("the visitor's address is limited across every auth endpoint", async () => {
  const ip = fakeLimiter(2);
  const limiters = { ip: ip.limiter };
  assert.equal(await authThrottled(post("/api/auth/signin", {}), "/api/auth/signin", limiters), false);
  assert.equal(await authThrottled(post("/api/auth/resend", {}), "/api/auth/resend", limiters), false);
  assert.equal(await authThrottled(post("/api/auth/signup", {}), "/api/auth/signup", limiters), true);
  assert.deepEqual(new Set(ip.keys), new Set(["ip:203.0.113.7"]));
});

test("an account is limited per endpoint, whichever address the attempts come from", async () => {
  const account = fakeLimiter(2);
  const limiters = { ip: fakeLimiter(100).limiter, account: account.limiter };
  const form = { email: "Ofiara@Example.com", password: "x" };
  assert.equal(
    await authThrottled(post("/api/auth/signin", form, "198.51.100.1"), "/api/auth/signin", limiters),
    false,
  );
  assert.equal(
    await authThrottled(post("/api/auth/signin", form, "198.51.100.2"), "/api/auth/signin", limiters),
    false,
  );
  assert.equal(
    await authThrottled(
      post("/api/auth/signin", { ...form, email: " ofiara@example.com " }, "198.51.100.3"),
      "/api/auth/signin",
      limiters,
    ),
    true,
  );
  // Another endpoint has its own count.
  assert.equal(await authThrottled(post("/api/auth/resend", form), "/api/auth/resend", limiters), false);
});

test("the account key never holds the address", async () => {
  const key = await accountKey("/api/auth/signin", "ofiara@example.com");
  assert.match(key, /^\/api\/auth\/signin:[0-9a-f]{64}$/);
  assert.equal(key.includes("ofiara"), false);
  assert.equal(key, await accountKey("/api/auth/signin", "  OFIARA@example.com "));
});

test("the endpoint still reads the body after the throttle", async () => {
  const request = post("/api/auth/signin", { email: "a@example.com", password: "secret" });
  await authThrottled(request, "/api/auth/signin", { account: fakeLimiter(5).limiter });
  assert.equal((await request.formData()).get("password"), "secret");
});

test("requests that did not come through Cloudflare (no or a loopback address) are not limited", async () => {
  const ip = fakeLimiter(0);
  assert.equal(
    await authThrottled(post("/api/auth/signin", { email: "a@example.com" }, null), "/api/auth/signin", {
      ip: ip.limiter,
    }),
    false,
  );
  assert.equal(
    await authThrottled(post("/api/auth/signin", { email: "a@example.com" }, "127.0.0.1"), "/api/auth/signin", {
      ip: ip.limiter,
    }),
    false,
  );
  assert.equal(
    await authThrottled(post("/api/auth/signin", { email: "a@example.com" }, "::1"), "/api/auth/signin", {
      ip: ip.limiter,
    }),
    false,
  );
  assert.equal(ip.keys.length, 0);
});

test("a missing or failing binding never blocks (fail open)", async () => {
  const failing: RateLimiter = { limit: () => Promise.reject(new Error("binding down")) };
  assert.equal(
    await authThrottled(post("/api/auth/signin", { email: "a@example.com" }), "/api/auth/signin", {}),
    false,
  );
  assert.equal(
    await authThrottled(post("/api/auth/signin", { email: "a@example.com" }), "/api/auth/signin", {
      ip: failing,
      account: failing,
    }),
    false,
  );
});

test("a body that is not a form skips the account limit but keeps the address limit", async () => {
  const request = new Request("https://skillnet.example/api/auth/signin", {
    method: "POST",
    headers: { "cf-connecting-ip": "203.0.113.9", "Content-Type": "application/json" },
    body: "{}",
  });
  const account = fakeLimiter(0);
  assert.equal(
    await authThrottled(request, "/api/auth/signin", { ip: fakeLimiter(5).limiter, account: account.limiter }),
    false,
  );
  assert.equal(account.keys.length, 0);
});
