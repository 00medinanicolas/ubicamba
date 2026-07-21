// Pipeline de datos de UbicAMBA.
//
// Genera, para cada zona (CABA + GBA norte/oeste/sur):
//   public/data/zona-<id>.json  — { nombre, esquinas: [{s1,s2,lat,lng,b}], areas: [{id,nombre,grupo?}] }
//   public/geo/*                — límites simplificados + puntos de etiqueta para overlays
// y además:
//   public/data/avenidas.json   — avenidas principales de CABA para el modo Avenidas
//
// Fuentes: calles de OpenStreetMap (Overpass, cacheado en data-src/osm-<zona>.json),
// barrios/comunas oficiales de BA Data, partidos del IGN (WFS, cacheado).
//
// Uso: node scripts/build-dataset.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_SRC = join(ROOT, 'data-src');
const OUT_DATA = join(ROOT, 'public', 'data');
const OUT_GEO = join(ROOT, 'public', 'geo');
mkdirSync(OUT_DATA, { recursive: true });
mkdirSync(OUT_GEO, { recursive: true });

const SEED = 20260721;
const CLUSTER_M = 120;

// ---------- zonas ----------
// bbox: [latMin, lngMin, latMax, lngMax] con margen; el recorte fino lo hace el PiP.
const ZONAS = [
  { id: 'caba', nombre: 'CABA', bbox: [-34.712, -58.54, -34.52, -58.32], cap: 150, partidos: null },
  {
    id: 'norte',
    nombre: 'Zona Norte',
    bbox: [-34.63, -58.88, -34.35, -58.44],
    cap: 140,
    partidos: ['General San Martín', 'José C. Paz', 'Malvinas Argentinas', 'San Fernando', 'San Isidro', 'San Miguel', 'Tigre', 'Vicente López'],
  },
  {
    id: 'oeste',
    nombre: 'Zona Oeste',
    bbox: [-34.96, -58.95, -34.55, -58.48],
    cap: 140,
    partidos: ['Hurlingham', 'Ituzaingó', 'La Matanza', 'Merlo', 'Moreno', 'Morón', 'Tres de Febrero'],
  },
  {
    id: 'sur',
    nombre: 'Zona Sur',
    bbox: [-34.96, -58.68, -34.6, -58.05],
    cap: 140,
    partidos: ['Almirante Brown', 'Avellaneda', 'Berazategui', 'Esteban Echeverría', 'Ezeiza', 'Florencio Varela', 'Lanús', 'Lomas de Zamora', 'Quilmes'],
  },
];

// ---------- barrios canónicos de CABA ----------
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
].map(([nombre, comuna], i) => ({ id: i + 1, nombre, grupo: comuna }));

const normalizar = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '').replace(/\bgral\b/g, 'general').replace(/\s+/g, ' ').trim();
const BARRIO_POR_CLAVE = new Map(BARRIOS.map((b) => [normalizar(b.nombre), b]));
BARRIO_POR_CLAVE.set('paternal', BARRIO_POR_CLAVE.get('la paternal'));

// ---------- utilidades ----------
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
const rad = (d) => (d * Math.PI) / 180;
function metros(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
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
function bboxDeGeom(geom) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys) for (const [x, y] of rings[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
function simplificarRing(ring, tol) {
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
  const simp = (rings) => rings.map((r) => simplificarRing(r, tol).map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]));
  return geom.type === 'Polygon'
    ? { type: 'Polygon', coordinates: simp(geom.coordinates) }
    : { type: 'MultiPolygon', coordinates: geom.coordinates.map(simp) };
}
function centroide(geom) {
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
  return mejor.map((v) => +v.toFixed(6));
}

// ---------- descarga OSM por zona (con caché y partición de bbox) ----------
const ENDPOINTS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'User-Agent': 'ubicamba-dataset/2.0 (juego educativo; contacto: 00medina.nicolas@gmail.com)',
  Accept: 'application/json',
};

