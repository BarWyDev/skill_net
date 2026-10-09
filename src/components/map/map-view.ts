// Map constants shared by the profile location picker and the public density map.

export interface ViewTarget {
  lat: number;
  lng: number;
  zoom: number;
}

export const POLAND_VIEW: ViewTarget = { lat: 52.07, lng: 19.48, zoom: 6 };

/** Keeps the maps around Poland, so a pin cannot be dragged far abroad (QA-017). [[S, W], [N, E]]. */
export const POLAND_MAX_BOUNDS: [[number, number], [number, number]] = [
  [48.3, 13.0],
  [55.6, 25.2],
];

// Polish titles and labels for the zoom buttons; Leaflet's default is English (QA-021).
export const ZOOM_IN_TITLE = "Przybliż";
export const ZOOM_OUT_TITLE = "Oddal";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
