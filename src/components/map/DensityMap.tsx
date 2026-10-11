import { useEffect, useRef, useState } from "react";
import type { PathOptions } from "leaflet";
import type { FeatureCollection, Polygon } from "geojson";
import { GeoJSON, MapContainer, TileLayer, useMap, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  POLAND_MAX_BOUNDS,
  POLAND_VIEW,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  type ViewTarget,
} from "@/components/map/map-view";
import { checkPostcodeInput, POSTCODE_ERROR } from "@/lib/postcode";
import { cn } from "@/lib/utils";
import type { DensityBand, DensityCellDTO, SkillCategoryDTO } from "@/types";

// Only banded 2 km cells reach this island. Never log responses or the typed postcode.

const AREA_ZOOM = 12;

// One hue, light to strong: the signal accent (--color-signal) at rising fill. SVG attributes cannot
// read CSS variables, so the hex is repeated here. The legend text carries the meaning, not the colour.
const SIGNAL = "#f2c230";
const BANDS: { band: DensityBand; label: string; fill: number }[] = [
  { band: 1, label: "5–9 osób", fill: 0.22 },
  { band: 2, label: "10–24 osoby", fill: 0.5 },
  { band: 3, label: "25 i więcej osób", fill: 0.85 },
];

function cellStyle(band: DensityBand): PathOptions {
  return { color: SIGNAL, weight: 1, opacity: 0.9, fillColor: SIGNAL, fillOpacity: BANDS[band - 1].fill };
}

function toFeatures(cells: DensityCellDTO[]): FeatureCollection<Polygon, { band: DensityBand }> {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({ type: "Feature", geometry: c.cell, properties: { band: c.band } })),
  };
}

type CellsState =
  { status: "loading" } | { status: "failed" } | { status: "ready"; cells: DensityCellDTO[]; request: number };
type LookupStatus = "idle" | "invalid" | "loading" | "found" | "unknown" | "failed";

const LOOKUP_MESSAGES: Record<LookupStatus, string | null> = {
  idle: null,
  invalid: POSTCODE_ERROR,
  loading: "Szukam kodu…",
  found: null,
  unknown: "Nie znamy tego kodu pocztowego.",
  failed: "Nie udało się sprawdzić kodu. Spróbuj ponownie.",
};

// The island renders only in the browser (client:only), so matchMedia is always there.
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Recenter({ target }: { target: ViewTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], target.zoom, { animate: !reducedMotion() });
  }, [map, target]);
  return null;
}

interface Props {
  categories: SkillCategoryDTO[];
  /** The signed-in resident's own coarsened point, or null to open on Poland. */
  start: { lat: number; lng: number } | null;
}

