// Motor de la mecánica "armá tu viaje": el jugador navega la red real
// (red-v1.json) con el MISMO modelo de costos del Dijkstra del pipeline:
// subir = espera de la línea · viajar = tiempos por tramo · bajar = penalBajar ·
// caminar = minutos de la conexión. Así su viaje armado es comparable 1:1
// con el óptimo precomputado del desafío.

import type { RedTransporte } from './tipos';

export interface LegArmado {
  tipo: 'linea' | 'caminar';
  li?: number;
  nombre: string;
  color: string;
  red?: 'subte' | 'tren';
  desdeIdx: number;
  hastaIdx: number;
  min: number;
  /** índices de estación recorridos, extremos incluidos */
  estaciones: number[];
}

export interface EstadoArmado {
  actual: number;
  legs: LegArmado[];
  minutos: number;
}

export function estadoInicial(origen: number): EstadoArmado {
  return { actual: origen, legs: [], minutos: 0 };
}

export interface OpcionLinea {
  li: number;
  pos: number;
  nombre: string;
  color: string;
  red: 'subte' | 'tren';
  hacia: string;
}

export interface OpcionCaminata {
  hasta: number;
  nombre: string;
  red: 'subte' | 'tren';
  min: number;
}

export function opcionesDesde(red: RedTransporte, actual: number): { lineas: OpcionLinea[]; caminatas: OpcionCaminata[] } {
  const lineas: OpcionLinea[] = [];
  red.lineas.forEach((l, li) => {
    const pos = l.sec.indexOf(actual);
    if (pos >= 0 && pos < l.sec.length - 1) {
      lineas.push({
        li,
        pos,
        nombre: l.nombre,
        color: l.color,
        red: l.red,
        hacia: red.estaciones[l.sec[l.sec.length - 1]].n,
      });
    }
  });
  const caminatas: OpcionCaminata[] = [];
  for (const [a, b, min] of red.caminatas) {
    const hasta = a === actual ? b : b === actual ? a : -1;
    if (hasta >= 0) {
      const est = red.estaciones[hasta];
      caminatas.push({ hasta, nombre: est.n, red: est.r, min });
    }
  }
  return { lineas, caminatas };
}

export interface Bajada {
  posFin: number;
  idx: number;
  nombre: string;
  paradas: number;
}

export function bajadasDe(red: RedTransporte, li: number, pos: number): Bajada[] {
  const l = red.lineas[li];
  const out: Bajada[] = [];
  for (let p = pos + 1; p < l.sec.length; p++) {
    out.push({ posFin: p, idx: l.sec[p], nombre: red.estaciones[l.sec[p]].n, paradas: p - pos });
  }
  return out;
}

export function tomarLinea(red: RedTransporte, estado: EstadoArmado, li: number, pos: number, posFin: number): EstadoArmado {
  const l = red.lineas[li];
  let viaje = 0;
  for (let p = pos; p < posFin; p++) viaje += l.hops[p];
  const min = l.espera + viaje + red.penalBajar;
  const leg: LegArmado = {
    tipo: 'linea',
    li,
    nombre: l.nombre,
    color: l.color,
    red: l.red,
    desdeIdx: estado.actual,
    hastaIdx: l.sec[posFin],
    min,
    estaciones: l.sec.slice(pos, posFin + 1),
  };
  return { actual: leg.hastaIdx, legs: [...estado.legs, leg], minutos: estado.minutos + min };
}

export function caminar(estado: EstadoArmado, hasta: number, min: number): EstadoArmado {
  const leg: LegArmado = {
    tipo: 'caminar',
    nombre: 'a pie',
    color: '#94a3b8',
    desdeIdx: estado.actual,
    hastaIdx: hasta,
    min,
    estaciones: [estado.actual, hasta],
  };
  return { actual: hasta, legs: [...estado.legs, leg], minutos: estado.minutos + min };
}

export function deshacer(estado: EstadoArmado): EstadoArmado {
  if (!estado.legs.length) return estado;
  const legs = estado.legs.slice(0, -1);
  const ultimo = estado.legs[estado.legs.length - 1];
  return {
    actual: legs.length ? legs[legs.length - 1].hastaIdx : ultimo.desdeIdx,
    legs,
    minutos: estado.minutos - ultimo.min,
  };
}

/** Dibuja cualquier lista de tramos (armados por el jugador o precomputados) sobre el mapa. */
export function fcDeEst(
  red: RedTransporte,
  legs: { estaciones?: number[]; est?: number[] }[]
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: legs
      .map((l) => l.estaciones ?? l.est ?? [])
      .filter((est) => est.length >= 2)
      .map((est) => ({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: est.map((i) => [red.estaciones[i].lng, red.estaciones[i].lat]),
        },
      })),
  };
}

export function resumenLegs(legs: LegArmado[]): string {
  const viajes = legs.filter((l) => l.tipo === 'linea').map((l) => l.nombre);
  return viajes.length ? viajes.join(' → ') : 'a pie';
}
