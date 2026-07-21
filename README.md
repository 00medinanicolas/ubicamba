# 🧭 UbicAMBA

Juego didáctico de geografía porteña, inspirado en [UbiCABA](https://cabatap.vercel.app) de @poniemangon.
Te dan una esquina ("Encontrá: **Cucha Cucha y Teniente General Donato Álvarez**") y tenés que tocar el mapa
—sin ningún cartel— donde creés que está. 5 rondas por partida.

**El giro didáctico**: overlays de comunas y barrios activables, ficha educativa después de cada ronda
(barrio y comuna de la esquina), y un roadmap con modos de avenidas, transporte público y Gran Buenos Aires.

## Correr

```bash
npm install
npm run dev        # http://localhost:5173
```

## Regenerar el dataset

```bash
npm run dataset
```

Descarga las calles de OpenStreetMap (Overpass, se cachea en `data-src/`), detecta ~15.500 esquinas reales,
les asigna barrio y comuna con los polígonos oficiales de BA Data, balancea por barrio y emite:

- `src/data/esquinas.json` — 4.800 esquinas `{s1, s2, lat, lng, b}` pre-mezcladas (habilita el "mapa del día" por bloques)
- `src/data/barrios.json` — 48 barrios con comuna
- `public/geo/*.geojson` — límites simplificados de comunas y barrios + puntos de etiqueta

## Mecánica

- **Puntaje**: ≤50 m = 100 pts; después −1 punto cada 66 m (0 pts a ~6,6 km). Máximo 500.
- **Mapa del día**: bloque diario determinístico de 5 esquinas (época: 2026-01-01).
- **Práctica libre** y **partida por barrios** (elegís qué barrios entran).
- **Compartir**: `/?e=<5 índices>&barrios=<ids>` — quien abre el link juega las mismas esquinas.
- La partida en curso sobrevive al reload (sessionStorage).

## Mapa

- Base vectorial: [OpenFreeMap](https://openfreemap.org) estilo *liberty*, **sin capas `symbol`**
  (el truco heredado de UbiCABA: cero nombres en pantalla).
- Vista satelital opcional: imágenes de Esri World Imagery + calles de liberty encima (híbrido sin labels).
- Overlays: líneas de comunas (celeste) y barrios (ámbar) con etiquetas propias.

## Datos y licencias

| Fuente | Uso | Licencia |
|---|---|---|
| OpenStreetMap (Overpass) | nombres y topología de calles → esquinas | ODbL — © OpenStreetMap contributors |
| BA Data: barrios y comunas | polígonos oficiales, asignación y overlays | CC BY 4.0 (GCBA) |
| BA Data: callejero oficial | (reservado para el modo avenidas: jerarquía vial) | CC BY 4.0 (GCBA) |
| OpenFreeMap | teselas vectoriales del mapa base | libre, sin API key |
| Esri World Imagery | vista satelital opcional | requiere atribución; revisar términos antes de publicar |

## Roadmap

- [x] **Fase 1** — modo clásico CABA + overlays didácticos de comunas/barrios + ficha educativa
- [ ] **Fase 2** — GBA (zona norte/oeste/sur, partidos del AMBA vía OSM), archivo de mapas del día, modo avenidas (callejero oficial: `red_jerarq`)
- [ ] **Fase 3** — desafío A→B en transporte público (GTFS AMBA precomputado offline), quiz de comunas ("¿qué comuna es este polígono?")

## Estructura

```
scripts/build-dataset.mjs   pipeline de datos (Overpass + BA Data → JSON del juego)
src/game/                   lógica pura: puntaje, selección, share, sesión
src/map/                    basemap sin labels + componente MapLibre
src/ui/                     menú, modal por barrios, panel final
reference/                  análisis técnico del UbiCABA original (ver ANALISIS-UBICABA.md)
data-src/                   fuentes crudas descargadas (no versionado)
```
