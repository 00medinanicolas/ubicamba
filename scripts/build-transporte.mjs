// Pipeline del modo "¿Cómo conviene ir?" (A→B en transporte público).
//
// Lee los GTFS de subte y trenes (extraídos en data-src/gtfs/*), construye un grafo
// de estaciones con tiempos reales de viaje, esperas por frecuencia y transbordos
// (oficiales del subte + caminatas entre estaciones cercanas), y genera desafíos:
// pares A→B con 3-4 itinerarios (el óptimo, alternativas y una "trampa" con menos
// transbordos), todos calculados con Dijkstra sobre estados (estación, línea).
//
// El dataset es VERSIONADO y REGENERABLE: cuando se sumen los colectivos, se corre
// de nuevo con más feeds y sale una nueva versión con las rutas recalculadas.
//
// Salida: public/data/transporte-v1.json
// Uso: node scripts/build-transporte.mjs   (requiere data-src/gtfs/{subte,trenes}/)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PARTIDOS_POR_ZONA, normalizarNombre } from './zonas-amba.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GTFS = join(ROOT, 'data-src', 'gtfs');
const VERSION = 'subte-tren-v1';
const SEED = 20260722;

const CUPO_BUCKET = 8; // desafíos por (combinación de zonas × nivel de combinaciones)
const TOPE_POR_ORIGEN = 3;
const MIN_MINUTOS = 12;
const MAX_MINUTOS = 95;
const CAMINATA_MAX_M = 450;
const VEL_CAMINATA = 1.15; // m/s
const PENAL_BAJAR = 0.5; // min

if (!existsSync(join(GTFS, 'subte', 'stops.txt')) || !existsSync(join(GTFS, 'trenes', 'stops.txt'))) {
  console.error('Faltan los GTFS extraídos en data-src/gtfs/{subte,trenes}. Ver README.');
  process.exit(1);
}

// ---------- utilidades ----------
function csv(path) {
  const texto = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const lineas = texto.split(/\r?\n/).filter((l) => l.length);
  const parse = (l) => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) {
        if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const cab = parse(lineas[0]);
  return lineas.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [cab[i], v])));
}
const seg = (hhmmss) => {
  const [h, m, s] = hhmmss.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};
