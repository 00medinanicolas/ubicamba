export type ZonaId = 'caba' | 'norte' | 'oeste' | 'sur';

export type Juego = 'esquinas' | 'avenidas' | 'transporte' | 'armar' | 'lugares' | 'areas';

export type CategoriaLugar =
  | 'monumento' | 'estado' | 'biblioteca' | 'cultura' | 'museo' | 'comida' | 'estadio';

/** Un lugar típico: se marca en el mapa y hay que decir cuál es. */
export interface Lugar {
  n: string;
  cat: CategoriaLugar;
  /** caba | pba */
  z: 'caba' | 'pba';
  lat: number;
  lng: number;
  /** otras formas que se aceptan al escribir la respuesta */
  a?: string[];
}

export interface DatosLugares {
  version: string;
  lugares: Lugar[];
}

export interface RedEstacion {
  n: string;
  r: 'subte' | 'tren';
  z: ZonaTransporte | null;
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

export type ZonaTransporte = 'caba' | 'norte' | 'oeste' | 'sur';

/** Tramo de un itinerario: `li` es el índice de línea en la red (-1 = a pie). */
export interface LegTransporte {
  li: number;
  min: number;
  /** índices de estación en red-v1.json */
  est: number[];
}

export interface OpcionTransporte {
  minutos: number;
  optima: boolean;
  legs: LegTransporte[];
}

export interface DesafioTransporte {
  /** índices de origen y destino en red-v1.json */
  o: number;
  d: number;
  /** zonas que toca el viaje óptimo */
  z: ZonaTransporte[];
  /** combinaciones (transbordos) del viaje óptimo */
  c: number;
  /** sin alternativas suficientes: solo sirve para "armá tu viaje" */
  soloArmar?: 1;
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
  /** modo Lugares: true = se escribe la respuesta; false/ausente = multiple choice */
  escribir?: boolean;
}
