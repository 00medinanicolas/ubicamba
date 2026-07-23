import { useEffect, useState } from 'react';
import type { DesafioTransporte, RedTransporte } from '../game/tipos';
import {
  bajadasDe,
  caminar,
  deshacer,
  estadoInicial,
  opcionesDesde,
  tomarLinea,
  type EstadoArmado,
  type LegArmado,
} from '../game/armar';

interface Props {
  red: RedTransporte;
  desafio: DesafioTransporte;
  onCambio: (legs: LegArmado[]) => void;
  onLlegada: (minutos: number, legs: LegArmado[]) => void;
  onRendirse: () => void;
}

/** Constructor paso a paso del viaje: línea → hasta dónde → transbordo → … */
export default function Armado({ red, desafio, onCambio, onLlegada, onRendirse }: Props) {
  const [estado, setEstado] = useState<EstadoArmado>(() => estadoInicial(desafio.idxOrigen));
  const [eligiendo, setEligiendo] = useState<{ li: number; pos: number } | null>(null);

  // reset al cambiar de desafío
  useEffect(() => {
    setEstado(estadoInicial(desafio.idxOrigen));
    setEligiendo(null);
    onCambio([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desafio]);

  function aplicar(nuevo: EstadoArmado) {
    setEstado(nuevo);
    setEligiendo(null);
    onCambio(nuevo.legs);
    if (nuevo.actual === desafio.idxDestino) {
      onLlegada(Math.round(nuevo.minutos), nuevo.legs);
    }
  }

  const actual = red.estaciones[estado.actual];
  const icono = (r: 'subte' | 'tren') => (r === 'subte' ? '🚇' : '🚆');

  if (eligiendo) {
    const linea = red.lineas[eligiendo.li];
    const bajadas = bajadasDe(red, eligiendo.li, eligiendo.pos);
    return (
      <div className="armado">
        <div className="armado-estado">
          <span className="leg-chip" style={{ '--color-leg': linea.color } as React.CSSProperties}>
            {icono(linea.red)} {linea.nombre}
          </span>
          <span>¿hasta dónde?</span>
          <button type="button" className="btn-secundario btn-mini" onClick={() => setEligiendo(null)}>
            ← otra línea
          </button>
        </div>
        <div className="armado-chips">
          {bajadas.map((b) => (
            <button
              key={b.posFin}
              type="button"
              className={`chip${b.idx === desafio.idxDestino ? ' chip-destino' : ''}`}
              onClick={() => aplicar(tomarLinea(red, estado, eligiendo.li, eligiendo.pos, b.posFin))}
            >
              {b.nombre} <small>·{b.paradas}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const { lineas, caminatas } = opcionesDesde(red, estado.actual);

  return (
    <div className="armado">
      <div className="armado-estado">
        <span>
          ⏱ <strong>{Math.round(estado.minutos)} min</strong> · estás en {icono(actual.r)} <strong>{actual.n}</strong>
        </span>
        {estado.legs.length > 0 && (
          <button type="button" className="btn-secundario btn-mini" onClick={() => aplicar(deshacer(estado))}>
            ↩ Deshacer
          </button>
        )}
        <button type="button" className="btn-secundario btn-mini" onClick={onRendirse}>
          🏳 Rendirse
        </button>
      </div>
      <div className="armado-chips">
        {lineas.map((l) => (
          <button
            key={l.li}
            type="button"
            className="chip chip-linea"
            style={{ '--color-leg': l.color } as React.CSSProperties}
            onClick={() => setEligiendo({ li: l.li, pos: l.pos })}
          >
            {icono(l.red)} {l.nombre} <small>→ {l.hacia}</small>
          </button>
        ))}
        {caminatas.map((c) => (
          <button
            key={c.hasta}
            type="button"
            className={`chip${c.hasta === desafio.idxDestino ? ' chip-destino' : ''}`}
            onClick={() => aplicar(caminar(estado, c.hasta, c.min))}
          >
            🚶 {c.nombre} <small>·{Math.round(c.min)}′</small>
          </button>
        ))}
      </div>
    </div>
  );
}
