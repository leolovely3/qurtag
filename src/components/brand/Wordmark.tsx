import { useId } from 'react';
import { cn } from '../../lib/cn';
import { MARK_LETTERS, NAME_BOX, NAME_GLYPHS, TAGLINE } from './logoPaths';

/**
 * The QuR Tag logo, in one place so it can be swapped. Every logo on screen comes from here.
 *
 * - `LogoMark`: the app icon's drawing. "QuR" in white with the u and its smile in the brand
 *   orange, on a near-black rounded square. Hand-built strokes, no font needed.
 * - `Wordmark`: the mark plus "QuR Tag", for headers and the app's sidebar.
 * - `Lockup`: the mark, "QuR Tag" and the tagline, for the website footer.
 * - `TagLogo`: the lockup in fixed light colours, for the printed tag.
 *
 * The paths are generated with the icon files by scripts/brand/build-brand.mjs (npm run brand),
 * so the website, the app and the icons always match.
 */

const ORANGE = '#FF5C2E';
const INK = '#0A0B0F';

/** The letters, fitted into a 100 x 100 box at 70% of its width, optically centred (smile included). */
function MarkLetters({ fill = 0.7 }: { fill?: number }) {
  const { box } = MARK_LETTERS;
  const k = (100 * fill) / box.w;
  const tx = (100 - box.w * k) / 2 - box.x * k;
  const ty = (100 - box.h * k) / 2 - box.y * k;
  const common = { fill: 'none', strokeLinejoin: 'round' as const };
  return (
    <g transform={`translate(${tx} ${ty}) scale(${k})`}>
      <path d={MARK_LETTERS.q[0]} stroke="#FFFFFF" strokeWidth={MARK_LETTERS.stroke} {...common} />
      <path d={MARK_LETTERS.q[1]} stroke="#FFFFFF" strokeWidth={MARK_LETTERS.stroke} strokeLinecap="round" {...common} />
      {MARK_LETTERS.u.map((d) => (
        <path key={d} d={d} stroke={ORANGE} strokeWidth={MARK_LETTERS.stroke} {...common} />
      ))}
      <path d={MARK_LETTERS.smile} stroke={ORANGE} strokeWidth={MARK_LETTERS.smileStroke} strokeLinecap="round" {...common} />
      {MARK_LETTERS.r.map((d) => (
        <path key={d} d={d} stroke="#FFFFFF" strokeWidth={MARK_LETTERS.stroke} {...common} />
      ))}
    </g>
  );
}

export function LogoMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="100" height="100" rx="22.5" fill={INK} />
      {/* A hairline so the square's edge still shows on a dark page. */}
      <rect x="0.5" y="0.5" width="99" height="99" rx="22" fill="none" stroke="var(--hairline-strong)" />
      <MarkLetters />
    </svg>
  );
}

/** "QuR Tag" as outlined Inter SemiBold; Q, R and Tag take the text colour, the u is orange. */
function NameText({ height, className, color }: { height: number; className?: string; color?: string }) {
  // The glyphs sit on a baseline at y = 0 with a cap height of about 73 (font size 100) and the
  // g's descender reaching about 24 below; `height` is the whole box, descender included.
  const top = -NAME_BOX.ascent - 2;
  const h = NAME_BOX.ascent + 30;
  return (
    <svg
      viewBox={`0 ${top} ${NAME_BOX.width + 2} ${h}`}
      height={height}
      width={(height * (NAME_BOX.width + 2)) / h}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      {NAME_GLYPHS.map((g, i) => (
        <path key={i} d={g.d} fill={g.accent ? ORANGE : color ?? 'currentColor'} />
      ))}
    </svg>
  );
}

interface WordmarkProps {
  className?: string;
  variant?: 'full' | 'mark';
}

/** The header logo: the mark and the name. Text colour follows the theme. */
export function Wordmark({ className, variant = 'full' }: WordmarkProps) {
  if (variant === 'mark') return <LogoMark size={28} title="QuR Tag" className={className} />;
  return (
    <span className={cn('inline-flex items-center gap-2 text-ink-900', className)} role="img" aria-label="QuR Tag">
      <LogoMark size={28} />
      {/* The box includes the g's descender; nudge it so the capitals centre on the mark. */}
      <NameText height={22} className="translate-y-[3px]" />
    </span>
  );
}

/** The mark, the name and the tagline, side by side. */
export function Lockup({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const mark = size === 'sm' ? 36 : 44;
  const nameH = size === 'sm' ? 20 : 25;
  return (
    <span className={cn('inline-flex items-center gap-3 text-ink-900', className)} role="img" aria-label={`QuR Tag. ${TAGLINE.text}`}>
      <LogoMark size={mark} />
      <span className="flex flex-col gap-1">
        <NameText height={nameH} />
        <span className="text-sm leading-none text-muted" aria-hidden>
          {TAGLINE.text}
        </span>
      </span>
    </span>
  );
}

/** The printed tag's logo: always the light version, whatever the screen theme. */
export function TagLogo({ className }: { className?: string }) {
  const id = useId();
  return (
    <span className={cn('inline-flex items-center gap-3', className)} role="img" aria-label={`QuR Tag. ${TAGLINE.text}`} id={id}>
      <LogoMark size={40} />
      <span className="flex flex-col gap-1.5">
        <NameText height={22} color={INK} />
        <svg viewBox={`0 -76 ${TAGLINE.width + 2} 100`} height={13} width={(13 * (TAGLINE.width + 2)) / 100} aria-hidden>
          <path d={TAGLINE.d} fill="#52545B" />
        </svg>
      </span>
    </span>
  );
}

/**
 * The lockup as one self-contained SVG (light colours), for drawing outside the page: the tag
 * PDF that the iPhone app prints (src/lib/tagPdf.ts).
 */
export function LockupSvg({ height = 100 }: { height?: number }) {
  const nameScale = 0.5;
  const tagScale = 0.24;
  const textX = 124;
  const width = Math.ceil(textX + Math.max(NAME_BOX.width * nameScale, TAGLINE.width * tagScale) + 4);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} 100`} height={height} width={(height * width) / 100}>
      <rect width="100" height="100" rx="22.5" fill={INK} />
      <MarkLetters />
      <g transform={`translate(${textX} 50) scale(${nameScale})`}>
        {NAME_GLYPHS.map((g, i) => (
          <path key={i} d={g.d} fill={g.accent ? ORANGE : INK} />
        ))}
      </g>
      <g transform={`translate(${textX} 84) scale(${tagScale})`}>
        <path d={TAGLINE.d} fill="#52545B" />
      </g>
    </svg>
  );
}
