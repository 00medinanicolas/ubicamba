import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike, Map as MapaML } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { crearEstilo, type Basemap } from './basemap';

export interface PinResultado {
  guess: [number, number]; // [lat, lng]
  actual: [number, number];
  etiqueta: string; // "R1"…"R5"
}

interface Props {
  basemap: Basemap;
  resultados: PinResultado[];
  clickHabilitado: boolean;
  onPick: (latlng: [number, number]) => void;
  verComunas: boolean;
  verBarrios: boolean;
}

const ENCUADRE: LngLatBoundsLike = [
  [-58.531, -34.708],
  [-58.333, -34.524],
];
const LIMITES: LngLatBoundsLike = [
  [-58.65, -34.78],
  [-58.22, -34.45],
];

// Overlays didácticos (se descargan una sola vez por sesión)
const overlays: Record<string, GeoJSON.FeatureCollection | null> = {
  comunas: null,
  'comunas-labels': null,
  barrios: null,
  'barrios-labels': null,
};
let overlaysPromesa: Promise<void> | null = null;
function cargarOverlays(): Promise<void> {
  overlaysPromesa ??= Promise.all(
    Object.keys(overlays).map(async (clave) => {
      const res = await fetch(`/geo/${clave}.geojson`);
      if (res.ok) overlays[clave] = await res.json();
    })
  ).then(() => undefined);
  return overlaysPromesa;
}

function puntoDiv(fondo: string, borde: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `width:15px;height:15px;border-radius:50%;background:${fondo};border:2px solid ${borde};box-shadow:0 0 0 1px rgba(0,0,0,.35)`;
  return el;
}

function pinRespuesta(etiqueta: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px';
  const chip = document.createElement('div');
  chip.textContent = etiqueta;
  chip.className = 'pin-etiqueta';
  wrap.append(chip, puntoDiv('#ef4444', '#b91c1c'));
  return wrap;
}

