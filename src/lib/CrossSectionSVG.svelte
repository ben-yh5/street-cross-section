<script>
  import { buildLaneLayout, totalWidthPx, WIDTHS } from './layout.js';

  export let road;
  export let height = null;   // if set, scale the whole diagram to this pixel height
  export let showLabels = true;

  const ROAD_HEIGHT = 80;
  const LABEL_HEIGHT = 20;
  const PADDING = 10;
  const BUF_PX = WIDTHS.buffer.px;

  // Unique prefix so clipPath ids don't collide when several diagrams are on the page
  const uid = Math.random().toString(36).slice(2, 8);

  $: lanes = buildLaneLayout(road);
  $: svgWidth = lanes ? totalWidthPx(lanes) + PADDING * 2 : 180;
  $: svgHeight = ROAD_HEIGHT + (showLabels ? LABEL_HEIGHT : 0) + PADDING;
  $: displayH = height ?? svgHeight;
  $: displayW = svgWidth * (displayH / svgHeight);

  function expandMotorLanes(lane) {
    const count = lane.count ?? 1;
    return Array.from({ length: count }, (_, i) => ({
      ...lane, widthPx: WIDTHS.motor.px, _index: i, _total: count,
    }));
  }

  $: columns = (() => {
    if (!lanes) return [];
    const cols = [];
    let cx = PADDING;
    for (const lane of lanes) {
      if (lane.type === 'motor') {
        for (const s of expandMotorLanes(lane)) {
          cols.push({ ...s, x: cx });
          cx += WIDTHS.motor.px;
        }
      } else {
        cols.push({ ...lane, x: cx });
        cx += lane.widthPx;
      }
    }
    return cols;
  })();

  function arrowPath(cx, cy, direction) {
    const up = direction === 'forward';
    const hw = 8, hh = 10, shaft = 14;
    if (up) {
      return `M ${cx} ${cy - hh - shaft / 2}
              L ${cx - hw} ${cy - shaft / 2} L ${cx - hw / 2} ${cy - shaft / 2}
              L ${cx - hw / 2} ${cy + hh + shaft / 2} L ${cx + hw / 2} ${cy + hh + shaft / 2}
              L ${cx + hw / 2} ${cy - shaft / 2} L ${cx + hw} ${cy - shaft / 2} Z`;
    } else {
      return `M ${cx} ${cy + hh + shaft / 2}
              L ${cx + hw} ${cy + shaft / 2} L ${cx + hw / 2} ${cy + shaft / 2}
              L ${cx + hw / 2} ${cy - hh - shaft / 2} L ${cx - hw / 2} ${cy - hh - shaft / 2}
              L ${cx - hw / 2} ${cy + shaft / 2} L ${cx - hw} ${cy + shaft / 2} Z`;
    }
  }

  function hatchLines(x, width, y0, height, step = 8) {
    const lines = [];
    for (let i = -height; i < width + height; i += step) {
      lines.push({ x1: x + i, y1: y0, x2: x + i + height, y2: y0 + height });
    }
    return lines;
  }

  function isSharrowLane(col) {
    if (!col.sharrow) return false;
    if (col.direction === 'forward')  return col._index === col._total - 1;
    if (col.direction === 'backward') return col._index === 0;
    return true;
  }

  function sharrowBike(cx, cy) {
    return { lx: cx - 11, rx: cx + 11, cy, wr: 7 };
  }

  function chevronPoints(cx, tipY, legLen, direction) {
    const w = 7;
    const sign = direction === 'forward' ? -1 : 1;
    return [
      [cx - w, tipY + sign * legLen],
      [cx,     tipY],
      [cx + w, tipY + sign * legLen],
    ].map(([x, y]) => `${x},${y}`).join(' ');
  }
</script>

