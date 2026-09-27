// Builds the postcode centroid migration from national address points.
// Zero dependencies on purpose. The raw inputs are several GB of address data; keep them
// outside the repo (they are never committed). Only the generated migration is.
//
//   node scripts/build-postcode-centroids.mjs --out supabase/migrations/<ts>_seed_postcode_centroids.sql <inputs...>
//
// Inputs are CSV files, `.csv.zip` files (read through `unzip -p`, one CSV per zip) or `-` for stdin.
// Each postcode's centroid is the mean of its address points, computed in the source CRS.
//
// Sources (both are GUGiK PRG address points, open data):
//   * OpenAddresses per-voivodeship CSVs (the defaults below: X, Y, kodPocztowy in EPSG:2180).
//     URLs are in https://github.com/openaddresses/openaddresses/tree/master/sources/pl
//   * The official PRG file https://opendata.geoportal.gov.pl/prg/adresy/PRG-punkty_adresowe.zip.
//     If it is GML, convert it first:
//       ogr2ogr -f CSV out.csv in.gml -t_srs EPSG:4326 -lco GEOMETRY=AS_XY
//     and run with --srs 4326 --lon X --lat Y --postcode kodPocztowy.
//
// Options:
//   --out PATH         migration file to write (required)
//   --lon NAME         easting / longitude column (default X)
//   --lat NAME         northing / latitude column (default Y)
//   --postcode NAME    postcode column (default kodPocztowy)
//   --srs 2180|4326    CRS of the coordinate columns (default 2180). EPSG:2180 centroids are
//                      transformed to 4326 by PostGIS when the migration is applied.
//   --delimiter CHAR   field delimiter (default ,)
//
// Prints only aggregate counts and the bounding box, never individual addresses.

import { spawn } from "node:child_process";
import { createReadStream, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

// Generous bounds for Poland; rows outside them are treated as invalid coordinates.
const BOUNDS = {
  2180: { minX: 100_000, maxX: 900_000, minY: 100_000, maxY: 820_000 },
  4326: { minX: 13.5, maxX: 24.5, minY: 48.5, maxY: 55.5 },
};
const BATCH_SIZE = 1000;
// PRG uses 00-000 as a placeholder for "no postcode"; it is not a real postcode.
const PLACEHOLDER_POSTCODES = new Set(["00-000"]);

const { values: opts, positionals: inputs } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    lon: { type: "string", default: "X" },
    lat: { type: "string", default: "Y" },
    postcode: { type: "string", default: "kodPocztowy" },
    srs: { type: "string", default: "2180" },
    delimiter: { type: "string", default: "," },
  },
});

if (!opts.out || inputs.length === 0 || !(opts.srs in BOUNDS)) {
  console.error(
    "Usage: build-postcode-centroids.mjs --out <migration.sql> [--srs 2180|4326] [--lon X --lat Y --postcode kodPocztowy] <csv|zip|->...",
  );
  process.exit(1);
}

const bounds = BOUNDS[opts.srs];

// Splits one CSV line, honouring double quotes and "" escapes.
function splitCsvLine(line, delimiter) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

function normalisePostcode(raw) {
  const match = /^(\d{2})-?(\d{3})$/.exec(raw.trim());
  if (!match) return null;
  const postcode = `${match[1]}-${match[2]}`;
  return PLACEHOLDER_POSTCODES.has(postcode) ? null : postcode;
}

function openInput(path) {
  if (path === "-") return process.stdin;
  if (path.endsWith(".zip")) {
    const unzip = spawn("unzip", ["-p", path], { stdio: ["ignore", "pipe", "inherit"] });
    unzip.on("exit", (code) => {
      if (code !== 0) {
        console.error(`unzip failed for ${basename(path)} (exit ${code})`);
        process.exit(1);
      }
    });
    return unzip.stdout;
  }
  return createReadStream(path);
}

const sums = new Map();
let rowsRead = 0;
let rowsSkipped = 0;

for (const path of inputs) {
  const lines = createInterface({ input: openInput(path), crlfDelay: Infinity });
  let columns = null;
  for await (const line of lines) {
    if (columns === null) {
      const header = splitCsvLine(line.replace(/^\uFEFF/, ""), opts.delimiter);
      columns = [opts.lon, opts.lat, opts.postcode].map((name) => header.indexOf(name));
      if (columns.includes(-1)) {
        console.error(`${basename(path)}: missing column(s); header has ${header.join(", ")}`);
        process.exit(1);
      }
      continue;
    }
    if (line === "") continue;
    rowsRead++;
    const fields = splitCsvLine(line, opts.delimiter);
    const x = Number(fields[columns[0]]);
    const y = Number(fields[columns[1]]);
    const postcode = normalisePostcode(fields[columns[2]] ?? "");
    if (
      postcode === null ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < bounds.minX ||
      x > bounds.maxX ||
      y < bounds.minY ||
      y > bounds.maxY
    ) {
      rowsSkipped++;
      continue;
    }
    const sum = sums.get(postcode);
    if (sum) {
      sum.x += x;
      sum.y += y;
      sum.n++;
    } else sums.set(postcode, { x, y, n: 1 });
  }
}

const decimals = opts.srs === "2180" ? 1 : 7;
const pointSql =
  opts.srs === "2180"
    ? "extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(v.x, v.y), 2180), 4326)::extensions.geography"
    : "extensions.st_setsrid(extensions.st_makepoint(v.x, v.y), 4326)::extensions.geography";

const rows = [...sums.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([postcode, { x, y, n }]) => ({
    postcode,
    x: (x / n).toFixed(decimals),
    y: (y / n).toFixed(decimals),
    n,
  }));

const box = rows.reduce(
  (b, r) => ({
    minX: Math.min(b.minX, Number(r.x)),
    maxX: Math.max(b.maxX, Number(r.x)),
    minY: Math.min(b.minY, Number(r.y)),
    maxY: Math.max(b.maxY, Number(r.y)),
  }),
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
);

const statements = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const values = rows
    .slice(i, i + BATCH_SIZE)
    .map((r) => `  ('${r.postcode}', ${r.x}, ${r.y}, ${r.n})`)
    .join(",\n");
  statements.push(
    `insert into public.postcodes (postcode, centroid, address_count)\n` +
      `select v.postcode, ${pointSql}, v.n\nfrom (values\n${values}\n) as v (postcode, x, y, n)\n` +
      `on conflict (postcode) do update set centroid = excluded.centroid, address_count = excluded.address_count;`,
  );
}

const header = [
  "-- Postcode centroids for all of Poland: the mean of each postcode's PRG address points.",
  "-- Reference data, not personal data. Generated by scripts/build-postcode-centroids.mjs; do not edit.",
  `-- Inputs (EPSG:${opts.srs}): ${inputs.map((p) => basename(p)).join(", ")}`,
  `-- ${rows.length} postcodes from ${rowsRead - rowsSkipped} address points.`,
  '-- Source: GUGiK PRG address points (open data). See README.md, "Dane kodów pocztowych".',
  "",
].join("\n");

writeFileSync(opts.out, `${header}\n${statements.join("\n\n")}\n`);

console.log(`postcodes: ${rows.length}`);
console.log(`rows read: ${rowsRead}, skipped: ${rowsSkipped}`);
console.log(`bbox (EPSG:${opts.srs}): x ${box.minX}..${box.maxX}, y ${box.minY}..${box.maxY}`);
console.log(`wrote ${opts.out}`);