const mediana = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const rad = (d) => (d * Math.PI) / 180;
function metros(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
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
function mulberry32(semilla) {
  let a = semilla >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);

// ---------- modelo ----------
const estaciones = new Map(); // id -> {id, nombre, lat, lng, red}
const lineas = []; // {id, red, ruta, nombre, color, secuencia: [estId], hops: [min], espera: min}

function agregarEstacion(id, nombre, lat, lng, red) {
  if (!estaciones.has(id)) estaciones.set(id, { id, nombre, lat, lng, red });
  return id;
}

// ---------- SUBTE ----------
{
  const dir = join(GTFS, 'subte');
  const stops = csv(join(dir, 'stops.txt'));
  const routes = csv(join(dir, 'routes.txt'));
  const trips = csv(join(dir, 'trips.txt'));
  const stopTimes = csv(join(dir, 'stop_times.txt'));
  const freqs = csv(join(dir, 'frequencies.txt'));
  const transfers = csv(join(dir, 'transfers.txt'));

  // andén -> estación (location_type 1 = estación; 0 con parent = andén)
  const andenAEstacion = new Map();
  for (const s of stops) {
    if (s.location_type === '1') {
      agregarEstacion('s' + s.stop_id, s.stop_name.trim(), +s.stop_lat, +s.stop_lon, 'subte');
    }
  }
  for (const s of stops) {
    if (s.location_type !== '1' && s.parent_station) andenAEstacion.set(s.stop_id, 's' + s.parent_station);
  }

  const colorDe = new Map(routes.map((r) => [r.route_id, '#' + (r.route_color || '888888')]));
  const nombreDe = new Map(routes.map((r) => [r.route_id, r.route_id.startsWith('PM') ? 'Premetro' : `Subte ${r.route_short_name}`]));

  const stPorTrip = new Map();
  for (const st of stopTimes) {
    if (!stPorTrip.has(st.trip_id)) stPorTrip.set(st.trip_id, []);
    stPorTrip.get(st.trip_id).push(st);
  }
  for (const arr of stPorTrip.values()) arr.sort((a, b) => +a.stop_sequence - +b.stop_sequence);

  // headway mediano por ruta (días hábiles, service_id 5)
  const headways = new Map();
  const tripsHabiles = new Set(trips.filter((t) => t.service_id === '5').map((t) => t.trip_id));
  for (const f of freqs) {
    if (!tripsHabiles.has(f.trip_id)) continue;
    const ruta = trips.find((t) => t.trip_id === f.trip_id).route_id;
    if (!headways.has(ruta)) headways.set(ruta, []);
    headways.get(ruta).push(+f.headway_secs);
  }

  for (const ruta of routes) {
    for (const dirId of ['0', '1']) {
      const tripsDir = trips.filter((t) => t.route_id === ruta.route_id && t.direction_id === dirId && t.service_id === '5');
      if (!tripsDir.length) continue;
      // patrón más largo
      let patron = null;
      for (const t of tripsDir) {
        const st = stPorTrip.get(t.trip_id) ?? [];
        if (!patron || st.length > patron.length) patron = st;
      }
      if (!patron || patron.length < 2) continue;
      const secuencia = patron.map((st) => andenAEstacion.get(st.stop_id) ?? 's' + st.stop_id);
      const hops = [];
      for (let i = 1; i < patron.length; i++) {
        hops.push(Math.max(0.6, (seg(patron[i].arrival_time) - seg(patron[i - 1].departure_time)) / 60));
      }
      const hw = mediana(headways.get(ruta.route_id) ?? [300]);
      lineas.push({
        id: `${ruta.route_id}|${dirId}`,
        red: 'subte',
        ruta: ruta.route_id,
        nombre: nombreDe.get(ruta.route_id),
        color: colorDe.get(ruta.route_id),
        secuencia,
        hops,
        espera: Math.min(6, Math.max(1.5, hw / 2 / 60)),
      });
    }
  }

  // transbordos oficiales (a nivel estación)
  global.transbordosSubte = [];
  const vistos = new Set();
  for (const t of transfers) {
    const a = andenAEstacion.get(t.from_stop_id), b = andenAEstacion.get(t.to_stop_id);
    if (!a || !b || a === b) continue;
    const clave = a < b ? a + b : b + a;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    global.transbordosSubte.push({ a, b, min: Math.max(2, +t.min_transfer_time / 60 + 1) });
  }
}

// ---------- TRENES ----------
{
  const dir = join(GTFS, 'trenes');
  const stops = csv(join(dir, 'stops.txt'));
  const routes = csv(join(dir, 'routes.txt'));
  const trips = csv(join(dir, 'trips.txt'));
  const stopTimes = csv(join(dir, 'stop_times.txt'));

  for (const s of stops) agregarEstacion('t' + s.stop_id, s.stop_name.trim(), +s.stop_lat, +s.stop_lon, 'tren');

  const COLOR_LINEA = {
    Roca: '#16a34a', Mitre: '#0ea5e9', Sarmiento: '#dc2626', 'San Martin': '#f97316',
    'Belgrano Sur': '#a16207', 'Linea Mitre': '#14b8a6',
  };

  const stPorTrip = new Map();
  for (const st of stopTimes) {
    if (!stPorTrip.has(st.trip_id)) stPorTrip.set(st.trip_id, []);
    stPorTrip.get(st.trip_id).push(st);
  }
  for (const arr of stPorTrip.values()) arr.sort((a, b) => +a.stop_sequence - +b.stop_sequence);

  for (const ruta of routes) {
    const familia = ruta.route_short_name.trim();
    const nombre = familia === 'Linea Mitre' ? 'Tren de la Costa' : `Tren ${familia}`;
    for (const dirId of ['0', '1']) {
      const tripsDir = trips.filter((t) => t.route_id === ruta.route_id && t.direction_id === dirId && t.service_id === '1');
      if (!tripsDir.length) continue;
      let patron = null;
      for (const t of tripsDir) {
        const st = stPorTrip.get(t.trip_id) ?? [];
        if (!patron || st.length > patron.length) patron = st;
      }
      if (!patron || patron.length < 2) continue;
      const secuencia = patron.map((st) => 't' + st.stop_id);

      // mediana de tiempo por tramo consecutivo (sobre todos los viajes hábiles que lo recorren)
      const porTramo = new Map();
      for (const t of tripsDir) {
        const st = stPorTrip.get(t.trip_id) ?? [];
        for (let i = 1; i < st.length; i++) {
          const clave = st[i - 1].stop_id + '>' + st[i].stop_id;
          const delta = (seg(st[i].arrival_time) - seg(st[i - 1].departure_time)) / 60;
          if (delta > 0 && delta < 60) {
            if (!porTramo.has(clave)) porTramo.set(clave, []);
            porTramo.get(clave).push(delta);
          }
        }
      }
      const hops = [];
      let ok = true;
      for (let i = 1; i < patron.length; i++) {
        const m = mediana(porTramo.get(patron[i - 1].stop_id + '>' + patron[i].stop_id) ?? []);
        if (Number.isNaN(m)) { ok = false; break; }
        hops.push(Math.max(1, m));
      }
      if (!ok) continue;

      // espera: mediana del intervalo entre salidas en la cabecera del patrón
      const salidas = tripsDir
        .map((t) => (stPorTrip.get(t.trip_id) ?? [])[0])
        .filter((st) => st && st.stop_id === patron[0].stop_id)
        .map((st) => seg(st.departure_time))
        .sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < salidas.length; i++) gaps.push((salidas[i] - salidas[i - 1]) / 60);
      const hw = mediana(gaps.filter((g) => g > 2 && g < 120)) || 30;
      lineas.push({
        id: `${ruta.route_id}|${dirId}`,
        red: 'tren',
        ruta: ruta.route_id,
        nombre,
        color: COLOR_LINEA[familia] ?? '#64748b',
        secuencia,
        hops,
        espera: Math.min(18, Math.max(3, hw / 2)),
      });
    }
  }
}

