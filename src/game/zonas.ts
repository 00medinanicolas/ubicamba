import type { ZonaId } from './tipos';

export interface OverlayDef {
  id: string;
  url: string;
  tipo: 'linea' | 'texto';
  /** a qué toggle responde */
  grupo: 'comunas' | 'areas';
  color: string;
  ancho?: number;
  tamano?: number;
  dash?: [number, number];
}

export interface ZonaDef {
  id: ZonaId;
  nombre: string;
  corto: string;
  /** cómo se llaman las áreas acá: Barrios o Partidos */
  etiquetaAreas: string;
  /** [[oeste, sur], [este, norte]] */
  encuadre: [[number, number], [number, number]];
  limites: [[number, number], [number, number]];
  tieneDia: boolean;
  overlays: OverlayDef[];
}

const overlayAreas = (url: string, urlLabels: string): OverlayDef[] => [
  { id: 'areas-linea', url, tipo: 'linea', grupo: 'areas', color: '#fbbf24', ancho: 1.1, dash: [1, 1.6] },
  { id: 'areas-texto', url: urlLabels, tipo: 'texto', grupo: 'areas', color: '#fcd34d', tamano: 11.5 },
];

export const ZONAS: Record<ZonaId, ZonaDef> = {
  caba: {
    id: 'caba',
    nombre: 'Ciudad de Buenos Aires',
    corto: 'CABA',
    etiquetaAreas: 'Barrios',
    encuadre: [[-58.531, -34.708], [-58.333, -34.524]],
    limites: [[-58.65, -34.78], [-58.22, -34.45]],
    tieneDia: true,
    overlays: [
      { id: 'comunas-linea', url: '/geo/comunas.geojson', tipo: 'linea', grupo: 'comunas', color: '#38bdf8', ancho: 2.2, dash: [2, 1.2] },
      { id: 'comunas-texto', url: '/geo/comunas-labels.geojson', tipo: 'texto', grupo: 'comunas', color: '#7dd3fc', tamano: 15 },
      ...overlayAreas('/geo/barrios.geojson', '/geo/barrios-labels.geojson'),
    ],
  },
  norte: {
    id: 'norte',
    nombre: 'GBA Zona Norte',
    corto: 'Norte',
    etiquetaAreas: 'Partidos',
    encuadre: [[-58.85, -34.62], [-58.45, -34.36]],
    limites: [[-59.0, -34.75], [-58.3, -34.25]],
    tieneDia: false,
    overlays: overlayAreas('/geo/partidos-norte.geojson', '/geo/partidos-norte-labels.geojson'),
  },
  oeste: {
    id: 'oeste',
    nombre: 'GBA Zona Oeste',
    corto: 'Oeste',
    etiquetaAreas: 'Partidos',
    encuadre: [[-58.93, -34.94], [-58.49, -34.56]],
    limites: [[-59.05, -35.05], [-58.35, -34.45]],
    tieneDia: false,
    overlays: overlayAreas('/geo/partidos-oeste.geojson', '/geo/partidos-oeste-labels.geojson'),
  },
  sur: {
    id: 'sur',
    nombre: 'GBA Zona Sur',
    corto: 'Sur',
    etiquetaAreas: 'Partidos',
    encuadre: [[-58.66, -34.95], [-58.06, -34.62]],
    limites: [[-58.85, -35.05], [-57.95, -34.5]],
    tieneDia: false,
    overlays: overlayAreas('/geo/partidos-sur.geojson', '/geo/partidos-sur-labels.geojson'),
  },
};

export const IDS_ZONA = Object.keys(ZONAS) as ZonaId[];

export function esZonaId(v: string | null): v is ZonaId {
  return v !== null && v in ZONAS;
}