<svg width={displayW} height={displayH} viewBox="0 0 {svgWidth} {svgHeight}" style="overflow: visible; display: block;">
  {#if !lanes}
    <rect x={0} y={0} width={svgWidth} height={ROAD_HEIGHT} rx={4} fill="#3a3a3a" />
    <text x={svgWidth / 2} y={ROAD_HEIGHT / 2 + 4} text-anchor="middle" fill="#aaa" font-size="11" font-family="system-ui">
      No lane data in OSM
    </text>
  {:else}
    <rect x={0} y={0} width={svgWidth} height={ROAD_HEIGHT} fill="#3a3a3a" />

    {#each columns as col}
      {@const cx = col.x + col.widthPx / 2}
      {@const cy = ROAD_HEIGHT / 2}

      {#if col.type === 'parking'}
        <rect x={col.x} y={0} width={col.widthPx} height={ROAD_HEIGHT} fill="#3a5070" />
        <clipPath id="clip-{uid}-p-{col.x}">
          <rect x={col.x} y={0} width={col.widthPx} height={ROAD_HEIGHT} />
        </clipPath>
        <g clip-path="url(#clip-{uid}-p-{col.x})" opacity="0.4">
          {#each hatchLines(col.x, col.widthPx, 0, ROAD_HEIGHT) as ln}
            <line x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke="#7ab" stroke-width="2" />
          {/each}
        </g>
        <line x1={col.x + col.widthPx} y1={0} x2={col.x + col.widthPx} y2={ROAD_HEIGHT} stroke="white" stroke-width="1.5" />

      {:else if col.type === 'bike'}
        {@const isForward = col.direction !== 'backward'}
        {@const bufX  = isForward ? col.x          : col.x + WIDTHS.bike.px}
        {@const bikeX = isForward ? col.x + BUF_PX : col.x}

        {#if col.bikeStyle === 'buffered'}
          <rect x={bufX} y={0} width={BUF_PX} height={ROAD_HEIGHT} fill="#2a3a2a" />
          <clipPath id="clip-{uid}-b-{col.x}">
            <rect x={bufX} y={0} width={BUF_PX} height={ROAD_HEIGHT} />
          </clipPath>
          <g clip-path="url(#clip-{uid}-b-{col.x})" opacity="0.6">
            {#each hatchLines(bufX, BUF_PX, 0, ROAD_HEIGHT, 6) as ln}
              <line x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke="#4caf50" stroke-width="1.5" />
            {/each}
          </g>
          <rect x={bikeX} y={0} width={WIDTHS.bike.px} height={ROAD_HEIGHT} fill="#1e5e38" />
          <line x1={col.x + col.widthPx} y1={0} x2={col.x + col.widthPx} y2={ROAD_HEIGHT} stroke="white" stroke-width="1" />

        {:else if col.bikeStyle === 'track'}
          <rect x={col.x} y={0} width={col.widthPx} height={ROAD_HEIGHT} fill="#1e5e38" />
          {@const barrierX = isForward ? col.x : col.x + col.widthPx - 1}
          <line x1={barrierX} y1={0} x2={barrierX} y2={ROAD_HEIGHT} stroke="#888" stroke-width="4" />
          <line x1={barrierX} y1={0} x2={barrierX} y2={ROAD_HEIGHT} stroke="#ddd" stroke-width="1.5" stroke-dasharray="6 4" />
          <line x1={col.x + col.widthPx} y1={0} x2={col.x + col.widthPx} y2={ROAD_HEIGHT} stroke="white" stroke-width="1" />

        {:else}
          <rect x={col.x} y={0} width={col.widthPx} height={ROAD_HEIGHT} fill="#1e5e38" />
          <line x1={col.x + col.widthPx} y1={0} x2={col.x + col.widthPx} y2={ROAD_HEIGHT} stroke="white" stroke-width="1" />
        {/if}

      {:else if col.type === 'motor'}
        <rect x={col.x} y={0} width={col.widthPx} height={ROAD_HEIGHT} fill="#555" />
        {#if col._index < col._total - 1}
          <line x1={col.x + col.widthPx} y1={8} x2={col.x + col.widthPx} y2={ROAD_HEIGHT - 8}
            stroke="white" stroke-width="1.5" stroke-dasharray="8 8" />
        {/if}
        {#if col.direction !== null}
          <path d={arrowPath(cx, cy, col.direction)} fill="rgba(255,255,255,0.7)" />
        {/if}
        {#if isSharrowLane(col)}
          {@const bike = sharrowBike(cx, cy + 8)}
          {@const dir = col.direction ?? 'forward'}
          <circle cx={bike.lx} cy={bike.cy} r={bike.wr} fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" />
          <circle cx={bike.rx} cy={bike.cy} r={bike.wr} fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" />
          <polyline points="{bike.lx},{bike.cy} {cx},{bike.cy - 10} {bike.rx},{bike.cy}"
            fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" />
          <line x1={cx - 5} y1={bike.cy - 10} x2={cx + 1} y2={bike.cy - 10}
            stroke="rgba(255,255,255,0.55)" stroke-width="1.5" />
          <line x1={bike.rx} y1={bike.cy - 5} x2={bike.rx + 5} y2={bike.cy - 5}
            stroke="rgba(255,255,255,0.55)" stroke-width="1.5" />
          <polyline points={chevronPoints(cx, cy - 14, 5, dir)}
            fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-linejoin="round" />
          <polyline points={chevronPoints(cx, cy - 22, 5, dir)}
            fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-linejoin="round" />
        {/if}

      {:else if col.type === 'centerline'}
        <rect x={col.x} y={0} width={col.widthPx} height={ROAD_HEIGHT} fill="#3a3a3a" />
        <line x1={col.x + 1} y1={0} x2={col.x + 1} y2={ROAD_HEIGHT} stroke="#f5c518" stroke-width="1.5" />
        <line x1={col.x + col.widthPx - 1} y1={0} x2={col.x + col.widthPx - 1} y2={ROAD_HEIGHT} stroke="#f5c518" stroke-width="1.5" />
      {/if}
    {/each}

    <line x1={PADDING} y1={0} x2={PADDING} y2={ROAD_HEIGHT} stroke="white" stroke-width="2" />
    <line x1={svgWidth - PADDING} y1={0} x2={svgWidth - PADDING} y2={ROAD_HEIGHT} stroke="white" stroke-width="2" />

    {#if showLabels}
      {#each columns as col}
        {#if col.label}
          <text x={col.x + col.widthPx / 2} y={ROAD_HEIGHT + 14} text-anchor="middle"
            fill="#ccc" font-size="9" font-family="system-ui">{col.label}</text>
        {:else if col.type === 'motor'}
          <text x={col.x + col.widthPx / 2} y={ROAD_HEIGHT + 14} text-anchor="middle"
            fill="#ccc" font-size="9" font-family="system-ui">
            {col.sharrow ? 'Sharrow' : `Motor: ${WIDTHS.motor.ft} ft`}
          </text>
        {/if}
      {/each}
    {/if}
  {/if}
</svg>
