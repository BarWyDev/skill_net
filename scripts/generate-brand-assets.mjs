// Brand assets: favicons, the Open Graph share image and the README images. Rebuild after a redesign.
//
//   node scripts/generate-brand-assets.mjs                 # icons, og-image.png, docs/images/banner.png
//   node scripts/generate-brand-assets.mjs --screenshots   # also docs/images/{landing,map,signin}.png
//
// The mark is drawn by hand in public/favicon.svg; everything else is exported from it or from the HTML
// templates below. Rasterising uses sharp (already installed with Astro) and a local Chrome in headless
// mode (set CHROME_PATH if it is not in the default place), so the script adds no dependencies.
// --screenshots needs a running server at BASE_URL (default http://localhost:4322, `npm run preview`).
// Use the production build rather than `npm run dev`, which overlays the Astro dev toolbar.

import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const DOCS_IMAGES = join(ROOT, "docs", "images");

// The site palette from src/styles/global.css.
const GRAPHITE = "#1e2024";
const CHALK = "#ece9e2";
const ASH = "#a3a6ad";
const SEAM = "#3a3d44";
const SIGNAL = "#f2c230";

// The line break follows the landing headline: "Lokalny katalog umiejętności / na czas kryzysu".
const TAGLINE = "Lokalny katalog umiejętności<br>na czas kryzysu.";
const SITE_HOST = "skillnet.barwy.workers.dev";

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH to a Chrome or Chromium binary.");
  return found;
}

function screenshot(url, width, height, out, waitMs = 2000) {
  execFileSync(
    findChrome(),
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--virtual-time-budget=${waitMs}`,
      `--screenshot=${out}`,
      url,
    ],
    { stdio: "ignore" },
  );
}

// Flat colours only, so a palette PNG stays small without visible banding.
async function writePng(input, out, { palette = true, quality = 95 } = {}) {
  await sharp(input).png({ palette, quality, effort: 10, compressionLevel: 9 }).toFile(out);
  return out;
}

// An ICO with PNG entries (supported by every browser since IE Vista-era).
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function icons() {
  const svg = readFileSync(join(PUBLIC, "favicon.svg"));
  const render = (size) =>
    sharp(svg, { density: (72 * size) / 16 })
      .resize(size, size)
      .png()
      .toBuffer();

  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(icoSizes.map(async (size) => ({ size, data: await render(size) })));
  writeFileSync(join(PUBLIC, "favicon.ico"), buildIco(icoPngs));
  await writePng(await render(96), join(PUBLIC, "favicon.png"), { palette: false });

  // iOS masks the icon itself, so the touch icon is full-bleed graphite with the grid inset.
  const inner = svg
    .toString()
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  const touch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 24 24">
    <rect x="-4" y="-4" width="24" height="24" fill="${GRAPHITE}"/>${inner}</svg>`;
  const touchPng = await sharp(Buffer.from(touch), { density: (72 * 180) / 24 })
    .resize(180, 180)
    .flatten({ background: GRAPHITE })
    .removeAlpha()
    .png()
    .toBuffer();
  await writePng(touchPng, join(PUBLIC, "apple-touch-icon.png"), { palette: false });
}

// @font-face rules from @fontsource, with the font files inlined so headless Chrome needs no file access.
function fontCss(pkg, weight) {
  const dir = join(ROOT, "node_modules", "@fontsource", pkg);
  return readFileSync(join(dir, `${weight}.css`), "utf8").replace(
    /url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)(, url\([^)]+\) format\('woff'\))?/g,
    (_, file) =>
      `url(data:font/woff2;base64,${readFileSync(join(dir, "files", file)).toString("base64")}) format('woff2')`,
  );
}

