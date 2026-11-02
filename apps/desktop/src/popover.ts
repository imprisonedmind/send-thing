export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const POPOVER_SIZE = { width: 430, height: 640 };
const GAP = 8;

export function containsPoint(
  bounds: Rectangle,
  point: { x: number; y: number },
) {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

export function popoverBounds(
  anchor: Rectangle,
  workArea: Rectangle,
): Rectangle {
  const width = Math.min(POPOVER_SIZE.width, workArea.width - GAP * 2);
  const height = Math.min(POPOVER_SIZE.height, workArea.height - GAP * 2);
  const center = {
    x: anchor.x + anchor.width / 2,
    y: anchor.y + anchor.height / 2,
  };
  const edges = [
    { side: "top", distance: Math.max(0, center.y - workArea.y) },
    {
      side: "bottom",
      distance: Math.max(0, workArea.y + workArea.height - center.y),
    },
    { side: "left", distance: Math.max(0, center.x - workArea.x) },
    {
      side: "right",
      distance: Math.max(0, workArea.x + workArea.width - center.x),
    },
  ] as const;
  const edge = edges.reduce((nearest, candidate) =>
    candidate.distance < nearest.distance ? candidate : nearest,
  );
  let x = center.x - width / 2;
  let y = center.y - height / 2;
  if (edge.side === "top") y = anchor.y + anchor.height + GAP;
  else if (edge.side === "bottom") y = anchor.y - height - GAP;
  else if (edge.side === "left") x = anchor.x + anchor.width + GAP;
  else x = anchor.x - width - GAP;
  return {
    x: Math.round(
      Math.max(
        workArea.x + GAP,
        Math.min(x, workArea.x + workArea.width - width - GAP),
      ),
    ),
    y: Math.round(
      Math.max(
        workArea.y + GAP,
        Math.min(y, workArea.y + workArea.height - height - GAP),
      ),
    ),
    width,
    height,
  };
}
