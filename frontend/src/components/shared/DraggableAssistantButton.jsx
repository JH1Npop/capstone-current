import { useEffect, useRef, useState } from 'react';

const EDGE_GAP = 12;
const DRAG_THRESHOLD = 5;

const clampPosition = (position, element) => {
  if (!position || !element) return position;
  const maxX = Math.max(EDGE_GAP, window.innerWidth - element.offsetWidth - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - element.offsetHeight - EDGE_GAP);
  return {
    x: Math.min(Math.max(EDGE_GAP, position.x), maxX),
    y: Math.min(Math.max(EDGE_GAP, position.y), maxY),
  };
};

export default function DraggableAssistantButton({ ariaLabel, storageKey, onOpen, children }) {
  const buttonRef = useRef(null);
  const dragStateRef = useRef(null);
  const positionRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [position, setPosition] = useState(null);

  const updatePosition = (nextPosition) => {
    const boundedPosition = clampPosition(nextPosition, buttonRef.current);
    positionRef.current = boundedPosition;
    setPosition(boundedPosition);
  };

  useEffect(() => {
    try {
      const storedPosition = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (Number.isFinite(storedPosition?.x) && Number.isFinite(storedPosition?.y)) {
        updatePosition(storedPosition);
      }
    } catch {
      // Keep the default bottom-right position when browser storage is unavailable.
    }
  }, [storageKey]);

  useEffect(() => {
    const keepInsideViewport = () => {
      if (positionRef.current) updatePosition(positionRef.current);
    };
    window.addEventListener('resize', keepInsideViewport);
    return () => window.removeEventListener('resize', keepInsideViewport);
  }, []);

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    const rect = buttonRef.current.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: rect.left,
      startY: rect.top,
      moved: false,
    };
    buttonRef.current.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragState.startPointerX;
    const deltaY = event.clientY - dragState.startPointerY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    dragState.moved = true;
    event.preventDefault();
    updatePosition({ x: dragState.startX + deltaX, y: dragState.startY + deltaY });
  };

  const finishDrag = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    suppressClickRef.current = dragState.moved;
    dragStateRef.current = null;
    buttonRef.current.releasePointerCapture?.(event.pointerId);
    if (dragState.moved && positionRef.current) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(positionRef.current));
      } catch {
        // The position remains usable for this session when storage is unavailable.
      }
    }
  };

  const handleClick = (event) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }
    onOpen();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={position ? { left: position.x, top: position.y } : undefined}
      className={`fixed z-40 grid h-14 w-14 touch-none select-none place-items-center rounded-full bg-brand-500 text-white shadow-xl shadow-brand-900/20 transition-colors hover:bg-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200 ${position ? '' : 'bottom-4 right-3 sm:bottom-20 sm:right-5 lg:bottom-8 lg:right-8'}`}
      aria-label={ariaLabel}
      title="Drag to move · Click to open"
    >
      {children}
    </button>
  );
}
