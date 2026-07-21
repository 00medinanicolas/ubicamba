import { useEffect, useMemo, useRef, useState } from 'react';
import type { Barrio } from '../game/tipos';
import { RONDAS } from '../game/logica';

export const COLORES_COMUNA = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
];
export const colorComuna = (c: number) => COLORES_COMUNA[(c - 1) % COLORES_COMUNA.length];

interface Props {
  barrios: Barrio[];
  conteo: Map<number, number>;
  onDia: () => void;
  onPractica: () => void;
  onPersonalizada: (barrioIds: number[]) => void;
}

export default function Menu({ barrios, conteo, onDia, onPractica, onPersonalizada }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [modal, setModal] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button type="button" className="menu-btn" onClick={() => setAbierto((v) => !v)}>
        Menú ▾
      </button>
      {abierto && (
        <div className="menu-lista">
          <button type="button" onClick={() => { setAbierto(false); onDia(); }}>Mapa del día</button>
          <button type="button" onClick={() => { setAbierto(false); onPractica(); }}>Práctica libre</button>
          <button type="button" onClick={() => { setAbierto(false); setModal(true); }}>Por barrios…</button>
        </div>
      )}
      {modal && (
        <ModalBarrios
          barrios={barrios}
          conteo={conteo}
          onCerrar={() => setModal(false)}
          onEmpezar={(ids) => { setModal(false); onPersonalizada(ids); }}
        />
      )}
    </div>
  );
}

function ModalBarrios({
  barrios,
  conteo,
  onCerrar,
  onEmpezar,
}: {
  barrios: Barrio[];
  conteo: Map<number, number>;
  onCerrar: () => void;
  onEmpezar: (ids: number[]) => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<number>>(() => new Set(barrios.map((b) => b.id)));

  const porComuna = useMemo(() => {
    const m = new Map<number, Barrio[]>();
    for (const b of barrios) {
      if (!m.has(b.comuna)) m.set(b.comuna, []);
      m.get(b.comuna)!.push(b);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [barrios]);

  const todos = seleccion.size === barrios.length;
  const disponibles = barrios.reduce((acc, b) => (seleccion.has(b.id) ? acc + (conteo.get(b.id) ?? 0) : acc), 0);
  const alcanza = disponibles >= RONDAS;

  const alternar = (id: number) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-encabezado">
          <span>Partida por barrios</span>
          <button type="button" className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <button
          type="button"
          className="btn-secundario"
          onClick={() => setSeleccion(todos ? new Set() : new Set(barrios.map((b) => b.id)))}
        >
          {todos ? 'Destildar todos' : 'Seleccionar todos'}
        </button>
        <div className="barrios-scroll">
          {porComuna.map(([comuna, lista]) => (
            <div key={comuna} className="grupo-comuna">
              <div className="grupo-titulo" style={{ color: colorComuna(comuna) }}>
                Comuna {comuna}
              </div>
              <div className="chips">
                {lista.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`chip${seleccion.has(b.id) ? ' activo' : ''}`}
                    style={{ '--color-comuna': colorComuna(comuna) } as React.CSSProperties}
                    onClick={() => alternar(b.id)}
                  >
                    {b.nombre}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn-primario" disabled={!alcanza} onClick={() => onEmpezar([...seleccion])}>
          {alcanza ? 'Empezar' : 'Elegí al menos un barrio'}
        </button>
      </div>
    </div>
  );
}