const FC_VACIA: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export default function GameMap({ basemap, resultados, clickHabilitado, onPick, verComunas, verBarrios }: Props) {
  const contRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaML | null>(null);
  const marcadoresRef = useRef<maplibregl.Marker[]>([]);
  const listoRef = useRef(false);

  // refs espejo para handlers y para re-armar capas tras cada setStyle
  const clickRef = useRef(clickHabilitado);
  const pickRef = useRef(onPick);
  const resultadosRef = useRef(resultados);
  const comunasRef = useRef(verComunas);
  const barriosRef = useRef(verBarrios);
  clickRef.current = clickHabilitado;
  pickRef.current = onPick;
  resultadosRef.current = resultados;
  comunasRef.current = verComunas;
  barriosRef.current = verBarrios;

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      const estilo = await crearEstilo('plano');
      if (cancelado || !contRef.current) return;

      const mapa = new maplibregl.Map({
        container: contRef.current,
        style: estilo,
        bounds: ENCUADRE,
        fitBoundsOptions: { padding: 12 },
        maxBounds: LIMITES,
        minZoom: 10.3,
        maxZoom: 18.5,
        attributionControl: { compact: true },
        // en dev permite leer el canvas (capturas de verificación); en prod queda apagado
        canvasContextAttributes: { preserveDrawingBuffer: import.meta.env.DEV },
      });
      mapaRef.current = mapa;
      mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

      mapa.on('click', (e) => {
        if (clickRef.current) pickRef.current([e.lngLat.lat, e.lngLat.lng]);
      });

      // Cada setStyle borra fuentes y capas propias: se re-arman en cada style.load
      mapa.on('style.load', () => armarCapas(mapa));
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__mapa = mapa;
        mapa.on('style.load', () => console.debug('[ubicamba] style.load'));
        mapa.on('error', (e) => console.warn('[ubicamba] map error:', e.error?.message));
      }

      cargarOverlays().then(() => {
        if (!cancelado && mapa.isStyleLoaded()) armarCapas(mapa);
      });
    }

    function armarCapas(mapa: MapaML) {
      // líneas guess → esquina real
      if (!mapa.getSource('lineas')) {
        mapa.addSource('lineas', { type: 'geojson', data: FC_VACIA });
        mapa.addLayer({
          id: 'lineas-halo',
          type: 'line',
          source: 'lineas',
          paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.35, 'line-blur': 1 },
        });
        mapa.addLayer({
          id: 'lineas-trazo',
          type: 'line',
          source: 'lineas',
          paint: { 'line-color': '#fff', 'line-width': 3.5 },
        });
      }

      // overlays didácticos
      const agregar = (
        clave: keyof typeof overlays,
        capas: () => void
      ) => {
        const data = overlays[clave];
        if (data && !mapa.getSource(clave)) {
          mapa.addSource(clave, { type: 'geojson', data });
          capas();
        }
      };

      agregar('comunas', () => {
        mapa.addLayer({
          id: 'comunas-linea',
          type: 'line',
          source: 'comunas',
          layout: { visibility: comunasRef.current ? 'visible' : 'none' },
          paint: { 'line-color': '#38bdf8', 'line-width': 2.2, 'line-dasharray': [2, 1.2] },
        });
      });
      agregar('comunas-labels', () => {
        mapa.addLayer({
          id: 'comunas-texto',
          type: 'symbol',
          source: 'comunas-labels',
          layout: {
            visibility: comunasRef.current ? 'visible' : 'none',
            'text-field': ['get', 'etiqueta'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 15,
          },
          paint: { 'text-color': '#7dd3fc', 'text-halo-color': 'rgba(0,0,0,.75)', 'text-halo-width': 1.6 },
        });
      });
      agregar('barrios', () => {
        mapa.addLayer(
          {
            id: 'barrios-linea',
            type: 'line',
            source: 'barrios',
            layout: { visibility: barriosRef.current ? 'visible' : 'none' },
            paint: { 'line-color': '#fbbf24', 'line-width': 1.1, 'line-dasharray': [1, 1.6], 'line-opacity': 0.9 },
          },
          mapa.getLayer('comunas-linea') ? 'comunas-linea' : undefined
        );
      });
      agregar('barrios-labels', () => {
        mapa.addLayer({
          id: 'barrios-texto',
          type: 'symbol',
          source: 'barrios-labels',
          layout: {
            visibility: barriosRef.current ? 'visible' : 'none',
            'text-field': ['get', 'nombre'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11.5,
          },
          paint: { 'text-color': '#fcd34d', 'text-halo-color': 'rgba(0,0,0,.7)', 'text-halo-width': 1.4 },
        });
      });

      aplicarResultados(mapa, resultadosRef.current);
      listoRef.current = true;
    }

    iniciar();
    return () => {
      cancelado = true;
      marcadoresRef.current.forEach((m) => m.remove());
      marcadoresRef.current = [];
      mapaRef.current?.remove();
      mapaRef.current = null;
      listoRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aplicarResultados(mapa: MapaML, res: PinResultado[]) {
    marcadoresRef.current.forEach((m) => m.remove());
    marcadoresRef.current = [];
    const lineas: GeoJSON.Feature[] = res.map((r) => {
      const mGuess = new maplibregl.Marker({ element: puntoDiv('#3b82f6', '#1d4ed8') })
        .setLngLat([r.guess[1], r.guess[0]])
        .addTo(mapa);
      const mReal = new maplibregl.Marker({ element: pinRespuesta(r.etiqueta), anchor: 'bottom' })
        .setLngLat([r.actual[1], r.actual[0]])
        .addTo(mapa);
      marcadoresRef.current.push(mGuess, mReal);
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [r.guess[1], r.guess[0]],
            [r.actual[1], r.actual[0]],
          ],
        },
        properties: {},
      };
    });
    (mapa.getSource('lineas') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: lineas });
  }

  // marcadores y líneas al cambiar los resultados
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa && listoRef.current) aplicarResultados(mapa, resultados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados]);

  // cambio de mapa base (plano ⇄ satélite)
  const basemapPrevio = useRef(basemap);
  useEffect(() => {
    if (basemapPrevio.current === basemap) return;
    basemapPrevio.current = basemap;
    const mapa = mapaRef.current;
    if (!mapa) return;
    listoRef.current = false;
    crearEstilo(basemap).then((estilo) => {
      if (mapaRef.current === mapa) mapa.setStyle(estilo); // style.load re-arma las capas
    });
  }, [basemap]);

  // visibilidad de overlays
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current) return;
    for (const [capa, visible] of [
      ['comunas-linea', verComunas],
      ['comunas-texto', verComunas],
      ['barrios-linea', verBarrios],
      ['barrios-texto', verBarrios],
    ] as const) {
      if (mapa.getLayer(capa)) mapa.setLayoutProperty(capa, 'visibility', visible ? 'visible' : 'none');
    }
  }, [verComunas, verBarrios]);

  // cursor
  useEffect(() => {
    const canvas = mapaRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = clickHabilitado ? 'crosshair' : '';
  }, [clickHabilitado]);

  return <div ref={contRef} className="mapa" />;
}
