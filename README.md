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

## Regenerar los datasets

```bash
npm run dataset      # esquinas + overlays + avenidas (OSM + BA Data + IGN)
node scripts/build-transporte.mjs   # desafíos A→B (GTFS subte+tren extraídos en data-src/gtfs/)
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
| OpenStreetMap (Overpass) | nombres y topología de calles → esquinas y avenidas | ODbL — © OpenStreetMap contributors |
| BA Data: barrios y comunas | polígonos oficiales, asignación y overlays | CC BY 4.0 (GCBA) |
| IGN (WFS `ign:departamento`) | polígonos de los 24 partidos del GBA | CC BY 4.0 (IGN Argentina) |
| BA Data: callejero oficial | (reservado para el modo avenidas: jerarquía vial) | CC BY 4.0 (GCBA) |
| OpenFreeMap | teselas vectoriales del mapa base | libre, sin API key |
| Esri World Imagery | vista satelital opcional | requiere atribución; revisar términos antes de publicar |

## Modos y zonas

- **Zonas**: CABA + GBA **Norte** (8 partidos), **Oeste** (7) y **Sur** (9) — los 24 partidos del conurbano,
  con overlay de límites de partidos (polígonos IGN) y partida por partidos. Se cambia desde el menú
  o por URL (`?z=norte`).
- **Modo Avenidas** (`?j=av`): se marca una avenida en el mapa y hay que reconocerla entre 4 opciones.
  90 avenidas principales de CABA rankeadas por longitud; la ficha cuenta qué barrios recorre.
  Las opciones son determinísticas por avenida → los links compartidos son desafíos idénticos.
- **Archivo**: calendario para jugar cualquier mapa del día pasado (desde el 1/1/2026).
- **Cómo llegar A→B** (`?j=tr`): te dan dos estaciones de la red de subtes y trenes y hay que elegir
  el itinerario más rápido entre varios (sin ver los tiempos). Calculado con Dijkstra sobre los GTFS
  oficiales: tiempos reales de viaje, esperas por frecuencia y transbordos. Rondas configurables en
  tandas de 5 (5/10/15/20). El dataset es versionado y regenerable: al sumar los colectivos (GTFS ya
  descargado, requiere credenciales de API Transporte) se recalculan todas las rutas.

## Roadmap

- [x] **Fase 1** — modo clásico CABA + overlays didácticos de comunas/barrios + ficha educativa
- [x] **Fase 2** — GBA norte/oeste/sur (24 partidos, esquinas OSM + polígonos IGN), archivo de mapas del día, modo Avenidas
- [ ] **Fase 3** — desafío A→B en transporte público (GTFS AMBA precomputado offline), quiz de comunas ("¿qué comuna es este polígono?"), localidades del GBA en la ficha didáctica

## Estructura

```
scripts/build-dataset.mjs   pipeline de datos (Overpass + BA Data → JSON del juego)
src/game/                   lógica pura: puntaje, selección, share, sesión
src/map/                    basemap sin labels + componente MapLibre
src/ui/                     menú, modal por barrios, panel final
reference/                  análisis técnico del UbiCABA original (ver ANALISIS-UBICABA.md)
data-src/                   fuentes crudas descargadas (no versionado)
```
