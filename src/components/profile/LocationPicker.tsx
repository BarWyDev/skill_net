import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";
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
import { isInPoland, OUTSIDE_POLAND_ERROR } from "@/lib/poland";
import { checkPostcodeInput, POSTCODE_ERROR } from "@/lib/postcode";
import { cn } from "@/lib/utils";
import type { LocationSource } from "@/types";

export interface LocationValue {
  source: LocationSource | null;
  postcode: string;
  lat: number | null;
  lng: number | null;
}

const POINT_ZOOM = 14;

// A div icon instead of Leaflet's default marker, whose image URLs break under a bundler.
const PIN_ICON = L.divIcon({
  className: "rounded-full border-2 border-white bg-purple-600 shadow-lg",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

type LookupStatus = "idle" | "invalid" | "loading" | "found" | "unknown" | "failed";

export const UNKNOWN_POSTCODE_MESSAGE = "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.";

const LOOKUP_MESSAGES: Record<LookupStatus, string | null> = {
  idle: null,
  invalid: POSTCODE_ERROR,
  loading: "Szukam kodu…",
  found: null,
  unknown: UNKNOWN_POSTCODE_MESSAGE,
  failed: "Nie udało się sprawdzić kodu. Zaznacz lokalizację na mapie.",
};

const PRIVACY_HINT = "Lokalizacja jest zaokrąglana do ok. 500 m — nikt nie zobaczy Twojego dokładnego adresu.";

/**
 * Why the current value cannot be saved yet, or null when it can (or when it is empty, which the
 * server reports). Lets a form block the submit instead of losing its edits to a server error (QA-017).
 */
export function locationProblem(value: LocationValue): string | null {
  if (value.source === "postcode" && value.postcode.trim() && (value.lat === null || value.lng === null)) {
    return checkPostcodeInput(value.postcode).kind === "valid" ? UNKNOWN_POSTCODE_MESSAGE : POSTCODE_ERROR;
  }
  if (value.source === "pin" && value.lat !== null && value.lng !== null && !isInPoland(value.lat, value.lng)) {
    return OUTSIDE_POLAND_ERROR;
  }
  return null;
}

function Recenter({ target }: { target: ViewTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], target.zoom);
  }, [map, target]);
  return null;
}

function ClickToPin({ onPin }: { onPin: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPin(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface Props {
  value: LocationValue;
  /** The location loaded with the page. An emptied postcode field goes back to it, or to a later pin. */
  initial: LocationValue;
  onChange: (next: LocationValue) => void;
  /** The note under the map. Defaults to the resident's privacy note; a crisis epicentre needs its own. */
  hint?: string;
}

export function LocationPicker({ value, initial, onChange, hint = PRIVACY_HINT }: Props) {
  const [lookup, setLookup] = useState<LookupStatus>("idle");
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null);
  // What an emptied postcode field goes back to: the loaded location, or a later map pin.
  const [revertTo, setRevertTo] = useState<LocationValue>(initial);
  const latestLookup = useRef(0);

  const hasPoint = value.lat !== null && value.lng !== null;
  const initialView = hasPoint ? { lat: value.lat ?? 0, lng: value.lng ?? 0, zoom: POINT_ZOOM } : POLAND_VIEW;

  async function handlePostcodeChange(raw: string) {
    const request = ++latestLookup.current;
    // Typing a postcode makes it the location (last edit wins). Clearing the field goes back to
    // the stored location or a later pin, so an abandoned edit never removes it.
    if (!raw.trim()) {
      setLookup("idle");
      onChange(revertTo);
      if (revertTo.lat !== null && revertTo.lng !== null) {
        setViewTarget({ lat: revertTo.lat, lng: revertTo.lng, zoom: POINT_ZOOM });
      }
      return;
    }
    const next: LocationValue = { source: "postcode", postcode: raw, lat: null, lng: null };
    onChange(next);

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
      onChange({ ...next, lat: point.lat, lng: point.lng });
      setViewTarget({ lat: point.lat, lng: point.lng, zoom: POINT_ZOOM });
    } catch {
      if (request === latestLookup.current) setLookup("failed");
    }
  }

  function handlePin(lat: number, lng: number) {
    latestLookup.current++;
    setLookup("idle");
    const pinned: LocationValue = { source: "pin", postcode: "", lat, lng };
    setRevertTo(pinned);
    onChange(pinned);
  }

  // The stored postcode is never read back, so a postcode location loads with an empty field.
  const storedFromPostcode = lookup === "idle" && value.source === "postcode" && !value.postcode.trim();
  const message = storedFromPostcode ? "Ustawiono z kodu pocztowego" : LOOKUP_MESSAGES[lookup];
  const pinOutside =
    value.source === "pin" && value.lat !== null && value.lng !== null && !isInPoland(value.lat, value.lng);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="postcode" className="mb-1 block text-sm text-blue-100">
          Kod pocztowy
        </label>
        <input
          id="postcode"
          name="postcode"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00-000"
          maxLength={6}
          value={value.postcode}
          onChange={(e) => {
            void handlePostcodeChange(e.target.value);
          }}
          onBlur={() => {
            if (checkPostcodeInput(value.postcode).kind === "partial") setLookup("invalid");
          }}
          aria-invalid={lookup === "invalid"}
          aria-describedby="postcode-status"
          className="h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-white placeholder:text-white/40 focus:border-purple-400 focus:outline-none sm:w-40"
        />
        <p
          id="postcode-status"
          role="status"
          className={cn(
            "mt-1 min-h-5 text-sm",
            lookup === "loading" || storedFromPostcode ? "text-blue-100/70" : "text-red-300",
          )}
        >
          {message}
        </p>
      </div>

      <div>
        <p className="mb-1 text-sm text-blue-100">…albo kliknij mapę lub przeciągnij znacznik</p>
        <MapContainer
          center={[initialView.lat, initialView.lng]}
          zoom={initialView.zoom}
          className="h-72 w-full rounded-xl"
          scrollWheelZoom={false}
          zoomControl={false}
          minZoom={5}
          maxBounds={POLAND_MAX_BOUNDS}
          maxBoundsViscosity={1}
        >
          <ZoomControl zoomInTitle={ZOOM_IN_TITLE} zoomOutTitle={ZOOM_OUT_TITLE} />
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          <Recenter target={viewTarget} />
          <ClickToPin onPin={handlePin} />
          {hasPoint && (
            <Marker
              position={[value.lat ?? 0, value.lng ?? 0]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{
                dragend(e) {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  handlePin(lat, lng);
                },
              }}
            />
          )}
        </MapContainer>
        <p id="pin-status" role="status" className="mt-1 min-h-5 text-sm text-red-300">
          {pinOutside && `${OUTSIDE_POLAND_ERROR} Przesuń znacznik.`}
        </p>
      </div>

      <p className="text-sm text-blue-100/70">{hint}</p>

      <input type="hidden" name="location_source" value={value.source ?? ""} />
      <input type="hidden" name="lat" value={value.lat ?? ""} />
      <input type="hidden" name="lng" value={value.lng ?? ""} />
    </div>
  );
}
