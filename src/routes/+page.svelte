<script>
  import '../app.css';
  import Map from '$lib/Map.svelte';
  import CrossSection from '$lib/CrossSection.svelte';
  import QueryPanel from '$lib/QueryPanel.svelte';
  import RoutePanel from '$lib/RoutePanel.svelte';

  let road = null;
  let panelX = 0;
  let panelY = 0;
  let storedLngLat = null;
  let mapRef;
  let mapInstance = null;

  function onRoadClicked(e) {
    road = e.detail.road;
    panelX = e.detail.pixel.x;
    panelY = e.detail.pixel.y;
    storedLngLat = e.detail.lngLat;
  }

  function onRoadSelected(e) {
    // Same handler as clicking a road directly — reuse cross-section display
    onRoadClicked(e);
  }

  function onRoadCleared() {
    road = null;
    storedLngLat = null;
  }

  function onMapMoved() {
    if (storedLngLat && mapRef) {
      const px = mapRef.project(storedLngLat);
      panelX = px.x;
      panelY = px.y;
    }
  }
</script>

<div style="position: relative; width: 100vw; height: 100vh;">
  <Map
    bind:this={mapRef}
    onMapReady={(m) => { mapInstance = m; }}
    on:roadClicked={onRoadClicked}
    on:roadCleared={onRoadCleared}
    on:mapMoved={onMapMoved}
  />

  {#if mapInstance}
    <QueryPanel map={mapInstance} on:roadSelected={onRoadSelected} />
    <RoutePanel map={mapInstance} on:roadSelected={onRoadSelected} />
  {/if}

  {#if road}
    <CrossSection {road} x={panelX} y={panelY} />
  {/if}
</div>
