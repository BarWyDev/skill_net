import { useEffect, useRef, useState } from "react";
import type { PathOptions } from "leaflet";
import type { FeatureCollection, Polygon } from "geojson";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION, OSM_TILE_URL, POLAND_VIEW, type ViewTarget } from "@/components/map/map-view";
import { cn } from "@/lib/utils";
import type { DensityBand, DensityCellDTO, SkillCategoryDTO } from "@/types";

// Only banded 2 km cells reach this island. Never log responses or the typed postcode.

const AREA_ZOOM = 12;
const POSTCODE_RE = /^(\d{2})-?(\d{3})$/;

const BANDS: { band: DensityBand; label: string; color: string }[] = [
  { band: 1, label: "5–9 osób", color: "#c4b5fd" },
  { band: 2, label: "10–24 osoby", color: "#8b5cf6" },
  { band: 3, label: "25 i więcej osób", color: "#5b21b6" },
];

function cellStyle(band: DensityBand): PathOptions {
  const color = BANDS[band - 1].color;
  return { color, weight: 1, fillColor: color, fillOpacity: 0.55 };
}

function toFeatures(cells: DensityCellDTO[]): FeatureCollection<Polygon, { band: DensityBand }> {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({ type: "Feature", geometry: c.cell, properties: { band: c.band } })),
  };
}

type CellsState =
  { status: "loading" } | { status: "failed" } | { status: "ready"; cells: DensityCellDTO[]; request: number };
type LookupStatus = "idle" | "loading" | "found" | "unknown" | "failed";

const LOOKUP_MESSAGES: Record<LookupStatus, string | null> = {
  idle: null,
  loading: "Szukam kodu…",
  found: null,
  unknown: "Nie znamy tego kodu pocztowego.",
  failed: "Nie udało się sprawdzić kodu. Spróbuj ponownie.",
};

function Recenter({ target }: { target: ViewTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], target.zoom);
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
    const match = POSTCODE_RE.exec(raw.trim());
    if (!match) {
      setLookup("idle");
      return;
    }

    setLookup("loading");
    try {
      // The code goes in the body: a URL would put it in Workers Logs.
      const response = await fetch("/api/kody-pocztowe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode: `${match[1]}-${match[2]}` }),
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
          ? "Brak obszarów z co najmniej 5 osobami dla tego filtra."
          : null;

  const filters = [{ slug: null, name: "Wszystkie" }, ...categories];

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm text-blue-100">Umiejętności</legend>
        <div className="flex flex-wrap gap-2">
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
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  selected
                    ? "border-purple-400 bg-purple-600 text-white"
                    : "border-white/20 bg-white/5 text-blue-100 hover:bg-white/10",
                )}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="map-postcode" className="mb-1 block text-sm text-blue-100">
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
          aria-describedby="map-postcode-status"
          className="h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-white placeholder:text-white/40 focus:border-purple-400 focus:outline-none sm:w-40"
        />
        <p
          id="map-postcode-status"
          role="status"
          className={cn("mt-1 min-h-5 text-sm", lookup === "loading" ? "text-blue-100/70" : "text-red-300")}
        >
          {LOOKUP_MESSAGES[lookup]}
        </p>
      </div>

      <p role="status" className="text-sm text-blue-100/70 empty:hidden">
        {statusMessage}
      </p>

      <MapContainer
        center={[initialView.lat, initialView.lng]}
        zoom={initialView.zoom}
        className="h-[28rem] w-full rounded-xl"
        scrollWheelZoom={false}
      >
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

      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-blue-100">
        <p className="mb-2 font-medium text-white">Legenda (kwadraty 2 × 2 km)</p>
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {BANDS.map((b) => (
            <li key={b.band} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-sm"
                style={{ backgroundColor: b.color }}
              />
              {b.label}
            </li>
          ))}
        </ul>
        <p className="text-blue-100/70">
          Obszary, w których jest mniej niż 5 osób, nie są pokazywane — wygląda to tak samo jak brak osób.
        </p>
      </div>
    </div>
  );
}
