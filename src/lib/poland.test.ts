// Poland outline check. Run with `npm run test:unit`. The SQL copy is tested in
// supabase/tests/poland_outline_test.sql with the same points.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isInPoland, POLAND_OUTLINE } from "./poland.ts";

// [name, lat, lng]
const POLISH: [string, number, number][] = [
  ["Warszawa", 52.23, 21.01],
  ["Hel", 54.6, 18.8],
  ["Świnoujście", 53.91, 14.24],
  ["Krynica Morska", 54.38, 19.45],
  ["Puńsk", 54.25, 23.19],
  ["Białowieża", 52.7, 23.85],
  ["Terespol", 52.07, 23.62],
  ["Zosin", 50.87, 24.14],
  ["Opołonek", 49.01, 22.86],
  ["Wołosate", 49.06, 22.68],
  ["Rysy", 49.18, 20.088],
  ["Zakopane", 49.3, 19.95],
  ["Wisła", 49.65, 18.86],
  ["Międzylesie", 50.15, 16.66],
  ["Kudowa-Zdrój", 50.44, 16.24],
  ["Mieroszów", 50.66, 16.19],
  ["Śnieżka", 50.735, 15.74],
  ["Bogatynia", 50.91, 14.96],
  ["Gubin", 51.95, 14.72],
  ["Cedynia", 52.88, 14.2],
];

const FOREIGN: [string, number, number][] = [
  ["Czechy, na północ od Pragi (K-06)", 50.53, 14.79],
  ["Berlin", 52.52, 13.4],
  ["Cottbus", 51.76, 14.33],
  ["Liberec", 50.77, 15.06],
  ["Broumov", 50.59, 16.33],
  ["Náchod", 50.42, 16.16],
  ["Opava", 49.94, 17.9],
  ["Ostrawa", 49.83, 18.29],
  ["Żylina", 49.22, 18.74],
  ["Poprad", 49.06, 20.3],
  ["Bardejów", 49.29, 21.28],
  ["Lwów", 49.84, 24.03],
  ["Kowel", 51.21, 24.71],
  ["Brześć", 52.1, 23.7],
  ["Grodno", 53.68, 23.83],
  ["Łoździeje", 54.23, 23.52],
  ["Wilno", 54.69, 25.28],
  ["Kaliningrad", 54.71, 20.51],
  ["Mamonowo", 54.47, 19.94],
];

test("the ring is closed", () => {
  assert.deepEqual(POLAND_OUTLINE[0], POLAND_OUTLINE.at(-1));
});

test("places in Poland, including border areas, are inside", () => {
  for (const [name, lat, lng] of POLISH) assert.equal(isInPoland(lat, lng), true, name);
});

test("places in neighbouring countries are outside, also inside the old bounding box", () => {
  for (const [name, lat, lng] of FOREIGN) assert.equal(isInPoland(lat, lng), false, name);
});
