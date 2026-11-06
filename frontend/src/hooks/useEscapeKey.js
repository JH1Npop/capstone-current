import { useEffect, useRef } from 'react';

// Calls onEscape when the Escape key is pressed while `active` is true.
// Used by simple modal dialogs so keyboard users can close them.
export default function useEscapeKey(active, onEscape) {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handlerRef.current?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active]);
}