console.log(`Estaciones: ${estaciones.size} · patrones de línea: ${lineas.length}`);

// ---------- conexiones de transbordo ----------
const vecinosCaminando = new Map(); // estId -> [{a: estId, min}]
function agregarCaminata(a, b, min) {
  if (!vecinosCaminando.has(a)) vecinosCaminando.set(a, []);
  const arr = vecinosCaminando.get(a);
  const ya = arr.find((v) => v.a === b);
  if (ya) ya.min = Math.min(ya.min, min);
  else arr.push({ a: b, min });
}
{
  const lista = [...estaciones.values()];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const d = metros(lista[i], lista[j]);
      if (d <= CAMINATA_MAX_M) {
        const min = Math.max(3, d / VEL_CAMINATA / 60 + 1.5);
        agregarCaminata(lista[i].id, lista[j].id, min);
        agregarCaminata(lista[j].id, lista[i].id, min);
      }
    }
  }
  for (const t of global.transbordosSubte) {
    agregarCaminata(t.a, t.b, t.min);
    agregarCaminata(t.b, t.a, t.min);
  }
}

// índice: estación -> [{linea, pos}]
const lineasPorEstacion = new Map();
lineas.forEach((l, li) => {
  l.secuencia.forEach((est, pos) => {
    if (!lineasPorEstacion.has(est)) lineasPorEstacion.set(est, []);
    lineasPorEstacion.get(est).push({ li, pos });
  });
});

