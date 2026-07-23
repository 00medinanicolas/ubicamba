export type ZonaId = 'caba' | 'norte' | 'oeste' | 'sur';

export type Juego = 'esquinas' | 'avenidas' | 'transporte' | 'armar';

export interface RedEstacion {
  n: string;
  r: 'subte' | 'tren';
  lat: number;
  lng: number;
}

export interface RedLinea {
  nombre: string;
  color: string;
  red: 'subte' | 'tren';
  espera: number;
  /** índices de estación en orden de recorrido */
  sec: number[];
  /** minutos entre estaciones consecutivas (largo = sec.length - 1) */
  hops: number[];
}

export interface RedTransporte {
  version: string;
  penalBajar: number;
  estaciones: RedEstacion[];
  lineas: RedLinea[];
  /** [idxA, idxB, minutos] (bidireccional) */
  caminatas: [number, number, number][];
}

export interface LegTransporte {
  tipo: 'subte' | 'tren' | 'caminar';
  linea: string;
  color: string;
  desde: string | null;
  hasta: string;
  paradas: number;
  min: number;
  /** estaciones del tramo como [lng, lat] (vacío en caminatas) */
  puntos: [number, number][];
}

export interface OpcionTransporte {
  minutos: number;
  optima: boolean;
  legs: LegTransporte[];
}

export interface PuntoTransporte {
  nombre: string;
  red: 'subte' | 'tren';
  lat: number;
  lng: number;
}

export interface DesafioTransporte {
  origen: PuntoTransporte;
  destino: PuntoTransporte;
  /** índices en red-v1.json (mecánica "armá tu viaje") */
  idxOrigen: number;
  idxDestino: number;
  opciones: OpcionTransporte[];
}

export interface DatosTransporte {
  version: string;
  modos: string[];
  desafios: DesafioTransporte[];
}

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
