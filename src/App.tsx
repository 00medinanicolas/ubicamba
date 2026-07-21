import { useEffect, useMemo, useState } from 'react';
import esquinasData from './data/esquinas.json';
import barriosData from './data/barrios.json';
import type { Barrio, Esquina, Modo, Resultado, Sesion } from './game/tipos';
import {
  RONDAS,
  distanciaM,
  emojiPuntos,
  indicesAlAzar,
  indicesDelDia,
  indicesPorBarrios,
  leerURL,
  nombreEsquina,
  numeroDia,
  puntosPorDistancia,
  urlCompartir,
} from './game/logica';
import { cargarSesion, guardarSesion, mismosIndices } from './game/sesion';
import GameMap, { type PinResultado } from './map/GameMap';
import type { Basemap } from './map/basemap';
import Menu from './ui/Menu';
import PanelFinal, { formatoDistancia, type FilaFinal } from './ui/PanelFinal';

const esquinas = esquinasData as Esquina[];
const barrios = barriosData as Barrio[];
const barrioPorId = new Map(barrios.map((b) => [b.id, b]));
const conteoPorBarrio = new Map<number, number>();
for (const e of esquinas) conteoPorBarrio.set(e.b, (conteoPorBarrio.get(e.b) ?? 0) + 1);
const idsValidos = new Set(barrios.map((b) => b.id));

function partidaInicial(): Sesion {
  const deURL = leerURL(esquinas.length, esquinas, idsValidos);
  const base: Sesion = deURL
    ? { indices: deURL.indices, modo: deURL.modo, barriosSel: deURL.barriosSel, ronda: 0, fase: 'adivinando', resultados: [] }
    : {
        indices: indicesDelDia(numeroDia(new Date()), esquinas.length),
        modo: 'dia',
        barriosSel: [],
        ronda: 0,
        fase: 'adivinando',
        resultados: [],
      };
  const guardada = cargarSesion();
  if (guardada && guardada.modo === base.modo && mismosIndices(guardada.indices, base.indices)) {
    return { ...base, ronda: guardada.ronda, fase: guardada.fase, resultados: guardada.resultados };
  }
  return base;
}

