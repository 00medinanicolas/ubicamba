import { useState } from 'react';
import { numeroDia } from '../game/logica';
import { Panel, Seccion } from './Panel';

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface Props {
  onElegir: (dia: number) => void;
  onCerrar: () => void;
}

/** Calendario para jugar mapas del día pasados (desde la época, 1/1/2026). */
export default function Archivo({ onElegir, onCerrar }: Props) {
  const [mesVista, setMesVista] = useState(() => new Date());
  const hoy = numeroDia(new Date());

  const anio = mesVista.getFullYear();
  const mes = mesVista.getMonth();
  const offset = (new Date(anio, mes, 1).getDay() + 6) % 7; // semana empieza en lunes
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();

  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasDelMes }, (_, i) => i + 1),
  ];

  const titulo = mesVista.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <Panel
      titulo="Archivo"
      bajada="Jugá el mapa del día de cualquier fecha pasada. Es el mismo para todos."
      onCerrar={onCerrar}
    >
      <Seccion
        titulo={titulo.charAt(0).toUpperCase() + titulo.slice(1)}
        hint={
          <span className="cal-nav">
            <button type="button" onClick={() => setMesVista(new Date(anio, mes - 1, 1))} aria-label="Mes anterior">
              ‹
            </button>
            <button type="button" onClick={() => setMesVista(new Date(anio, mes + 1, 1))} aria-label="Mes siguiente">
              ›
            </button>
          </span>
        }
      >
        <div className="cal-semana">
          {DIAS_SEMANA.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cal-grilla">
          {celdas.map((d, i) => {
            if (d === null) return <span key={`v${i}`} />;
            const dia = numeroDia(new Date(anio, mes, d));
            const jugable = dia >= 0 && dia <= hoy;
            return (
              <button
                key={d}
                type="button"
                className={`cal-celda${dia === hoy ? ' hoy' : ''}`}
                disabled={!jugable}
                onClick={() => onElegir(dia)}
              >
                {d}
              </button>
            );
          })}
        </div>
      </Seccion>
    </Panel>
  );
}
