import { useEffect, useMemo, useRef, useState } from 'react';
import type { Area, DatosZona, ZonaId } from '../game/tipos';
import { RONDAS } from '../game/logica';
import { IDS_ZONA, ZONAS, type ZonaDef } from '../game/zonas';
import Archivo from './Archivo';

export const COLORES_COMUNA = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
];
export const colorComuna = (c: number) => COLORES_COMUNA[(c - 1) % COLORES_COMUNA.length];

interface Props {
  zona: ZonaDef;
  datos: DatosZona | null;
  onZona: (z: ZonaId) => void;
  onDia: () => void;
  onPractica: () => void;
  onPorAreas: (ids: number[]) => void;
  onAvenidas: () => void;
  onArchivo: (dia: number) => void;
}

export default function Menu({ zona, datos, onZona, onDia, onPractica, onPorAreas, onAvenidas, onArchivo }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [modalAreas, setModalAreas] = useState(false);
  const [modalArchivo, setModalArchivo] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const item = (accion: () => void) => () => {
    setAbierto(false);
    accion();
  };

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button type="button" className="menu-btn" onClick={() => setAbierto((v) => !v)}>
        Menú ▾
      </button>
      {abierto && (
        <div className="menu-lista">
          <div className="menu-zonas">
            {IDS_ZONA.map((id) => (
              <button
                key={id}
                type="button"
                className={`zona-chip${id === zona.id ? ' activo' : ''}`}
                onClick={item(() => onZona(id))}
              >
                {ZONAS[id].corto}
              </button>
            ))}
          </div>
          <button type="button" onClick={item(onDia)}>Mapa del día <small>CABA</small></button>
          <button type="button" onClick={item(onPractica)}>Práctica libre <small>{zona.corto}</small></button>
          <button type="button" onClick={item(() => setModalAreas(true))}>
            Por {zona.etiquetaAreas.toLowerCase()}… <small>{zona.corto}</small>
          </button>
          <button type="button" onClick={item(onAvenidas)}>Modo Avenidas <small>CABA</small></button>
          <button type="button" onClick={item(() => setModalArchivo(true))}>Archivo <small>días pasados</small></button>
        </div>
      )}
      {modalAreas && datos && (
        <ModalAreas
          titulo={`Partida por ${zona.etiquetaAreas.toLowerCase()}`}
          datos={datos}
          onCerrar={() => setModalAreas(false)}
          onEmpezar={(ids) => {
            setModalAreas(false);
            onPorAreas(ids);
          }}
        />
      )}
      {modalArchivo && (
        <Archivo
          onCerrar={() => setModalArchivo(false)}
          onElegir={(dia) => {
            setModalArchivo(false);
            onArchivo(dia);
          }}
        />
      )}
    </div>
  );
}

function ModalAreas({
  titulo,
  datos,
  onCerrar,
  onEmpezar,
}: {
  titulo: string;
  datos: DatosZona;
  onCerrar: () => void;
  onEmpezar: (ids: number[]) => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<number>>(() => new Set(datos.areas.map((a) => a.id)));

  const conteo = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of datos.esquinas) m.set(e.b, (m.get(e.b) ?? 0) + 1);
    return m;
  }, [datos]);

  const grupos = useMemo(() => {
    const conGrupo = datos.areas.some((a) => a.grupo !== undefined);
    if (!conGrupo) return [[0, datos.areas] as [number, Area[]]];
    const m = new Map<number, Area[]>();
    for (const a of datos.areas) {
      const g = a.grupo ?? 0;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(a);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [datos]);

  const todos = seleccion.size === datos.areas.length;
  const disponibles = datos.areas.reduce((acc, a) => (seleccion.has(a.id) ? acc + (conteo.get(a.id) ?? 0) : acc), 0);
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
          <span>{titulo}</span>
          <button type="button" className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <button
          type="button"
          className="btn-secundario"
          onClick={() => setSeleccion(todos ? new Set() : new Set(datos.areas.map((a) => a.id)))}
        >
          {todos ? 'Destildar todos' : 'Seleccionar todos'}
        </button>
        <div className="barrios-scroll">
          {grupos.map(([g, lista]) => (
            <div key={g} className="grupo-comuna">
              {g > 0 && (
                <div className="grupo-titulo" style={{ color: colorComuna(g) }}>
                  Comuna {g}
                </div>
              )}
              <div className="chips">
                {lista.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`chip${seleccion.has(a.id) ? ' activo' : ''}`}
                    style={{ '--color-comuna': g > 0 ? colorComuna(g) : '#4cc2ff' } as React.CSSProperties}
                    onClick={() => alternar(a.id)}
                  >
                    {a.nombre}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn-primario" disabled={!alcanza} onClick={() => onEmpezar([...seleccion])}>
          {alcanza ? 'Empezar' : `Elegí al menos un ${titulo.includes('partidos') ? 'partido' : 'barrio'}`}
        </button>
      </div>
    </div>
  );
}