// ---------- Dijkstra sobre estados (estación, línea | a pie) ----------
function buscarRuta(origen, destino, { rutasProhibidas = new Set(), penalTransbordo = 0 } = {}) {
  // estado: `${est}` (a pie) o `${est}@${li}` (arriba de la línea li)
  const dist = new Map();
  const prev = new Map();
  const cola = [[0, origen, null]]; // [costo, estado, infoPrev]
  dist.set(origen, 0);

  const push = (costo, estado, desde, mov) => {
    if (costo < (dist.get(estado) ?? Infinity)) {
      dist.set(estado, costo);
      prev.set(estado, { desde, mov });
      cola.push([costo, estado]);
    }
  };

  while (cola.length) {
    // cola simple con extracción del mínimo (el grafo es chico)
    let mejor = 0;
    for (let i = 1; i < cola.length; i++) if (cola[i][0] < cola[mejor][0]) mejor = i;
    const [costo, estado] = cola.splice(mejor, 1)[0];
    if (costo > (dist.get(estado) ?? Infinity)) continue;
    if (estado === destino) break;

    const [est, liStr] = estado.split('@');
    if (liStr === undefined) {
      // a pie en una estación: caminar o subirse a una línea
      for (const v of vecinosCaminando.get(est) ?? []) {
        push(costo + v.min, v.a, estado, { tipo: 'caminar', min: v.min });
      }
      for (const { li, pos } of lineasPorEstacion.get(est) ?? []) {
        const l = lineas[li];
        if (rutasProhibidas.has(l.ruta)) continue;
        if (pos >= l.secuencia.length - 1) continue; // no tiene sentido subir en la última
        const costoSubir = l.espera + penalTransbordo;
        push(costo + costoSubir, `${est}@${li}`, estado, { tipo: 'subir', min: costoSubir });
      }
    } else {
      const li = +liStr;
      const l = lineas[li];
      const pos = l.secuencia.indexOf(est);
      // seguir hasta la próxima estación
      if (pos >= 0 && pos < l.secuencia.length - 1) {
        const sig = l.secuencia[pos + 1];
        push(costo + l.hops[pos], `${sig}@${li}`, estado, { tipo: 'viajar', min: l.hops[pos] });
      }
      // bajarse
      push(costo + PENAL_BAJAR, est, estado, { tipo: 'bajar', min: PENAL_BAJAR });
    }
  }

  if (!dist.has(destino)) return null;

  // reconstrucción → legs
  const pasos = [];
  let estado = destino;
  while (estado !== origen) {
    const p = prev.get(estado);
    if (!p) break;
    pasos.push({ estado, ...p.mov });
    estado = p.desde;
  }
  pasos.reverse();

  const legs = [];
  for (const paso of pasos) {
    const [est, liStr] = paso.estado.split('@');
    if (paso.tipo === 'caminar') {
      legs.push({ tipo: 'caminar', desde: null, hasta: est, min: paso.min, estaciones: [est] });
    } else if (paso.tipo === 'subir') {
      legs.push({ tipo: 'viaje', li: +liStr, espera: paso.min, min: 0, estaciones: [est] });
    } else if (paso.tipo === 'viajar') {
      const leg = legs[legs.length - 1];
      leg.min += paso.min;
      leg.estaciones.push(est);
    }
    // 'bajar' no altera legs
  }

  const total = dist.get(destino);
  return { total, legs };
}

// ---------- desafíos ----------
// firma por lo que VE el jugador (nombre de línea + cantidad de paradas):
// dos ramales distintos con el mismo recorrido visible son la misma opción.
function firma(ruta) {
  return ruta.legs
    .filter((l) => l.tipo === 'viaje')
    .map((l) => `${lineas[l.li].nombre}:${l.estaciones.length - 1}`)
    .join('>');
}

/** Payload compacto: las estaciones van por índice y el cliente resuelve nombres/colores/coords desde red-v1.json. */
function empaquetar(ruta, optima) {
  const legs = [];
  for (const l of ruta.legs) {
    if (l.tipo === 'caminar') {
      const previo = legs[legs.length - 1];
      const hasta = idxDe.get(l.hasta);
      if (previo && previo.li === -1) {
        // dos caminatas seguidas se muestran como una sola
        previo.min += Math.round(l.min);
        previo.est.push(hasta);
        continue;
      }
      const desde = previo ? previo.est[previo.est.length - 1] : null;
      legs.push({ li: -1, min: Math.round(l.min), est: desde === null ? [hasta] : [desde, hasta] });
    } else {
      legs.push({
        li: l.li,
        min: Math.round(l.min + l.espera),
        est: l.estaciones.map((e) => idxDe.get(e)),
      });
    }
  }
  return { minutos: Math.round(ruta.total), optima, legs };
}

/** Zonas que toca una ruta (origen, destino y todas las estaciones intermedias). */
function zonasDeRuta(ruta, origen, destino) {
  const zonas = new Set();
  const sumar = (id) => zonas.add(estaciones.get(id).zona);
  sumar(origen);
  sumar(destino);
  for (const l of ruta.legs) for (const e of l.estaciones) sumar(e);
  return zonas.has(null) ? null : [...zonas].sort();
}

