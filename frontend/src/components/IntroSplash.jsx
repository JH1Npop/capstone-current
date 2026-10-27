import { memo, useCallback, useEffect, useState } from 'react';
import './IntroSplash.css';

// "Sun to Panel": sunlight charges a solar panel that docks into the logo as the yellow bar of the F.
// Every moving part is its own HTML layer animated only with transform/opacity, so the browser can
// composite the frames on the GPU instead of repainting one large SVG while the page loads below.
const INTRO_MS = 4000;
const FADE_MS = 500;
const SEEN_KEY = 'afn_intro_seen';

// The logo is laid out on a 650 x 570 grid; layers are placed as percentages of that grid.
const GRID_W = 650;
const GRID_H = 570;
const place = (x, y, width, height) => ({
  left: `${(x / GRID_W) * 100}%`,
  top: `${(y / GRID_H) * 100}%`,
  width: `${(width / GRID_W) * 100}%`,
  height: `${(height / GRID_H) * 100}%`,
});

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

const BEAM_FROM = [120, 100];
const BEAMS = [210, 333, 456].map((x) => {
  const dx = x - BEAM_FROM[0];
  const dy = 338 - BEAM_FROM[1];
  return { length: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
});

const CELLS = Array.from({ length: 12 }, (_, index) => ({ row: Math.floor(index / 6), column: index % 6 }));

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

function Letter({ className, box, viewBox, gradientId, children }) {
  return (
    <svg className={`afn-intro__layer ${className}`} style={place(...box)} viewBox={viewBox} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a86e6" />
          <stop offset="1" stopColor="#0d63c7" />
        </linearGradient>
      </defs>
      {children(`url(#${gradientId})`)}
    </svg>
  );
}

function IntroSplash() {
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
      <div className="afn-intro__stage" role="img" aria-label="AFN Solar Power Engineering Services">
        {BEAMS.map(({ length, angle }) => (
          <div
            key={angle}
            className="afn-intro__beam"
            style={{
              left: `${(BEAM_FROM[0] / GRID_W) * 100}%`,
              top: `${(BEAM_FROM[1] / GRID_H) * 100}%`,
              width: `${(length / GRID_W) * 100}%`,
              transform: `rotate(${angle}deg)`,
            }}
          >
            <span />
          </div>
        ))}

        <svg className="afn-intro__layer afn-intro__sun" style={place(150, 22, 350, 186)} viewBox="150 22 350 186" aria-hidden="true">
          <defs>
            <linearGradient id="afn-intro-ray" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffd21f" />
              <stop offset="1" stopColor="#f7a900" />
            </linearGradient>
          </defs>
          {RAYS.map((points) => <polygon key={points} points={points} fill="url(#afn-intro-ray)" />)}
          <path d="M240,200 A85,85 0 0 1 410,200" fill="none" stroke="#f7b500" strokeWidth="13" />
        </svg>

        <Letter className="afn-intro__a" box={[80, 222, 166, 168]} viewBox="80 222 166 168" gradientId="afn-intro-a">
          {(fill) => <path fillRule="evenodd" fill={fill} d="M80,390 L143,222 L183,222 L246,390 L203,390 L192,358 L134,358 L123,390 Z M144,326 L182,326 L163,272 Z" />}
        </Letter>
        <Letter className="afn-intro__f" box={[258, 262, 118, 128]} viewBox="258 262 118 128" gradientId="afn-intro-f">
          {(fill) => (
            <>
              <rect x="258" y="262" width="44" height="128" fill={fill} />
              <rect x="258" y="298" width="118" height="36" fill={fill} />
            </>
          )}
        </Letter>
        <Letter className="afn-intro__n" box={[422, 222, 149, 168]} viewBox="422 222 149 168" gradientId="afn-intro-n">
          {(fill) => <path fill={fill} d="M422,390 L422,222 L463,222 L530,322 L530,222 L571,222 L571,390 L530,390 L463,290 L463,390 Z" />}
        </Letter>

        <div className="afn-intro__layer afn-intro__bar" style={place(258, 222, 150, 40)} />
        <div className="afn-intro__layer afn-intro__panel" style={place(258, 222, 150, 40)}>
          {CELLS.map(({ row, column }) => (
            <span
              key={`${row}-${column}`}
              style={{
                '--i': column,
                left: `${((3 + column * 24.5) / 150) * 100}%`,
                top: `${((3 + row * 18.5) / 40) * 100}%`,
                width: `${(21.5 / 150) * 100}%`,
                height: `${(15.5 / 40) * 100}%`,
              }}
            />
          ))}
        </div>

        <div className="afn-intro__layer afn-intro__dash afn-intro__dash--left" style={place(30, 458, 74, 4)} />
        <div className="afn-intro__layer afn-intro__dash afn-intro__dash--right" style={place(546, 458, 74, 4)} />
        <svg className="afn-intro__layer afn-intro__tagline" style={place(100, 430, 450, 60)} viewBox="100 430 450 60" aria-hidden="true">
          <text x="325" y="478" textAnchor="middle" fontSize="48" fontWeight="600" letterSpacing="1" fill="#f5a300">SOLAR POWER</text>
        </svg>
        <svg className="afn-intro__layer afn-intro__subline" style={place(0, 505, 650, 45)} viewBox="0 505 650 45" aria-hidden="true">
          <text x="325" y="540" textAnchor="middle" fontSize="38" fontWeight="500" letterSpacing="4" fill="#0b2f63">ENGINEERING SERVICES</text>
        </svg>
      </div>

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

// The landing page re-renders while its settings load; the intro has no props, so skip those renders.
export default memo(IntroSplash);
