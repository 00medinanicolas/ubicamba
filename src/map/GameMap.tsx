import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapaML } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { crearEstilo, type Basemap } from './basemap';
import { ruta } from '../game/datos';
import type { OverlayDef, ZonaDef } from '../game/zonas';

export interface PinResultado {
  guess: [number, number]; // [lat, lng]
  actual: [number, number];
  etiqueta: string; // "R1"…"R5"
}

export interface MarcadorAB {
  latlng: [number, number];
  etiqueta: string;
  color: string;
}

interface Props {
  zona: ZonaDef;
  basemap: Basemap;
  resultados: PinResultado[];
  clickHabilitado: boolean;
  onPick: (latlng: [number, number]) => void;
  verComunas: boolean;
  verAreas: boolean;
  /** geometría destacada (modo Avenidas / ruta óptima de transporte); null = nada */
  destacado: GeoJSON.FeatureCollection | null;
  /** segunda geometría (la opción elegida cuando no fue la óptima), en rojo punteado */
  trazadoMalo: GeoJSON.FeatureCollection | null;
  /** marcadores A/B del modo transporte; al setearse la vista se amplía al AMBA */
  marcadoresAB: MarcadorAB[] | null;
  /** modo Comunas y localidades: la vista se queda en la zona entera en vez de
      acercarse a la geometría destacada, que ahí es justamente lo que hay que ubicar. */
  encuadrarZona?: boolean;
}

// caché de overlays descargados (por URL, vive toda la sesión)
const cacheOverlay = new Map<string, Promise<GeoJSON.FeatureCollection | null>>();
function datosOverlay(url: string): Promise<GeoJSON.FeatureCollection | null> {
  let p = cacheOverlay.get(url);
  if (!p) {
    p = fetch(ruta(url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    cacheOverlay.set(url, p);
  }
  return p;
}

function puntoDiv(fondo: string, borde: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `width:15px;height:15px;border-radius:50%;background:${fondo};border:2px solid ${borde};box-shadow:0 0 0 1px rgba(0,0,0,.35)`;
  return el;
}

function pinRespuesta(etiqueta: string, color = '#ef4444', borde = '#b91c1c'): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px';
  const chip = document.createElement('div');
  chip.textContent = etiqueta;
  chip.className = 'pin-etiqueta';
  chip.style.borderColor = color;
  wrap.append(chip, puntoDiv(color, borde));
  return wrap;
}

const FC_VACIA: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function bboxDeFC(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
  let minX = 180, minY = 90, maxX = -180, maxY = -90, alguno = false;
  const visitar = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const [x, y] = coords as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      alguno = true;
    } else if (Array.isArray(coords)) {
      coords.forEach(visitar);
    }
  };
  for (const f of fc.features) visitar((f.geometry as GeoJSON.LineString).coordinates);
  return alguno ? [[minX, minY], [maxX, maxY]] : null;
}

const LIMITES_AMBA: [[number, number], [number, number]] = [[-59.35, -35.25], [-57.65, -34.05]];

