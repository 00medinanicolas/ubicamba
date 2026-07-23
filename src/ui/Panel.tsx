import { useEffect, type ReactNode } from 'react';

/**
 * Primitivas de UI compartidas por todos los paneles de configuración.
 * Un solo lenguaje visual: encabezado + secciones etiquetadas + pie con resumen y acción.
 */

interface PanelProps {
  titulo: string;
  bajada?: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'normal' | 'ancho';
}

export function Panel({ titulo, bajada, onCerrar, children, pie, ancho = 'normal' }: PanelProps) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCerrar]);

  return (
    <div className="panel-fondo" onClick={onCerrar} role="presentation">
      <div
        className={`panel${ancho === 'ancho' ? ' panel-ancho' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <header className="panel-encabezado">
          <div>
            <h2>{titulo}</h2>
            {bajada && <p>{bajada}</p>}
          </div>
          <button type="button" className="panel-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="panel-cuerpo">{children}</div>
        {pie && <footer className="panel-pie">{pie}</footer>}
      </div>
    </div>
  );
}

export function Seccion({ titulo, hint, children }: { titulo: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel-seccion">
      <div className="panel-seccion-cab">
        <span className="panel-seccion-titulo">{titulo}</span>
        {hint && <span className="panel-seccion-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export interface OpcionSegmento<T> {
  valor: T;
  etiqueta: string;
  deshabilitado?: boolean;
}

export function Segmentado<T extends string | number>({
  opciones,
  valor,
  onCambio,
  ariaLabel,
}: {
  opciones: OpcionSegmento<T>[];
  valor: T;
  onCambio: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmentado" role="radiogroup" aria-label={ariaLabel}>
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          className={o.valor === valor ? 'activo' : ''}
          disabled={o.deshabilitado}
          onClick={() => onCambio(o.valor)}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function Tarjeta({
  titulo,
  detalle,
  icono,
  activo,
  onClick,
}: {
  titulo: string;
  detalle: string;
  icono: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`tarjeta-opcion${activo ? ' activo' : ''}`} onClick={onClick} aria-pressed={activo}>
      <span className="tarjeta-icono" aria-hidden="true">{icono}</span>
      <span className="tarjeta-texto">
        <strong>{titulo}</strong>
        <small>{detalle}</small>
      </span>
    </button>
  );
}

export function Casilla({
  etiqueta,
  detalle,
  activo,
  onClick,
  color,
}: {
  etiqueta: string;
  detalle?: string;
  activo: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      className={`casilla${activo ? ' activo' : ''}`}
      style={color ? ({ '--casilla-color': color } as React.CSSProperties) : undefined}
      onClick={onClick}
      aria-pressed={activo}
    >
      <span className="casilla-marca" aria-hidden="true">
        {activo ? '✓' : ''}
      </span>
      <span className="casilla-texto">
        {etiqueta}
        {detalle && <small>{detalle}</small>}
      </span>
    </button>
  );
}
