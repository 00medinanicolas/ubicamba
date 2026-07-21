import type { Esquina, Modo } from './tipos';

export const RONDAS = 5;
export const PUNTOS_MAX = RONDAS * 100;

/** Época del "mapa del día" (UTC). Cambiarla reinicia la numeración de días. */
const EPOCA = Date.UTC(2026, 0, 1);
const DIA_MS = 86_400_000;

export function numeroDia(fecha: Date): number {
  const utc = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return Math.floor((utc - EPOCA) / DIA_MS);
}

/** Mapa del día: bloque de 5 esquinas consecutivas del array pre-mezclado. */
export function indicesDelDia(dia: number, total: number): number[] {
  const bloques = Math.floor(total / RONDAS);
  const inicio = (((dia % bloques) + bloques) % bloques) * RONDAS;
  return Array.from({ length: RONDAS }, (_, i) => inicio + i);
}

export function indicesAlAzar(total: number, cantidad = RONDAS): number[] {
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, cantidad);
}

export function indicesPorBarrios(esquinas: Esquina[], barrios: number[]): number[] {
  const set = new Set(barrios);
  const pool: number[] = [];
  esquinas.forEach((e, i) => {
    if (set.has(e.b)) pool.push(i);
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, RONDAS);
}

// ---------- distancia y puntaje ----------
const rad = (g: number) => (g * Math.PI) / 180;

export function distanciaM(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** ≤50 m = 100 puntos; después se pierde 1 punto cada 66 m (0 pts a ~6,6 km). */
export function puntosPorDistancia(m: number): number {
  return m <= 50 ? 100 : Math.max(0, 100 - Math.floor((m - 50) / 66));
}

export function emojiPuntos(p: number): string {
  if (p === 100) return '🎯';
  if (p >= 90) return '🔥';
  if (p >= 80) return '🏆';
  if (p >= 60) return '👍';
  if (p >= 40) return '🤙';
  if (p >= 20) return '😛';
  return '😂';
}

export function nombreEsquina(e: Esquina): string {
  return e.s2 ? `${e.s1} y ${e.s2}` : e.s1;
}

// ---------- share por URL (misma semántica que UbiCABA: índices 1-based) ----------
export function urlCompartir(indices: number[], barrios?: number[]): string {
  const base = `/?e=${indices.map((i) => i + 1).join('-')}`;
  return barrios && barrios.length ? `${base}&barrios=${barrios.join('-')}` : base;
}

export interface PartidaDeURL {
  indices: number[];
  modo: Modo;
  barriosSel: number[];
}

export function leerURL(totalEsquinas: number, esquinas: Esquina[], barriosValidos: Set<number>): PartidaDeURL | null {
  const params = new URLSearchParams(window.location.search);
  const e = params.get('e');
  if (!e) return null;
  const partes = e.split('-').map(Number);
  if (partes.length !== RONDAS) return null;
  const indices = partes.map((n) => n - 1);
  if (!indices.every((i) => Number.isInteger(i) && i >= 0 && i < totalEsquinas)) return null;

  const b = params.get('barrios');
  if (b) {
    const ids = b.split('-').map(Number);
    if (ids.length && ids.every((id) => barriosValidos.has(id)) && indices.every((i) => ids.includes(esquinas[i].b))) {
      return { indices, modo: 'personalizada', barriosSel: ids };
    }
  }
  return { indices, modo: 'link', barriosSel: [] };
}
