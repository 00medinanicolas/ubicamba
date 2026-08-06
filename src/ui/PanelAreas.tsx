import { useState } from 'react';
import type { ColeccionArea } from '../game/datos';
import { TANDAS } from '../game/logica';
import { Panel, Seccion, Segmentado, Tarjeta } from './Panel';

export type ModalidadArea = 'elegir' | 'escribir';

export interface ConfigAreas {
  coleccion: ColeccionArea;
  modalidad: ModalidadArea;
  rondas: number;
}

/** Cada colección es un dataset de public/geo/ y ya trae su propio conteo. */
export const COLECCIONES: { id: ColeccionArea; etiqueta: string; detalle: string; cuantas: number }[] = [
  { id: 'comunas', etiqueta: 'Comunas de CABA', detalle: 'Las 15 comunas porteñas', cuantas: 15 },
  { id: 'barrios', etiqueta: 'Barrios de CABA', detalle: 'Los 48 barrios porteños', cuantas: 48 },
  { id: 'partidos-norte', etiqueta: 'Partidos del Norte', detalle: 'San Isidro, Vicente López y vecinos', cuantas: 8 },
  { id: 'partidos-oeste', etiqueta: 'Partidos del Oeste', detalle: 'Morón, La Matanza y vecinos', cuantas: 7 },
  { id: 'partidos-sur', etiqueta: 'Partidos del Sur', detalle: 'Avellaneda, Quilmes y vecinos', cuantas: 9 },
];

interface Props {
  inicial?: ConfigAreas;
  onJugar: (config: ConfigAreas) => void;
  onCerrar: () => void;
}

export default function PanelAreas({ inicial, onJugar, onCerrar }: Props) {
  const [coleccion, setColeccion] = useState<ColeccionArea>(inicial?.coleccion ?? 'comunas');
  const [modalidad, setModalidad] = useState<ModalidadArea>(inicial?.modalidad ?? 'elegir');
  const [rondas, setRondas] = useState<number>(inicial?.rondas ?? 5);

  const elegida = COLECCIONES.find((c) => c.id === coleccion)!;
  const rondasPosibles = TANDAS.filter((n) => n <= elegida.cuantas);
  const rondasFinal = rondasPosibles.includes(rondas) ? rondas : (rondasPosibles[rondasPosibles.length - 1] ?? 0);

  return (
    <Panel
      titulo="Comunas y localidades"
      bajada="Se ilumina un contorno en el mapa y hay que decir cuál es. Los límites quedan apagados: si no, la respuesta estaría escrita en la pantalla."
      onCerrar={onCerrar}
      pie={
        <>
          <span className="panel-resumen">
            <strong>{elegida.cuantas}</strong> {elegida.etiqueta.toLowerCase()}
          </span>
          <button type="button" className="btn-primario" onClick={() => onJugar({ coleccion, modalidad, rondas: rondasFinal })}>
            Jugar {rondasFinal} rondas
          </button>
        </>
      }
    >
      <Seccion titulo="Qué se adivina">
        <div className="grilla-2">
          {COLECCIONES.map((c) => (
            <Tarjeta
              key={c.id}
              icono={c.id.startsWith('partidos') ? '🗺' : c.id === 'comunas' ? '🔢' : '🏘'}
              titulo={c.etiqueta}
              detalle={c.detalle}
              activo={coleccion === c.id}
              onClick={() => setColeccion(c.id)}
            />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Cómo se responde">
        <div className="grilla-2">
          <Tarjeta
            icono="🃏"
            titulo="Elegir entre opciones"
            detalle="Cuatro nombres: marcá el que corresponde al contorno."
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

      <Seccion titulo="Rondas">
        <Segmentado
          ariaLabel="Cantidad de rondas"
          opciones={TANDAS.map((n) => ({ valor: n, etiqueta: String(n), deshabilitado: n > elegida.cuantas }))}
          valor={rondasFinal}
          onCambio={setRondas}
        />
      </Seccion>
    </Panel>
  );
}
