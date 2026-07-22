import { useEffect, useMemo, useState } from 'react';
import type { Avenida, DatosZona, Juego, Modo, Resultado, Sesion, ZonaId } from './game/tipos';
import {
  RONDAS,
  distanciaM,
  emojiPuntos,
  indicesAlAzar,
  indicesDelDia,
  indicesPorAreas,
  nombreEsquina,
  numeroDia,
  opcionesAvenida,
  parseURL,
  puntosPorDistancia,
  urlCompartir,
} from './game/logica';
import { cargarAvenidas, cargarZona } from './game/datos';
import { cargarSesion, guardarSesion, mismosIndices } from './game/sesion';
import { ZONAS } from './game/zonas';
import GameMap, { type PinResultado } from './map/GameMap';
import type { Basemap } from './map/basemap';
import Menu, { colorComuna } from './ui/Menu';
import PanelFinal, { formatoDistancia, type FilaFinal } from './ui/PanelFinal';

function sesionBase(zona: ZonaId, juego: Juego, indices: number[], modo: Modo, areasSel: number[]): Sesion {
  return { zona, juego, indices, modo, areasSel, ronda: 0, fase: 'adivinando', resultados: [] };
}

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
        }));
  // conservar el shim de testing (dev) a través de las navegaciones internas
  if (new URLSearchParams(window.location.search).has('rafshim')) {
    url += (url.includes('?') ? '&' : '?') + 'rafshim=1';
  }
  window.history.replaceState(null, '', url);
}

