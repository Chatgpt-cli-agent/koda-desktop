import { useEffect, useRef, useState, type ReactNode } from "react";

// Deterministic twinkling starfield — golden-angle spread so dots never clump.
// Generated once at module load, not per render.
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 137.508) % 100,
  y: (i * 61.803 + 13) % 100,
  delay: (i % 7) * 0.6,
  dur: 2.6 + (i % 5) * 0.9,
  size: i % 3 === 0 ? 2.5 : 1.5,
}));

// The Koda glyph. `draw` renders the stroke-draw variant used by the flying
// intro logo; otherwise the settled filled emblem. Same path data as the app
// icon. The gradient id differs per instance so the settled and the flying
// copy can coexist in the DOM without one shadowing the other's `url(#...)`.
function Emblem({ draw = false }: { draw?: boolean }): React.JSX.Element {
  const gradientId = draw ? "kodaOnboardGlyphFly" : "kodaOnboardGlyph";
  return (
    <svg
      viewBox="0 0 285.98 285.98"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0.1" x2="1" y2="0.4">
          <stop offset="0%" stopColor="#c86bff" />
          <stop offset="45%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <g transform="translate(-117.02 -112.00)">
        <path
          className={draw ? "onboard-glyph" : undefined}
          pathLength={draw ? 100 : undefined}
          d="M 314.44 118.00 L 372.56 118.00 L 379.00 122.56 L 356.09 153.16 L 356.91 156.84 L 352.09 158.16 L 252.02 293.67 L 263.77 289.95 L 276.84 280.91 L 299.09 253.16 L 306.84 248.09 L 305.00 255.56 L 307.09 258.84 L 391.91 359.16 L 393.00 386.56 L 391.00 387.81 L 337.44 387.00 L 336.67 388.98 L 326.23 389.05 L 325.67 392.98 L 320.16 391.91 L 320.91 383.16 L 295.09 353.84 L 292.91 348.16 L 221.91 263.16 L 217.44 259.00 L 218.98 261.67 L 215.16 260.09 L 216.16 263.91 L 210.02 255.67 L 210.05 249.23 L 211.91 249.84 L 221.09 234.16 Z M 354.56 156.00 L 354.44 156.00 L 354.33 156.02 L 354.23 156.05 L 354.16 156.09 L 354.09 156.16 L 354.05 156.23 L 354.02 156.33 L 354.00 156.44 L 354.00 156.56 L 354.02 156.67 L 354.05 156.77 L 354.09 156.84 L 354.16 156.91 L 354.23 156.95 L 354.33 156.98 L 354.44 157.00 L 354.56 157.00 L 354.67 156.98 L 354.77 156.95 L 354.84 156.91 L 354.91 156.84 L 354.95 156.77 L 354.98 156.67 L 355.00 156.56 L 355.00 156.44 L 354.98 156.33 L 354.95 156.23 L 354.91 156.16 L 354.84 156.09 L 354.77 156.05 L 354.67 156.02 Z M 322.56 385.00 L 322.44 385.00 L 322.33 385.02 L 322.23 385.05 L 322.16 385.09 L 322.09 385.16 L 322.05 385.23 L 322.02 385.33 L 322.00 385.44 L 322.00 385.56 L 322.02 385.67 L 322.05 385.77 L 322.09 385.84 L 322.16 385.91 L 322.23 385.95 L 322.33 385.98 L 322.44 386.00 L 322.56 386.00 L 322.67 385.98 L 322.77 385.95 L 322.84 385.91 L 322.91 385.84 L 322.95 385.77 L 322.98 385.67 L 323.00 385.56 L 323.00 385.44 L 322.98 385.33 L 322.95 385.23 L 322.91 385.16 L 322.84 385.09 L 322.77 385.05 L 322.67 385.02 Z M 324.56 386.00 L 324.44 386.00 L 324.33 386.02 L 324.23 386.05 L 324.16 386.09 L 324.09 386.16 L 324.05 386.23 L 324.02 386.33 L 324.00 386.44 L 324.00 386.56 L 324.02 386.67 L 324.05 386.77 L 324.09 386.84 L 324.16 386.91 L 324.23 386.95 L 324.33 386.98 L 324.44 387.00 L 324.56 387.00 L 324.69 387.00 L 324.81 387.00 L 324.94 387.00 L 325.06 387.00 L 325.19 387.00 L 325.31 387.00 L 325.44 387.00 L 325.56 387.00 L 325.69 387.00 L 325.81 387.00 L 325.94 387.00 L 326.06 387.00 L 326.19 387.00 L 326.31 387.00 L 326.44 387.00 L 326.56 387.00 L 326.69 387.00 L 326.81 387.00 L 326.94 387.00 L 327.06 387.00 L 327.19 387.00 L 327.31 387.00 L 327.44 387.00 L 327.56 387.00 L 327.69 387.00 L 327.81 387.00 L 327.94 387.00 L 328.06 387.00 L 328.19 387.00 L 328.31 387.00 L 328.44 387.00 L 328.56 387.00 L 328.69 387.00 L 328.81 387.00 L 328.94 387.00 L 329.06 387.00 L 329.19 387.00 L 329.31 387.00 L 329.44 387.00 L 329.56 387.00 L 329.69 387.00 L 329.81 387.00 L 329.94 387.00 L 330.06 387.00 L 330.19 387.00 L 330.31 387.00 L 330.44 387.00 L 330.56 387.00 L 330.69 387.00 L 330.81 387.00 L 330.94 387.00 L 331.06 387.00 L 331.19 387.00 L 331.31 387.00 L 331.44 387.00 L 331.56 387.00 L 331.67 386.98 L 331.77 386.95 L 331.84 386.91 L 331.91 386.84 L 331.95 386.77 L 331.98 386.67 L 332.00 386.56 L 332.00 386.44 L 331.98 386.33 L 331.95 386.23 L 331.91 386.16 L 331.84 386.09 L 331.77 386.05 L 331.67 386.02 L 331.56 386.00 L 331.44 386.00 L 331.31 386.00 L 331.19 386.00 L 331.06 386.00 L 330.94 386.00 L 330.81 386.00 L 330.69 386.00 L 330.56 386.00 L 330.44 386.00 L 330.31 386.00 L 330.19 386.00 L 330.06 386.00 L 329.94 386.00 L 329.81 386.00 L 329.69 386.00 L 329.56 386.00 L 329.44 386.00 L 329.31 386.00 L 329.19 386.00 L 329.06 386.00 L 328.94 386.00 L 328.81 386.00 L 328.69 386.00 L 328.56 386.00 L 328.44 386.00 L 328.31 386.00 L 328.19 386.00 L 328.06 386.00 L 327.94 386.00 L 327.81 386.00 L 327.69 386.00 L 327.56 386.00 L 327.44 386.00 L 327.31 386.00 L 327.19 386.00 L 327.06 386.00 L 326.94 386.00 L 326.81 386.00 L 326.69 386.00 L 326.56 386.00 L 326.44 386.00 L 326.31 386.00 L 326.19 386.00 L 326.06 386.00 L 325.94 386.00 L 325.81 386.00 L 325.69 386.00 L 325.56 386.00 L 325.44 386.00 L 325.31 386.00 L 325.19 386.00 L 325.06 386.00 L 324.94 386.00 L 324.81 386.00 L 324.69 386.00 Z M 229.44 117.00 L 228.98 198.67 L 187.00 253.56 L 240.95 322.23 L 242.98 385.67 L 162.69 386.00 L 153.00 384.56 L 152.98 289.33 L 127.02 257.33 Z"
          fill={`url(#${gradientId})`}
        />
      </g>
    </svg>
  );
}