async function consultarOverpass(bbox) {
  const query = `[out:json][timeout:300][bbox:${bbox.join(',')}];
way["highway"~"^(primary|secondary|tertiary|residential|living_street|unclassified|pedestrian)$"]["name"];
out body;
>;
out skel qt;`;
  for (let intento = 0; intento < 2; intento++) {
    for (const url of ENDPOINTS_OVERPASS) {
      try {
        console.log(`  Overpass ${url.split('/')[2]} bbox=${bbox.map((n) => n.toFixed(2)).join(',')}`);
        const res = await fetch(url, { method: 'POST', headers: HEADERS, body: 'data=' + encodeURIComponent(query) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.elements?.length) throw new Error('respuesta vacía' + (json.remark ? ` (${json.remark})` : ''));
        return json.elements;
      } catch (e) {
        console.warn('    falló:', e.message);
      }
    }
    console.log('  reintento en 20 s...');
    await new Promise((r) => setTimeout(r, 20000));
  }
  return null;
}

async function elementosOSM(bbox, profundidad = 0) {
  const directo = await consultarOverpass(bbox);
  if (directo) return directo;
  if (profundidad >= 2) throw new Error('Overpass agotado incluso con bbox partida');
  console.log('  partiendo bbox en 2 por latitud...');
  const [latMin, lngMin, latMax, lngMax] = bbox;
  const latMedia = (latMin + latMax) / 2;
  const a = await elementosOSM([latMin, lngMin, latMedia, lngMax], profundidad + 1);
  const b = await elementosOSM([latMedia, lngMin, latMax, lngMax], profundidad + 1);
  const vistos = new Set();
  const union = [];
  for (const el of [...a, ...b]) {
    const clave = el.type + el.id;
    if (!vistos.has(clave)) { vistos.add(clave); union.push(el); }
  }
  return union;
}

async function osmDeZona(zona) {
  const cache = join(DATA_SRC, `osm-${zona.id}.json`);
  if (existsSync(cache)) {
    console.log(`[${zona.id}] usando caché OSM`);
    return JSON.parse(readFileSync(cache, 'utf8')).elements ?? JSON.parse(readFileSync(cache, 'utf8'));
  }
  console.log(`[${zona.id}] descargando calles de OSM...`);
  const elements = await elementosOSM(zona.bbox);
  writeFileSync(cache, JSON.stringify({ elements }));
  return elements;
}

// ---------- partidos del GBA (IGN WFS, con caché) ----------
async function partidosIGN() {
  const cache = join(DATA_SRC, 'partidos-ign.geojson');
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  console.log('Descargando partidos del IGN (WFS)...');
  const base = 'https://wms.ign.gob.ar/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=ign:departamento&outputFormat=application/json';
  const intentos = [
    base + '&CQL_FILTER=' + encodeURIComponent("in1 LIKE '06%' AND BBOX(geom,-59.05,-35.05,-57.95,-34.25)"),
    base + '&CQL_FILTER=' + encodeURIComponent("in1 LIKE '06%'"),
  ];
  for (const url of intentos) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const fc = await res.json();
      if (!fc.features?.length) throw new Error('sin features');
      console.log(`  ${fc.features.length} departamentos recibidos`);
      writeFileSync(cache, JSON.stringify(fc));
      return fc;
    } catch (e) {
      console.warn('  falló:', e.message);
    }
  }
  throw new Error('No se pudieron descargar los partidos del IGN');
}

// ---------- detección de esquinas ----------
function esquinasDesdeOSM(elements, poligonos) {
  const nodos = new Map();
  const vias = [];
  for (const el of elements) {
    if (el.type === 'node') nodos.set(el.id, [el.lon, el.lat]);
    else if (el.type === 'way' && el.tags?.name) vias.push(el);
  }
  const porNodo = new Map();
  for (const via of vias) {
    const nombre = via.tags.name.trim();
    if (/sin nombre/i.test(nombre)) continue;
    for (const ref of via.nodes) {
      let set = porNodo.get(ref);
      if (!set) porNodo.set(ref, (set = new Set()));
      set.add(nombre);
    }
  }
  const porDupla = new Map();
  for (const [id, nombres] of porNodo) {
    if (nombres.size < 2) continue;
    const coord = nodos.get(id);
    if (!coord) continue;
    const orden = [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
    for (let i = 0; i < orden.length; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const clave = orden[i] + '||' + orden[j];
        let clusters = porDupla.get(clave);
        if (!clusters) porDupla.set(clave, (clusters = []));
        const cercano = clusters.find((c) => metros(c.lat / c.n, c.lng / c.n, coord[1], coord[0]) < CLUSTER_M);
        if (cercano) { cercano.lng += coord[0]; cercano.lat += coord[1]; cercano.n++; }
        else clusters.push({ lng: coord[0], lat: coord[1], n: 1 });
      }
    }
  }
  const esquinas = [];
  let fuera = 0;
  for (const [clave, clusters] of porDupla) {
    const [s1, s2] = clave.split('||');
    for (const c of clusters) {
      const lat = c.lat / c.n, lng = c.lng / c.n;
      const p = poligonos.find(
        (p) => lng >= p.minX && lng <= p.maxX && lat >= p.minY && lat <= p.maxY && dentroDePoligono(lng, lat, p.geom)
      );
      if (!p) { fuera++; continue; }
      esquinas.push({ s1, s2, lat: +lat.toFixed(7), lng: +lng.toFixed(7), b: p.area.id });
    }
  }
  return { esquinas, fuera, viasConNombre: vias.length };
}

