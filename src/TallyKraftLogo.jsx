import React from 'react';

/**
 * TallyKraft brand mark — "Midnight & Gold".
 *   variant="icon"            → the slate square monogram only
 *   variant="wordmark"        → monogram + "TallyKraft" in slate ink
 *   variant="wordmark-light"  → monogram + white wordmark (for dark / gradient bars)
 *
 * `size` is the monogram's height in px; the wordmark scales from it.
 * Self-contained inline SVG — no external asset.
 */

const SLATE = '#334155';
const SLATE_DEEP = '#0f172a';
const GOLD = '#c8a04e';

const Monogram = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    role="img"
    aria-label="TallyKraft"
    style={{ display: 'block', flexShrink: 0 }}
  >
    <defs>
      <linearGradient id="tk-mg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={SLATE_DEEP} />
        <stop offset="1" stopColor={SLATE} />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="40" height="40" rx="10" fill="url(#tk-mg)" />
    {/* gold serifed "T" */}
    <rect x="9" y="11" width="22" height="4.2" rx="1.4" fill={GOLD} />
    <rect x="17.9" y="11" width="4.2" height="19" rx="1.4" fill={GOLD} />
    {/* subtle ledger baseline */}
    <rect x="9" y="27.5" width="22" height="2.6" rx="1.3" fill={GOLD} opacity="0.4" />
  </svg>
);

const TallyKraftLogo = ({ size = 36, variant = 'icon', color }) => {
  if (variant !== 'wordmark' && variant !== 'wordmark-light') {
    return <Monogram size={size} />;
  }

  const light = variant === 'wordmark-light';
  const fontSize = Math.round(size * 0.5);
  const textColor = light ? '#ffffff' : (color || SLATE_DEEP);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.32) }}>
      <Monogram size={size} />
      <span style={{
        fontWeight: 700,
        fontSize,
        letterSpacing: '-0.02em',
        color: textColor,
        lineHeight: 1,
        fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
      }}>
        Tally<span style={{ color: light ? GOLD : GOLD, fontWeight: 800 }}>Kraft</span>
      </span>
    </span>
  );
};

export default TallyKraftLogo;
