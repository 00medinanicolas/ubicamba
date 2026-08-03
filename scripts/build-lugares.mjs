// Dataset del modo "Lugares": sitios típicos de CABA y PBA.
//
// La LISTA es curada a mano (abajo); las COORDENADAS salen de OpenStreetMap, para
// no inventar ubicaciones. El script baja todos los elementos con nombre y tags
// relevantes del AMBA + La Plata + Luján y machea cada lugar por nombre normalizado.
//
// El macheo es EXACTO a propósito. La primera versión caía a subcadenas y macheaba
// basura (MALBA -> "B", Luna Park -> "UNA", Museo Evita -> "Evita"). Si un lugar no
// está en OSM con ese nombre, no se emite: se informa y se resuelve a mano poniéndole
// el campo `osm`. Cuando hay varios homónimos se desempata con `cerca: [lat,lng]`.
//
//   node scripts/build-lugares.mjs
//
// Salida: public/data/lugares-v1.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_SRC = join(ROOT, 'data-src');
const OUT = join(ROOT, 'public', 'data');
mkdirSync(DATA_SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

const HEADERS = { 'User-Agent': 'UbicAMBA/0.1 (juego didactico; datos OSM)' };
const ESPEJOS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// bbox: AMBA + La Plata + Luján
const BBOX = [-35.05, -59.32, -34.28, -57.85];

// ---------- la lista curada ----------
// cat:   monumento | estado | biblioteca | cultura | museo | comida | estadio
// zona:  caba | pba
// osm:   nombre exacto en OSM, cuando difiere del que se muestra
// cerca: [lat,lng] para desempatar homónimos
// alias: otras formas que se aceptan como respuesta escrita
const LISTA = [
  // --- CABA · monumentos e hitos ---
  { n: 'Obelisco', cat: 'monumento', zona: 'caba', alias: ['obelisco de buenos aires'] },
  { n: 'Floralis Genérica', cat: 'monumento', zona: 'caba', alias: ['floralis'] },
  { n: 'Torre Monumental', cat: 'monumento', zona: 'caba', osm: 'Torre de los Ingleses', alias: ['torre de los ingleses'] },
  { n: 'Monumento de los Españoles', cat: 'monumento', zona: 'caba', cerca: [-34.57497, -58.41506], alias: ['monumento a los españoles', 'carta magna'] },
  { n: 'Pirámide de Mayo', cat: 'monumento', zona: 'caba', cerca: [-34.60841, -58.37216] },
  { n: 'Puente de la Mujer', cat: 'monumento', zona: 'caba', cerca: [-34.60803, -58.36538] },
  { n: 'Planetario Galileo Galilei', cat: 'cultura', zona: 'caba', alias: ['planetario'] },
  { n: 'El Rosedal', cat: 'monumento', zona: 'caba', osm: 'Parque El Rosedal', alias: ['rosedal', 'rosedal de palermo'] },

  // --- CABA · edificios del Estado ---
  { n: 'Casa Rosada', cat: 'estado', zona: 'caba', alias: ['casa de gobierno'] },
  { n: 'Congreso de la Nación', cat: 'estado', zona: 'caba', osm: 'Congreso de la Nación Argentina', alias: ['congreso'] },
  { n: 'Palacio de Justicia', cat: 'estado', zona: 'caba', alias: ['tribunales', 'corte suprema'] },
  { n: 'Legislatura de la Ciudad', cat: 'estado', zona: 'caba', osm: 'Legislatura de la Ciudad Autónoma de Buenos Aires', alias: ['legislatura', 'legislatura porteña'] },
  { n: 'Palacio Barolo', cat: 'estado', zona: 'caba', alias: ['barolo'] },
  { n: 'Casa Nacional del Bicentenario', cat: 'cultura', zona: 'caba' },

  // --- CABA · bibliotecas ---
  { n: 'Biblioteca Nacional Mariano Moreno', cat: 'biblioteca', zona: 'caba', osm: 'Biblioteca Nacional', alias: ['biblioteca nacional'] },
  { n: 'Biblioteca del Congreso de la Nación', cat: 'biblioteca', zona: 'caba', osm: 'Biblioteca del Congreso de la Nación (BCN)', alias: ['biblioteca del congreso'] },
  { n: 'Biblioteca Nacional de Maestros', cat: 'biblioteca', zona: 'caba', osm: 'Biblioteca Nacional de los Maestros' },
  { n: 'El Ateneo Grand Splendid', cat: 'cultura', zona: 'caba', alias: ['el ateneo', 'ateneo'] },

  // --- CABA · cultura, teatros y cines ---
  { n: 'Teatro Colón', cat: 'cultura', zona: 'caba', alias: ['colon'] },
  { n: 'Teatro General San Martín', cat: 'cultura', zona: 'caba', alias: ['teatro san martin'] },
  { n: 'Palacio Libertad', cat: 'cultura', zona: 'caba', osm: 'Palacio Libertad - Domingo F. Sarmiento', alias: ['cck', 'centro cultural kirchner'] },
  { n: 'Centro Cultural Recoleta', cat: 'cultura', zona: 'caba' },
  { n: 'Ciudad Cultural Konex', cat: 'cultura', zona: 'caba', alias: ['konex'] },
  { n: 'Teatro Gran Rex', cat: 'cultura', zona: 'caba', osm: 'Gran Rex', alias: ['gran rex'] },
  { n: 'Teatro Ópera', cat: 'cultura', zona: 'caba', osm: 'Opera Allianz', alias: ['opera', 'opera allianz'] },
  { n: 'Cine Gaumont', cat: 'cultura', zona: 'caba', osm: 'Espacio INCAA KM 0 - Gaumont', alias: ['gaumont'] },
  { n: 'Luna Park', cat: 'cultura', zona: 'caba', osm: 'Stadium Luna Park' },

  // --- CABA · museos ---
  { n: 'Museo Nacional de Bellas Artes', cat: 'museo', zona: 'caba', alias: ['bellas artes', 'mnba'] },
  { n: 'MALBA', cat: 'museo', zona: 'caba', osm: 'Museo de Arte Latinoamericano de Buenos Aires (MALBA)', alias: ['museo de arte latinoamericano de buenos aires'] },
  { n: 'Museo Evita', cat: 'museo', zona: 'caba', osm: 'Museo Evita - Instituto Nacional Eva Perón De Investigaciones Históricas' },

  // --- CABA · comida típica y bares notables ---
  { n: 'Café Tortoni', cat: 'comida', zona: 'caba', alias: ['tortoni'] },
  { n: 'Pizzería Güerrin', cat: 'comida', zona: 'caba', osm: 'Güerrín', alias: ['guerrin'] },
  { n: 'El Cuartito', cat: 'comida', zona: 'caba' },
  { n: 'Las Violetas', cat: 'comida', zona: 'caba' },
  { n: 'Café La Biela', cat: 'comida', zona: 'caba', alias: ['la biela'] },
  { n: 'Confitería El Molino', cat: 'comida', zona: 'caba', alias: ['el molino'] },
  { n: 'Los 36 Billares', cat: 'comida', zona: 'caba' },
  { n: 'Bar El Federal', cat: 'comida', zona: 'caba', osm: 'El Federal', alias: ['el federal'] },
  { n: 'La Poesía', cat: 'comida', zona: 'caba' },
  { n: 'El Preferido de Palermo', cat: 'comida', zona: 'caba', alias: ['el preferido'] },
  { n: 'Don Julio', cat: 'comida', zona: 'caba', cerca: [-34.58629, -58.42428] },
  { n: 'La Brigada', cat: 'comida', zona: 'caba' },
  { n: 'Pizzería Banchero', cat: 'comida', zona: 'caba', osm: 'Banchero', cerca: [-34.60405, -58.38498], alias: ['banchero'] },
  { n: 'El Obrero', cat: 'comida', zona: 'caba', cerca: [-34.62968, -58.35683] },
  { n: 'Los Inmortales', cat: 'comida', zona: 'caba', osm: 'Los Inmortales - Corrientes', alias: ['los inmortales'] },

  // --- CABA · estadios ---
  { n: 'La Bombonera', cat: 'estadio', zona: 'caba', alias: ['estadio alberto j armando', 'bombonera', 'boca'] },
  { n: 'Estadio Más Monumental', cat: 'estadio', zona: 'caba', osm: 'Estadio Monumental', cerca: [-34.54532, -58.44966], alias: ['monumental', 'estadio monumental', 'river'] },
  { n: 'Estadio Tomás Adolfo Ducó', cat: 'estadio', zona: 'caba', alias: ['el palacio', 'huracan', 'duco'] },
  { n: 'Estadio Pedro Bidegain', cat: 'estadio', zona: 'caba', alias: ['nuevo gasometro', 'san lorenzo', 'bidegain'] },

  // --- PBA ---
  { n: 'Catedral de La Plata', cat: 'monumento', zona: 'pba', osm: 'Iglesia Catedral Nuestra Señora de los Dolores' },
  { n: 'Museo de La Plata', cat: 'museo', zona: 'pba', osm: 'Museo de Ciencias Naturales', cerca: [-34.90899, -57.93546], alias: ['museo de ciencias naturales'] },
  { n: 'Casa de Gobierno de la Provincia de Buenos Aires', cat: 'estado', zona: 'pba', alias: ['casa de gobierno de la provincia'] },
  { n: 'Municipalidad de La Plata', cat: 'estado', zona: 'pba', cerca: [-34.92005, -57.95306], alias: ['palacio municipal de la plata'] },
  { n: 'Teatro Argentino de La Plata', cat: 'cultura', zona: 'pba', osm: 'Teatro Argentino', alias: ['teatro argentino'] },
  { n: 'República de los Niños', cat: 'cultura', zona: 'pba' },
  { n: 'Estadio Único Diego Armando Maradona', cat: 'estadio', zona: 'pba', alias: ['estadio unico', 'estadio ciudad de la plata'] },
  { n: 'Basílica de Luján', cat: 'monumento', zona: 'pba', osm: 'Basílica Nuestra Señora de Luján' },
  { n: 'Puerto de Frutos', cat: 'cultura', zona: 'pba', alias: ['puerto de frutos de tigre'] },
  { n: 'Museo de Arte Tigre', cat: 'museo', zona: 'pba', alias: ['mat'] },
  { n: 'Estadio Libertadores de América', cat: 'estadio', zona: 'pba', osm: 'Estadio Libertadores de América - Ricardo Enrique Bochini', alias: ['independiente'] },
];

// ---------- utilidades ----------
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  for (const url of ESPEJOS) {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: HEADERS,
          body: 'data=' + encodeURIComponent(query),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        console.log('  ' + url.split('/')[2] + ' falló (' + e.message + ')');
        await dormir(2500);
      }
    }
  }
  throw new Error('Overpass agotado');
}

