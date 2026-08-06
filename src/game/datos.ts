import type { Avenida, DatosLugares, DatosTransporte, DatosZona, Lugar, RedTransporte, ZonaId } from './tipos';

/** Resuelve rutas de assets respetando el base de Vite (en Pages la app vive bajo /ubicamba/). */
export const ruta = (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, '');

const cacheZonas = new Map<ZonaId, Promise<DatosZona>>();

export function cargarZona(zona: ZonaId): Promise<DatosZona> {
  let p = cacheZonas.get(zona);
  if (!p) {
    p = fetch(ruta(`data/zona-${zona}.json`)).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar la zona ${zona} (${r.status})`);
      return r.json() as Promise<DatosZona>;
    });
    p.catch(() => cacheZonas.delete(zona));
    cacheZonas.set(zona, p);
  }
  return p;
}

let cacheTransporte: Promise<DatosTransporte> | null = null;

export function cargarTransporte(): Promise<DatosTransporte> {
  if (!cacheTransporte) {
    cacheTransporte = fetch(ruta('data/transporte-v1.json')).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar el dataset de transporte (${r.status})`);
      return r.json() as Promise<DatosTransporte>;
    });
    cacheTransporte.catch(() => (cacheTransporte = null));
  }
  return cacheTransporte;
}

let cacheRed: Promise<RedTransporte> | null = null;

export function cargarRed(): Promise<RedTransporte> {
  if (!cacheRed) {
    cacheRed = fetch(ruta('data/red-v1.json')).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar la red de transporte (${r.status})`);
      return r.json() as Promise<RedTransporte>;
    });
    cacheRed.catch(() => (cacheRed = null));
  }
  return cacheRed;
}

let cacheLugares: Promise<Lugar[]> | null = null;

export function cargarLugares(): Promise<Lugar[]> {
  if (!cacheLugares) {
    cacheLugares = fetch(ruta('data/lugares-v1.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudieron cargar los lugares (${r.status})`);
        return r.json() as Promise<DatosLugares>;
      })
      .then((d) => d.lugares);
    cacheLugares.catch(() => (cacheLugares = null));
  }
  return cacheLugares;
}

let cacheAvenidas: Promise<Avenida[]> | null = null;

export function cargarAvenidas(): Promise<Avenida[]> {
  if (!cacheAvenidas) {
    cacheAvenidas = fetch(ruta('data/avenidas.json')).then((r) => {
      if (!r.ok) throw new Error(`No se pudieron cargar las avenidas (${r.status})`);
      return r.json() as Promise<Avenida[]>;
    });
    cacheAvenidas.catch(() => (cacheAvenidas = null));
  }
  return cacheAvenidas;
}

/* ---------- Modo Comunas y Localidades ----------
   Los poligonos ya viven en public/geo/ porque son los mismos que dibujan los
   overlays del mapa. Aca se cargan como dataset de juego: cada feature es una
   ronda y su nombre es la respuesta. */

export type ColeccionArea = 'comunas' | 'barrios' | 'partidos-norte' | 'partidos-oeste' | 'partidos-sur';

export interface AreaGeo {
  nombre: string;
  feature: GeoJSON.Feature;
}

const cacheAreas = new Map<ColeccionArea, Promise<AreaGeo[]>>();

export function cargarAreasGeo(col: ColeccionArea): Promise<AreaGeo[]> {
  let p = cacheAreas.get(col);
  if (!p) {
    p = fetch(ruta(`geo/${col}.geojson`))
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudieron cargar los limites de ${col} (${r.status})`);
        return r.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((fc) =>
        fc.features
          .map((f) => {
            const props = (f.properties ?? {}) as Record<string, unknown>;
            // comunas.geojson trae el numero; el resto, la etiqueta con el nombre.
            const nombre =
              typeof props.comuna === 'number' || typeof props.comuna === 'string'
                ? `Comuna ${props.comuna}`
                : String(props.etiqueta ?? '').trim();
            return { nombre, feature: f };
          })
          .filter((a) => a.nombre.length > 0)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      );
    p.catch(() => cacheAreas.delete(col));
    cacheAreas.set(col, p);
  }
  return p;
}
