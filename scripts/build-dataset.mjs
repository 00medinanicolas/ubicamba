// Genera el dataset de esquinas de CABA desde OpenStreetMap (Overpass) y
// asigna barrio/comuna con los polígonos oficiales de BA Data.
//
// Salidas:
//   src/data/esquinas.json  — [{s1, s2, lat, lng, b}] pre-mezclado (seed fija)
//   src/data/barrios.json   — [{id, nombre, comuna}]
//
// Uso: node scripts/build-dataset.mjs
// La respuesta cruda de Overpass se cachea en data-src/osm-calles.json.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data-src', 'osm-calles.json');
const SEED = 20260721;
const TARGET_TOTAL = 4800;
const CAP_POR_BARRIO = 150;
const CLUSTER_M = 120; // nodos de la misma dupla de calles a menos de esto = una sola esquina

// ---------- barrios canónicos (id estable, nombre con acentos, comuna) ----------
const BARRIOS = [
  ['Constitución', 1], ['Monserrat', 1], ['Puerto Madero', 1], ['Retiro', 1], ['San Nicolás', 1], ['San Telmo', 1],
  ['Recoleta', 2],
  ['Balvanera', 3], ['San Cristóbal', 3],
  ['Barracas', 4], ['La Boca', 4], ['Nueva Pompeya', 4], ['Parque Patricios', 4],
  ['Almagro', 5], ['Boedo', 5],
  ['Caballito', 6],
  ['Flores', 7], ['Parque Chacabuco', 7],
  ['Villa Lugano', 8], ['Villa Riachuelo', 8], ['Villa Soldati', 8],
  ['Liniers', 9], ['Mataderos', 9], ['Parque Avellaneda', 9],
  ['Floresta', 10], ['Monte Castro', 10], ['Vélez Sársfield', 10], ['Versalles', 10], ['Villa Luro', 10], ['Villa Real', 10],
  ['Villa del Parque', 11], ['Villa Devoto', 11], ['Villa General Mitre', 11], ['Villa Santa Rita', 11],
  ['Coghlan', 12], ['Saavedra', 12], ['Villa Pueyrredón', 12], ['Villa Urquiza', 12],
  ['Belgrano', 13], ['Colegiales', 13], ['Núñez', 13],
  ['Palermo', 14],
  ['Agronomía', 15], ['Chacarita', 15], ['La Paternal', 15], ['Parque Chas', 15], ['Villa Crespo', 15], ['Villa Ortúzar', 15],
].map(([nombre, comuna], i) => ({ id: i + 1, nombre, comuna }));

const normalizar = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '').replace(/\bgral\b/g, 'general').replace(/\s+/g, ' ').trim();
const BARRIO_POR_CLAVE = new Map(BARRIOS.map((b) => [normalizar(b.nombre), b]));
// alias del dataset oficial
BARRIO_POR_CLAVE.set('paternal', BARRIO_POR_CLAVE.get('la paternal'));

