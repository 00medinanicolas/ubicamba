import type { RasterSourceSpecification, StyleSpecification } from 'maplibre-gl';

export type Basemap = 'plano' | 'satelite';

let libertyCache: StyleSpecification | null = null;

/** Estilo base: OpenFreeMap "liberty" (vectorial, sin API key, uso libre). */
async function liberty(): Promise<StyleSpecification> {
  if (!libertyCache) {
    const res = await fetch('https://tiles.openfreemap.org/styles/liberty');
    if (!res.ok) throw new Error('No se pudo cargar el mapa base (' + res.status + ')');
    libertyCache = (await res.json()) as StyleSpecification;
  }
  return structuredClone(libertyCache);
}

const ESRI_SAT: RasterSourceSpecification = {
  type: 'raster',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  maxzoom: 19,
  attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
};

/**
 * El truco heredado de UbiCABA: se eliminan todas las capas `symbol` del estilo,
 * así el mapa no muestra ningún nombre de calle, barrio ni lugar.
 *
 * - `plano`: liberty completo sin textos (manzanas, parques, agua, vías).
 * - `satelite`: imagen satelital de Esri + las líneas de calles de liberty encima
 *   (equivalente al "hybrid sin labels" del juego original, sin API key).
 */
export async function crearEstilo(modo: Basemap): Promise<StyleSpecification> {
  const estilo = await liberty();
  estilo.layers = estilo.layers.filter((l) => l.type !== 'symbol');

  if (modo === 'satelite') {
    estilo.sources = { ...estilo.sources, 'esri-sat': ESRI_SAT };
    const calles = estilo.layers.filter(
      (l) => l.type === 'line' && /road|highway|bridge|tunnel|street|motorway|trunk|primary|secondary|tertiary|minor|rail|path/i.test(l.id)
    );
    estilo.layers = [{ id: 'satelite', type: 'raster', source: 'esri-sat' }, ...calles];
  }
  return estilo;
}