export default function GameMap({
  zona,
  basemap,
  resultados,
  clickHabilitado,
  onPick,
  verComunas,
  verAreas,
  destacado,
  trazadoMalo,
  marcadoresAB,
  encuadrarZona = false,
}: Props) {
  const contRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaML | null>(null);
  const marcadoresRef = useRef<maplibregl.Marker[]>([]);
  const marcadoresABRef = useRef<maplibregl.Marker[]>([]);
  const listoRef = useRef(false);
  // `listoRef` es un ref, así que nada re-renderiza cuando el mapa queda listo: los
  // efectos que dependen de él se salteaban si sus datos llegaban ANTES que el estilo.
  // Con los modos viejos nunca se notaba (los datasets tardan más que el mapa), pero
  // el de Lugares carga un JSON chico y el marcador no aparecía. Espejo en estado:
  const [listo, setListo] = useState(false);
  const capasOverlayRef = useRef<string[]>([]);

  const clickRef = useRef(clickHabilitado);
  const pickRef = useRef(onPick);
  const resultadosRef = useRef(resultados);
  const comunasRef = useRef(verComunas);
  const areasRef = useRef(verAreas);
  const zonaRef = useRef(zona);
  const destacadoRef = useRef(destacado);
  const trazadoMaloRef = useRef(trazadoMalo);
  clickRef.current = clickHabilitado;
  pickRef.current = onPick;
  resultadosRef.current = resultados;
  comunasRef.current = verComunas;
  areasRef.current = verAreas;
  destacadoRef.current = destacado;
  trazadoMaloRef.current = trazadoMalo;

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      const estilo = await crearEstilo('plano');
      if (cancelado || !contRef.current) return;

      const mapa = new maplibregl.Map({
        container: contRef.current,
        style: estilo,
        bounds: zonaRef.current.encuadre,
        fitBoundsOptions: { padding: 12 },
        maxBounds: zonaRef.current.limites,
        minZoom: 9.5,
        maxZoom: 18.5,
        attributionControl: { compact: true },
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
        mapa.on('error', (e) => console.warn('[ubicamba] map error:', e.error?.message));
      }
    }

    function armarCapas(mapa: MapaML) {
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
      if (!mapa.getSource('destacado')) {
        mapa.addSource('destacado', { type: 'geojson', data: destacadoRef.current ?? FC_VACIA });
        // Relleno para el modo Comunas y localidades. Sobre una LineString (avenidas)
        // MapLibre no dibuja nada, asi que la capa no molesta a los demas modos.
        mapa.addLayer({
          id: 'destacado-relleno',
          type: 'fill',
          source: 'destacado',
          paint: { 'fill-color': '#4cc2ff', 'fill-opacity': 0.18 },
        });
        mapa.addLayer({
          id: 'destacado-halo',
          type: 'line',
          source: 'destacado',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#062033', 'line-width': 9, 'line-opacity': 0.75, 'line-blur': 1.5 },
        });
        mapa.addLayer({
          id: 'destacado-trazo',
          type: 'line',
          source: 'destacado',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#4cc2ff', 'line-width': 4 },
        });
      }
      if (!mapa.getSource('trazado-malo')) {
        mapa.addSource('trazado-malo', { type: 'geojson', data: trazadoMaloRef.current ?? FC_VACIA });
        mapa.addLayer({
          id: 'trazado-malo-linea',
          type: 'line',
          source: 'trazado-malo',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ef4444', 'line-width': 3, 'line-dasharray': [1.5, 1.5] },
        });
      }
      capasOverlayRef.current = [];
      agregarOverlays(mapa);
      aplicarResultados(mapa, resultadosRef.current);
      listoRef.current = true;
      setListo(true);
    }

    iniciar();
    return () => {
      cancelado = true;
      marcadoresRef.current.forEach((m) => m.remove());
      marcadoresRef.current = [];
      mapaRef.current?.remove();
      mapaRef.current = null;
      listoRef.current = false;
      setListo(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function visibleDe(def: OverlayDef): 'visible' | 'none' {
    const v = def.grupo === 'comunas' ? comunasRef.current : areasRef.current;
    return v ? 'visible' : 'none';
  }

  function agregarOverlays(mapa: MapaML) {
    const zonaAlPedir = zonaRef.current;
    for (const def of zonaAlPedir.overlays) {
      datosOverlay(def.url).then((data) => {
        if (!data || mapaRef.current !== mapa) return;
        if (zonaRef.current.id !== zonaAlPedir.id) return; // cambió la zona mientras bajaba
        if (mapa.getSource(def.id)) return;
        if (!mapa.isStyleLoaded() && !mapa.getSource('lineas')) return;
        mapa.addSource(def.id, { type: 'geojson', data });
        if (def.tipo === 'linea') {
          mapa.addLayer(
            {
              id: def.id,
              type: 'line',
              source: def.id,
              layout: { visibility: visibleDe(def) },
              paint: {
                'line-color': def.color,
                'line-width': def.ancho ?? 1.5,
                ...(def.dash ? { 'line-dasharray': def.dash } : {}),
              },
            },
            mapa.getLayer('lineas-halo') ? 'lineas-halo' : undefined
          );
        } else {
          mapa.addLayer({
            id: def.id,
            type: 'symbol',
            source: def.id,
            layout: {
              visibility: visibleDe(def),
              'text-field': ['get', 'etiqueta'],
              'text-font': ['Noto Sans Bold'],
              'text-size': def.tamano ?? 12,
            },
            paint: { 'text-color': def.color, 'text-halo-color': 'rgba(0,0,0,.75)', 'text-halo-width': 1.5 },
          });
        }
        capasOverlayRef.current.push(def.id);
      });
    }
  }

  function quitarOverlays(mapa: MapaML) {
    for (const id of capasOverlayRef.current) {
      if (mapa.getLayer(id)) mapa.removeLayer(id);
      if (mapa.getSource(id)) mapa.removeSource(id);
    }
    capasOverlayRef.current = [];
  }

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

  // resultados → marcadores y líneas
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa && listoRef.current) aplicarResultados(mapa, resultados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados, listo]);

  // cambio de zona → overlays nuevos + encuadre
  useEffect(() => {
    const anterior = zonaRef.current;
    zonaRef.current = zona;
    const mapa = mapaRef.current;
    if (!mapa || anterior.id === zona.id) return;
    if (listoRef.current) quitarOverlays(mapa);
    mapa.setMaxBounds(zona.limites);
    mapa.fitBounds(zona.encuadre, { padding: 12, duration: 900 });
    if (listoRef.current) agregarOverlays(mapa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona]);

  // geometría destacada (modo Avenidas / ruta óptima)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current) return;
    (mapa.getSource('destacado') as GeoJSONSource | undefined)?.setData(destacado ?? FC_VACIA);
    if (destacado && !marcadoresAB && !encuadrarZona) {
      const bbox = bboxDeFC(destacado);
      if (bbox) mapa.fitBounds(bbox, { padding: 60, duration: 700, maxZoom: 14.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destacado, listo, encuadrarZona]);

  // Modo Comunas y localidades: la vista vuelve a la zona entera, que es el marco
  // de referencia para reconocer el contorno.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current || !encuadrarZona) return;
    mapa.fitBounds(zona.encuadre, { padding: 24, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encuadrarZona, zona.id, listo]);

  // trazado de la opción elegida (cuando no fue la óptima)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current) return;
    (mapa.getSource('trazado-malo') as GeoJSONSource | undefined)?.setData(trazadoMalo ?? FC_VACIA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trazadoMalo, listo]);

  // marcadores A/B del modo transporte (amplían la vista al AMBA)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current) return;
    marcadoresABRef.current.forEach((m) => m.remove());
    marcadoresABRef.current = [];
    if (marcadoresAB?.length) {
      mapa.setMaxBounds(LIMITES_AMBA);
      for (const m of marcadoresAB) {
        const marker = new maplibregl.Marker({ element: pinRespuesta(m.etiqueta, m.color, m.color), anchor: 'bottom' })
          .setLngLat([m.latlng[1], m.latlng[0]])
          .addTo(mapa);
        marcadoresABRef.current.push(marker);
      }
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const m of marcadoresAB) {
        minX = Math.min(minX, m.latlng[1]); maxX = Math.max(maxX, m.latlng[1]);
        minY = Math.min(minY, m.latlng[0]); maxY = Math.max(maxY, m.latlng[0]);
      }
      mapa.fitBounds([[minX, minY], [maxX, maxY]], { padding: 80, duration: 700, maxZoom: 13 });
    } else {
      mapa.setMaxBounds(zonaRef.current.limites);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadoresAB, listo]);

  // cambio de mapa base (plano ⇄ satélite)
  const basemapPrevio = useRef(basemap);
  useEffect(() => {
    if (basemapPrevio.current === basemap) return;
    basemapPrevio.current = basemap;
    const mapa = mapaRef.current;
    if (!mapa) return;
    listoRef.current = false;
    setListo(false);
    crearEstilo(basemap).then((estilo) => {
      if (mapaRef.current === mapa) mapa.setStyle(estilo); // style.load re-arma las capas
    });
  }, [basemap]);

  // visibilidad de overlays
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current) return;
    for (const def of zonaRef.current.overlays) {
      if (mapa.getLayer(def.id)) mapa.setLayoutProperty(def.id, 'visibility', visibleDe(def));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verComunas, verAreas]);

  // cursor
  useEffect(() => {
    const canvas = mapaRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = clickHabilitado ? 'crosshair' : '';
  }, [clickHabilitado]);

  return <div ref={contRef} className="mapa" />;
}
