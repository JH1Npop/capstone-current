import { useCallback, useEffect, useState } from 'react';
import './IntroSplash.css';

// "Sun to Panel": sunlight charges a solar panel that docks into the logo as the yellow bar of the F.
const INTRO_MS = 4000;
const FADE_MS = 500;
const SEEN_KEY = 'afn_intro_seen';

const SUN_X = 325;
const SUN_Y = 200;
const RAYS = Array.from({ length: 13 }, (_, index) => {
  const angle = Math.PI - (index * Math.PI) / 12;
  const outer = index % 2 === 0 ? 172 : 146;
  const inner = 114;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const base = [SUN_X + inner * cos, SUN_Y - inner * sin];
  const tip = [SUN_X + outer * cos, SUN_Y - outer * sin];
  return [
    [base[0] + 7 * sin, base[1] + 7 * cos],
    [tip[0] + 1.6 * sin, tip[1] + 1.6 * cos],
    [tip[0] - 1.6 * sin, tip[1] - 1.6 * cos],
    [base[0] - 7 * sin, base[1] - 7 * cos],
  ].map((point) => point.map((value) => value.toFixed(1)).join(',')).join(' ');
});
const CELLS = Array.from({ length: 12 }, (_, index) => ({ row: Math.floor(index / 6), column: index % 6 }));
const BEAM_TARGETS = [210, 333, 456];

const readSession = (key) => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeSession = (key, value) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Blocked storage only means the intro may play again on reload.
  }
};

// Plays once per browser tab. `?intro=play` replays it on demand (for demos and tests).
export function shouldPlayIntro(search = window.location.search) {
  if (new URLSearchParams(search).get('intro') === 'play') return true;
  if (import.meta.env.VITE_DISABLE_INTRO === 'true') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return readSession(SEEN_KEY) !== '1';
}

export default function IntroSplash() {
  const [phase, setPhase] = useState(() => (shouldPlayIntro() ? 'playing' : 'done'));

  const finish = useCallback((fast = false) => {
    setPhase((current) => (current === 'playing' ? (fast ? 'skipping' : 'leaving') : current));
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    writeSession(SEEN_KEY, '1');
    const timer = window.setTimeout(() => finish(false), INTRO_MS);
    const skip = () => finish(true);
    window.addEventListener('keydown', skip);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', skip);
    };
  }, [phase, finish]);

  useEffect(() => {
    if (phase !== 'leaving' && phase !== 'skipping') return undefined;
    const timer = window.setTimeout(() => setPhase('done'), phase === 'skipping' ? 250 : FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={`afn-intro ${phase !== 'playing' ? `afn-intro--${phase}` : ''}`}
      data-testid="afn-intro"
      onClick={() => finish(true)}
    >
      <svg className="afn-intro__logo" viewBox="0 0 650 570" role="img" aria-label="AFN Solar Power Engineering Services">
        <defs>
          <linearGradient id="afn-intro-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a86e6" />
            <stop offset="1" stopColor="#0d63c7" />
          </linearGradient>
          <linearGradient id="afn-intro-bar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f6a800" />
            <stop offset="1" stopColor="#ffe24d" />
          </linearGradient>
          <linearGradient id="afn-intro-ray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd21f" />
            <stop offset="1" stopColor="#f7a900" />
          </linearGradient>
          <clipPath id="afn-intro-sky">
            <rect x="0" y="0" width="650" height="222" />
          </clipPath>
        </defs>

        <g>
          {BEAM_TARGETS.map((x) => (
            <line key={x} className="afn-intro__beam" pathLength="1" x1="120" y1="100" x2={x} y2="338" stroke="#ffc21a" strokeWidth="3" />
          ))}
        </g>

        <g clipPath="url(#afn-intro-sky)">
          <g className="afn-intro__sun">
            {RAYS.map((points) => <polygon key={points} points={points} fill="url(#afn-intro-ray)" />)}
            <path d="M240,200 A85,85 0 0 1 410,200" fill="none" stroke="#f7b500" strokeWidth="13" />
          </g>
        </g>

        <path className="afn-intro__a" fillRule="evenodd" fill="url(#afn-intro-blue)" d="M80,390 L143,222 L183,222 L246,390 L203,390 L192,358 L134,358 L123,390 Z M144,326 L182,326 L163,272 Z" />
        <g className="afn-intro__f">
          <rect x="258" y="262" width="44" height="128" fill="url(#afn-intro-blue)" />
          <rect x="258" y="298" width="118" height="36" fill="url(#afn-intro-blue)" />
        </g>
        <rect className="afn-intro__bar" x="258" y="222" width="150" height="40" rx="2" fill="url(#afn-intro-bar)" />
        <path className="afn-intro__n" fill="url(#afn-intro-blue)" d="M422,390 L422,222 L463,222 L530,322 L530,222 L571,222 L571,390 L530,390 L463,290 L463,390 Z" />

        <g className="afn-intro__panel">
          <rect x="258" y="222" width="150" height="40" rx="2" fill="#0a3f80" stroke="#c9d6e8" strokeWidth="1.5" />
          {CELLS.map(({ row, column }) => (
            <rect
              key={`${row}-${column}`}
              className="afn-intro__cell"
              style={{ '--i': column }}
              x={261 + column * 24.5}
              y={225 + row * 18.5}
              width="21.5"
              height="15.5"
              rx="1"
            />
          ))}
        </g>

        <line className="afn-intro__dash afn-intro__dash--left" x1="30" y1="460" x2="104" y2="460" stroke="#f5a300" strokeWidth="4" strokeLinecap="round" />
        <line className="afn-intro__dash afn-intro__dash--right" x1="546" y1="460" x2="620" y2="460" stroke="#f5a300" strokeWidth="4" strokeLinecap="round" />
        <text className="afn-intro__tagline" x="325" y="478" textAnchor="middle" fontSize="48" fontWeight="600" letterSpacing="1" fill="#f5a300">SOLAR POWER</text>
        <text className="afn-intro__subline" x="325" y="540" textAnchor="middle" fontSize="38" fontWeight="500" letterSpacing="4" fill="#0b2f63">ENGINEERING SERVICES</text>
      </svg>

      <button
        type="button"
        className="afn-intro__skip"
        onClick={(event) => {
          event.stopPropagation();
          finish(true);
        }}
      >
        Skip intro
      </button>
    </div>
  );
}
