<script>
  import CrossSectionSVG from './CrossSectionSVG.svelte';

  export let road;
  export let x = 0;
  export let y = 0;

  $: bearing = road?.bearing ?? 0;
</script>

<!-- Panel anchored at click point, never rotated -->
<div class="panel" style="left: {x}px; top: {y}px;">

  <!-- Road diagram: only this part rotates -->
  <div class="diagram" style="transform: rotate({bearing}deg);">
    <CrossSectionSVG {road} />
  </div>

  <!-- Header: always horizontal -->
  <div class="header">{road.name} · {road.highway}</div>
</div>

<style>
  .panel {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .diagram {
    pointer-events: none;
    transform-origin: center center;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.65));
  }

  .header {
    margin-top: 6px;
    background: rgba(15, 15, 30, 0.88);
    color: #e8e8ff;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    white-space: nowrap;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
    pointer-events: auto;
    transition: opacity 0.15s;
  }
  .header:hover {
    opacity: 0.2;
  }
</style>