function generarOpciones(origen, destino) {
  const optima = buscarRuta(origen, destino);
  if (!optima) return null;
  const viajes = optima.legs.filter((l) => l.tipo === 'viaje');
  if (!viajes.length) return null; // tiene que haber al menos un tramo en transporte

  const candidatas = [{ ruta: optima, optima: true }];
  const firmas = new Set([firma(optima)]);
  // el margen tolerado crece con el largo del viaje: en un viaje directo y corto,
  // la alternativa razonable siempre es bastante peor
  const extraMax = Math.max(50, optima.total * 0.9);
  const probar = (r) => {
    if (!r) return;
    const f = firma(r);
    if (firmas.has(f)) return;
    const extra = r.total - optima.total;
    if (extra < 3 || extra > extraMax) return;
    firmas.add(f);
    candidatas.push({ ruta: r, optima: false });
  };

  // alternativas: sin cada una de las líneas del óptimo, y variando la aversión al transbordo
  for (const v of viajes.slice(0, 3)) {
    probar(buscarRuta(origen, destino, { rutasProhibidas: new Set([lineas[v.li].ruta]) }));
  }
  probar(buscarRuta(origen, destino, { penalTransbordo: 12 })); // la "trampa": menos transbordos
  probar(buscarRuta(origen, destino, { penalTransbordo: -1.5 })); // la opuesta: más transbordos
  if (candidatas.length < 3 && viajes.length >= 1) {
    // último recurso: prohibir de a dos líneas para forzar un camino distinto
    const rutasTop = viajes.slice(0, 2).map((v) => lineas[v.li].ruta);
    probar(buscarRuta(origen, destino, { rutasProhibidas: new Set(rutasTop) }));
  }
  // la óptima siempre entra; se completan hasta 3 alternativas y se mezcla el orden final
  const mezclar = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const alternativas = mezclar(candidatas.filter((c) => !c.optima)).slice(0, 3);
  const elegidas = mezclar([candidatas.find((c) => c.optima), ...alternativas]);
  const rutaOptima = elegidas.find((c) => c.optima).ruta;
  return {
    opciones: elegidas.map((c) => empaquetar(c.ruta, c.optima)),
    rutaOptima,
    combinaciones: viajes.length - 1,
  };
}

// ---------- zona de cada estación (CABA / norte / oeste / sur) ----------
const listaEstaciones = [...estaciones.values()];
const idxDe = new Map(listaEstaciones.map((e, i) => [e.id, i]));
{
  const poligonos = [];
  const barriosFC = JSON.parse(readFileSync(join(ROOT, 'data-src','barrios.geojson'), 'utf8'));
  for (const f of barriosFC.features) poligonos.push({ zona: 'caba', geom: f.geometry, ...bboxDeGeom(f.geometry) });

  // los partidos ya los descargó build-dataset (caché en data-src)
  const cacheIGN = join(ROOT, 'data-src', 'partidos-ign.geojson');
  if (!existsSync(cacheIGN)) {
    console.error('Falta data-src/partidos-ign.geojson. Corré antes: npm run dataset');
    process.exit(1);
  }
  const ign = JSON.parse(readFileSync(cacheIGN, 'utf8'));
  const zonaDePartido = new Map();
  for (const [zona, nombres] of Object.entries(PARTIDOS_POR_ZONA)) {
    for (const n of nombres) zonaDePartido.set(normalizarNombre(n), zona);
  }
  for (const f of ign.features) {
    const zona = zonaDePartido.get(normalizarNombre(f.properties.nam ?? ''));
    if (zona) poligonos.push({ zona, geom: f.geometry, ...bboxDeGeom(f.geometry) });
  }

  const conteo = {};
  for (const e of listaEstaciones) {
    const p = poligonos.find(
      (p) => e.lng >= p.minX && e.lng <= p.maxX && e.lat >= p.minY && e.lat <= p.maxY && dentroDePoligono(e.lng, e.lat, p.geom)
    );
    e.zona = p?.zona ?? null;
    conteo[e.zona ?? 'fuera'] = (conteo[e.zona ?? 'fuera'] ?? 0) + 1;
  }
  console.log('Estaciones por zona:', JSON.stringify(conteo));
}

// ---------- red navegable para la mecánica "armá tu viaje" ----------
{
  const caminatasOut = [];
  const vistas = new Set();
  for (const [a, vecinos] of vecinosCaminando) {
    for (const v of vecinos) {
      const ia = idxDe.get(a), ib = idxDe.get(v.a);
      const clave = ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      caminatasOut.push([ia, ib, +v.min.toFixed(1)]);
    }
  }
  const red = {
    version: VERSION,
    penalBajar: PENAL_BAJAR,
    estaciones: listaEstaciones.map((e) => ({
      n: e.nombre,
      r: e.red,
      z: e.zona,
      lat: +e.lat.toFixed(5),
      lng: +e.lng.toFixed(5),
    })),
    lineas: lineas.map((l) => ({
      nombre: l.nombre,
      color: l.color,
      red: l.red,
      espera: +l.espera.toFixed(1),
      sec: l.secuencia.map((id) => idxDe.get(id)),
      hops: l.hops.map((h) => +h.toFixed(1)),
    })),
    caminatas: caminatasOut,
  };
  writeFileSync(join(ROOT, 'public', 'data', 'red-v1.json'), JSON.stringify(red));
  console.log(`Red navegable: ${red.estaciones.length} estaciones, ${red.lineas.length} patrones, ${caminatasOut.length} caminatas`);
}

