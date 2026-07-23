import { useEffect, useRef, useState } from 'react';
import type { DatosZona, DesafioTransporte, ZonaId } from '../game/tipos';
import { TANDAS } from '../game/logica';
import { ZONAS, type ZonaDef } from '../game/zonas';
import Archivo from './Archivo';
import PanelEsquinas, { type ConfigEsquinas } from './PanelEsquinas';
import PanelTransporte, { type ConfigTransporte } from './PanelTransporte';
import { Panel, Seccion, Segmentado } from './Panel';

export { colorComuna } from './colores';

type Abierto = null | 'esquinas' | 'transporte' | 'avenidas' | 'archivo';

interface Props {
  zona: ZonaDef;
  datos: DatosZona | null;
  desafiosTransporte: DesafioTransporte[] | null;
  onPedirZona: (z: ZonaId) => Promise<DatosZona>;
  onPedirTransporte: () => Promise<DesafioTransporte[]>;
  onDia: () => void;
  onEsquinas: (config: ConfigEsquinas) => void;
  onAvenidas: (rondas: number) => void;
  onTransporte: (config: ConfigTransporte, indices: number[]) => void;
  onArchivo: (dia: number) => void;
}

export default function Menu({
  zona,
  datos,
  desafiosTransporte,
  onPedirZona,
  onPedirTransporte,
  onDia,
  onEsquinas,
  onAvenidas,
  onTransporte,
  onArchivo,
}: Props) {
  const [abiertoMenu, setAbiertoMenu] = useState(false);
  const [panel, setPanel] = useState<Abierto>(null);
  const [desafios, setDesafios] = useState<DesafioTransporte[] | null>(desafiosTransporte);
  const [rondasAvenidas, setRondasAvenidas] = useState(5);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abiertoMenu) return;
    const cerrar = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbiertoMenu(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abiertoMenu]);

  const item = (accion: () => void) => () => {
    setAbiertoMenu(false);
    accion();
  };

  async function abrirTransporte() {
    setPanel('transporte');
    if (!desafios) setDesafios(await onPedirTransporte());
  }

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button type="button" className="menu-btn" onClick={() => setAbiertoMenu((v) => !v)} aria-expanded={abiertoMenu}>
        Menú ▾
      </button>

      {abiertoMenu && (
        <div className="menu-lista" role="menu">
          <button type="button" onClick={item(onDia)}>
            <span>Mapa del día</span>
            <small>el desafío diario de CABA</small>
          </button>
          <button type="button" onClick={item(() => setPanel('esquinas'))}>
            <span>Encontrá la esquina</span>
            <small>zona, barrios y rondas</small>
          </button>
          <button type="button" onClick={item(() => setPanel('avenidas'))}>
            <span>Avenidas</span>
            <small>reconocé la avenida marcada</small>
          </button>
          <button type="button" onClick={item(() => void abrirTransporte())}>
            <span>Cómo llegar (A→B)</span>
            <small>subte y trenes, con dificultad</small>
          </button>
          <button type="button" onClick={item(() => setPanel('archivo'))}>
            <span>Archivo</span>
            <small>mapas del día pasados</small>
          </button>
        </div>
      )}

      {panel === 'esquinas' && datos && (
        <PanelEsquinas
          zonaActual={zona.id}
          datos={datos}
          onPedirZona={onPedirZona}
          onCerrar={() => setPanel(null)}
          onJugar={(c) => {
            setPanel(null);
            onEsquinas(c);
          }}
        />
      )}

      {panel === 'transporte' && (
        <>
          {desafios ? (
            <PanelTransporte
              desafios={desafios}
              onCerrar={() => setPanel(null)}
              onJugar={(c, indices) => {
                setPanel(null);
                onTransporte(c, indices);
              }}
            />
          ) : (
            <Panel titulo="Cómo llegar de A a B" onCerrar={() => setPanel(null)}>
              <p className="panel-cargando">Cargando la red de subtes y trenes…</p>
            </Panel>
          )}
        </>
      )}

      {panel === 'avenidas' && (
        <Panel
          titulo="Avenidas"
          bajada="Marcamos una avenida en el mapa y tenés que reconocerla entre cuatro opciones."
          onCerrar={() => setPanel(null)}
          pie={
            <>
              <span className="panel-resumen">
                <strong>90</strong> avenidas principales de CABA
              </span>
              <button
                type="button"
                className="btn-primario"
                onClick={() => {
                  setPanel(null);
                  onAvenidas(rondasAvenidas);
                }}
              >
                Jugar {rondasAvenidas} rondas
              </button>
            </>
          }
        >
          <Seccion titulo="Rondas">
            <Segmentado
              opciones={TANDAS.map((n) => ({ valor: n, etiqueta: String(n) }))}
              valor={rondasAvenidas}
              onCambio={setRondasAvenidas}
              ariaLabel="Cantidad de rondas"
            />
          </Seccion>
        </Panel>
      )}

      {panel === 'archivo' && (
        <Archivo
          onCerrar={() => setPanel(null)}
          onElegir={(dia) => {
            setPanel(null);
            onArchivo(dia);
          }}
        />
      )}
    </div>
  );
}

export { ZONAS };
