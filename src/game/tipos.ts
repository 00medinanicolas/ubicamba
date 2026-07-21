export interface Esquina {
  s1: string;
  s2: string;
  lat: number;
  lng: number;
  /** id de barrio (1..48), ver barrios.json */
  b: number;
}

export interface Barrio {
  id: number;
  nombre: string;
  comuna: number;
}

/** 'link' cubre tanto la práctica como las partidas abiertas desde un link compartido. */
export type Modo = 'dia' | 'link' | 'personalizada';

export type Fase = 'adivinando' | 'revelada' | 'terminado';

export interface Resultado {
  /** índice de la esquina dentro del dataset */
  idx: number;
  guess: [number, number]; // [lat, lng]
  distancia: number; // metros
  puntos: number;
}

export interface Sesion {
  indices: number[];
  modo: Modo;
  barriosSel: number[];
  ronda: number;
  fase: Fase;
  resultados: Resultado[];
}
