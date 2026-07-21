<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import { getCachedWays, parseRoadTags } from './osm.js';
  import { runQuery } from './query.js';

  export let map;   // Mapbox map instance

  const dispatch = createEventDispatcher();

  let queryStr = '';
  let error = null;
  let totalMatches = 0;
  let resultCount = 0;
  let markers = [];

  function clearMarkers() {
    for (const m of markers) m.remove();
    markers = [];
  }

  function midpoint(way) {
    const g = way.geometry;
    const m = g[Math.floor(g.length / 2)];
    return { lat: m.lat, lon: m.lon };
  }

  function runSearch() {
    clearMarkers();
    error = null;
    totalMatches = 0;
    resultCount = 0;

    const ways = getCachedWays();
    if (!ways.length) {
      error = 'No cached roads — run: node scripts/fetch-roads.js';
      return;
    }

    let result;
    try {
      const center = map.getCenter();
      result = runQuery(queryStr, ways, {
        center: { lat: center.lat, lon: center.lng },
        limit: 10,
      });
    } catch (e) {
      error = e.message;
      return;
    }

    totalMatches = result.total;
    resultCount  = result.hits.length;

    for (let i = 0; i < result.hits.length; i++) {
      const way = result.hits[i];
      const { lat, lon } = midpoint(way);

      const el = document.createElement('div');
      el.className = 'query-pin';
      el.textContent = String(i + 1);

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lon, lat])
        .addTo(map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const lngLat = { lat, lng: lon };
        const road = parseRoadTags(way.tags, way.geometry, lat, lon);
        const pixel = map.project([lon, lat]);
        dispatch('roadSelected', { road, lngLat, pixel });
      });

      markers.push(marker);
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter') runSearch();
  }

  onDestroy(clearMarkers);
</script>

<div class="panel">
  <div class="row">
    <input
      class="input"
      bind:value={queryStr}
      on:keydown={onKeydown}
      placeholder="highway=primary  ·  lanes>2  ·  name~Pike"
      spellcheck="false"
    />
    <button class="btn" on:click={runSearch}>▶</button>
  </div>

  {#if error}
    <div class="status error">{error}</div>
  {:else if resultCount > 0}
    <div class="status">
      Showing {resultCount} of {totalMatches} match{totalMatches === 1 ? '' : 'es'},
      sorted by distance from map center
    </div>
  {:else if totalMatches === 0 && queryStr}
    <div class="status">No matches</div>
  {/if}
</div>

<style>
  .panel {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 320px;
  }

  .row {
    display: flex;
    gap: 6px;
  }

  .input {
    flex: 1;
    background: rgba(15, 15, 30, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #e8e8ff;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    outline: none;
  }
  .input::placeholder { color: rgba(200, 200, 220, 0.4); }
  .input:focus { border-color: rgba(255, 255, 255, 0.4); }

  .btn {
    background: rgba(15, 15, 30, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #e8e8ff;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover { background: rgba(40, 40, 80, 0.95); }

  .status {
    font-size: 11px;
    color: #aaa;
    font-family: system-ui, sans-serif;
    padding: 2px 12px;
  }
  .error { color: #ff8080; }

  /* Pin markers — injected into the map DOM, so must use :global */
  :global(.query-pin) {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #ffe066;
    color: #111;
    font-size: 11px;
    font-weight: 700;
    font-family: system-ui, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: 2px solid #333;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    transition: transform 0.1s;
  }
  :global(.query-pin:hover) {
    transform: scale(1.25);
  }
</style>
