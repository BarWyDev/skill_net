import type { LatLngBoundsExpression, PathOptions } from "leaflet";
import type { Polygon } from "geojson";
import { GeoJSON, MapContainer, TileLayer, Tooltip, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  POLAND_MAX_BOUNDS,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
} from "@/components/map/map-view";

// Only the block outline and the lettered course squares reach this island: no course text or ids.

// The signal accent (--color-signal), as in DensityMap: SVG attributes cannot read CSS variables.
const SIGNAL = "#f2c230";
const BLOCK_STYLE: PathOptions = { color: SIGNAL, weight: 2, opacity: 0.9, dashArray: "6 6", fill: false };
const SQUARE_STYLE: PathOptions = { color: SIGNAL, weight: 1, opacity: 0.9, fillColor: SIGNAL, fillOpacity: 0.35 };

/** [[S, W], [N, E]] of a GeoJSON polygon. */
function boundsOf(polygon: Polygon): LatLngBoundsExpression {
  const points = polygon.coordinates[0];
  const lats = points.map((p) => p[1]);
  const lngs = points.map((p) => p[0]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

interface Props {
  /** The viewer's 3×3 block of 2 km squares. */
  block: Polygon;
  /** One entry per square with courses, lettered in the list's order. */
  squares: { letter: string; cell: Polygon }[];
}

export function CoursesMap({ block, squares }: Props) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <MapContainer
      bounds={boundsOf(block)}
      boundsOptions={{ padding: [12, 12] }}
      className="site-map border-seam h-[min(60vh,420px)] min-h-[18rem] w-full border"
      scrollWheelZoom={false}
      zoomControl={false}
      zoomAnimation={!reduceMotion}
      fadeAnimation={!reduceMotion}
      minZoom={9}
      maxBounds={POLAND_MAX_BOUNDS}
      maxBoundsViscosity={1}
    >
      <ZoomControl zoomInTitle={ZOOM_IN_TITLE} zoomOutTitle={ZOOM_OUT_TITLE} />
      <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
      <GeoJSON data={block} style={BLOCK_STYLE} interactive={false} />
      {squares.map((s) => (
        <GeoJSON key={s.letter} data={s.cell} style={SQUARE_STYLE}>
          <Tooltip permanent direction="center" className="course-square-label">
            {s.letter}
          </Tooltip>
        </GeoJSON>
      ))}
    </MapContainer>
  );
}
