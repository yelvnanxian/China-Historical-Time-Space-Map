# Real terrain reference

The map uses original **Mapzen / Tilezen Terrarium elevation PNGs**, downloaded
from the public `elevation-tiles-prod` AWS bucket. The importer preserves original
PNG bytes and records per-file SHA-256 checksums in
`public/data/terrain/manifest.json`.

- Import command: `python3 scripts/import-terrain.py`
- Source: <https://registry.opendata.aws/terrain-tiles/>
- Public endpoint: <https://s3.amazonaws.com/elevation-tiles-prod/terrarium/6/49/25.png>
- Coverage: 55°E–155°E, 5°S–65°N; zoom levels 0–6, 256×256 pixels per tile.
- Encoding: `elevation_m = red * 256 + green + blue / 256 - 32768`.
- Original format, source, and contributor attribution documents are preserved
  under `public/data/terrain/` and linked from the map controls.

The application uses two separate MapLibre `raster-dem` sources for hillshade
and terrain, as recommended by MapLibre to improve rendering quality. Both read
the same local files; no API key or remote runtime requests are required.
Hillshade is visible by default in the flat map. 3D mode uses a 55° viewing angle
and a moderate 1.5× vertical exaggeration. Returning to 2D removes terrain and
restores a north-up, 0°-pitch map. Hillshade can be toggled independently.

These are **modern elevations**, not reconstructed historical topography. The
coarse local cache is intended for regional terrain observation. At zoom 6,
sampling is roughly 1–2.4 km depending on latitude; zooming farther in does not
provide additional underlying detail. Source tiles can contain bathymetry below
sea level as well as land elevation.

## Integration and error handling

Mount `<TerrainLayer map={map.current} ready={ready} />` inside the map wrapper.
The optional `onExplore` callback runs before the mountain-view camera move, so
the host can clear any automatic fit-on-resize state.
At the beginning of the host MapLibre `error` handler, use
`if (isTerrainError(event)) return;` from the same module. The terrain component
handles failures locally, disables terrain and shading, and offers a retry.
Other map sources and the base map remain available.

The component checks for existing sources and layers before adding them and
removes the resources it owns on unmount. It also tolerates the parent removing
the map before child cleanup.

## Data checks

HTTP requests for representative tiles returned status 200 and real 256×256
PNG images without authentication. Direct Terrarium decoding of downloaded
zoom-6 data gave the following samples (coarse cell values, not surveyed point
elevations):

| Region | Longitude, latitude | Tile | Decoded elevation |
|---|---|---|---:|
| Hengduan Mountains | 100.8, 29.5 | 6/49/26 | 4,390 m |
| Tibetan Plateau | 90.0, 32.0 | 6/48/25 | 4,663 m |
| North China Plain | 116.0, 36.0 | 6/52/25 | 44 m |
| Sichuan Basin | 104.1, 30.6 | 6/50/26 | 489 m |

The parent task verified real hillshade and the 3D Hengduan Mountains view in
the browser. `npx tsx --test server/terrain.test.ts` checks the complete 454-tile
coverage and all SHA-256 values, independently decodes real PNG cells to verify
regional elevation differences, and checks that terrain-specific failures are
handled locally without swallowing base-map or administrative-boundary errors.
