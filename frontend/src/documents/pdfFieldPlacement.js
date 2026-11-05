export const MIN_PDF_ZOOM = 0.75;
export const MAX_PDF_ZOOM = 1.75;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const coordinate = (value) => Number(value.toFixed(6));

export const clampPdfZoom = (value) => clamp(Number(value) || 1, MIN_PDF_ZOOM, MAX_PDF_ZOOM);

export const movePdfField = (placement, deltaX, deltaY) => {
  const current = placement || { x: 0, y: 0, width: 0.25, height: 0.05 };
  return {
    ...current,
    x: coordinate(clamp(current.x + deltaX, 0, 1 - current.width)),
    y: coordinate(clamp(current.y + deltaY, 0, 1 - current.height)),
  };
};

export const resizePdfField = (placement, deltaWidth, deltaHeight) => {
  const current = placement || { x: 0, y: 0, width: 0.25, height: 0.05 };
  return {
    ...current,
    width: coordinate(clamp(current.width + deltaWidth, 0.03, 1 - current.x)),
    height: coordinate(clamp(current.height + deltaHeight, 0.02, 1 - current.y)),
  };
};
