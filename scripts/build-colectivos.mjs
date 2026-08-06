// Construye la capa de COLECTIVOS de la red, a partir del GTFS del AMBA.
//
// Por qué un puñado de líneas y no todas: el GTFS trae 1.076 ramales y 43.201
// paradas (stop_times.txt pesa 1,3 GB). Metidas enteras, el JSON que baja el
// navegador se dispara y —peor— el juego se rompe: con esa densidad casi
// cualquier A→B se resuelve con un solo colectivo y elegir el mejor itinerario
// deja de tener gracia. Se toman entonces las líneas clásicas, las que alguien
// que vive en Buenos Aires reconoce por el número.
//
// Reducciones, en orden:
//   1. sólo las líneas de CLASICAS (todos sus ramales)
//   2. un viaje representativo por ramal y sentido: el de más paradas
//   3. sólo paradas dentro del encuadre del AMBA
//   4. se descartan paradas intermedias a menos de PASO_M de la anterior, salvo
//      cabeceras y las que están cerca de una estación de subte o tren
//   5. paradas a menos de FUSION_M entre sí se fusionan en un nodo
//
// Uso: node scripts/build-colectivos.mjs
//      (requiere data-src/gtfs/colectivos/{routes,trips,stops,stop_times}.txt)

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GTFS = join(ROOT, 'data-src', 'gtfs', 'colectivos');
const RED = join(ROOT, 'public', 'data', 'red-v1.json');
const SALIDA = join(ROOT, 'public', 'data', 'colectivos-v1.json');

/** Las que se reconocen por el número. */
const CLASICAS = ['5','7','10','12','15','19','22','24','28','29','34','39','44','45','55','57','59','60','64','65','68','86','92','100','111','118','132','152','168'];

const BBOX = { oeste: -58.95, este: -58.16, sur: -35.02, norte: -34.34 };
const PASO_M = 800;      // separación mínima entre paradas consecutivas que se conservan
const FUSION_M = 180;    // paradas más cerca que esto pasan a ser un solo nodo
const CERCA_EST_M = 400; // parada "de transbordo": se conserva siempre

if (!existsSync(join(GTFS, 'stop_times.txt'))) {
  console.error('Faltan los GTFS de colectivos en data-src/gtfs/colectivos/. Ver README.');
  process.exit(1);
}

// ---------- utilidades ----------
const RAD = Math.PI / 180;
function metros(aLat, aLng, bLat, bLng) {
  const x = (bLng - aLng) * RAD * Math.cos(((aLat + bLat) / 2) * RAD);
  const y = (bLat - aLat) * RAD;
  return Math.sqrt(x * x + y * y) * 6371000;
}
function partirCSV(linea) {
  const out = [];
  let act = '', comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') { if (comillas && linea[i + 1] === '"') { act += '"'; i++; } else comillas = !comillas; }
    else if (c === ',' && !comillas) { out.push(act); act = ''; }
    else act += c;
  }
  out.push(act);
  return out;
}
function leerCSV(archivo) {
  const txt = readFileSync(join(GTFS, archivo), 'utf8');
  const lineas = txt.split(/\r?\n/).filter((l) => l.length);
  const cab = partirCSV(lineas[0].replace(/^﻿/, ''));
  return lineas.slice(1).map((l) => {
    const v = partirCSV(l);
    const o = {};
    cab.forEach((k, i) => (o[k] = v[i]));
    return o;
  });
}
/** "922 MONTES DE OCA MANUEL AV." -> "Av. Montes de Oca Manuel" */
const ABREV = { 'AV.': 'Av.', 'AV': 'Av.', 'GRAL.': 'Gral.', 'GRAL': 'Gral.', 'PTE.': 'Pte.',
  'DR.': 'Dr.', 'EST.': 'Est.', 'PZA.': 'Pza.', 'BV.': 'Bv.', 'CNEL.': 'Cnel.' };