// ---------- 1. bajar candidatos ----------
const CACHE = join(DATA_SRC, 'osm-lugares.json');
let crudo;
if (existsSync(CACHE)) {
  console.log('Usando cache data-src/osm-lugares.json');
  crudo = JSON.parse(readFileSync(CACHE, 'utf8'));
} else {
  const [s, w, n, e] = BBOX;
  const filtros = [
    'amenity~"^(restaurant|cafe|bar|pub|fast_food|theatre|library|arts_centre|cinema|townhall|courthouse|place_of_worship)$"',
    'tourism~"^(museum|attraction|artwork|viewpoint)$"',
    'historic~"^(monument|memorial|building|castle)$"',
    'building~"^(government|palace|cathedral|stadium|civic)$"',
    'leisure~"^(stadium|park)$"',
    'office="government"',
    'amenity="university"',
  ];
  const cuerpo = filtros.map((f) => 'nwr["name"][' + f + '](' + s + ',' + w + ',' + n + ',' + e + ');').join('\n  ');
  const query = '[out:json][timeout:600];\n(\n  ' + cuerpo + '\n);\nout center tags;';
  console.log('Consultando Overpass (puede tardar varios minutos)…');
  crudo = await overpass(query);
  writeFileSync(CACHE, JSON.stringify(crudo));
  console.log('  ' + crudo.elements.length + ' elementos guardados en cache');
}

