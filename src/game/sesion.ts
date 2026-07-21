import type { Sesion } from './tipos';

const CLAVE = 'ubicamba-sesion';

export function cargarSesion(): Sesion | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(s: Sesion): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(s));
  } catch {
    /* almacenamiento lleno o bloqueado: se juega igual, sin persistencia */
  }
}

export function mismosIndices(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
