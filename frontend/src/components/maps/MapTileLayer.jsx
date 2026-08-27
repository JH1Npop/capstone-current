import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { TileLayer, useMap } from 'react-leaflet';
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../../utils/mapRegion';

const TILE_LAYERS = {
  map: {
    label: 'Map',
    url: MAP_TILE_URL,
    attribution: MAP_ATTRIBUTION
  },
  clean2d: {
    label: '2D',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }
};

export default function MapTileLayer({ defaultLayer = 'map' }) {
  const map = useMap();
  const [activeLayer, setActiveLayer] = useState(TILE_LAYERS[defaultLayer] ? defaultLayer : 'map');
  const layer = TILE_LAYERS[activeLayer] || TILE_LAYERS.map;
  const layerOptions = useMemo(() => Object.entries(TILE_LAYERS), []);

  useEffect(() => {
    const control = L.control({ position: 'topright' });

    control.onAdd = () => {
      const container = L.DomUtil.create(
        'div',
        'leaflet-control rounded-lg border border-slate-200 bg-white p-1 shadow-lg'
      );

      container.style.display = 'flex';
      container.style.gap = '4px';
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      layerOptions.forEach(([key, item]) => {
        const button = L.DomUtil.create('button', '', container);
        button.type = 'button';
        button.dataset.layerKey = key;
        button.textContent = item.label;
        button.style.borderRadius = '6px';
        button.style.padding = '6px 10px';
        button.style.fontSize = '12px';
        button.style.fontWeight = '700';
        button.style.transition = 'background 120ms ease, color 120ms ease';
        button.style.background = key === activeLayer ? '#0f172a' : '#ffffff';
        button.style.color = key === activeLayer ? '#ffffff' : '#475569';

        L.DomEvent.on(button, 'click', (event) => {
          L.DomEvent.preventDefault(event);
          setActiveLayer(key);
        });
      });

      return container;
    };

    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [activeLayer, layerOptions, map]);

  return <TileLayer key={activeLayer} url={layer.url} attribution={layer.attribution} />;
}
