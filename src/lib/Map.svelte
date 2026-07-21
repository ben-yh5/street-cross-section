<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import 'mapbox-gl/dist/mapbox-gl.css';
  import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';
  import { fetchRoadFromOSM, initCache } from './osm.js';

  const dispatch = createEventDispatcher();

  export let onMapReady = null;

  let mapContainer;
  let map;
  let loading = false;

  // Road layer IDs in Mapbox streets style that indicate clickable roads
  const ROAD_LAYER_PATTERNS = [
    'road-', 'tunnel-', 'bridge-', 'motorway-', 'street-'
  ];

  function isRoadLayer(layerId) {
    return ROAD_LAYER_PATTERNS.some(p => layerId.startsWith(p));
  }

  onMount(() => {
    mapboxgl.accessToken = PUBLIC_MAPBOX_TOKEN;
    initCache(); // fire-and-forget; resolves before any click will happen

    map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-122.3321, 47.6062], // Seattle
      zoom: 15
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => { if (onMapReady) onMapReady(map); });

    map.on('click', async (e) => {
      const features = map.queryRenderedFeatures(e.point, {});
      const roadHit = features.find(f => isRoadLayer(f.layer.id));

      if (!roadHit) {
        dispatch('roadCleared');
        return;
      }

      // Change cursor to spinner-ish (we'll handle loading state in parent)
      loading = true;
      dispatch('loading', true);

      try {
        const road = await fetchRoadFromOSM(e.lngLat.lat, e.lngLat.lng);
        if (road) {
          const pixel = map.project(e.lngLat);
          dispatch('roadClicked', { road, pixel, lngLat: e.lngLat });
        } else {
          dispatch('roadCleared');
        }
      } catch (err) {
        console.error('OSM fetch error:', err);
        dispatch('roadCleared');
      } finally {
        loading = false;
        dispatch('loading', false);
      }
    });

    // Update panel pixel position on map move/zoom
    map.on('move', () => {
      dispatch('mapMoved', map);
    });

    map.on('mouseenter', 'road-simple', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'road-simple', () => { map.getCanvas().style.cursor = ''; });
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  export function project(lngLat) {
    return map ? map.project(lngLat) : { x: 0, y: 0 };
  }
</script>

<div class="map-container" bind:this={mapContainer}>
  {#if loading}
    <div class="loading-indicator">Querying OSM...</div>
  {/if}
</div>

<style>
  .map-container {
    position: absolute;
    inset: 0;
    cursor: default;
  }

  .loading-indicator {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    z-index: 20;
    pointer-events: none;
  }
</style>
