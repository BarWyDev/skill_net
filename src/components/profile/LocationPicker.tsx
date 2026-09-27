import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { LocationSource } from "@/types";

export interface LocationValue {
  source: LocationSource | null;
  postcode: string;
  lat: number | null;
  lng: number | null;
}

interface ViewTarget {
  lat: number;
  lng: number;
  zoom: number;
}

const POLAND_VIEW: ViewTarget = { lat: 52.07, lng: 19.48, zoom: 6 };
const POINT_ZOOM = 14;
const POSTCODE_RE = /^(\d{2})-?(\d{3})$/;

// A div icon instead of Leaflet's default marker, whose image URLs break under a bundler.
const PIN_ICON = L.divIcon({
  className: "rounded-full border-2 border-white bg-purple-600 shadow-lg",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

type LookupStatus = "idle" | "loading" | "found" | "unknown" | "failed";

const LOOKUP_MESSAGES: Record<LookupStatus, string | null> = {
  idle: null,
  loading: "Szukam kodu…",
  found: null,
  unknown: "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.",
  failed: "Nie udało się sprawdzić kodu. Zaznacz lokalizację na mapie.",
};

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
  /** The location loaded with the page. An emptied postcode field goes back to it. */
  initial: LocationValue;
  onChange: (next: LocationValue) => void;
}

export function LocationPicker({ value, initial, onChange }: Props) {
  const [lookup, setLookup] = useState<LookupStatus>("idle");
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null);
  const latestLookup = useRef(0);

  const hasPoint = value.lat !== null && value.lng !== null;
  const initialView = hasPoint ? { lat: value.lat ?? 0, lng: value.lng ?? 0, zoom: POINT_ZOOM } : POLAND_VIEW;

  async function handlePostcodeChange(raw: string) {
    const request = ++latestLookup.current;
    // Typing a postcode makes it the location (last edit wins). Clearing the field goes back to
    // the stored location, so an abandoned edit never removes it.
    if (!raw.trim()) {
      setLookup("idle");
      onChange(initial);
      if (initial.lat !== null && initial.lng !== null) {
        setViewTarget({ lat: initial.lat, lng: initial.lng, zoom: POINT_ZOOM });
      }
      return;
    }
    const next: LocationValue = { source: "postcode", postcode: raw, lat: null, lng: null };
    onChange(next);

    const match = POSTCODE_RE.exec(raw.trim());
    if (!match) {
      setLookup("idle");
      return;
    }

    setLookup("loading");
    try {
      const response = await fetch(`/api/kody-pocztowe/${match[1]}-${match[2]}`);
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
    onChange({ source: "pin", postcode: "", lat, lng });
  }

  // The stored postcode is never read back, so a postcode location loads with an empty field.
  const storedFromPostcode = lookup === "idle" && value.source === "postcode" && !value.postcode.trim();
  const message = storedFromPostcode ? "Ustawiono z kodu pocztowego" : LOOKUP_MESSAGES[lookup];

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
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
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
      </div>

      <p className="text-sm text-blue-100/70">
        Lokalizacja jest zaokrąglana do ok. 500 m — nikt nie zobaczy Twojego dokładnego adresu.
      </p>

      <input type="hidden" name="location_source" value={value.source ?? ""} />
      <input type="hidden" name="lat" value={value.lat ?? ""} />
      <input type="hidden" name="lng" value={value.lng ?? ""} />
    </div>
  );
}
