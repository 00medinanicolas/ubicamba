import { PUNTOS_MAX } from '../game/logica';

export interface FilaFinal {
  etiqueta: string;
  titulo: string;
  sub: string;
  resultado: string;
  colorPunto?: string;
}

export function formatoDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

interface Props {
  filas: FilaFinal[];
  total: number;
  copiado: boolean;
  onCompartir: () => void;
  onNueva: () => void;
}

export default function PanelFinal({ filas, total, copiado, onCompartir, onNueva }: Props) {
  return (
    <div className="panel-final">
      <div className="final-titulo">
        ¡Terminaste! <strong>{total}</strong> / {PUNTOS_MAX} puntos
      </div>
      <ul className="desglose">
        {filas.map((f) => (
          <li key={f.etiqueta}>
            <span className="desglose-ronda">{f.etiqueta}</span>
            <span className="desglose-esquina">
              {f.titulo}
              <small>
                {f.colorPunto && <span className="punto-comuna" style={{ background: f.colorPunto }} />}
                {f.sub}
              </small>
            </span>
            <span className="desglose-puntos">{f.resultado}</span>
          </li>
        ))}
      </ul>
      <div className="final-acciones">
        <button type="button" className="btn-secundario" onClick={onCompartir}>
          {copiado ? '¡Copiado!' : 'Compartir resultado'}
        </button>
        <button type="button" className="btn-primario" onClick={onNueva}>
          Jugar otra
        </button>
      </div>
    </div>
  );
}
