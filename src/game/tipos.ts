export type ZonaId = 'caba' | 'norte' | 'oeste' | 'sur';

export type Juego = 'esquinas' | 'avenidas';

export interface Esquina {
  s1: string;
  s2: string;
  lat: number;
  lng: number;
  /** id de área (barrio en CABA, partido en GBA) dentro de su zona */
  b: number;
}

export interface Area {
  id: number;
  nombre: string;
  /** número de comuna (solo CABA) */
  grupo?: number;
}

export interface DatosZona {
  nombre: string;
  areas: Area[];
  esquinas: Esquina[];
}

export interface Avenida {
  nombre: string;
  largoKm: number;
  barrios: string[];
  /** polilíneas [lng, lat] */
  lineas: [number, number][][];
}

/** 'link' cubre tanto la práctica como las partidas abiertas desde un link compartido. */
export type Modo = 'dia' | 'link' | 'personalizada';

export type Fase = 'adivinando' | 'revelada' | 'terminado';

export interface Resultado {
  /** índice dentro del dataset del juego (esquinas o avenidas) */
  idx: number;
  /** [lat, lng] del toque (solo esquinas) */
  guess: [number, number] | null;
  /** opción elegida (solo avenidas) */
  eleccion?: string;
  distancia: number;
  puntos: number;
}

export interface Sesion {
  zona: ZonaId;
  juego: Juego;
  indices: number[];
  modo: Modo;
  areasSel: number[];
  ronda: number;
  fase: Fase;
  resultados: Resultado[];
}
