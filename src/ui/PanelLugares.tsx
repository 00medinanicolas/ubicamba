import { useMemo, useState } from 'react';
import type { CategoriaLugar, Lugar } from '../game/tipos';
import { TANDAS } from '../game/logica';
import { Casilla, Panel, Seccion, Segmentado, Tarjeta } from './Panel';

export type ModalidadLugar = 'elegir' | 'escribir';

export interface ConfigLugares {
  modalidad: ModalidadLugar;
  cats: CategoriaLugar[];
  zonas: ('caba' | 'pba')[];
  rondas: number;
}

const CATS: { id: CategoriaLugar; etiqueta: string; icono: string }[] = [
  { id: 'monumento', etiqueta: 'Monumentos', icono: '🗿' },
  { id: 'estado', etiqueta: 'Edificios del Estado', icono: '🏛' },
  { id: 'biblioteca', etiqueta: 'Bibliotecas', icono: '📚' },
  { id: 'cultura', etiqueta: 'Teatros y cultura', icono: '🎭' },
  { id: 'museo', etiqueta: 'Museos', icono: '🖼' },
  { id: 'comida', etiqueta: 'Bares y comida típica', icono: '🍕' },
  { id: 'estadio', etiqueta: 'Estadios', icono: '🏟' },
];

const ZONAS: { id: 'caba' | 'pba'; etiqueta: string }[] = [
  { id: 'caba', etiqueta: 'CABA' },
  { id: 'pba', etiqueta: 'Provincia' },
];

export function filtrarLugares(lugares: Lugar[], config: ConfigLugares): number[] {
  const out: number[] = [];
  lugares.forEach((l, i) => {
    if (config.cats.length && !config.cats.includes(l.cat)) return;
    if (config.zonas.length && !config.zonas.includes(l.z)) return;
    out.push(i);
  });
  return out;
}

interface Props {
  lugares: Lugar[];
  inicial?: ConfigLugares;
  onJugar: (config: ConfigLugares, indices: number[]) => void;
  onCerrar: () => void;
}

export default function PanelLugares({ lugares, inicial, onJugar, onCerrar }: Props) {
  const [modalidad, setModalidad] = useState<ModalidadLugar>(inicial?.modalidad ?? 'elegir');
  const [cats, setCats] = useState<CategoriaLugar[]>(inicial?.cats ?? CATS.map((c) => c.id));
  const [zonas, setZonas] = useState<('caba' | 'pba')[]>(inicial?.zonas ?? ['caba', 'pba']);
  const [rondas, setRondas] = useState<number>(inicial?.rondas ?? 5);

  const config: ConfigLugares = { modalidad, cats, zonas, rondas };
  const disponibles = useMemo(() => filtrarLugares(lugares, config), [lugares, cats, zonas]);

  const alternar = <T,>(v: T, lista: T[], set: (l: T[]) => void) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  const cuantos = (id: CategoriaLugar) => lugares.filter((l) => l.cat === id && (!zonas.length || zonas.includes(l.z))).length;

  const rondasPosibles = TANDAS.filter((n) => n <= disponibles.length);
  const rondasFinal = rondasPosibles.includes(rondas) ? rondas : (rondasPosibles[rondasPosibles.length - 1] ?? 0);
  const puedeJugar = disponibles.length >= TANDAS[0];

  return (
    <Panel
      titulo="Lugares típicos"
      bajada="Te marcamos un lugar en el mapa y hay que decir cuál es."
      onCerrar={onCerrar}
      pie={
        <>
          <span className="panel-resumen">
            {disponibles.length === 0 ? (
              <>Ningún lugar coincide — sumá categorías o zonas</>
            ) : (
              <>
                <strong>{disponibles.length}</strong> lugares disponibles
              </>
            )}
          </span>
          <button
            type="button"
            className="btn-primario"
            disabled={!puedeJugar}
            onClick={() => onJugar({ ...config, rondas: rondasFinal }, disponibles)}
          >
            {puedeJugar ? `Jugar ${rondasFinal} rondas` : 'Sin lugares suficientes'}
          </button>
        </>
      }
    >
      <Seccion titulo="Cómo se responde">
        <div className="grilla-2">
          <Tarjeta
            icono="🃏"
            titulo="Elegir entre opciones"
            detalle="Cuatro nombres: marcá el que corresponde al lugar señalado."
            activo={modalidad === 'elegir'}
            onClick={() => setModalidad('elegir')}
          />
          <Tarjeta
            icono="⌨️"
            titulo="Escribir el nombre"
            detalle="Se acepta sin mayúsculas, sin tildes y hasta incompleto."
            activo={modalidad === 'escribir'}
            onClick={() => setModalidad('escribir')}
          />
        </div>
      </Seccion>

      <Seccion titulo="Zona">
        <div className="grilla-2">
          {ZONAS.map((z) => (
            <Casilla
              key={z.id}
              etiqueta={z.etiqueta}
              detalle={`${lugares.filter((l) => l.z === z.id).length} lugares`}
              activo={zonas.includes(z.id)}
              onClick={() => alternar(z.id, zonas, setZonas)}
            />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Qué entra" hint={`${cats.length} de ${CATS.length}`}>
        <div className="grilla-2">
          {CATS.map((c) => (
            <Casilla
              key={c.id}
              etiqueta={`${c.icono} ${c.etiqueta}`}
              detalle={`${cuantos(c.id)}`}
              activo={cats.includes(c.id)}
              onClick={() => alternar(c.id, cats, setCats)}
            />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Rondas">
        <Segmentado
          ariaLabel="Cantidad de rondas"
          opciones={TANDAS.map((n) => ({ valor: n, etiqueta: String(n), deshabilitado: n > disponibles.length }))}
          valor={rondasFinal}
          onCambio={setRondas}
        />
      </Seccion>
    </Panel>
  );
}
