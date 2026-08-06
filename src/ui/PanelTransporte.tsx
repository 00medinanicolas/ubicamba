import { useMemo, useState } from 'react';
import type { DesafioTransporte, ModoTransporte, ZonaTransporte } from '../game/tipos';
import { TANDAS } from '../game/logica';
import { Casilla, Panel, Seccion, Segmentado, Tarjeta } from './Panel';

export type Mecanica = 'elegir' | 'armar';
export type NivelComb = 'todas' | 'directo' | 'una' | 'dosmas';

export interface ConfigTransporte {
  mecanica: Mecanica;
  zonas: ZonaTransporte[];
  redes: ModoTransporte[];
  comb: NivelComb;
  rondas: number;
}

const ZONAS_UI: { id: ZonaTransporte; etiqueta: string; detalle: string }[] = [
  { id: 'caba', etiqueta: 'CABA', detalle: 'subtes y cabeceras' },
  { id: 'norte', etiqueta: 'Zona Norte', detalle: 'Mitre, San Martín' },
  { id: 'oeste', etiqueta: 'Zona Oeste', detalle: 'Sarmiento, Belgrano' },
  { id: 'sur', etiqueta: 'Zona Sur', detalle: 'Roca' },
];

const REDES_UI: { id: ModoTransporte; etiqueta: string; detalle: string }[] = [
  { id: 'subte', etiqueta: '🚇 Subte', detalle: 'las seis líneas y el Premetro' },
  { id: 'tren', etiqueta: '🚆 Tren', detalle: 'Mitre, San Martín, Sarmiento, Roca, Belgrano' },
  { id: 'colectivo', etiqueta: '🚌 Colectivo', detalle: '29 líneas clásicas' },
];

const COMB: { valor: NivelComb; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Cualquiera' },
  { valor: 'directo', etiqueta: 'Directo' },
  { valor: 'una', etiqueta: '1 combinación' },
  { valor: 'dosmas', etiqueta: '2 o más' },
];

export function filtrarDesafios(desafios: DesafioTransporte[], config: ConfigTransporte): number[] {
  const zonas = new Set(config.zonas);
  const redes = new Set(config.redes);
  const out: number[] = [];
  desafios.forEach((d, i) => {
    if (config.mecanica === 'elegir' && d.soloArmar) return;
    if (!d.z.every((z) => zonas.has(z))) return;
    // Un viaje entra sólo si TODAS las redes que usa están habilitadas: si no,
    // se mostraría un itinerario óptimo que el jugador dijo no querer.
    if (d.m && !d.m.every((m) => redes.has(m))) return;
    if (config.comb === 'directo' && d.c !== 0) return;
    if (config.comb === 'una' && d.c !== 1) return;
    if (config.comb === 'dosmas' && d.c < 2) return;
    out.push(i);
  });
  return out;
}

interface Props {
  desafios: DesafioTransporte[];
  inicial?: ConfigTransporte;
  onJugar: (config: ConfigTransporte, indices: number[]) => void;
  onCerrar: () => void;
}

export default function PanelTransporte({ desafios, inicial, onJugar, onCerrar }: Props) {
  const [mecanica, setMecanica] = useState<Mecanica>(inicial?.mecanica ?? 'elegir');
  const [zonas, setZonas] = useState<ZonaTransporte[]>(inicial?.zonas ?? ['caba', 'norte', 'oeste', 'sur']);
  const [redes, setRedes] = useState<ModoTransporte[]>(inicial?.redes ?? ['subte', 'tren', 'colectivo']);
  const [comb, setComb] = useState<NivelComb>(inicial?.comb ?? 'todas');
  const [rondas, setRondas] = useState<number>(inicial?.rondas ?? 5);

  const config: ConfigTransporte = { mecanica, zonas, redes, comb, rondas };
  const disponibles = useMemo(() => filtrarDesafios(desafios, config), [desafios, mecanica, zonas, redes, comb]);

  const alternar = <T,>(v: T, lista: T[], set: (l: T[]) => void) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  const alternarZona = (z: ZonaTransporte) =>
    setZonas((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));

  const rondasPosibles = TANDAS.filter((n) => n <= disponibles.length);
  const rondasFinal = rondasPosibles.includes(rondas) ? rondas : (rondasPosibles[rondasPosibles.length - 1] ?? 0);
  const puedeJugar = disponibles.length >= TANDAS[0];

  return (
    <Panel
      titulo="Cómo llegar de A a B"
      bajada="Viajes reales de la red de subtes y trenes, calculados con los horarios oficiales."
      onCerrar={onCerrar}
      pie={
        <>
          <span className="panel-resumen">
            {disponibles.length === 0 ? (
              <>Ningún viaje coincide — ampliá las zonas o las combinaciones</>
            ) : (
              <>
                <strong>{disponibles.length}</strong> viajes disponibles
              </>
            )}
          </span>
          <button
            type="button"
            className="btn-primario"
            disabled={!puedeJugar}
            onClick={() => onJugar({ ...config, rondas: rondasFinal }, disponibles)}
          >
            {puedeJugar ? `Jugar ${rondasFinal} rondas` : 'Sin viajes suficientes'}
          </button>
        </>
      }
    >
      <Seccion titulo="Mecánica">
        <div className="grilla-2">
          <Tarjeta
            icono="🃏"
            titulo="Elegí el itinerario"
            detalle="Te mostramos varias opciones: marcá la más rápida."
            activo={mecanica === 'elegir'}
            onClick={() => setMecanica('elegir')}
          />
          <Tarjeta
            icono="🧩"
            titulo="Armá tu viaje"
            detalle="Construilo paso a paso: líneas, transbordos y caminatas."
            activo={mecanica === 'armar'}
            onClick={() => setMecanica('armar')}
          />
        </div>
      </Seccion>

      <Seccion titulo="Zonas" hint="el viaje entero pasa solo por lo que elijas">
        <div className="grilla-2">
          {ZONAS_UI.map((z) => (
            <Casilla
              key={z.id}
              etiqueta={z.etiqueta}
              detalle={z.detalle}
              activo={zonas.includes(z.id)}
              onClick={() => alternarZona(z.id)}
            />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Redes" hint="con qué se puede viajar">
        <div className="grilla-2">
          {REDES_UI.map((r) => (
            <Casilla
              key={r.id}
              etiqueta={r.etiqueta}
              detalle={r.detalle}
              activo={redes.includes(r.id)}
              onClick={() => alternar(r.id, redes, setRedes)}
            />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Combinaciones" hint="cuántos transbordos tiene el mejor viaje">
        <Segmentado opciones={COMB} valor={comb} onCambio={setComb} ariaLabel="Combinaciones" />
      </Seccion>

      <Seccion titulo="Rondas">
        <Segmentado
          opciones={TANDAS.map((n) => ({ valor: n, etiqueta: String(n), deshabilitado: n > disponibles.length }))}
          valor={rondasFinal}
          onCambio={setRondas}
          ariaLabel="Cantidad de rondas"
        />
      </Seccion>
    </Panel>
  );
}
