import { useMemo, useState } from 'react';
import type { Area, DatosZona, ZonaId } from '../game/tipos';
import { TANDAS } from '../game/logica';
import { IDS_ZONA, ZONAS } from '../game/zonas';
import { Casilla, Panel, Seccion, Segmentado } from './Panel';
import { colorComuna } from './colores';

export interface ConfigEsquinas {
  zona: ZonaId;
  areas: number[] | null; // null = todas
  rondas: number;
}

interface Props {
  zonaActual: ZonaId;
  datos: DatosZona;
  /** carga los datos de otra zona cuando el usuario la elige dentro del panel */
  onPedirZona: (z: ZonaId) => Promise<DatosZona>;
  onJugar: (config: ConfigEsquinas) => void;
  onCerrar: () => void;
}

export default function PanelEsquinas({ zonaActual, datos, onPedirZona, onJugar, onCerrar }: Props) {
  const [zona, setZona] = useState<ZonaId>(zonaActual);
  const [datosZona, setDatosZona] = useState<DatosZona>(datos);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<number>>(() => new Set(datos.areas.map((a) => a.id)));
  const [rondas, setRondas] = useState(5);

  async function cambiarZona(z: ZonaId) {
    if (z === zona) return;
    setCargando(true);
    const d = await onPedirZona(z);
    setZona(z);
    setDatosZona(d);
    setSeleccion(new Set(d.areas.map((a) => a.id)));
    setCargando(false);
  }

  const conteo = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of datosZona.esquinas) m.set(e.b, (m.get(e.b) ?? 0) + 1);
    return m;
  }, [datosZona]);

  const grupos = useMemo(() => {
    const conGrupo = datosZona.areas.some((a) => a.grupo !== undefined);
    if (!conGrupo) return [[0, datosZona.areas] as [number, Area[]]];
    const m = new Map<number, Area[]>();
    for (const a of datosZona.areas) {
      const g = a.grupo ?? 0;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(a);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [datosZona]);

  const disponibles = datosZona.areas.reduce((acc, a) => (seleccion.has(a.id) ? acc + (conteo.get(a.id) ?? 0) : acc), 0);
  const todas = seleccion.size === datosZona.areas.length;
  const puedeJugar = disponibles >= TANDAS[0];
  const rondasPosibles = TANDAS.filter((n) => n <= disponibles);
  const rondasFinal = rondasPosibles.includes(rondas) ? rondas : (rondasPosibles[rondasPosibles.length - 1] ?? 0);

  const alternar = (id: number) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const zonaDef = ZONAS[zona];

  return (
    <Panel
      titulo="Encontrá la esquina"
      bajada="Te damos el nombre de un cruce y tenés que marcarlo en el mapa."
      onCerrar={onCerrar}
      ancho="ancho"
      pie={
        <>
          <span className="panel-resumen">
            <strong>{disponibles.toLocaleString('es-AR')}</strong> esquinas ·{' '}
            {todas ? `todo ${zonaDef.corto}` : `${seleccion.size} de ${datosZona.areas.length}`}
          </span>
          <button
            type="button"
            className="btn-primario"
            disabled={!puedeJugar}
            onClick={() => onJugar({ zona, areas: todas ? null : [...seleccion], rondas: rondasFinal })}
          >
            {puedeJugar ? `Jugar ${rondasFinal} rondas` : `Elegí al menos un ${zonaDef.etiquetaAreas.slice(0, -1).toLowerCase()}`}
          </button>
        </>
      }
    >
      <Seccion titulo="Zona">
        <Segmentado
          opciones={IDS_ZONA.map((id) => ({ valor: id, etiqueta: ZONAS[id].corto, deshabilitado: cargando }))}
          valor={zona}
          onCambio={(z) => void cambiarZona(z)}
          ariaLabel="Zona"
        />
      </Seccion>

      <Seccion
        titulo={zonaDef.etiquetaAreas}
        hint={
          <button type="button" className="enlace" onClick={() => setSeleccion(todas ? new Set() : new Set(datosZona.areas.map((a) => a.id)))}>
            {todas ? 'Ninguno' : 'Todos'}
          </button>
        }
      >
        <div className="areas-scroll">
          {grupos.map(([g, lista]) => (
            <div key={g} className="areas-grupo">
              {g > 0 && (
                <span className="areas-grupo-titulo" style={{ color: colorComuna(g) }}>
                  Comuna {g}
                </span>
              )}
              <div className="areas-chips">
                {lista.map((a) => (
                  <Casilla
                    key={a.id}
                    etiqueta={a.nombre}
                    activo={seleccion.has(a.id)}
                    onClick={() => alternar(a.id)}
                    color={g > 0 ? colorComuna(g) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Rondas">
        <Segmentado
          opciones={TANDAS.map((n) => ({ valor: n, etiqueta: String(n), deshabilitado: n > disponibles }))}
          valor={rondasFinal}
          onCambio={setRondas}
          ariaLabel="Cantidad de rondas"
        />
      </Seccion>
    </Panel>
  );
}
