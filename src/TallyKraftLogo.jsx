import React from 'react';

/**
 * TallyKraft brand mark — white theme.
 *   variant="icon"            → the original artwork mark (recolored slate)
 *   variant="wordmark"        → mark + "TallyKraft" in slate ink
 *   variant="wordmark-light"  → mark + white wordmark (for the rare dark surface)
 *
 * The mark itself is public/tallykraft.svg (the original path artwork, its
 * blue-violet facets remapped to a slate range for the white UI).
 */

const INK = '#2a2320';   // warm near-black — wordmark on white
const SUB = '#5c1f22';    // oxblood — the 'Kraft' half

const TallyKraftLogo = ({ size = 36, variant = 'icon', color }) => {
  const Mark = (
    <img
      src="/tallykraft.svg"
      alt="TallyKraft"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
    />
  );

  if (variant !== 'wordmark' && variant !== 'wordmark-light') return Mark;

  const light = variant === 'wordmark-light';
  const fontSize = Math.round(size * 0.5);
  const textColor = light ? '#ffffff' : (color || INK);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3) }}>
      {Mark}
      <span style={{
        fontWeight: 700,
        fontSize,
        letterSpacing: '-0.02em',
        color: textColor,
        lineHeight: 1,
        fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
      }}>
        Tally<span style={{ fontWeight: 800, color: light ? '#ffffff' : SUB }}>Kraft</span>
      </span>
    </span>
  );
};

export default TallyKraftLogo;
