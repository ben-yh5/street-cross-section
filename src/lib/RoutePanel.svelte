<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { parseGPX, samplePoints, matchRouteToRoads } from './gpx.js';
  import { getCachedWays } from './osm.js';
  import CrossSectionSVG from './CrossSectionSVG.svelte';

  export let map;

  const dispatch = createEventDispatcher();
  const SOURCE_ID = 'gpx-route';

  let fileInput;
  let segments = [];
  let routeName = null;
  let error = null;
  let selectedIdx = -1;

  async function onFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    error = null;

    if (!getCachedWays().length) {
      error = 'Road cache still loading — try again in a moment';
      return;
    }

    try {
      const text = await file.text();
      const pts = parseGPX(text);
      const sampled = samplePoints(pts);
      segments = matchRouteToRoads(sampled);
      routeName = file.name.replace(/\.gpx$/i, '');
      selectedIdx = -1;
      drawRoute(pts);
      fitToRoute(pts);
    } catch (err) {
      error = err.message;
      segments = [];
      routeName = null;
    }
    e.target.value = '';   // allow re-importing the same file
  }

  function drawRoute(pts) {
    const geojson = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pts.map(p => [p.lon, p.lat]) },
    };
    if (map.getSource(SOURCE_ID)) {
      map.getSource(SOURCE_ID).setData(geojson);
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: SOURCE_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#e91e63',
          'line-width': 3,
          'line-opacity': 0.75,
        },
      });
    }
  }

  function fitToRoute(pts) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60 });
  }

  function selectSegment(seg, i) {
    selectedIdx = i;
    map.flyTo({ center: [seg.lon, seg.lat], zoom: 16 });
    dispatch('roadSelected', {
      road: seg.road,
      lngLat: { lat: seg.lat, lng: seg.lon },
      pixel: map.project([seg.lon, seg.lat]),
    });
  }

  function clearRoute() {
    segments = [];
    routeName = null;
    selectedIdx = -1;
    if (map.getLayer(SOURCE_ID)) map.removeLayer(SOURCE_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }

  function fmtDist(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }

  onDestroy(() => {
    if (map?.getLayer(SOURCE_ID)) map.removeLayer(SOURCE_ID);
    if (map?.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  });
</script>

<input
  type="file"
  accept=".gpx"
  bind:this={fileInput}
  on:change={onFileChosen}
  style="display: none;"
/>

{#if !routeName}
  <button class="import-btn" on:click={() => fileInput.click()}>Import GPX route</button>
  {#if error}
    <div class="error-toast">{error}</div>
  {/if}
{:else}
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="title">{routeName}</div>
      <div class="subtitle">{segments.length} road segments</div>
      <button class="close" on:click={clearRoute}>✕</button>
    </div>

    <div class="list">
      {#each segments as seg, i}
        <button
          class="item"
          class:selected={i === selectedIdx}
          on:click={() => selectSegment(seg, i)}
        >
          <div class="item-head">
            <span class="idx">{i + 1}</span>
            <span class="name">{seg.road.name}</span>
            <span class="dist">{fmtDist(seg.distanceM)}</span>
          </div>
          <div class="mini">
            <CrossSectionSVG road={seg.road} height={48} showLabels={false} />
          </div>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .import-btn {
    position: absolute;
    top: 52px;
    left: 12px;
    z-index: 20;
    background: rgba(15, 15, 30, 0.88);
    color: #e8e8ff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    cursor: pointer;
  }
  .import-btn:hover { background: rgba(40, 40, 80, 0.95); }

  .error-toast {
    position: absolute;
    top: 90px;
    left: 12px;
    z-index: 20;
    background: rgba(80, 20, 20, 0.9);
    color: #ffb0b0;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
  }

  .sidebar {
    position: absolute;
    top: 52px;
    left: 12px;
    bottom: 12px;
    width: 280px;
    z-index: 20;
    background: rgba(15, 15, 30, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: system-ui, sans-serif;
  }

  .sidebar-header {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: relative;
  }
  .title { color: #e8e8ff; font-size: 13px; font-weight: 600; padding-right: 20px; }
  .subtitle { color: #999; font-size: 11px; margin-top: 2px; }
  .close {
    position: absolute;
    top: 8px;
    right: 10px;
    background: none;
    border: none;
    color: #999;
    font-size: 14px;
    cursor: pointer;
  }
  .close:hover { color: #fff; }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .item {
    display: block;
    width: 100%;
    text-align: left;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 6px;
    cursor: pointer;
  }
  .item:hover { background: rgba(255, 255, 255, 0.09); }
  .item.selected { border-color: #e91e63; }

  .item-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 6px;
  }
  .idx {
    color: #e91e63;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .name {
    color: #e8e8ff;
    font-size: 12px;
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dist { color: #999; font-size: 10px; flex-shrink: 0; }

  .mini { overflow-x: auto; }
</style>