export default function App() {
  const [sesion, setSesion] = useState<Sesion>(partidaInicial);
  const [copiado, setCopiado] = useState(false);
  const [verComunas, setVerComunas] = useState(false);
  const [verBarrios, setVerBarrios] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('plano');

  const { indices, modo, barriosSel, ronda, fase, resultados } = sesion;
  const esquinaActual = esquinas[indices[ronda]];
  const total = resultados.reduce((acc, r) => acc + r.puntos, 0);
  const ultimo = resultados[resultados.length - 1];

  useEffect(() => guardarSesion(sesion), [sesion]);

  // avance automático tras la revelación (también hay botón "Siguiente")
  useEffect(() => {
    if (fase !== 'revelada') return;
    const t = setTimeout(avanzar, 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, ronda]);

  function manejarPick(latlng: [number, number]) {
    if (fase !== 'adivinando') return;
    const d = distanciaM(latlng, [esquinaActual.lat, esquinaActual.lng]);
    const r: Resultado = { idx: indices[ronda], guess: latlng, distancia: d, puntos: puntosPorDistancia(d) };
    setSesion((s) => ({ ...s, fase: 'revelada', resultados: [...s.resultados, r] }));
  }

  function avanzar() {
    setSesion((s) => {
      if (s.fase !== 'revelada') return s;
      return s.ronda + 1 >= RONDAS
        ? { ...s, fase: 'terminado' }
        : { ...s, ronda: s.ronda + 1, fase: 'adivinando' };
    });
  }

  function nuevaPartida(nuevosIndices: number[], nuevoModo: Modo, sel: number[] = []) {
    window.history.replaceState(
      null,
      '',
      nuevoModo === 'dia' ? '/' : urlCompartir(nuevosIndices, nuevoModo === 'personalizada' ? sel : undefined)
    );
    setCopiado(false);
    setSesion({ indices: nuevosIndices, modo: nuevoModo, barriosSel: sel, ronda: 0, fase: 'adivinando', resultados: [] });
  }

  function tituloPartida(): string {
    if (modo === 'dia') {
      return `Mapa del día · ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
    }
    if (modo === 'personalizada') {
      const nombres = barriosSel.map((id) => barrioPorId.get(id)?.nombre).filter(Boolean);
      return nombres.length <= 3 ? `Solo ${nombres.join(', ')}` : `${nombres.length} barrios elegidos`;
    }
    return 'Partida libre';
  }

  async function compartirResultado() {
    const lineaPuntos = resultados.map((r) => `${r.puntos}${emojiPuntos(r.puntos)}`).join(' ');
    const link = `${window.location.origin}${urlCompartir(indices, modo === 'personalizada' ? barriosSel : undefined)}`;
    const texto = `🧭 UbicAMBA — ${tituloPartida()}\n${lineaPuntos}\nTotal: ${total}/${RONDAS * 100}\nJugala vos: ${link}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado: sin feedback */
    }
  }

  const pins: PinResultado[] = useMemo(
    () =>
      resultados.map((r, i) => ({
        guess: r.guess,
        actual: [esquinas[r.idx].lat, esquinas[r.idx].lng],
        etiqueta: `R${i + 1}`,
      })),
    [resultados]
  );

  const filasFinal: FilaFinal[] = resultados.map((r, i) => {
    const e = esquinas[r.idx];
    const b = barrioPorId.get(e.b)!;
    return {
      etiqueta: `R${i + 1}`,
      esquina: nombreEsquina(e),
      barrio: b.nombre,
      comuna: b.comuna,
      distancia: r.distancia,
      puntos: r.puntos,
    };
  });

  const barrioReveal = ultimo ? barrioPorId.get(esquinas[ultimo.idx].b) : undefined;

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-fila">
          <span className="marca">
            🧭 UbicAMBA <small className="marca-sub">esquinas de CABA</small>
          </span>
          {fase === 'terminado' ? (
            <span className="ronda">¡Juego terminado!</span>
          ) : (
            <span className="ronda">Ronda {ronda + 1} / {RONDAS}</span>
          )}
          <Menu
            barrios={barrios}
            conteo={conteoPorBarrio}
            onDia={() => nuevaPartida(indicesDelDia(numeroDia(new Date()), esquinas.length), 'dia')}
            onPractica={() => nuevaPartida(indicesAlAzar(esquinas.length), 'link')}
            onPersonalizada={(ids) => nuevaPartida(indicesPorBarrios(esquinas, ids), 'personalizada', ids)}
          />
          <span className="puntaje">Puntaje: {total}</span>
        </div>
        {fase !== 'terminado' && (
          <div className="consigna">
            Encontrá: <strong>{esquinaActual.s1}</strong>
            {esquinaActual.s2 && <> y <strong>{esquinaActual.s2}</strong></>}
          </div>
        )}
      </header>

      <div className="mapa-wrap">
        <GameMap
          basemap={basemap}
          resultados={pins}
          clickHabilitado={fase === 'adivinando'}
          onPick={manejarPick}
          verComunas={verComunas}
          verBarrios={verBarrios}
        />
        <div className="controles-mapa">
          <button
            type="button"
            className={verComunas ? 'activo' : ''}
            onClick={() => setVerComunas((v) => !v)}
            title="Mostrar límites de las 15 comunas"
          >
            Comunas
          </button>
          <button
            type="button"
            className={verBarrios ? 'activo' : ''}
            onClick={() => setVerBarrios((v) => !v)}
            title="Mostrar límites y nombres de los 48 barrios"
          >
            Barrios
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
        {fase === 'adivinando' && (
          <span className="pista">Tocá el mapa donde creés que está la esquina</span>
        )}
        {fase === 'revelada' && ultimo && barrioReveal && (
          <div className="ficha">
            <div className="ficha-dato">
              📍 <strong>{nombreEsquina(esquinas[ultimo.idx])}</strong> está en{' '}
              <strong>{barrioReveal.nombre}</strong> (Comuna {barrioReveal.comuna})
            </div>
            <div className="ficha-resultado">
              Te equivocaste por {formatoDistancia(ultimo.distancia)} — <strong>{ultimo.puntos} pts</strong>
              <button type="button" className="btn-primario btn-siguiente" onClick={avanzar}>
                {ronda + 1 >= RONDAS ? 'Ver resultado' : 'Siguiente →'}
              </button>
            </div>
          </div>
        )}
        {fase === 'terminado' && (
          <PanelFinal
            filas={filasFinal}
            total={total}
            copiado={copiado}
            onCompartir={compartirResultado}
            onNueva={() => nuevaPartida(indicesAlAzar(esquinas.length), 'link')}
          />
        )}
      </footer>
    </div>
  );
}
