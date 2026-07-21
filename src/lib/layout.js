export const WIDTHS = {
  motor:    { px: 60,  ft: 11.5 },
  bike:     { px: 26,  ft: 4.9  },
  buffer:   { px: 17,  ft: 3.3  },  // hatch strip added to buffered bike lanes
  parking:  { px: 34,  ft: 6.6  },
  centerline: { px: 4, ft: null },
};

// bikeStyle: 'lane' | 'buffered' | 'track'
// bikeLeft/bikeRight from osm.js: 'lane' | 'buffered' | 'track' | 'shared_lane' | null
export function buildLaneLayout(road) {
  const { lanesForward, lanesBackward, directionsKnown, oneway,
          bikeLeft, bikeRight, parkingLeft, parkingRight } = road;

  if (lanesForward === null && lanesBackward === null) return null;

  const fwd = lanesForward  ?? 0;
  const bwd = lanesBackward ?? 0;

  const sharrowLeft  = bikeLeft  === 'shared_lane';
  const sharrowRight = bikeRight === 'shared_lane';

  const lanes = [];

  // ── left edge (outermost → inward) ──────────────────────────────────────
  if (parkingLeft) {
    lanes.push({ type: 'parking', side: 'left', widthPx: WIDTHS.parking.px, label: `Parking: ${WIDTHS.parking.ft} ft` });
  }

  if (bikeLeft && bikeLeft !== 'shared_lane') {
    const style = bikeLeft;
    const totalPx = style === 'buffered'
      ? WIDTHS.bike.px + WIDTHS.buffer.px
      : WIDTHS.bike.px;
    const ftLabel = style === 'buffered'
      ? `Buffered Bike: ${(WIDTHS.bike.ft + WIDTHS.buffer.ft).toFixed(1)} ft`
      : style === 'track'
        ? `Protected Track: ${WIDTHS.bike.ft} ft`
        : `Bike Lane: ${WIDTHS.bike.ft} ft`;
    const dir = directionsKnown ? 'backward' : null;
    lanes.push({ type: 'bike', bikeStyle: style, direction: dir, widthPx: totalPx, label: ftLabel });
  }

  // Backward motor lanes
  if (bwd > 0) {
    const dir = directionsKnown ? 'backward' : null;
    lanes.push({ type: 'motor', direction: dir, count: bwd, sharrow: sharrowLeft,
                 widthPx: WIDTHS.motor.px * bwd, label: null });
  }

  // Center divider
  if (!oneway && fwd > 0 && bwd > 0) {
    lanes.push({ type: 'centerline', widthPx: WIDTHS.centerline.px, label: null });
  }

  // Forward motor lanes
  if (fwd > 0) {
    const dir = directionsKnown ? 'forward' : null;
    lanes.push({ type: 'motor', direction: dir, count: fwd, sharrow: sharrowRight,
                 widthPx: WIDTHS.motor.px * fwd, label: null });
  }

  // ── right edge (inward → outermost) ─────────────────────────────────────
  if (bikeRight && bikeRight !== 'shared_lane') {
    const style = bikeRight;
    const totalPx = style === 'buffered'
      ? WIDTHS.bike.px + WIDTHS.buffer.px
      : WIDTHS.bike.px;
    const ftLabel = style === 'buffered'
      ? `Buffered Bike: ${(WIDTHS.bike.ft + WIDTHS.buffer.ft).toFixed(1)} ft`
      : style === 'track'
        ? `Protected Track: ${WIDTHS.bike.ft} ft`
        : `Bike Lane: ${WIDTHS.bike.ft} ft`;
    const dir = directionsKnown ? 'forward' : null;
    lanes.push({ type: 'bike', bikeStyle: style, direction: dir, widthPx: totalPx, label: ftLabel });
  }

  if (parkingRight) {
    lanes.push({ type: 'parking', side: 'right', widthPx: WIDTHS.parking.px, label: `Parking: ${WIDTHS.parking.ft} ft` });
  }

  return lanes;
}

export function totalWidthPx(lanes) {
  return lanes.reduce((sum, l) => sum + l.widthPx, 0);
}