// ---------- PRNG con semilla (reproducible) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- distancia ----------
const rad = (d) => (d * Math.PI) / 180;
function metros(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

// ---------- point-in-polygon (ray casting) ----------
function dentroDeAnillo(lng, lat, ring) {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function dentroDePoligono(lng, lat, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys) {
    if (dentroDeAnillo(lng, lat, rings[0]) && !rings.slice(1).some((h) => dentroDeAnillo(lng, lat, h))) return true;
  }
  return false;
}

// ---------- 1. datos OSM (con caché) ----------
async function datosOSM() {
  if (existsSync(CACHE)) {
    console.log('Usando caché', CACHE);
    return JSON.parse(readFileSync(CACHE, 'utf8'));
  }
  // bbox de CABA con un margen chico; el recorte fino lo hace el PiP con barrios oficiales
  const query = `[out:json][timeout:240][bbox:-34.712,-58.54,-34.52,-58.32];
way["highway"~"^(primary|secondary|tertiary|residential|living_street|unclassified|pedestrian)$"]["name"];
out body;
>;
out skel qt;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];
  for (let intento = 0; intento < 2; intento++) {
    for (const url of endpoints) {
      try {
        console.log('Consultando Overpass:', url);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'ubicamba-dataset/1.0 (juego educativo; contacto: 00medina.nicolas@gmail.com)',
            Accept: 'application/json',
          },
          body: 'data=' + encodeURIComponent(query),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.elements?.length) throw new Error('respuesta vacía' + (json.remark ? ` (${json.remark})` : ''));
        writeFileSync(CACHE, JSON.stringify(json));
        return json;
      } catch (e) {
        console.warn('  falló:', e.message);
      }
    }
    console.log('Reintentando en 20 s...');
    await new Promise((r) => setTimeout(r, 20000));
  }
  throw new Error('No se pudo descargar de Overpass');
}

const osm = await datosOSM();
const nodos = new Map(); // id -> [lng, lat]
const vias = [];
for (const el of osm.elements) {
  if (el.type === 'node') nodos.set(el.id, [el.lon, el.lat]);
  else if (el.type === 'way' && el.tags?.name) vias.push(el);
}
console.log(`OSM: ${vias.length} vías con nombre, ${nodos.size} nodos`);

// ---------- 2. nodos compartidos por >=2 nombres distintos ----------
const porNodo = new Map(); // nodeId -> Set(nombres)
for (const via of vias) {
  const nombre = via.tags.name.trim();
  if (/sin nombre/i.test(nombre)) continue;
  for (const ref of via.nodes) {
    let set = porNodo.get(ref);
    if (!set) porNodo.set(ref, (set = new Set()));
    set.add(nombre);
  }
}
const candidatos = [];
for (const [id, nombres] of porNodo) {
  if (nombres.size < 2) continue;
  const coord = nodos.get(id);
  if (coord) candidatos.push({ coord, nombres: [...nombres] });
}
console.log('Nodos-esquina candidatos:', candidatos.length);

// ---------- 3. una esquina por dupla de calles (centroide de nodos cercanos) ----------
// Una avenida con carriles separados cruza una calle en 2+ nodos: los agrupamos.
const porDupla = new Map(); // "a||b" -> [{lng,lat}...] en clusters
for (const { coord, nombres } of candidatos) {
  const orden = [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  for (let i = 0; i < orden.length; i++) {
    for (let j = i + 1; j < orden.length; j++) {
      const clave = orden[i] + '||' + orden[j];
      let clusters = porDupla.get(clave);
      if (!clusters) porDupla.set(clave, (clusters = []));
      const cercano = clusters.find((c) =>
        metros(c.lat / c.n, c.lng / c.n, coord[1], coord[0]) < CLUSTER_M
      );
      if (cercano) { cercano.lng += coord[0]; cercano.lat += coord[1]; cercano.n++; }
      else clusters.push({ lng: coord[0], lat: coord[1], n: 1 });
    }
  }
}
const esquinasCrudas = [];
for (const [clave, clusters] of porDupla) {
  const [s1, s2] = clave.split('||');
  for (const c of clusters) {
    esquinasCrudas.push({ s1, s2, lat: c.lat / c.n, lng: c.lng / c.n });
  }
}
console.log('Esquinas únicas (por dupla+ubicación):', esquinasCrudas.length);

// ---------- 4. asignar barrio y comuna con polígonos oficiales ----------
const barriosFC = JSON.parse(readFileSync(join(ROOT, 'data-src', 'barrios.geojson'), 'utf8'));
const poligonos = [];
for (const f of barriosFC.features) {
  const b = BARRIO_POR_CLAVE.get(normalizar(f.properties.nombre));
  if (!b) { console.warn('Barrio oficial sin match:', f.properties.nombre); continue; }
  // bbox para descartar rápido
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const rings of polys) for (const [x, y] of rings[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  poligonos.push({ b, geom: f.geometry, minX, minY, maxX, maxY });
}
if (poligonos.length !== 48) console.warn('OJO: se esperaban 48 barrios, hay', poligonos.length);

let fuera = 0;
const esquinas = [];
for (const e of esquinasCrudas) {
  const p = poligonos.find(
    (p) => e.lng >= p.minX && e.lng <= p.maxX && e.lat >= p.minY && e.lat <= p.maxY &&
      dentroDePoligono(e.lng, e.lat, p.geom)
  );
  if (!p) { fuera++; continue; }
  esquinas.push({ s1: e.s1, s2: e.s2, lat: +e.lat.toFixed(7), lng: +e.lng.toFixed(7), b: p.b.id });
}
console.log(`Con barrio asignado: ${esquinas.length} (descartadas fuera de CABA: ${fuera})`);

// ---------- 5. balancear por barrio y mezclar con semilla ----------
const rnd = mulberry32(SEED);
const porBarrio = new Map();
for (const e of esquinas) {
  let arr = porBarrio.get(e.b);
  if (!arr) porBarrio.set(e.b, (arr = []));
  arr.push(e);
}
let seleccion = [];
for (const [, arr] of [...porBarrio.entries()].sort((a, b) => a[0] - b[0])) {
  shuffle(arr, rnd);
  seleccion.push(...arr.slice(0, CAP_POR_BARRIO));
}
if (seleccion.length > TARGET_TOTAL) {
  shuffle(seleccion, rnd);
  seleccion = seleccion.slice(0, TARGET_TOTAL);
}
shuffle(seleccion, rnd); // orden final pre-mezclado: habilita "mapa del día" por bloques

// ---------- 6. emitir ----------
const outDir = join(ROOT, 'src', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'esquinas.json'), JSON.stringify(seleccion));
writeFileSync(join(outDir, 'barrios.json'), JSON.stringify(BARRIOS));

// ---------- 7. overlays didácticos: comunas y barrios simplificados + etiquetas ----------
function simplificarRing(ring, tol) {
  // Douglas-Peucker sobre grados, con lng compensado por latitud
  const kx = Math.cos((-34.6 * Math.PI) / 180);
  const perp = (p, a, b) => {
    const ax = (b[0] - a[0]) * kx, ay = b[1] - a[1];
    const px = (p[0] - a[0]) * kx, py = p[1] - a[1];
    const l2 = ax * ax + ay * ay;
    if (!l2) return Math.hypot(px, py);
    const t = Math.max(0, Math.min(1, (px * ax + py * ay) / l2));
    return Math.hypot(px - t * ax, py - t * ay);
  };
  const dp = (pts) => {
    if (pts.length <= 2) return pts;
    let maxD = 0, maxI = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perp(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
    return [...dp(pts.slice(0, maxI + 1)).slice(0, -1), ...dp(pts.slice(maxI))];
  };
  const out = dp(ring);
  return out.length >= 4 ? out : ring;
}
function simplificarGeom(geom, tol) {
  const simp = (rings) => rings.map((r) => simplificarRing(r, tol));
  return geom.type === 'Polygon'
    ? { type: 'Polygon', coordinates: simp(geom.coordinates) }
    : { type: 'MultiPolygon', coordinates: geom.coordinates.map(simp) };
}
function centroide(geom) {
  // centroide del anillo exterior más grande (shoelace)
  const anillos = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);
  let mejor = null, mejorArea = 0;
  for (const ring of anillos) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (Math.abs(a) > mejorArea) { mejorArea = Math.abs(a); mejor = [cx / (3 * a), cy / (3 * a)]; }
  }
  return mejor;
}
const geoDir = join(ROOT, 'public', 'geo');
mkdirSync(geoDir, { recursive: true });

const comunasFC = JSON.parse(readFileSync(join(ROOT, 'data-src', 'comunas.geojson'), 'utf8'));
const comunasOut = { type: 'FeatureCollection', features: [] };
const comunasLabels = { type: 'FeatureCollection', features: [] };
for (const f of comunasFC.features) {
  const num = Math.round(f.properties.comuna);
  const geom = simplificarGeom(f.geometry, 0.00012);
  comunasOut.features.push({ type: 'Feature', properties: { comuna: num }, geometry: geom });
  comunasLabels.features.push({
    type: 'Feature', properties: { comuna: num, etiqueta: `Comuna ${num}` },
    geometry: { type: 'Point', coordinates: centroide(f.geometry).map((v) => +v.toFixed(6)) },
  });
}
writeFileSync(join(geoDir, 'comunas.geojson'), JSON.stringify(comunasOut));
writeFileSync(join(geoDir, 'comunas-labels.geojson'), JSON.stringify(comunasLabels));

const barriosOut = { type: 'FeatureCollection', features: [] };
const barriosLabels = { type: 'FeatureCollection', features: [] };
for (const f of barriosFC.features) {
  const b = BARRIO_POR_CLAVE.get(normalizar(f.properties.nombre));
  if (!b) continue;
  barriosOut.features.push({
    type: 'Feature', properties: { id: b.id, nombre: b.nombre, comuna: b.comuna },
    geometry: simplificarGeom(f.geometry, 0.00008),
  });
  barriosLabels.features.push({
    type: 'Feature', properties: { id: b.id, nombre: b.nombre, comuna: b.comuna },
    geometry: { type: 'Point', coordinates: centroide(f.geometry).map((v) => +v.toFixed(6)) },
  });
}
writeFileSync(join(geoDir, 'barrios.geojson'), JSON.stringify(barriosOut));
writeFileSync(join(geoDir, 'barrios-labels.geojson'), JSON.stringify(barriosLabels));
console.log('Overlays escritos en public/geo/');

const resumen = {};
for (const e of seleccion) {
  const b = BARRIOS[e.b - 1];
  resumen[b.nombre] = (resumen[b.nombre] || 0) + 1;
}
console.log('\nTotal final:', seleccion.length, 'esquinas');
console.log('Por barrio:', Object.entries(resumen).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}=${c}`).join(', '));
const conAv = seleccion.filter((e) => /^avenida /i.test(e.s1) || /^avenida /i.test(e.s2)).length;
console.log('Con avenida:', conAv);
console.log('Muestra:', JSON.stringify(seleccion.slice(0, 5), null, 1));