// The density grid from the map: outlined 2 km squares at the map's fill levels, one at full signal.
function gridSvg(cols, rows, cell, gap) {
  const levels = [
    [0, 0, 0.22, 0, 0],
    [0, 0.22, 0.5, 0.22, 0],
    [0.22, 0.5, 1, 0.5, 0.22],
    [0, 0.22, 0.85, 0.22, 0],
    [0, 0, 0.22, 0, 0],
  ];
  const step = cell + gap;
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fill = levels[r % levels.length][c % levels[0].length];
      const x = c * step;
      const y = r * step;
      rects.push(
        fill === 0
          ? `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" fill="none" stroke="${SEAM}" stroke-width="2"/>`
          : `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" fill="${SIGNAL}" fill-opacity="${fill}" stroke="${SIGNAL}" stroke-opacity="0.9" stroke-width="2"/>`,
      );
    }
  }
  const size = (n) => n * step - gap;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size(cols)}" height="${size(rows)}">${rects.join("")}</svg>`;
}

// One template for the share image and the README banner. Text stays inside an 80 px safe margin.
function cardHtml(width, height) {
  const cell = Math.round(height * 0.122);
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>
    ${fontCss("big-shoulders-display", 800)}
    ${fontCss("atkinson-hyperlegible-next", 400)}
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: ${GRAPHITE}; }
    body { position: relative; color: ${CHALK}; font-family: "Atkinson Hyperlegible Next", sans-serif; }
    .text { position: absolute; left: 88px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; width: ${Math.round(width * 0.52)}px; }
    h1 { margin: 0; font-family: "Big Shoulders Display", sans-serif; font-weight: 800; font-size: ${Math.round(height * 0.3)}px; line-height: 0.85; letter-spacing: 0.005em; }
    p { margin: ${Math.round(height * 0.05)}px 0 0; font-size: ${Math.round(height * 0.064)}px; line-height: 1.3; max-width: 15em; }
    .host { position: absolute; left: 88px; bottom: 72px; font-size: ${Math.round(height * 0.036)}px; color: ${ASH}; display: flex; align-items: center; gap: 14px; }
    .host i { width: 14px; height: 14px; background: ${SIGNAL}; display: block; }
    .grid { position: absolute; right: 88px; top: 50%; transform: translateY(-50%); }
  </style></head><body>
    <div class="text"><h1>SkillNet</h1><p>${TAGLINE}</p></div>
    <div class="host"><i></i>${SITE_HOST}</div>
    <div class="grid">${gridSvg(5, 5, cell, Math.round(cell * 0.14))}</div>
  </body></html>`;
}

async function cards() {
  const tmp = mkdtempSync(join(tmpdir(), "skillnet-brand-"));
  try {
    for (const [width, height, out] of [
      [1200, 630, join(PUBLIC, "og-image.png")],
      [1280, 640, join(DOCS_IMAGES, "banner.png")],
    ]) {
      const html = join(tmp, `card-${width}.html`);
      const raw = join(tmp, `card-${width}.png`);
      writeFileSync(html, cardHtml(width, height));
      screenshot(`file://${html}`, width, height, raw);
      await writePng(raw, out);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function screenshots() {
  const base = process.env.BASE_URL ?? "http://localhost:4322";
  const tmp = mkdtempSync(join(tmpdir(), "skillnet-shots-"));
  try {
    // The map page is taller so the map itself is in the shot; the wait lets its tiles load.
    for (const [path, name, height, waitMs] of [
      ["/", "landing", 800, 3000],
      ["/mapa", "map", 1180, 8000],
      ["/auth/signin", "signin", 800, 3000],
    ]) {
      const raw = join(tmp, `${name}.png`);
      screenshot(new URL(path, base).href, 1280, height, raw, waitMs);
      // Map tiles are photographic; quality 80 keeps each screenshot under about 300 KB.
      await writePng(raw, join(DOCS_IMAGES, `${name}.png`), { quality: 80 });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

mkdirSync(DOCS_IMAGES, { recursive: true });
await icons();
await cards();
if (process.argv.includes("--screenshots")) await screenshots();
console.log("Brand assets written to public/ and docs/images/.");
