import type { Avenida, DatosTransporte, DatosZona, RedTransporte, ZonaId } from './tipos';

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