// ---------- 2. indexar por nombre (TODOS los homónimos) ----------
const porNombre = new Map();
for (const el of crudo.elements) {
  const nombre = el.tags && el.tags.name;
  if (!nombre) continue;
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lng = el.lon != null ? el.lon : el.center && el.center.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') continue;
  const clave = norm(nombre);
  if (!porNombre.has(clave)) porNombre.set(clave, []);
  porNombre.get(clave).push({ nombre, lat, lng, peso: Object.keys(el.tags).length });
}
console.log('Índice: ' + porNombre.size + ' nombres distintos.');

// ---------- 3. resolver ----------
const resueltos = [];
const fallados = [];
const ambiguos = [];
for (const item of LISTA) {
  const cands = porNombre.get(norm(item.osm || item.n));
  if (!cands || !cands.length) { fallados.push(item.n); continue; }
  let hit;
  if (item.cerca) {
    const [la, lo] = item.cerca;
    const d2 = (c) => (c.lat - la) ** 2 + (c.lng - lo) ** 2;
    hit = cands.reduce((a, b) => (d2(a) <= d2(b) ? a : b));
    if (Math.sqrt(d2(hit)) > 0.01) { fallados.push(item.n + ' (el más cercano quedó lejos)'); continue; }
  } else if (cands.length === 1) {
    hit = cands[0];
  } else {
    ambiguos.push(item.n + ' — ' + cands.length + ' homónimos; agregar `cerca`');
    continue;
  }
  resueltos.push({
    n: item.n,
    cat: item.cat,
    z: item.zona,
    lat: +hit.lat.toFixed(6),
    lng: +hit.lng.toFixed(6),
    ...(item.alias && item.alias.length ? { a: item.alias } : {}),
    osm: hit.nombre,
  });
}

// ---------- 4. informe y salida ----------
console.log('\nResueltos: ' + resueltos.length + ' / ' + LISTA.length);
if (fallados.length) console.log('\nNO están en OSM con ese nombre (no se emiten):\n  - ' + fallados.join('\n  - '));
if (ambiguos.length) console.log('\nAMBIGUOS (no se emiten):\n  - ' + ambiguos.join('\n  - '));
const distinto = resueltos.filter((r) => norm(r.osm) !== norm(r.n));
if (distinto.length) {
  console.log('\nSe muestran con nombre propio, distinto al de OSM (a propósito):');
  for (const d of distinto) console.log('  ' + d.n + '  <-  OSM: ' + d.osm);
}
const porCat = {};
for (const r of resueltos) porCat[r.cat] = (porCat[r.cat] || 0) + 1;
console.log('\nPor categoría: ' + JSON.stringify(porCat));
console.log('Por zona: ' + JSON.stringify(resueltos.reduce((a, r) => ((a[r.z] = (a[r.z] || 0) + 1), a), {})));

writeFileSync(
  join(OUT, 'lugares-v1.json'),
  JSON.stringify({ version: 'lugares-v1', lugares: resueltos.map(({ osm, ...r }) => r) })
);
console.log('\nEscrito public/data/lugares-v1.json');