export function DensityMap({ categories, start }: Props) {
  const [category, setCategory] = useState<string | null>(null);
  const [cells, setCells] = useState<CellsState>({ status: "loading" });
  const [postcode, setPostcode] = useState("");
  const [lookup, setLookup] = useState<LookupStatus>("idle");
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null);
  const latestCells = useRef(0);
  const latestLookup = useRef(0);

  const initialView: ViewTarget = start ? { ...start, zoom: AREA_ZOOM } : POLAND_VIEW;

  useEffect(() => {
    // The filter buttons set the loading state, so the effect only fetches.
    const request = ++latestCells.current;
    // Only the category travels in the URL; the visitor's area never leaves the browser.
    const url = category ? `/api/mapa?kategoria=${encodeURIComponent(category)}` : "/api/mapa";
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as DensityCellDTO[];
        if (request === latestCells.current) setCells({ status: "ready", cells: data, request });
      })
      .catch(() => {
        if (request === latestCells.current) setCells({ status: "failed" });
      });
  }, [category]);

  async function handlePostcodeChange(raw: string) {
    setPostcode(raw);
    const request = ++latestLookup.current;
    const input = checkPostcodeInput(raw);
    if (input.kind !== "valid") {
      // An unfinished code is only flagged on blur; one that can never be valid is flagged now.
      setLookup(input.kind === "invalid" ? "invalid" : "idle");
      return;
    }

    setLookup("loading");
    try {
      // The code goes in the body: a URL would put it in Workers Logs.
      const response = await fetch("/api/kody-pocztowe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode: input.postcode }),
      });
      if (request !== latestLookup.current) return;
      if (response.status === 404) {
        setLookup("unknown");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const point = (await response.json()) as { lat: number; lng: number };
      if (request !== latestLookup.current) return;
      setLookup("found");
      setViewTarget({ lat: point.lat, lng: point.lng, zoom: AREA_ZOOM });
    } catch {
      if (request === latestLookup.current) setLookup("failed");
    }
  }

  const statusMessage =
    cells.status === "loading"
      ? "Wczytuję mapę…"
      : cells.status === "failed"
        ? "Nie udało się wczytać mapy. Odśwież stronę."
        : cells.cells.length === 0
          ? // Rare skills will always look like this, so say why rather than "nobody" (QA-008).
            category
            ? "W żadnym kwadracie nie ma jeszcze 10 osób z umiejętnościami z tej grupy. Mniejsze skupiska ukrywamy dla prywatności."
            : "W żadnym kwadracie nie ma jeszcze 5 osób. Mniejsze skupiska ukrywamy dla prywatności."
          : null;
  // At the whole-Poland zoom the 2 km cells are too small to see (QA-006).
  const showAreaHint = !start && viewTarget === null;

  const filters = [{ slug: null, name: "Wszystkie" }, ...categories];

  const reduceMotion = reducedMotion();
  const container = "mx-auto max-w-6xl px-4 sm:px-8";

  return (
    <>
      <div className={container}>
        <div className="mt-14 grid grid-cols-12 gap-x-6 gap-y-6 sm:mt-20">
          <fieldset className="col-span-12 min-w-0 lg:col-span-8">
            <legend className="text-ash mb-1 text-[0.9375rem]">Umiejętności</legend>
            <div className="flex flex-wrap gap-x-5">
              {filters.map((f) => {
                const selected = f.slug === category;
                return (
                  <button
                    key={f.slug ?? "all"}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (selected) return;
                      setCells({ status: "loading" });
                      setCategory(f.slug);
                    }}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center underline-offset-[6px]",
                      selected
                        ? "text-chalk decoration-signal underline decoration-[3px]"
                        : "text-ash hover:text-chalk hover:underline",
                    )}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="col-span-12 lg:col-span-4">
            <label htmlFor="map-postcode" className="text-ash mb-2 block text-[0.9375rem]">
              Przejdź do kodu pocztowego
            </label>
            <input
              id="map-postcode"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00-000"
              maxLength={6}
              value={postcode}
              onChange={(e) => {
                void handlePostcodeChange(e.target.value);
              }}
              onBlur={() => {
                if (checkPostcodeInput(postcode).kind === "partial") setLookup("invalid");
              }}
              aria-invalid={lookup === "invalid"}
              aria-describedby="map-postcode-status"
              className="field h-12 w-40 px-3 text-lg tabular-nums"
            />
            <p
              id="map-postcode-status"
              role="status"
              className={cn("mt-2 min-h-6 text-[0.9375rem]", lookup === "loading" ? "text-ash" : "text-alarm")}
            >
              {LOOKUP_MESSAGES[lookup]}
            </p>
            {showAreaHint && (
              <p className="text-ash mt-1 max-w-[40ch] text-[0.9375rem] leading-relaxed">
                W skali całej Polski kwadraty 2 km są za małe, żeby je zobaczyć. Wpisz kod pocztowy, a mapa przybliży
                okolicę.
              </p>
            )}
          </div>
        </div>

        <p
          role="status"
          className={cn(
            "mt-6 max-w-[60ch] leading-relaxed empty:hidden",
            cells.status === "failed" ? "text-alarm" : "text-ash",
          )}
        >
          {statusMessage}
        </p>
      </div>

      <div className="mx-auto mt-6 max-w-[96rem] px-4 sm:px-8">
        <MapContainer
          center={[initialView.lat, initialView.lng]}
          zoom={initialView.zoom}
          className="site-map border-seam h-[min(70vh,640px)] min-h-[26rem] w-full border"
          scrollWheelZoom={false}
          zoomControl={false}
          zoomAnimation={!reduceMotion}
          fadeAnimation={!reduceMotion}
          minZoom={5}
          maxBounds={POLAND_MAX_BOUNDS}
          maxBoundsViscosity={1}
        >
          <ZoomControl zoomInTitle={ZOOM_IN_TITLE} zoomOutTitle={ZOOM_OUT_TITLE} />
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          <Recenter target={viewTarget} />
          {cells.status === "ready" && (
            // GeoJSON data is immutable after mount, so a new key redraws the layer per response.
            <GeoJSON
              key={cells.request}
              data={toFeatures(cells.cells)}
              style={(feature) => cellStyle((feature?.properties as { band: DensityBand }).band)}
            />
          )}
        </MapContainer>
      </div>

      <div className={cn(container, "mt-5")}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <p>Osoby w kwadracie 2 × 2 km</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {BANDS.map((b) => (
              <li key={b.band} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="border-signal inline-block size-5 border"
                  style={{ backgroundColor: `rgb(242 194 48 / ${b.fill})` }}
                />
                {b.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-ash mt-2 max-w-[60ch] leading-relaxed">
          Kwadraty, w których mieszka mniej niż 5 osób, ukrywamy. Wyglądają tak samo jak puste.
        </p>
      </div>
    </>
  );
}