type Phase = "draw" | "settle" | "done";

// Draw completes and the fill lands by ~2.2s; then the logo flies to its slot.
const DRAW_MS = 2200;
const SETTLE_MS = 950;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface OnboardHeroProps {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  // Play the full big-centre → draw → fly-up intro. Off = emblem fades in place
  // and content cascades immediately (used on downstream onboarding screens).
  intro?: boolean;
  // Widen the content column (installing progress / terminal log).
  wide?: boolean;
}

/**
 * Shared cinematic chrome for the onboarding screens. Renders the aurora
 * backdrop, starfield, animated Hermes emblem, eyebrow, upright title, and the
 * page-specific `children` inside a reveal-on-settle body.
 */
function OnboardHero({
  eyebrow,
  title,
  children,
  intro = false,
  wide = false,
}: OnboardHeroProps): React.JSX.Element {
  const emblemRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(prefersReducedMotion()).current;
  const runIntro = intro && !reduced;

  const [phase, setPhase] = useState<Phase>(runIntro ? "draw" : "done");
  // Transform applied to the flying logo once we know where its slot is.
  const [flyStyle, setFlyStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!runIntro) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        // Measure the settled slot and fly the big centred logo into it.
        const el = emblemRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          const tx = r.left + r.width / 2 - window.innerWidth / 2;
          const ty = r.top + r.height / 2 - window.innerHeight / 2;
          const s = r.width / 180;
          setFlyStyle({
            transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${s})`,
          });
        }
        setPhase("settle");
      }, DRAW_MS),
    );

    timers.push(setTimeout(() => setPhase("done"), DRAW_MS + SETTLE_MS));

    return () => timers.forEach(clearTimeout);
  }, [runIntro]);

  return (
    <div className="screen onboard-screen" data-phase={phase}>
      <div className="onboard-fx" aria-hidden="true">
        <div className="onboard-aurora" />
        <div className="onboard-vignette" />
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="onboard-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animation: `onboardTwinkle ${p.dur}s ease ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <div className={`onboard-hero${wide ? " onboard-hero--wide" : ""}`}>
        <div className="onboard-emblem" ref={emblemRef}>
          <div className="onboard-emblem-glow" />
          <Emblem />
        </div>

        <div className="onboard-eyebrow">{eyebrow}</div>
        <h1 className="onboard-title">{title}</h1>
        <div className="onboard-body">{children}</div>
      </div>

      {runIntro && phase !== "done" && (
        <div className="onboard-fly" style={flyStyle} aria-hidden="true">
          <div className="onboard-fly-glow" />
          <Emblem draw />
        </div>
      )}
    </div>
  );
}

export default OnboardHero;
