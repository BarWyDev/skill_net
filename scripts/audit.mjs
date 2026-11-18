// Fails on high and critical advisories in the dependencies the Worker ships (`npm audit --omit=dev`),
// except the ones listed in ALLOWED. Zero dependencies; reads only the lockfile, so no `npm ci` first.
//
//   npm run audit
//
// An entry in ALLOWED is for an advisory with no patched release to upgrade to. The run also fails when
// an entry no longer matches anything, so a stale exception gets removed instead of lingering.

import { spawnSync } from "node:child_process";

const ALLOWED = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    // ReDoS in picomatch, reached through astro, vite and tinyglobby. It covers every release up to the
    // latest (4.0.7), so there is nothing to upgrade to. Accepted by the owner on the date below; whether
    // any glob can come from request input was not analysed. Remove this entry once a patched picomatch
    // is installed.
    added: "2026-11-18",
  },
];

const FAILING = new Set(["high", "critical"]);

function fail(message) {
  console.error(`audit: ${message}`);
  process.exit(1);
}

// `npm audit` exits non-zero whenever it finds anything, so the exit code says nothing here.
const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (result.error) fail(`could not run npm audit: ${result.error.message}`);

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  fail(`npm audit did not print JSON:\n${result.stderr || result.stdout}`);
}
if (report.error || !report.vulnerabilities) {
  fail(`npm audit failed: ${report.error?.summary ?? report.message ?? "no vulnerabilities field in the report"}`);
}

// Each package lists what it is vulnerable `via`: advisory objects, or names of other packages that
// carry one. Only the objects are advisories; the same one shows up under several packages.
const advisories = new Map();
for (const entry of Object.values(report.vulnerabilities)) {
  for (const via of entry.via) {
    if (typeof via === "string") continue;
    const id = via.url.split("/").pop();
    advisories.set(id, {
      id,
      severity: via.severity,
      name: via.name,
      range: via.range,
      title: via.title,
      url: via.url,
    });
  }
}

const allowedIds = new Set(ALLOWED.map((entry) => entry.id));
const blocking = [...advisories.values()].filter((a) => FAILING.has(a.severity) && !allowedIds.has(a.id));
const allowedSeen = [...advisories.values()].filter((a) => allowedIds.has(a.id));
const stale = ALLOWED.filter((entry) => !advisories.has(entry.id));

for (const a of allowedSeen) {
  console.log(`audit: allowed ${a.id} (${a.name} ${a.range}, ${a.severity}): ${a.title}`);
}

if (blocking.length > 0) {
  for (const a of blocking) {
    console.error(`audit: ${a.severity} ${a.id} in ${a.name} ${a.range}: ${a.title}\n       ${a.url}`);
  }
  fail(`${blocking.length} high or critical advisory(ies). Try \`npm audit fix\`.`);
}

if (stale.length > 0) {
  fail(`no longer reported, remove from ALLOWED in scripts/audit.mjs: ${stale.map((entry) => entry.id).join(", ")}`);
}

console.log("audit: no high or critical advisories outside the allowlist");
