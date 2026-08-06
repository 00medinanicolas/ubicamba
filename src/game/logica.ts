import type { Avenida, DesafioTransporte, Esquina, Juego, Lugar, ZonaId } from './tipos';
import { esZonaId } from './zonas';

/** Tanda base: las partidas se arman en múltiplos de 5 rondas (5, 10, 15, 20). */
export const RONDAS = 5;
export const TANDAS = [5, 10, 15, 20];
export const MAX_RONDAS = 40;

/** Época del "mapa del día" (UTC). Cambiarla reinicia la numeración de días. */
const EPOCA = Date.UTC(2026, 0, 1);
const DIA_MS = 86_400_000;

export function numeroDia(fecha: Date): number {
  const utc = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return Math.floor((utc - EPOCA) / DIA_MS);
}

export function fechaDeDia(dia: number): Date {
  return new Date(EPOCA + dia * DIA_MS);
}

/** Mapa del día: bloque de 5 esquinas consecutivas del array pre-mezclado. */
export function indicesDelDia(dia: number, total: number): number[] {
  const bloques = Math.floor(total / RONDAS);
  const inicio = (((dia % bloques) + bloques) % bloques) * RONDAS;
  return Array.from({ length: RONDAS }, (_, i) => inicio + i);
}

function mezclar<T>(arr: T[], rnd: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function indicesAlAzar(total: number, cantidad = RONDAS): number[] {
  return mezclar(Array.from({ length: total }, (_, i) => i)).slice(0, cantidad);
}

/**
 * Índices de desafíos A→B al azar, respetando la mecánica.
 *
 * "Elegir el itinerario" necesita alternativas plausibles: los viajes marcados
 * `soloArmar` tienen una sola opción (o menos de las que pide su nivel de
 * combinaciones), así que preguntar "¿cómo conviene ir?" sobre ellos no es una
 * pregunta —son 100 puntos regalados—. En "armá tu viaje" sí valen: ahí no se
 * elige entre alternativas sino que se arma el recorrido paso a paso.
 *
 * El panel ya filtraba esto (ver filtrarDesafios), pero el sorteo al azar —el
 * que corre al entrar por un link `?j=tr` y al tocar "Jugar otra"— sorteaba
 * sobre el dataset entero.
 */
export function indicesTransporteAlAzar(
  desafios: DesafioTransporte[],
  juego: Juego,
  cantidad = RONDAS
): number[] {
  const pool: number[] = [];
  desafios.forEach((d, i) => {
    if (juego === 'transporte' && d.soloArmar) return;
    pool.push(i);
  });
  return mezclar(pool).slice(0, cantidad);
}

export function indicesPorAreas(esquinas: Esquina[], areas: number[], cantidad = RONDAS): number[] {
  const set = new Set(areas);
  const pool: number[] = [];
  esquinas.forEach((e, i) => {
    if (set.has(e.b)) pool.push(i);
  });
  return mezclar(pool).slice(0, cantidad);
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

// ---------- opciones del modo Avenidas (determinísticas por índice) ----------
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 4 opciones (la correcta + 3 señuelos), iguales para todos los que jueguen este índice. */
export function opcionesAvenida(avenidas: Avenida[], idx: number): string[] {
  const rnd = mulberry32(idx * 7919 + 20260721);
  const opciones = [avenidas[idx].nombre];
  const usados = new Set([idx]);
  while (opciones.length < 4 && usados.size < avenidas.length) {
    const j = Math.floor(rnd() * avenidas.length);
    if (usados.has(j)) continue;
    usados.add(j);
    opciones.push(avenidas[j].nombre);
  }
  return mezclar(opciones, rnd);
}

// ---------- modo Lugares ----------
/**
 * 4 opciones (la correcta + 3 señuelos), iguales para todos los que jueguen este índice.
 * Los señuelos salen primero de la MISMA categoría: si no, la pregunta se contesta sola
 * ("¿cuál de estas cuatro es una pizzería?").
 */
export function opcionesLugar(lugares: Lugar[], idx: number): string[] {
  const rnd = mulberry32(idx * 6151 + 20260803);
  const correcta = lugares[idx];
  const opciones = [correcta.n];
  const usados = new Set([idx]);
  const tomar = (pool: number[]) => {
    let guarda = 0;
    while (opciones.length < 4 && guarda++ < 400 && pool.some((i) => !usados.has(i))) {
      const j = pool[Math.floor(rnd() * pool.length)];
      if (usados.has(j)) continue;
      usados.add(j);
      opciones.push(lugares[j].n);
    }
  };
  const indices = lugares.map((_, i) => i);
  tomar(indices.filter((i) => i !== idx && lugares[i].cat === correcta.cat));
  tomar(indices.filter((i) => i !== idx));
  return mezclar(opciones, rnd);
}

// ---------- modo Comunas y Localidades ----------
/** 4 opciones (la correcta + 3 senuelos) tomadas de la misma coleccion. */
export function opcionesArea(nombres: string[], idx: number): string[] {
  const rnd = mulberry32(idx * 7919 + 20260806);
  const opciones = [nombres[idx]];
  const usados = new Set([idx]);
  let guarda = 0;
  while (opciones.length < 4 && guarda++ < 400 && usados.size < nombres.length) {
    const j = Math.floor(rnd() * nombres.length);
    if (usados.has(j)) continue;
    usados.add(j);
    opciones.push(nombres[j]);
  }
  return mezclar(opciones, rnd);
}

/** Indices al azar de la coleccion de areas, sin repetir. */
export function indicesAreasAlAzar(total: number, cuantas: number): number[] {
  const todos = Array.from({ length: total }, (_, i) => i);
  for (let i = todos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [todos[i], todos[j]] = [todos[j], todos[i]];
  }
  return todos.slice(0, Math.min(cuantas, total));
}

/** Índices al azar filtrando por categoría y zona (listas vacías = sin filtrar). */
export function indicesLugaresAlAzar(
  lugares: Lugar[],
  cats: string[],
  zonas: string[],
  cantidad = RONDAS
): number[] {
  const pool: number[] = [];
  lugares.forEach((l, i) => {
    if (cats.length && !cats.includes(l.cat)) return;
    if (zonas.length && !zonas.includes(l.z)) return;
    pool.push(i);
  });
  return mezclar(pool).slice(0, cantidad);
}

// ---------- share por URL ----------
export interface ParamsPartida {
  zona: ZonaId;
  juego: Juego;
  indices: number[] | null;
  areasParam: number[] | null;
  /** modo Lugares: se escribe la respuesta en vez de elegirla */
  escribir: boolean;
}

/** Devuelve solo el query string ("?z=…&e=…"); el path lo pone quien lo usa (en Pages la app vive bajo un subpath). */
export function urlCompartir(
  indices: number[],
  opts: { zona: ZonaId; juego: Juego; areas?: number[]; escribir?: boolean }
): string {
  const p = new URLSearchParams();
  if (opts.zona !== 'caba') p.set('z', opts.zona);
  if (opts.juego === 'avenidas') p.set('j', 'av');
  if (opts.juego === 'transporte') p.set('j', 'tr');
  if (opts.juego === 'armar') p.set('j', 'ar');
  if (opts.juego === 'lugares') p.set('j', 'lu');
  // la modalidad viaja en el link: el que lo abre juega el mismo desafío
  if (opts.juego === 'lugares' && opts.escribir) p.set('m', 'esc');
  p.set('e', indices.map((i) => i + 1).join('-'));
  if (opts.areas?.length) p.set('areas', opts.areas.join('-'));
  return '?' + p.toString();
}

/** Lectura cruda de la URL; la validación contra el dataset la hace App al cargar los datos. */
export function parseURL(): ParamsPartida {
  const p = new URLSearchParams(window.location.search);
  const z = p.get('z');
  const zona: ZonaId = esZonaId(z) ? z : 'caba';
  const j = p.get('j');
  const juego: Juego =
    j === 'av' ? 'avenidas'
    : j === 'tr' ? 'transporte'
    : j === 'ar' ? 'armar'
    : j === 'lu' ? 'lugares'
    : 'esquinas';
  const escribir = p.get('m') === 'esc';

  let indices: number[] | null = null;
  const e = p.get('e');
  if (e) {
    const partes = e.split('-').map(Number);
    const largoValido = partes.length >= RONDAS && partes.length <= MAX_RONDAS && partes.length % RONDAS === 0;
    if (largoValido && partes.every((n) => Number.isInteger(n) && n >= 1)) {
      indices = partes.map((n) => n - 1);
    }
  }

  let areasParam: number[] | null = null;
  const a = p.get('areas');
  if (a) {
    const ids = a.split('-').map(Number);
    if (ids.length && ids.every((n) => Number.isInteger(n) && n >= 1)) areasParam = ids;
  }

  // avenidas, transporte y lugares son juegos de red completa: parten de la vista CABA
  const juegoFinal: Juego = juego !== 'esquinas' && zona !== 'caba' ? 'esquinas' : juego;
  return {
    zona: juego === 'transporte' || juego === 'lugares' ? 'caba' : zona,
    juego: juegoFinal,
    indices,
    areasParam,
    escribir,
  };
}