// ---------- generación por cuotas (zonas × combinaciones) ----------
const porZona = { caba: [], norte: [], oeste: [], sur: [] };
for (const e of listaEstaciones) if (e.zona) porZona[e.zona].push(e);
console.log(`Estaciones elegibles: ${Object.values(porZona).reduce((a, l) => a + l.length, 0)}`);

// pasadas dirigidas: primero dentro de cada zona (lo más difícil de encontrar al azar), después entre zonas
const PASADAS = [
  ['caba', 'caba', 1600], ['sur', 'sur', 1600], ['oeste', 'oeste', 1400], ['norte', 'norte', 1400],
  ['caba', 'sur', 900], ['caba', 'oeste', 900], ['caba', 'norte', 900],
  ['norte', 'oeste', 700], ['oeste', 'sur', 700], ['norte', 'sur', 700],
];

const desafios = [];
const porOrigen = new Map();
const buckets = new Map();
let intentos = 0;

for (const [zA, zB, presupuesto] of PASADAS) {
  const listaA = porZona[zA], listaB = porZona[zB];
  if (!listaA.length || !listaB.length) continue;
  for (let n = 0; n < presupuesto; n++) {
    intentos++;
    const a = listaA[Math.floor(rnd() * listaA.length)];
    const b = listaB[Math.floor(rnd() * listaB.length)];
    if (a.id === b.id || metros(a, b) < 3000) continue;
    if ((porOrigen.get(a.id) ?? 0) >= TOPE_POR_ORIGEN) continue;

    const gen = generarOpciones(a.id, b.id);
    if (!gen) continue;
    const opt = gen.opciones.find((o) => o.optima);
    if (opt.minutos < MIN_MINUTOS || opt.minutos > MAX_MINUTOS) continue;

    const zonas = zonasDeRuta(gen.rutaOptima, a.id, b.id);
    if (!zonas) continue; // la ruta se escapa de las 4 zonas

    // "elegir el itinerario" necesita alternativas plausibles; "armá tu viaje" no.
    // Los viajes sin suficientes opciones (típico de los directos y de las zonas
    // con un solo ramal) se guardan igual, marcados para la mecánica de armado.
    const minOpciones = gen.combinaciones === 0 ? 2 : 3;
    const soloArmar = gen.opciones.length < minOpciones;

    const nivel = Math.min(gen.combinaciones, 2);
    const clave = `${zonas.join('+')}|${nivel}|${soloArmar ? 'b' : 'ab'}`;
    if ((buckets.get(clave) ?? 0) >= CUPO_BUCKET) continue;
    buckets.set(clave, (buckets.get(clave) ?? 0) + 1);
    porOrigen.set(a.id, (porOrigen.get(a.id) ?? 0) + 1);

    desafios.push({
      o: idxDe.get(a.id),
      d: idxDe.get(b.id),
      z: zonas,
      c: gen.combinaciones,
      ...(soloArmar ? { soloArmar: 1 } : {}),
      opciones: gen.opciones,
    });
  }
}

writeFileSync(
  join(ROOT, 'public', 'data', 'transporte-v1.json'),
  JSON.stringify({ version: VERSION, modos: ['subte', 'tren'], desafios })
);

console.log(`\nDesafíos generados: ${desafios.length} (${intentos} intentos)`);
const resumenZonas = {};
const resumenComb = {};
for (const d of desafios) {
  resumenZonas[d.z.join('+')] = (resumenZonas[d.z.join('+')] ?? 0) + 1;
  resumenComb[d.c] = (resumenComb[d.c] ?? 0) + 1;
}
console.log('por zonas:', JSON.stringify(resumenZonas));
console.log('por combinaciones:', JSON.stringify(resumenComb));
console.log(`aptos para "elegir itinerario": ${desafios.filter((d) => !d.soloArmar).length} · solo para "armar": ${desafios.filter((d) => d.soloArmar).length}`);
for (const d of desafios.slice(0, 10)) {
  const opt = d.opciones.find((o) => o.optima);
  const resumen = opt.legs.map((l) => (l.li < 0 ? 'a pie' : lineas[l.li].nombre)).join(' → ');
  console.log(
    `  [${d.z.join('+')}·${d.c}] ${listaEstaciones[d.o].nombre} → ${listaEstaciones[d.d].nombre}: ${opt.minutos} min [${resumen}]`
  );
}