function balancear(esquinas, cap, rnd) {
  const porArea = new Map();
  for (const e of esquinas) {
    let arr = porArea.get(e.b);
    if (!arr) porArea.set(e.b, (arr = []));
    arr.push(e);
  }
  const seleccion = [];
  for (const [, arr] of [...porArea.entries()].sort((a, b) => a[0] - b[0])) {
    shuffle(arr, rnd);
    seleccion.push(...arr.slice(0, cap));
  }
  return shuffle(seleccion, rnd);
}

// ---------- proceso por zona ----------
const rnd = mulberry32(SEED);
const barriosFC = JSON.parse(readFileSync(join(DATA_SRC, 'barrios.geojson'), 'utf8'));

for (const zona of ZONAS) {
  console.log(`\n=== ${zona.nombre} ===`);
  let areas, poligonos;

  if (zona.id === 'caba') {
    areas = BARRIOS;
    poligonos = [];
    for (const f of barriosFC.features) {
      const area = BARRIO_POR_CLAVE.get(normalizar(f.properties.nombre));
      if (!area) { console.warn('Barrio sin match:', f.properties.nombre); continue; }
      poligonos.push({ area, geom: f.geometry, ...bboxDeGeom(f.geometry) });
    }
  } else {
    const ign = await partidosIGN();
    const buscados = new Map(zona.partidos.map((n) => [normalizar(n), n]));
    const encontrados = new Map();
    for (const f of ign.features) {
      const clave = normalizar(f.properties.nam ?? '');
      if (buscados.has(clave) && !encontrados.has(clave)) encontrados.set(clave, f);
    }
    const faltan = [...buscados.keys()].filter((k) => !encontrados.has(k));
    if (faltan.length) throw new Error(`Partidos no encontrados en IGN: ${faltan.join(', ')}`);
    areas = [...encontrados.values()]
      .map((f) => ({ nombre: buscados.get(normalizar(f.properties.nam)), feature: f }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((x, i) => ({ id: i + 1, nombre: x.nombre, feature: x.feature }));
    poligonos = areas.map((a) => ({ area: a, geom: a.feature.geometry, ...bboxDeGeom(a.feature.geometry) }));
  }

  const elements = await osmDeZona(zona);
  const { esquinas, fuera, viasConNombre } = esquinasDesdeOSM(elements, poligonos);
  console.log(`vías con nombre: ${viasConNombre} · esquinas en zona: ${esquinas.length} (descartadas: ${fuera})`);
  const seleccion = balancear(esquinas, zona.cap, rnd);

  const areasOut = areas.map(({ id, nombre, grupo }) => (grupo ? { id, nombre, grupo } : { id, nombre }));
  writeFileSync(join(OUT_DATA, `zona-${zona.id}.json`), JSON.stringify({ nombre: zona.nombre, areas: areasOut, esquinas: seleccion }));
  const resumen = {};
  for (const e of seleccion) resumen[areasOut[e.b - 1].nombre] = (resumen[areasOut[e.b - 1].nombre] || 0) + 1;
  console.log(`seleccionadas: ${seleccion.length} → ${Object.entries(resumen).map(([n, c]) => `${n}=${c}`).join(', ')}`);

  // overlays
  if (zona.id === 'caba') {
    const comunasFC = JSON.parse(readFileSync(join(DATA_SRC, 'comunas.geojson'), 'utf8'));
    const comunasOut = { type: 'FeatureCollection', features: [] };
    const comunasLabels = { type: 'FeatureCollection', features: [] };
    for (const f of comunasFC.features) {
      const num = Math.round(f.properties.comuna);
      comunasOut.features.push({ type: 'Feature', properties: { comuna: num }, geometry: simplificarGeom(f.geometry, 0.00012) });
      comunasLabels.features.push({
        type: 'Feature', properties: { etiqueta: `Comuna ${num}` },
        geometry: { type: 'Point', coordinates: centroide(f.geometry) },
      });
    }
    writeFileSync(join(OUT_GEO, 'comunas.geojson'), JSON.stringify(comunasOut));
    writeFileSync(join(OUT_GEO, 'comunas-labels.geojson'), JSON.stringify(comunasLabels));

    const barriosOut = { type: 'FeatureCollection', features: [] };
    const barriosLabels = { type: 'FeatureCollection', features: [] };
    for (const p of poligonos) {
      barriosOut.features.push({
        type: 'Feature', properties: { etiqueta: p.area.nombre },
        geometry: simplificarGeom(p.geom, 0.00008),
      });
      barriosLabels.features.push({
        type: 'Feature', properties: { etiqueta: p.area.nombre },
        geometry: { type: 'Point', coordinates: centroide(p.geom) },
      });
    }
    writeFileSync(join(OUT_GEO, 'barrios.geojson'), JSON.stringify(barriosOut));
    writeFileSync(join(OUT_GEO, 'barrios-labels.geojson'), JSON.stringify(barriosLabels));
  } else {
    const lineas = { type: 'FeatureCollection', features: [] };
    const labels = { type: 'FeatureCollection', features: [] };
    for (const p of poligonos) {
      lineas.features.push({
        type: 'Feature', properties: { etiqueta: p.area.nombre },
        geometry: simplificarGeom(p.geom, 0.00025),
      });
      labels.features.push({
        type: 'Feature', properties: { etiqueta: p.area.nombre },
        geometry: { type: 'Point', coordinates: centroide(p.geom) },
      });
    }
    writeFileSync(join(OUT_GEO, `partidos-${zona.id}.geojson`), JSON.stringify(lineas));
    writeFileSync(join(OUT_GEO, `partidos-${zona.id}-labels.geojson`), JSON.stringify(labels));
  }
}

// ---------- avenidas principales de CABA (para el modo Avenidas) ----------
console.log('\n=== Avenidas ===');
{
  const elements = JSON.parse(readFileSync(join(DATA_SRC, 'osm-caba.json'), 'utf8')).elements;
  const nodos = new Map();
  for (const el of elements) if (el.type === 'node') nodos.set(el.id, [el.lon, el.lat]);

  const poligonosBarrios = [];
  for (const f of barriosFC.features) {
    const area = BARRIO_POR_CLAVE.get(normalizar(f.properties.nombre));
    if (area) poligonosBarrios.push({ area, geom: f.geometry, ...bboxDeGeom(f.geometry) });
  }
  const barrioDePunto = (lng, lat) =>
    poligonosBarrios.find(
      (p) => lng >= p.minX && lng <= p.maxX && lat >= p.minY && lat <= p.maxY && dentroDePoligono(lng, lat, p.geom)
    )?.area.nombre;

  const TIPOS_AV = new Set(['trunk', 'primary', 'secondary']);
  const porNombre = new Map();
  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.name) continue;
    if (!TIPOS_AV.has(el.tags.highway)) continue;
    if (!/^avenida /i.test(el.tags.name)) continue;
    const linea = el.nodes.map((id) => nodos.get(id)).filter(Boolean);
    if (linea.length < 2) continue;
    let arr = porNombre.get(el.tags.name.trim());
    if (!arr) porNombre.set(el.tags.name.trim(), (arr = []));
    arr.push(linea);
  }

  const simplificarLinea = (pts, tol) => {
    const ring = simplificarRing(pts, tol);
    return (ring.length >= 2 ? ring : pts).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
  };

  const avenidas = [];
  for (const [nombre, lineas] of porNombre) {
    let largo = 0;
    const barriosCruzados = new Set();
    for (const linea of lineas) {
      for (let i = 1; i < linea.length; i++) {
        largo += metros(linea[i - 1][1], linea[i - 1][0], linea[i][1], linea[i][0]);
      }
      for (let i = 0; i < linea.length; i += 12) {
        const b = barrioDePunto(linea[i][0], linea[i][1]);
        if (b) barriosCruzados.add(b);
      }
    }
    if (largo < 1200 || !barriosCruzados.size) continue;
    avenidas.push({
      nombre,
      largoKm: +(largo / 1000).toFixed(1),
      barrios: [...barriosCruzados],
      lineas: lineas.map((l) => simplificarLinea(l, 0.00012)),
    });
  }
  avenidas.sort((a, b) => b.largoKm - a.largoKm);
  const top = avenidas.slice(0, 90);
  shuffle(top, mulberry32(SEED + 1)); // orden pre-mezclado, igual que las esquinas
  writeFileSync(join(OUT_DATA, 'avenidas.json'), JSON.stringify(top));
  console.log(`avenidas emitidas: ${top.length} (de ${avenidas.length} candidatas)`);
  console.log('las 5 más largas:', avenidas.slice(0, 5).map((a) => `${a.nombre} (${a.largoKm} km)`).join(' · '));
}

console.log('\nListo.');
