import type { Avenida, DatosZona, ZonaId } from './tipos';

const cacheZonas = new Map<ZonaId, Promise<DatosZona>>();

export function cargarZona(zona: ZonaId): Promise<DatosZona> {
  let p = cacheZonas.get(zona);
  if (!p) {
    p = fetch(`/data/zona-${zona}.json`).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar la zona ${zona} (${r.status})`);
      return r.json() as Promise<DatosZona>;
    });
    p.catch(() => cacheZonas.delete(zona));
    cacheZonas.set(zona, p);
  }
  return p;
}

let cacheAvenidas: Promise<Avenida[]> | null = null;

export function cargarAvenidas(): Promise<Avenida[]> {
  if (!cacheAvenidas) {
    cacheAvenidas = fetch('/data/avenidas.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudieron cargar las avenidas (${r.status})`);
      return r.json() as Promise<Avenida[]>;
    });
    cacheAvenidas.catch(() => (cacheAvenidas = null));
  }
  return cacheAvenidas;
}
