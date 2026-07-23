// Definición compartida de las zonas del AMBA (la usan build-dataset y build-transporte).

export const PARTIDOS_POR_ZONA = {
  norte: ['General San Martín', 'José C. Paz', 'Malvinas Argentinas', 'San Fernando', 'San Isidro', 'San Miguel', 'Tigre', 'Vicente López'],
  oeste: ['Hurlingham', 'Ituzaingó', 'La Matanza', 'Merlo', 'Moreno', 'Morón', 'Tres de Febrero'],
  sur: ['Almirante Brown', 'Avellaneda', 'Berazategui', 'Esteban Echeverría', 'Ezeiza', 'Florencio Varela', 'Lanús', 'Lomas de Zamora', 'Quilmes'],
};

export const NOMBRE_ZONA = {
  caba: 'CABA',
  norte: 'Zona Norte',
  oeste: 'Zona Oeste',
  sur: 'Zona Sur',
};

export const normalizarNombre = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .replace(/\bgral\b/g, 'general')
    .replace(/\s+/g, ' ')
    .trim();
