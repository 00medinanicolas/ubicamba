import { useEffect, useMemo, useState } from 'react';
import type {
  Avenida,
  DatosTransporte,
  DatosZona,
  DesafioTransporte,
  Juego,
  Lugar,
  Modo,
  OpcionTransporte,
  RedTransporte,
  Resultado,
  Sesion,
  ZonaId,
} from './game/tipos';
import {
  RONDAS,
  distanciaM,
  emojiPuntos,
  indicesAlAzar,
  indicesTransporteAlAzar,
  indicesLugaresAlAzar,
  indicesDelDia,
  indicesPorAreas,
  nombreEsquina,
  numeroDia,
  opcionesAvenida,
  opcionesLugar,
  parseURL,
  puntosPorDistancia,
  urlCompartir,
} from './game/logica';
import { fcDeEst, resumenLegs, type LegArmado } from './game/armar';
import { cargarAvenidas, cargarLugares, cargarRed, cargarTransporte, cargarZona } from './game/datos';
import { aceptaRespuesta } from './game/respuestas';
import { cargarSesion, guardarSesion, mismosIndices } from './game/sesion';
import { ZONAS } from './game/zonas';
import GameMap, { type MarcadorAB, type PinResultado } from './map/GameMap';
import type { Basemap } from './map/basemap';
import Menu from './ui/Menu';
import Armado from './ui/Armado';
import PanelFinal, { formatoDistancia, type FilaFinal } from './ui/PanelFinal';
import type { ConfigEsquinas } from './ui/PanelEsquinas';
import type { ConfigTransporte } from './ui/PanelTransporte';
import type { ConfigLugares } from './ui/PanelLugares';
import { colorComuna } from './ui/colores';

function sesionBase(
  zona: ZonaId,
  juego: Juego,
  indices: number[],
  modo: Modo,
  areasSel: number[],
  escribir = false
): Sesion {
  return { zona, juego, indices, modo, areasSel, ronda: 0, fase: 'adivinando', resultados: [], escribir };
}

const ETIQUETA_CAT: Record<string, string> = {
  monumento: 'monumento', estado: 'edificio del Estado', biblioteca: 'biblioteca',
  cultura: 'cultura', museo: 'museo', comida: 'bar o comida típica', estadio: 'estadio',
};

function aplicarURL(s: Sesion) {
  // path actual + query de la partida: funciona igual en / y bajo /ubicamba/ (Pages)
  let url =
    window.location.pathname +
    (s.modo === 'dia'
      ? ''
      : urlCompartir(s.indices, {
          zona: s.zona,
          juego: s.juego,
          areas: s.modo === 'personalizada' ? s.areasSel : undefined,
          escribir: s.escribir,
        }));
  // conservar el shim de testing (dev) a través de las navegaciones internas
  if (new URLSearchParams(window.location.search).has('rafshim')) {
    url += (url.includes('?') ? '&' : '?') + 'rafshim=1';
  }
  window.history.replaceState(null, '', url);
}

const iconoRed = (r: 'subte' | 'tren') => (r === 'subte' ? '🚇' : '🚆');

