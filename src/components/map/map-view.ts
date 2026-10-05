// Map constants shared by the profile location picker and the public density map.

export interface ViewTarget {
  lat: number;
  lng: number;
  zoom: number;
}

export const POLAND_VIEW: ViewTarget = { lat: 52.07, lng: 19.48, zoom: 6 };

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
