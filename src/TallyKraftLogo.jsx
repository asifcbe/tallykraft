import React from 'react';

const TallyKraftLogo = ({ size = 36, variant = 'icon' }) => {
  if (variant === 'wordmark') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.35) }}>
        <img
          src="/tallykraft.svg"
          alt="TallyKraft"
          width={size}
          height={size}
          style={{ display: 'block', flexShrink: 0 }}
        />
        <span style={{
          fontWeight: 800,
          fontSize: Math.round(size * 0.42),
          letterSpacing: '-0.025em',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1,
        }}>
          TallyKraft
        </span>
      </span>
    );
  }

  return (
    <img
      src="/tallykraft.svg"
      alt="TallyKraft"
      width={size}
      height={size}
      style={{ display: 'block' }}
    />
  );
};

export default TallyKraftLogo;
