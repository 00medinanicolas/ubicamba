/**
 * Comparación tolerante de respuestas escritas.
 *
 * La idea: el jugador escribe rápido y de memoria. Tiene que valer lo mismo
 * "colon" que "Teatro Colón", y "gotze" que "Mario Götze". Se aceptan:
 *   - mayúsculas y tildes de cualquier forma        ("GÜERRIN" = "güerrin")
 *   - puntuación y espacios de más                  ("el  ateneo!" = "El Ateneo")
 *   - erratas cortas                                ("tortoni" vs "tortonni")
 *   - respuestas incompletas por la palabra fuerte  ("bombonera" = "La Bombonera")
 *
 * Lo que NO se acepta es contestar sólo con la parte genérica: "biblioteca" no
 * alcanza para "Biblioteca Nacional Mariano Moreno", ni "estadio" para un estadio.
 * Para las formas idiomáticas que sí valen ("biblioteca nacional", "cck", "la
 * bombonera") cada lugar/pregunta declara sus `alias`.
 */

/** Minúsculas, sin tildes, sin puntuación; deja sólo letras, números y espacios. */
export function normalizar(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const sinEspacios = (s: string) => s.replace(/ /g, '');

/**
 * Palabras que no identifican por sí solas: categorías, artículos y preposiciones.
 * Si un nombre está hecho SÓLO de estas, no se descarta ninguna (p. ej. "Luna Park").
 */
const GENERICAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'e', 'en', 'al', 'a',
  'teatro', 'cine', 'museo', 'biblioteca', 'estadio', 'palacio', 'casa', 'bar',
  'cafe', 'confiteria', 'pizzeria', 'restaurante', 'monumento', 'plaza', 'parque',
  'centro', 'cultural', 'ciudad', 'nacional', 'provincia', 'buenos', 'aires',
  'republica', 'basilica', 'catedral', 'iglesia', 'puente', 'torre', 'don',
  'universidad', 'ministerio', 'municipalidad', 'gobierno', 'gran', 'gral',
  'gran', 'gral', 'san', 'santa', 'gpo',
]);

const tokens = (s: string) => normalizar(s).split(' ').filter(Boolean);

/** Tolerancia a erratas según el largo de la palabra. */
function tolerancia(largo: number): number {
  if (largo <= 4) return 0;
  if (largo <= 7) return 1;
  return 2;
}

/** Distancia de edición con corte temprano (no hace falta el valor exacto si ya se pasó). */
export function distancia(a: string, b: string, tope: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let mejorFila = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + costo);
      fila.push(v);
      if (v < mejorFila) mejorFila = v;
    }
    if (mejorFila > tope) return tope + 1;
    previa = fila;
  }
  return previa[b.length];
}

const pareceIgual = (a: string, b: string) => a === b || distancia(a, b, tolerancia(b.length)) <= tolerancia(b.length);

/** Palabras que identifican al nombre (las genéricas quedan afuera, salvo que sea todo genérico). */
export function clavesDe(nombre: string): string[] {
  const t = tokens(nombre);
  const fuertes = t.filter((p) => !GENERICAS.has(p) && p.length >= 3);
  return fuertes.length ? fuertes : t;
}

/** ¿`entrada` alcanza para dar por buena la respuesta `objetivo`? */
function coincideCon(entrada: string, objetivo: string): boolean {
  const e = normalizar(entrada);
  const o = normalizar(objetivo);
  if (!e || !o) return false;

  // 1. igual (o casi) ignorando espacios: cubre "elateneo" y erratas cortas
  const ep = sinEspacios(e);
  const op = sinEspacios(o);
  if (ep === op) return true;
  if (distancia(ep, op, tolerancia(op.length)) <= tolerancia(op.length)) return true;

  const te = tokens(e);
  const to = tokens(o);
  const claves = clavesDe(o);

  // 2. una sola palabra: tiene que ser la palabra FUERTE final (el "apellido").
  //    Así "gotze" vale por "Mario Götze" y "colon" por "Teatro Colón", pero
  //    "mario" o "teatro" solos no alcanzan.
  if (te.length === 1) {
    const ultima = claves[claves.length - 1];
    return !!ultima && ultima.length >= 4 && pareceIgual(te[0], ultima);
  }

  // 3. varias palabras: todas tienen que estar en el nombre y tienen que cubrir
  //    al menos una palabra fuerte. "biblioteca nacional" no alcanza para
  //    "Biblioteca Nacional Mariano Moreno" (sólo cubre genéricas).
  const todasEstan = te.every((p) => to.some((q) => pareceIgual(p, q)));
  const cubreFuerte = te.some((p) => claves.some((c) => pareceIgual(p, c)));
  return todasEstan && cubreFuerte;
}

/** Acepta si coincide con el nombre o con cualquiera de sus alias. */
export function aceptaRespuesta(entrada: string, nombre: string, alias: string[] = []): boolean {
  if (!normalizar(entrada)) return false;
  return [nombre, ...alias].some((o) => coincideCon(entrada, o));
}
