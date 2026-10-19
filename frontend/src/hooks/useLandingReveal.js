import { useEffect, useState } from 'react';

// Adds `is-visible` to every [data-reveal] element inside `rootRef` as it scrolls into view. Content
// stays visible without IntersectionObserver because the hidden start state only applies once the
// root gets `landing-reveal-ready`.
export function useLandingReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') return undefined;

    root.classList.add('landing-reveal-ready');
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    root.querySelectorAll('[data-reveal]:not(.is-visible)').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

// Counts the leading number of a highlight value ("120+", "8 years") up from zero once visible.
export function useCountUp(value, elementRef) {
  const text = String(value || '');
  const match = text.match(/^(\D*)(\d[\d,]*)(.*)$/);
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    const element = elementRef.current;
    if (!match || !element || prefersReducedMotion() || typeof window.IntersectionObserver === 'undefined') {
      setDisplay(text);
      return undefined;
    }
    const [, prefix, digits, suffix] = match;
    const target = Number(digits.replace(/,/g, ''));
    let frame = 0;
    setDisplay(`${prefix}0${suffix}`);

    const observer = new window.IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const started = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - started) / 1400);
        const eased = 1 - (1 - progress) ** 3;
        setDisplay(`${prefix}${Math.round(target * eased).toLocaleString('en-PH')}${suffix}`);
        if (progress < 1) frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    }, { threshold: 0.4 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return display;
}