function nombreParada(crudo) {
  let t = crudo.replace(/^\s*\d+\s*/, '').trim();
  const partes = t.split(/\s+/);
  // los sufijos tipo AV. van al principio, como se dice
  const suf = [];
  while (partes.length > 1 && ABREV[partes[partes.length - 1].toUpperCase()]) {
    suf.unshift(ABREV[partes.pop().toUpperCase()]);
  }
  const cuerpo = partes.map((w) => {
    const a = ABREV[w.toUpperCase()];
    if (a) return a;
    if (w.length <= 2 && /^(y|de|del|la|el)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  return [...suf, ...cuerpo].join(' ').replace(/\s+/g, ' ').trim() || crudo;
}

const aMinutos = (hms) => {
  const [h, m, s] = hms.split(':').map(Number);
  return h * 60 + m + (s || 0) / 60;
};

// ---------- 1. rutas de las líneas clásicas ----------
const rutas = new Map(); // route_id -> { linea, ramal, desc }
for (const r of leerCSV('routes.txt')) {
  const m = /^(\d+)/.exec(r.route_short_name || '');
  if (!m || !CLASICAS.includes(m[1])) continue;
  rutas.set(r.route_id, { linea: m[1], ramal: r.route_short_name, desc: r.route_desc || '' });
}
console.log(`Líneas clásicas: ${new Set([...rutas.values()].map((r) => r.linea)).size} · ramales: ${rutas.size}`);

// ---------- 2. viajes candidatos ----------
// Hasta 4 por ramal y sentido; después nos quedamos con el de más paradas.
const candidatos = new Map(); // trip_id -> route_id
const porRamalSentido = new Map();
for (const t of leerCSV('trips.txt')) {
  if (!rutas.has(t.route_id)) continue;
  const k = t.route_id + '|' + (t.direction_id ?? '0');
  const lista = porRamalSentido.get(k) ?? [];
  if (lista.length >= 4) continue;
  lista.push(t.trip_id);
  porRamalSentido.set(k, lista);
  candidatos.set(t.trip_id, t.route_id);
}
console.log(`Viajes candidatos: ${candidatos.size}`);

// ---------- 3. stop_times, en streaming ----------
const secuencias = new Map(); // trip_id -> [{stop_id, orden, min}]
await new Promise((listo) => {
  const rl = createInterface({ input: createReadStream(join(GTFS, 'stop_times.txt')), crlfDelay: Infinity });
  let cab = null, iTrip = 0, iStop = 0, iSeq = 0, iArr = 0, leidas = 0;
  rl.on('line', (linea) => {
    if (!cab) {
      cab = partirCSV(linea.replace(/^﻿/, ''));
      iTrip = cab.indexOf('trip_id'); iStop = cab.indexOf('stop_id');
      iSeq = cab.indexOf('stop_sequence'); iArr = cab.indexOf('arrival_time');
      return;
    }
    if (++leidas % 4000000 === 0) process.stdout.write(`  ${(leidas / 1e6).toFixed(0)}M filas…\r`);
    // corte barato antes de partir la línea entera
    const coma = linea.indexOf(',');
    const trip = coma < 0 ? linea : linea.slice(0, coma);
    if (!candidatos.has(trip)) return;
    const v = partirCSV(linea);
    const arr = candidatos.size ? v[iArr] : '';
    const lista = secuencias.get(v[iTrip]) ?? [];
    lista.push({ stop: v[iStop], orden: +v[iSeq], min: arr ? aMinutos(arr) : 0 });
    secuencias.set(v[iTrip], lista);
  });
  rl.on('close', () => { process.stdout.write('\n'); listo(); });
});
console.log(`Viajes con paradas: ${secuencias.size}`);

// el representativo por ramal+sentido es el de más paradas
const elegidos = [];
for (const [k, trips] of porRamalSentido) {
  let mejor = null;
  for (const t of trips) {
    const s = secuencias.get(t);
    if (s && (!mejor || s.length > mejor.s.length)) mejor = { t, s };
  }
  if (mejor && mejor.s.length >= 5) elegidos.push({ route: k.split('|')[0], paradas: mejor.s.sort((a, b) => a.orden - b.orden) });
}
console.log(`Recorridos elegidos: ${elegidos.length}`);

// ---------- 4. paradas ----------
const paradas = new Map();
for (const s of leerCSV('stops.txt')) paradas.set(s.stop_id, { n: nombreParada(s.stop_name), lat: +s.stop_lat, lng: +s.stop_lon });

const red = JSON.parse(readFileSync(RED, 'utf8'));
const estacionesFijas = red.estaciones.map((e) => ({ lat: e.lat, lng: e.lng }));
const cercaDeEstacion = (lat, lng) =>
  estacionesFijas.some((e) => metros(lat, lng, e.lat, e.lng) <= CERCA_EST_M);

// ---------- 5. armar nodos fusionando por cercanía ----------
const nodos = [];
const grilla = new Map();
const clave = (lat, lng) => `${Math.round(lat / 0.0018)}|${Math.round(lng / 0.0018)}`;
function nodoDe(lat, lng, nombre) {
  const [ci, cj] = clave(lat, lng).split('|').map(Number);
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++)
      for (const k of grilla.get(`${ci + di}|${cj + dj}`) ?? [])
        if (metros(lat, lng, nodos[k].lat, nodos[k].lng) <= FUSION_M) return k;
  const idx = nodos.length;
  nodos.push({ n: nombre, r: 'colectivo', z: null, lat, lng });
  const k = clave(lat, lng);
  grilla.set(k, [...(grilla.get(k) ?? []), idx]);
  return idx;
}

const lineas = [];
for (const rec of elegidos) {
  const meta = rutas.get(rec.route);
  // El recorrido se CORTA en el borde del AMBA, no se perfora: si se filtraran las
  // paradas de afuera una por una (el 57 llega a Mercedes, el 60 a Escobar), las que
  // quedan a los costados del hueco pasarian a ser consecutivas y el tramo entre
  // ellas mediria decenas de minutos. Se toma la tirada contigua mas larga adentro.
  const todas = rec.paradas.map((p) => ({ ...paradas.get(p.stop), min: p.min }));
  const dentro = (p) => p && p.lat >= BBOX.sur && p.lat <= BBOX.norte && p.lng >= BBOX.oeste && p.lng <= BBOX.este;
  let crudas = [], corrida = [];
  for (const p of todas) {
    if (dentro(p)) { corrida.push(p); if (corrida.length > crudas.length) crudas = corrida; }
    else corrida = [];
  }
  if (crudas.length < 5) continue;

  // ralear: cabeceras siempre; intermedias sólo si se alejaron PASO_M o son transbordo
  const conservadas = [];
  crudas.forEach((p, i) => {
    const ultima = conservadas[conservadas.length - 1];
    const esCabecera = i === 0 || i === crudas.length - 1;
    if (esCabecera || !ultima || metros(p.lat, p.lng, ultima.lat, ultima.lng) >= PASO_M || cercaDeEstacion(p.lat, p.lng)) {
      conservadas.push(p);
    }
  });
  if (conservadas.length < 4) continue;

  const sec = [], hops = [];
  let previo = null;
  for (const p of conservadas) {
    const idx = nodoDe(p.lat, p.lng, p.n);
    if (sec.length && idx === sec[sec.length - 1]) continue; // fusionadas: no repetir
    if (previo) {
      const dt = p.min - previo.min;
      // Estimacion de respaldo, sólo si el GTFS no da un horario utilizable. La
      // velocidad NO puede ser plana: un tramo expreso por autopista (el 57 hace
      // 25 km sin parar por el Camino del Buen Ayre) a 16 km/h daba saltos de
      // 98 minutos. Se escala con la distancia.
      const km = metros(previo.lat, previo.lng, p.lat, p.lng) / 1000;
      const vel = km > 8 ? 45 : km > 3 ? 26 : 16;
      const est = (km / vel) * 60;
      hops.push(+(dt > 0.2 && dt < 60 ? dt : est).toFixed(2));
    }
    sec.push(idx);
    previo = p;
  }
  if (sec.length < 4) continue;
  // Los dos sentidos de un ramal comparten nombre: se distinguen por el destino.
  const hasta = nodos[sec[sec.length - 1]].n;
  lineas.push({ nombre: `${meta.ramal} → ${hasta}`, linea: meta.linea, ramal: meta.ramal,
    desc: meta.desc, desde: nodos[sec[0]].n, hasta,
    color: '#f5b301', red: 'colectivo', espera: 6, sec, hops });
}

// ---------- 6. caminatas hacia subte y tren ----------
const caminatas = [];
nodos.forEach((n, i) => {
  red.estaciones.forEach((e, j) => {
    const d = metros(n.lat, n.lng, e.lat, e.lng);
    if (d <= CERCA_EST_M) caminatas.push([i, j, +(d / 1000 / 4.5 * 60 + 1).toFixed(2)]);
  });
});

const salida = { version: 'colectivos-v1', lineasClasicas: CLASICAS, paradas: nodos, lineas, caminatasAEstacion: caminatas };
writeFileSync(SALIDA, JSON.stringify(salida));
const kb = (JSON.stringify(salida).length / 1024).toFixed(0);
console.log(`\nParadas: ${nodos.length} · recorridos: ${lineas.length} · caminatas a subte/tren: ${caminatas.length}`);
console.log(`Escrito ${SALIDA} (${kb} KB)`);