export default function App() {
  const [datos, setDatos] = useState<DatosZona | null>(null);
  const [avenidas, setAvenidas] = useState<Avenida[] | null>(null);
  const [transporte, setTransporte] = useState<DatosTransporte | null>(null);
  const [lugares, setLugares] = useState<Lugar[] | null>(null);
  const [escrito, setEscrito] = useState('');
  const [red, setRed] = useState<RedTransporte | null>(null);
  const [armadoLegs, setArmadoLegs] = useState<LegArmado[]>([]);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [verComunas, setVerComunas] = useState(false);
  const [verAreas, setVerAreas] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('plano');

  // ---------- arranque: URL → datos → sesión ----------
  useEffect(() => {
    (async () => {
      try {
        const p = parseURL();
        const d = await cargarZona(p.zona);
        let avs: Avenida[] | null = null;
        let tr: DatosTransporte | null = null;
        let s: Sesion;

        if (p.juego === 'transporte' || p.juego === 'armar') {
          const [datosTr, redTr] = await Promise.all([cargarTransporte(), cargarRed()]);
          tr = datosTr;
          setRed(redTr);
          // Con `e=` en la URL mandan esos índices tal cual, aunque incluyan viajes
          // `soloArmar`: un link compartido tiene que reproducir la MISMA partida.
          // Sin `e=`, el sorteo respeta la mecánica.
          const validos = p.indices && p.indices.every((i) => i < datosTr.desafios.length);
          s = sesionBase(
            'caba',
            p.juego,
            validos ? p.indices! : indicesTransporteAlAzar(datosTr.desafios, p.juego),
            'link',
            []
          );
        } else if (p.juego === 'lugares') {
          const lug = await cargarLugares();
          setLugares(lug);
          const validos = p.indices && p.indices.every((i) => i < lug.length);
          s = sesionBase(
            'caba',
            'lugares',
            validos ? p.indices! : indicesLugaresAlAzar(lug, [], []),
            'link',
            [],
            p.escribir
          );
        } else if (p.juego === 'avenidas') {
          avs = await cargarAvenidas();
          const validos = p.indices && p.indices.every((i) => i < avs!.length);
          s = sesionBase('caba', 'avenidas', validos ? p.indices! : indicesAlAzar(avs.length), 'link', []);
        } else {
          const indices = p.indices && p.indices.every((i) => i < d.esquinas.length) ? p.indices : null;
          let modo: Modo = 'link';
          let areasSel: number[] = [];
          if (
            indices &&
            p.areasParam &&
            p.areasParam.every((id) => d.areas.some((a) => a.id === id)) &&
            indices.every((i) => p.areasParam!.includes(d.esquinas[i].b))
          ) {
            modo = 'personalizada';
            areasSel = p.areasParam;
          }
          if (indices) {
            s = sesionBase(p.zona, 'esquinas', indices, modo, areasSel);
          } else if (p.zona === 'caba') {
            s = sesionBase('caba', 'esquinas', indicesDelDia(numeroDia(new Date()), d.esquinas.length), 'dia', []);
          } else {
            s = sesionBase(p.zona, 'esquinas', indicesAlAzar(d.esquinas.length), 'link', []);
          }
        }

        const guardada = cargarSesion();
        if (
          guardada &&
          guardada.zona === s.zona &&
          guardada.juego === s.juego &&
          guardada.modo === s.modo &&
          mismosIndices(guardada.indices, s.indices)
        ) {
          s = { ...s, ronda: guardada.ronda, fase: guardada.fase, resultados: guardada.resultados };
        }
        aplicarURL(s);
        setDatos(d);
        setAvenidas(avs);
        setTransporte(tr);
        setSesion(s);
      } catch (e) {
        setErrorCarga(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (sesion) guardarSesion(sesion);
  }, [sesion]);

  // avance automático tras la revelación (también hay botón "Siguiente")
  useEffect(() => {
    if (sesion?.fase !== 'revelada') return;
    const t = setTimeout(avanzar, 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.fase, sesion?.ronda]);

  // ---------- helpers de partida ----------
  const totalRondas = sesion?.indices.length ?? RONDAS;

  function empezar(s: Sesion, d: DatosZona) {
    aplicarURL(s);
    setCopiado(false);
    setDatos(d);
    setSesion(s);
  }

  async function pedirZona(z: ZonaId) {
    return cargarZona(z);
  }

  async function pedirTransporte() {
    const [tr, redTr] = await Promise.all([cargarTransporte(), cargarRed()]);
    setTransporte(tr);
    setRed(redTr);
    return tr.desafios;
  }

  async function pedirLugares() {
    const l = await cargarLugares();
    setLugares(l);
    return l;
  }

  async function jugarLugares(config: ConfigLugares, disponibles: number[]) {
    const [d, lug] = await Promise.all([cargarZona('caba'), cargarLugares()]);
    setLugares(lug);
    const pool = [...disponibles];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    empezar(
      sesionBase('caba', 'lugares', pool.slice(0, config.rondas), 'link', [], config.modalidad === 'escribir'),
      d
    );
  }

  async function irAlDia(dia: number, modo: Modo) {
    const d = await cargarZona('caba');
    empezar(sesionBase('caba', 'esquinas', indicesDelDia(dia, d.esquinas.length), modo, []), d);
  }

  async function jugarEsquinas(config: ConfigEsquinas) {
    const d = await cargarZona(config.zona);
    const indices = config.areas
      ? indicesPorAreas(d.esquinas, config.areas, config.rondas)
      : indicesAlAzar(d.esquinas.length, config.rondas);
    empezar(
      sesionBase(config.zona, 'esquinas', indices, config.areas ? 'personalizada' : 'link', config.areas ?? []),
      d
    );
  }

  async function jugarAvenidas(rondas: number) {
    const [d, avs] = await Promise.all([cargarZona('caba'), cargarAvenidas()]);
    setAvenidas(avs);
    empezar(sesionBase('caba', 'avenidas', indicesAlAzar(avs.length, rondas), 'link', []), d);
  }

  async function jugarTransporte(config: ConfigTransporte, disponibles: number[]) {
    const d = await cargarZona('caba');
    const pool = [...disponibles];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const juegoNuevo: Juego = config.mecanica === 'armar' ? 'armar' : 'transporte';
    empezar(sesionBase('caba', juegoNuevo, pool.slice(0, config.rondas), 'link', []), d);
  }

  function repetirPartida() {
    if (!sesion || !datos) return;
    if ((sesion.juego === 'transporte' || sesion.juego === 'armar') && transporte) {
      empezar(
        sesionBase(
          'caba',
          sesion.juego,
          indicesTransporteAlAzar(transporte.desafios, sesion.juego, sesion.indices.length),
          'link',
          []
        ),
        datos
      );
      return;
    }
    if (sesion.juego === 'lugares' && lugares) {
      empezar(
        sesionBase(
          'caba', 'lugares',
          indicesLugaresAlAzar(lugares, [], [], sesion.indices.length),
          'link', [], sesion.escribir
        ),
        datos
      );
      return;
    }
    if (sesion.juego === 'avenidas' && avenidas) {
      empezar(sesionBase('caba', 'avenidas', indicesAlAzar(avenidas.length, sesion.indices.length), 'link', []), datos);
      return;
    }
    empezar(
      sesionBase(sesion.zona, 'esquinas', indicesAlAzar(datos.esquinas.length, sesion.indices.length), 'link', []),
      datos
    );
  }

  function avanzar() {
    setSesion((s) => {
      if (!s || s.fase !== 'revelada') return s;
      return s.ronda + 1 >= s.indices.length
        ? { ...s, fase: 'terminado' }
        : { ...s, ronda: s.ronda + 1, fase: 'adivinando' };
    });
  }

  // ---------- jugadas ----------
  function manejarPick(latlng: [number, number]) {
    if (!sesion || !datos || sesion.fase !== 'adivinando' || sesion.juego !== 'esquinas') return;
    const e = datos.esquinas[sesion.indices[sesion.ronda]];
    const d = distanciaM(latlng, [e.lat, e.lng]);
    const r: Resultado = { idx: sesion.indices[sesion.ronda], guess: latlng, distancia: d, puntos: puntosPorDistancia(d) };
    setSesion((s) => (s ? { ...s, fase: 'revelada', resultados: [...s.resultados, r] } : s));
  }

  function manejarOpcion(nombre: string) {
    if (!sesion || !avenidas || sesion.fase !== 'adivinando' || sesion.juego !== 'avenidas') return;
    const idx = sesion.indices[sesion.ronda];
    const correcta = avenidas[idx].nombre === nombre;
    const r: Resultado = { idx, guess: null, eleccion: nombre, distancia: 0, puntos: correcta ? 100 : 0 };
    setSesion((s) => (s ? { ...s, fase: 'revelada', resultados: [...s.resultados, r] } : s));
  }

  /** Modo Lugares. `texto` es lo que el jugador escribió (o eligió); vacío = se rindió. */
  function manejarLugar(texto: string) {
    if (!sesion || !lugares || sesion.fase !== 'adivinando' || sesion.juego !== 'lugares') return;
    const idx = sesion.indices[sesion.ronda];
    const l = lugares[idx];
    const correcta = sesion.escribir
      ? aceptaRespuesta(texto, l.n, l.a ?? [])
      : texto === l.n;
    const r: Resultado = {
      idx,
      guess: null,
      eleccion: texto || '(paso)',
      distancia: 0,
      puntos: correcta ? 100 : 0,
    };
    setEscrito('');
    setSesion((s) => (s ? { ...s, fase: 'revelada', resultados: [...s.resultados, r] } : s));
  }

  function manejarItinerario(opcionIdx: number) {
    if (!sesion || !transporte || sesion.fase !== 'adivinando' || sesion.juego !== 'transporte') return;
    const idx = sesion.indices[sesion.ronda];
    const desafio = transporte.desafios[idx];
    const elegida = desafio.opciones[opcionIdx];
    const optima = desafio.opciones.find((o) => o.optima)!;
    const puntos = elegida.optima ? 100 : Math.max(0, 100 - 3 * (elegida.minutos - optima.minutos));
    const r: Resultado = { idx, guess: null, eleccion: String(opcionIdx), distancia: 0, puntos };
    setSesion((s) => (s ? { ...s, fase: 'revelada', resultados: [...s.resultados, r] } : s));
  }

  function manejarLlegada(minutos: number, legs: LegArmado[]) {
    if (!sesion || !transporte || sesion.juego !== 'armar') return;
    const idx = sesion.indices[sesion.ronda];
    const optima = transporte.desafios[idx].opciones.find((o) => o.optima)!;
    const puntos = minutos <= optima.minutos + 1.5 ? 100 : Math.max(0, Math.round(100 - 3 * (minutos - optima.minutos)));
    const r: Resultado = { idx, guess: null, eleccion: resumenLegs(legs), distancia: minutos, puntos };
    setSesion((s) => (s ? { ...s, fase: 'revelada', resultados: [...s.resultados, r] } : s));
  }

  function manejarRendirse() {
    if (!sesion || sesion.juego !== 'armar') return;
    const idx = sesion.indices[sesion.ronda];
    const r: Resultado = { idx, guess: null, eleccion: '(te rendiste)', distancia: 0, puntos: 0 };
    setSesion((s) => (s ? { ...s, fase: 'revelada', resultados: [...s.resultados, r] } : s));
  }

  // ---------- derivados ----------
  const zona = ZONAS[sesion?.zona ?? 'caba'];
  const juego = sesion?.juego ?? 'esquinas';
  const esTransporte = juego === 'transporte' || juego === 'armar';

  const esquinaActual = juego === 'esquinas' && sesion && datos ? datos.esquinas[sesion.indices[sesion.ronda]] : null;
  const avenidaActual = juego === 'avenidas' && sesion && avenidas ? avenidas[sesion.indices[sesion.ronda]] : null;
  const lugarActual =
    juego === 'lugares' && sesion && lugares && sesion.fase !== 'terminado'
      ? lugares[sesion.indices[sesion.ronda]]
      : null;
  const desafioActual =
    esTransporte && sesion && transporte && sesion.fase !== 'terminado'
      ? transporte.desafios[sesion.indices[sesion.ronda]]
      : null;

  // el viaje armado se descarta al pasar de ronda o de juego
  useEffect(() => {
    setEscrito('');
    setArmadoLegs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.ronda, juego]);

  /** nombre y color de un tramo, resueltos contra la red */
  function infoLeg(l: { li: number; est: number[] }) {
    if (!red || l.li < 0) return { nombre: 'a pie', color: '#94a3b8', icono: '🚶', paradas: 0 };
    const linea = red.lineas[l.li];
    return { nombre: linea.nombre, color: linea.color, icono: iconoRed(linea.red), paradas: l.est.length - 1 };
  }

  const resumenOpcion = (op: OpcionTransporte) => op.legs.filter((l) => l.li >= 0).map((l) => infoLeg(l).nombre).join(' → ');

  const opciones = useMemo(
    () =>
      juego === 'avenidas' && sesion && avenidas && sesion.fase !== 'terminado'
        ? opcionesAvenida(avenidas, sesion.indices[sesion.ronda])
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [juego, sesion?.ronda, sesion?.indices, avenidas]
  );

  const opcionesLug = useMemo(
    () =>
      juego === 'lugares' && sesion && lugares && !sesion.escribir && sesion.fase !== 'terminado'
        ? opcionesLugar(lugares, sesion.indices[sesion.ronda])
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [juego, sesion?.ronda, sesion?.indices, sesion?.escribir, lugares]
  );

  const ultimo = sesion?.resultados[sesion.resultados.length - 1];

  const destacado = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (avenidaActual && sesion?.fase !== 'terminado') {
      return {
        type: 'FeatureCollection',
        features: avenidaActual.lineas.map((l) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: l },
        })),
      };
    }
    if (desafioActual && red && sesion?.fase === 'revelada') {
      return fcDeEst(red, desafioActual.opciones.find((o) => o.optima)!.legs);
    }
    if (juego === 'armar' && red && sesion?.fase === 'adivinando' && armadoLegs.length) {
      return fcDeEst(red, armadoLegs);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avenidaActual, desafioActual, sesion?.fase, juego, red, armadoLegs]);

  const trazadoMalo = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!desafioActual || !red || sesion?.fase !== 'revelada' || !ultimo) return null;
    if (juego === 'armar') {
      return ultimo.puntos === 100 || !armadoLegs.length ? null : fcDeEst(red, armadoLegs);
    }
    if (!ultimo.eleccion) return null;
    const elegida = desafioActual.opciones[+ultimo.eleccion];
    return elegida.optima ? null : fcDeEst(red, elegida.legs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desafioActual, sesion?.fase, ultimo, juego, red, armadoLegs]);

  const marcadoresAB = useMemo<MarcadorAB[] | null>(() => {
    if (lugarActual) {
      return [{ latlng: [lugarActual.lat, lugarActual.lng], etiqueta: '?', color: '#e3b341' }];
    }
    if (!desafioActual || !red) return null;
    const o = red.estaciones[desafioActual.o];
    const d = red.estaciones[desafioActual.d];
    return [
      { latlng: [o.lat, o.lng], etiqueta: 'A', color: '#22c55e' },
      { latlng: [d.lat, d.lng], etiqueta: 'B', color: '#ef4444' },
    ];
  }, [desafioActual, red, lugarActual]);

  const pins: PinResultado[] = useMemo(() => {
    if (!sesion || !datos || sesion.juego !== 'esquinas') return [];
    return sesion.resultados.map((r, i) => {
      const e = datos.esquinas[r.idx];
      return { guess: r.guess!, actual: [e.lat, e.lng], etiqueta: `R${i + 1}` };
    });
  }, [sesion, datos]);

  const total = sesion?.resultados.reduce((acc, r) => acc + r.puntos, 0) ?? 0;

  function areaDe(idx: number) {
    return datos!.areas[datos!.esquinas[idx].b - 1];
  }

  function tituloPartida(s: Sesion): string {
    if (s.juego === 'transporte') return 'Cómo llegar (A→B)';
    if (s.juego === 'armar') return 'Armá tu viaje (A→B)';
    if (s.juego === 'avenidas') return 'Modo Avenidas';
    if (s.juego === 'lugares') return `Lugares típicos (${s.escribir ? 'escritas' : 'opciones'})`;
    if (s.modo === 'dia') {
      return `Mapa del día · ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
    }
    const nombreZona = ZONAS[s.zona].corto;
    if (s.modo === 'personalizada') {
      const nombres = s.areasSel.map((id) => datos?.areas.find((a) => a.id === id)?.nombre).filter(Boolean);
      return nombres.length <= 3 ? `${nombreZona} · solo ${nombres.join(', ')}` : `${nombreZona} · ${nombres.length} áreas`;
    }
    return s.zona === 'caba' ? 'Partida libre' : `Partida libre · ${nombreZona}`;
  }

  async function compartirResultado() {
    if (!sesion) return;
    const lineaPuntos = sesion.resultados.map((r) => `${r.puntos}${emojiPuntos(r.puntos)}`).join(' ');
    const link = `${window.location.origin}${window.location.pathname}${urlCompartir(sesion.indices, {
      zona: sesion.zona,
      juego: sesion.juego,
      areas: sesion.modo === 'personalizada' ? sesion.areasSel : undefined,
      escribir: sesion.escribir,
    })}`;
    const texto = `🧭 UbicAMBA — ${tituloPartida(sesion)}\n${lineaPuntos}\nTotal: ${total}/${sesion.indices.length * 100}\nJugala vos: ${link}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado */
    }
  }

  const filasFinal: FilaFinal[] = useMemo(() => {
    if (!sesion || !datos) return [];
    return sesion.resultados.map((r, i) => {
      const etiqueta = `R${i + 1}`;
      if ((sesion.juego === 'transporte' || sesion.juego === 'armar') && transporte && red) {
        const d = transporte.desafios[r.idx];
        const optima = d.opciones.find((o) => o.optima)!;
        const ok = r.puntos === 100;
        const sub =
          sesion.juego === 'armar'
            ? `tu viaje: ${r.eleccion}${r.distancia ? ` (${Math.round(r.distancia)} min, óptima ${optima.minutos})` : ''}`
            : resumenOpcion(optima);
        return {
          etiqueta,
          titulo: `${red.estaciones[d.o].n} → ${red.estaciones[d.d].n}`,
          sub,
          resultado: ok ? '✔ 100 pts' : `${r.puntos} pts`,
        };
      }
      if (sesion.juego === 'lugares' && lugares) {
        const l = lugares[r.idx];
        const ok = r.puntos === 100;
        return {
          etiqueta,
          titulo: l.n,
          sub: `${ETIQUETA_CAT[l.cat] ?? l.cat} · ${l.z === 'caba' ? 'CABA' : 'Provincia'}`,
          resultado: ok ? '✔ 100 pts' : `✘ ${r.eleccion ?? ''} — 0 pts`,
        };
      }
      if (sesion.juego === 'avenidas' && avenidas) {
        const av = avenidas[r.idx];
        const ok = r.puntos === 100;
        return {
          etiqueta,
          titulo: av.nombre,
          sub: `recorre ${av.barrios.slice(0, 4).join(', ')}${av.barrios.length > 4 ? '…' : ''}`,
          resultado: ok ? '✔ 100 pts' : `✘ ${r.eleccion ?? ''} — 0 pts`,
        };
      }
      const e = datos.esquinas[r.idx];
      const a = areaDe(r.idx);
      return {
        etiqueta,
        titulo: nombreEsquina(e),
        sub: a.grupo ? `${a.nombre} · Comuna ${a.grupo}` : `Partido de ${a.nombre}`,
        resultado: `${formatoDistancia(r.distancia)} — ${r.puntos} pts`,
        colorPunto: a.grupo ? colorComuna(a.grupo) : '#4cc2ff',
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion, datos, avenidas, transporte, red, lugares]);

  // ---------- render ----------
  if (errorCarga) {
    return (
      <div className="pantalla-carga">
        <div>😕 No se pudieron cargar los datos del juego.</div>
        <small>{errorCarga}</small>
      </div>
    );
  }
  if (!sesion || !datos) {
    return <div className="pantalla-carga">🧭 Cargando UbicAMBA…</div>;
  }

  const areaReveal = ultimo && juego === 'esquinas' ? areaDe(ultimo.idx) : null;
  const avenidaReveal = ultimo && juego === 'avenidas' && avenidas ? avenidas[ultimo.idx] : null;
  const lugarReveal = ultimo && juego === 'lugares' && lugares && sesion.fase === 'revelada' ? lugares[ultimo.idx] : null;
  const revealTransporte: DesafioTransporte | null =
    ultimo && esTransporte && transporte && sesion.fase === 'revelada' ? transporte.desafios[ultimo.idx] : null;

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-fila">
          <span className="marca">
            🧭 UbicAMBA{' '}
            <small className="marca-sub">
              {esTransporte ? 'A→B' : juego === 'lugares' ? 'Lugares' : zona.corto}
            </small>
          </span>
          {sesion.fase === 'terminado' ? (
            <span className="ronda">¡Juego terminado!</span>
          ) : (
            <span className="ronda">Ronda {sesion.ronda + 1} / {totalRondas}</span>
          )}
          <Menu
            zona={zona}
            datos={datos}
            desafiosTransporte={transporte?.desafios ?? null}
            onPedirZona={pedirZona}
            onPedirTransporte={pedirTransporte}
            onPedirLugares={pedirLugares}
            onDia={() => irAlDia(numeroDia(new Date()), 'dia')}
            onEsquinas={jugarEsquinas}
            onAvenidas={jugarAvenidas}
            onTransporte={jugarTransporte}
            onLugares={jugarLugares}
            onArchivo={(dia) => irAlDia(dia, 'link')}
          />
          <span className="puntaje">Puntaje: {total}</span>
        </div>
        {sesion.fase !== 'terminado' && (
          <div className="consigna">
            {esTransporte && desafioActual && red ? (
              <>
                ¿Cómo conviene ir de {iconoRed(red.estaciones[desafioActual.o].r)}{' '}
                <strong>{red.estaciones[desafioActual.o].n}</strong> a{' '}
                {iconoRed(red.estaciones[desafioActual.d].r)} <strong>{red.estaciones[desafioActual.d].n}</strong>?
              </>
            ) : juego === 'avenidas' ? (
              <>¿Qué avenida es la <strong>marcada en celeste</strong>?</>
            ) : juego === 'lugares' ? (
              <>¿Qué lugar es el <strong>marcado en el mapa</strong>?</>
            ) : (
              esquinaActual && (
                <>
                  Encontrá: <strong>{esquinaActual.s1}</strong>
                  {esquinaActual.s2 && <> y <strong>{esquinaActual.s2}</strong></>}
                </>
              )
            )}
          </div>
        )}
      </header>

      <div className="mapa-wrap">
        <GameMap
          zona={zona}
          basemap={basemap}
          resultados={pins}
          clickHabilitado={sesion.fase === 'adivinando' && juego === 'esquinas'}
          onPick={manejarPick}
          verComunas={verComunas}
          verAreas={verAreas}
          destacado={destacado}
          trazadoMalo={trazadoMalo}
          marcadoresAB={marcadoresAB}
        />
        <div className="controles-mapa">
          {zona.overlays.some((o) => o.grupo === 'comunas') && (
            <button
              type="button"
              className={verComunas ? 'activo' : ''}
              onClick={() => setVerComunas((v) => !v)}
              title="Mostrar límites de las 15 comunas"
            >
              Comunas
            </button>
          )}
          <button
            type="button"
            className={verAreas ? 'activo' : ''}
            onClick={() => setVerAreas((v) => !v)}
            title={`Mostrar límites de ${zona.etiquetaAreas.toLowerCase()}`}
          >
            {zona.etiquetaAreas}
          </button>
          <button
            type="button"
            onClick={() => setBasemap((b) => (b === 'plano' ? 'satelite' : 'plano'))}
            title="Alternar entre plano y vista satelital"
          >
            {basemap === 'plano' ? 'Satélite' : 'Plano'}
          </button>
        </div>
      </div>

      <footer className="pie">
        {sesion.fase === 'adivinando' && juego === 'esquinas' && (
          <span className="pista">Tocá el mapa donde creés que está la esquina</span>
        )}
        {sesion.fase === 'adivinando' && juego === 'avenidas' && (
          <div className="opciones">
            {opciones.map((op) => (
              <button key={op} type="button" className="btn-opcion" onClick={() => manejarOpcion(op)}>
                {op}
              </button>
            ))}
          </div>
        )}
        {sesion.fase === 'adivinando' && juego === 'lugares' && !sesion.escribir && (
          <div className="opciones">
            {opcionesLug.map((op) => (
              <button key={op} type="button" className="btn-opcion" onClick={() => manejarLugar(op)}>
                {op}
              </button>
            ))}
          </div>
        )}
        {sesion.fase === 'adivinando' && juego === 'lugares' && sesion.escribir && (
          <form
            className="respuesta-escrita"
            onSubmit={(e) => {
              e.preventDefault();
              if (escrito.trim()) manejarLugar(escrito.trim());
            }}
          >
            <input
              type="text"
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              placeholder="Escribí qué lugar es…"
              aria-label="Nombre del lugar"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="btn-primario" disabled={!escrito.trim()}>
              Responder
            </button>
            <button type="button" className="btn-opcion btn-paso" onClick={() => manejarLugar('')}>
              Paso
            </button>
          </form>
        )}
        {sesion.fase === 'adivinando' && juego === 'armar' && desafioActual && red && (
          <Armado
            red={red}
            desafio={desafioActual}
            onCambio={setArmadoLegs}
            onLlegada={manejarLlegada}
            onRendirse={manejarRendirse}
          />
        )}
        {sesion.fase === 'adivinando' && juego === 'transporte' && desafioActual && (
          <div className="opciones opciones-transporte">
            {desafioActual.opciones.map((op, i) => (
              <button key={i} type="button" className="btn-opcion btn-itinerario" onClick={() => manejarItinerario(i)}>
                <span className="itinerario-legs">
                  {/* las caminatas cortas son transbordos internos: no aportan a la decisión */}
                  {op.legs
                    .filter((l) => l.li >= 0 || l.min >= 4)
                    .map((l, j) => {
                      const info = infoLeg(l);
                      return (
                        <span key={j} className="leg-chip" style={{ '--color-leg': info.color } as React.CSSProperties}>
                          {info.icono} {info.nombre}
                          {info.paradas > 0 && <small> ·{info.paradas}</small>}
                        </span>
                      );
                    })}
                </span>
                <small className="itinerario-transbordos">
                  {(() => {
                    const n = op.legs.filter((l) => l.li >= 0).length - 1;
                    return n === 0 ? 'viaje directo' : n === 1 ? '1 combinación' : `${n} combinaciones`;
                  })()}
                </small>
              </button>
            ))}
          </div>
        )}
        {sesion.fase === 'revelada' && ultimo && areaReveal && esquinaActual && (
          <div className="ficha">
            <div className="ficha-dato">
              📍 <strong>{nombreEsquina(datos.esquinas[ultimo.idx])}</strong>{' '}
              {areaReveal.grupo ? (
                <>está en <strong>{areaReveal.nombre}</strong> (Comuna {areaReveal.grupo})</>
              ) : (
                <>está en el partido de <strong>{areaReveal.nombre}</strong></>
              )}
            </div>
            <div className="ficha-resultado">
              Te equivocaste por {formatoDistancia(ultimo.distancia)} — <strong>{ultimo.puntos} pts</strong>
              <button type="button" className="btn-primario btn-siguiente" onClick={avanzar}>
                {sesion.ronda + 1 >= totalRondas ? 'Ver resultado' : 'Siguiente →'}
              </button>
            </div>
          </div>
        )}
        {sesion.fase === 'revelada' && ultimo && avenidaReveal && (
          <div className="ficha">
            <div className="ficha-dato">
              {ultimo.puntos === 100 ? '✔ ¡Correcta! ' : <>✘ Marcaste <em>{ultimo.eleccion}</em>. Era </>}
              <strong>{avenidaReveal.nombre}</strong> — recorre{' '}
              {avenidaReveal.barrios.slice(0, 5).join(', ')}
              {avenidaReveal.barrios.length > 5 ? '…' : ''}
            </div>
            <div className="ficha-resultado">
              <strong>{ultimo.puntos} pts</strong>
              <button type="button" className="btn-primario btn-siguiente" onClick={avanzar}>
                {sesion.ronda + 1 >= totalRondas ? 'Ver resultado' : 'Siguiente →'}
              </button>
            </div>
          </div>
        )}
        {sesion.fase === 'revelada' && ultimo && lugarReveal && (
          <div className="ficha">
            <div className="ficha-dato">
              {ultimo.puntos === 100 ? (
                '✔ ¡Correcta! '
              ) : ultimo.eleccion && ultimo.eleccion !== '(paso)' ? (
                <>✘ Dijiste <em>{ultimo.eleccion}</em>. Era </>
              ) : (
                <>✘ Era </>
              )}
              <strong>{lugarReveal.n}</strong> — {ETIQUETA_CAT[lugarReveal.cat] ?? lugarReveal.cat},{' '}
              {lugarReveal.z === 'caba' ? 'CABA' : 'Provincia de Buenos Aires'}
            </div>
            <div className="ficha-resultado">
              <strong>{ultimo.puntos} pts</strong>
              <button type="button" className="btn-primario btn-siguiente" onClick={avanzar}>
                {sesion.ronda + 1 >= totalRondas ? 'Ver resultado' : 'Siguiente →'}
              </button>
            </div>
          </div>
        )}
        {revealTransporte && ultimo && (
          <div className="ficha">
            <div className="ficha-dato">
              {(() => {
                const optima = revealTransporte.opciones.find((o) => o.optima)!;
                const ruta = resumenOpcion(optima);
                if (juego === 'armar') {
                  if (!ultimo.distancia) {
                    return (
                      <>
                        🏳 Te rendiste. La óptima era <strong>{optima.minutos} min</strong>: {ruta}
                      </>
                    );
                  }
                  return ultimo.puntos === 100 ? (
                    <>
                      🏁 ¡Llegaste en <strong>{Math.round(ultimo.distancia)} min</strong> — tan rápido como la óptima!
                    </>
                  ) : (
                    <>
                      🏁 Llegaste en <strong>{Math.round(ultimo.distancia)} min</strong>; la óptima era{' '}
                      <strong>{optima.minutos} min</strong>: {ruta}
                    </>
                  );
                }
                const elegida = revealTransporte.opciones[+ultimo.eleccion!];
                return elegida.optima ? (
                  <>
                    ✔ ¡La más rápida! <strong>{optima.minutos} min</strong>: {ruta}
                  </>
                ) : (
                  <>
                    ✘ La tuya tardaba <strong>{elegida.minutos} min</strong>; la mejor era{' '}
                    <strong>{optima.minutos} min</strong>: {ruta}
                  </>
                );
              })()}
            </div>
            <div className="ficha-resultado">
              <strong>{ultimo.puntos} pts</strong>
              <button type="button" className="btn-primario btn-siguiente" onClick={avanzar}>
                {sesion.ronda + 1 >= totalRondas ? 'Ver resultado' : 'Siguiente →'}
              </button>
            </div>
          </div>
        )}
        {sesion.fase === 'terminado' && (
          <PanelFinal
            filas={filasFinal}
            total={total}
            copiado={copiado}
            onCompartir={compartirResultado}
            onNueva={repetirPartida}
          />
        )}
      </footer>
    </div>
  );
}