export default function App() {
  const [datos, setDatos] = useState<DatosZona | null>(null);
  const [avenidas, setAvenidas] = useState<Avenida[] | null>(null);
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
        let s: Sesion;

        if (p.juego === 'avenidas') {
          avs = await cargarAvenidas();
          const validos = p.indices && p.indices.every((i) => i < avs!.length);
          s = sesionBase('caba', 'avenidas', validos ? p.indices! : indicesAlAzar(avs.length), 'link', []);
        } else {
          let indices = p.indices && p.indices.every((i) => i < d.esquinas.length) ? p.indices : null;
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
  function empezar(s: Sesion, d: DatosZona, avs: Avenida[] | null) {
    aplicarURL(s);
    setCopiado(false);
    setDatos(d);
    if (avs) setAvenidas(avs);
    setSesion(s);
  }

  async function cambiarZona(z: ZonaId) {
    const d = await cargarZona(z);
    const s =
      z === 'caba'
        ? sesionBase('caba', 'esquinas', indicesDelDia(numeroDia(new Date()), d.esquinas.length), 'dia', [])
        : sesionBase(z, 'esquinas', indicesAlAzar(d.esquinas.length), 'link', []);
    empezar(s, d, null);
  }

  async function irAlDia(dia: number, modo: Modo) {
    const d = await cargarZona('caba');
    empezar(sesionBase('caba', 'esquinas', indicesDelDia(dia, d.esquinas.length), modo, []), d, null);
  }

  function practicaLibre() {
    if (!datos || !sesion) return;
    if (sesion.juego === 'avenidas' && avenidas) {
      empezar(sesionBase('caba', 'avenidas', indicesAlAzar(avenidas.length), 'link', []), datos, avenidas);
      return;
    }
    empezar(sesionBase(sesion.zona, 'esquinas', indicesAlAzar(datos.esquinas.length), 'link', []), datos, null);
  }

  function porAreas(ids: number[]) {
    if (!datos || !sesion) return;
    empezar(sesionBase(sesion.zona, 'esquinas', indicesPorAreas(datos.esquinas, ids), 'personalizada', ids), datos, null);
  }

  async function modoAvenidas() {
    const [d, avs] = await Promise.all([cargarZona('caba'), cargarAvenidas()]);
    empezar(sesionBase('caba', 'avenidas', indicesAlAzar(avs.length), 'link', []), d, avs);
  }

  function avanzar() {
    setSesion((s) => {
      if (!s || s.fase !== 'revelada') return s;
      return s.ronda + 1 >= RONDAS ? { ...s, fase: 'terminado' } : { ...s, ronda: s.ronda + 1, fase: 'adivinando' };
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

  // ---------- derivados ----------
  const zona = ZONAS[sesion?.zona ?? 'caba'];
  const esAvenidas = sesion?.juego === 'avenidas';

  const esquinaActual = !esAvenidas && sesion && datos ? datos.esquinas[sesion.indices[sesion.ronda]] : null;
  const avenidaActual = esAvenidas && sesion && avenidas ? avenidas[sesion.indices[sesion.ronda]] : null;

  const opciones = useMemo(
    () => (esAvenidas && sesion && avenidas && sesion.fase !== 'terminado' ? opcionesAvenida(avenidas, sesion.indices[sesion.ronda]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esAvenidas, sesion?.ronda, sesion?.indices, avenidas]
  );

  const destacado = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!avenidaActual || sesion?.fase === 'terminado') return null;
    return {
      type: 'FeatureCollection',
      features: avenidaActual.lineas.map((l) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: l },
      })),
    };
  }, [avenidaActual, sesion?.fase]);

  const pins: PinResultado[] = useMemo(() => {
    if (!sesion || !datos || sesion.juego !== 'esquinas') return [];
    return sesion.resultados.map((r, i) => {
      const e = datos.esquinas[r.idx];
      return { guess: r.guess!, actual: [e.lat, e.lng], etiqueta: `R${i + 1}` };
    });
  }, [sesion, datos]);

  const total = sesion?.resultados.reduce((acc, r) => acc + r.puntos, 0) ?? 0;
  const ultimo = sesion?.resultados[sesion.resultados.length - 1];

  function areaDe(idx: number) {
    return datos!.areas[datos!.esquinas[idx].b - 1];
  }

  function tituloPartida(s: Sesion): string {
    if (s.juego === 'avenidas') return 'Modo Avenidas';
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
    })}`;
    const texto = `🧭 UbicAMBA — ${tituloPartida(sesion)}\n${lineaPuntos}\nTotal: ${total}/${RONDAS * 100}\nJugala vos: ${link}`;
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
  }, [sesion, datos, avenidas]);

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

  const areaReveal = ultimo && sesion.juego === 'esquinas' ? areaDe(ultimo.idx) : null;
  const avenidaReveal = ultimo && sesion.juego === 'avenidas' && avenidas ? avenidas[ultimo.idx] : null;

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-fila">
          <span className="marca">
            🧭 UbicAMBA <small className="marca-sub">{zona.corto}</small>
          </span>
          {sesion.fase === 'terminado' ? (
            <span className="ronda">¡Juego terminado!</span>
          ) : (
            <span className="ronda">Ronda {sesion.ronda + 1} / {RONDAS}</span>
          )}
          <Menu
            zona={zona}
            datos={datos}
            onZona={cambiarZona}
            onDia={() => irAlDia(numeroDia(new Date()), 'dia')}
            onPractica={practicaLibre}
            onPorAreas={porAreas}
            onAvenidas={modoAvenidas}
            onArchivo={(dia) => irAlDia(dia, 'link')}
          />
          <span className="puntaje">Puntaje: {total}</span>
        </div>
        {sesion.fase !== 'terminado' && (
          <div className="consigna">
            {esAvenidas ? (
              <>¿Qué avenida es la <strong>marcada en celeste</strong>?</>
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
          clickHabilitado={sesion.fase === 'adivinando' && sesion.juego === 'esquinas'}
          onPick={manejarPick}
          verComunas={verComunas}
          verAreas={verAreas}
          destacado={destacado}
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
        {sesion.fase === 'adivinando' && !esAvenidas && (
          <span className="pista">Tocá el mapa donde creés que está la esquina</span>
        )}
        {sesion.fase === 'adivinando' && esAvenidas && (
          <div className="opciones">
            {opciones.map((op) => (
              <button key={op} type="button" className="btn-opcion" onClick={() => manejarOpcion(op)}>
                {op}
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
                {sesion.ronda + 1 >= RONDAS ? 'Ver resultado' : 'Siguiente →'}
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
                {sesion.ronda + 1 >= RONDAS ? 'Ver resultado' : 'Siguiente →'}
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
            onNueva={practicaLibre}
          />
        )}
      </footer>
    </div>
  );
}
