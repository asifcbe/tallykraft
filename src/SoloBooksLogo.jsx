import React from 'react';

/**
 * SoloBooksLogo — the canonical brand mark.
 *
 * Props:
 *   size          number  — icon size in px (default 36)
 *   variant       "icon"  — just the square mark (default)
 *               | "light" — same mark, white pages with no gradient bg (for dark backgrounds)
 */
const SoloBooksLogo = ({ size = 36, variant = 'icon' }) => {
  const uid = React.useId().replace(/:/g, '');
  const bgId = `sb-bg-${uid}`;
  const shineId = `sb-shine-${uid}`;

  if (variant === 'light') {
    // White / transparent version for use on coloured/dark backgrounds
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Solo Books">
        {/* Left page */}
        <path d="M20 9C17 9 12.5 10.2 9 11.8L9 30.5C12.5 29 17 27.8 20 28.5V9Z" fill="white"/>
        {/* Right page */}
        <path d="M20 9C23 9 27.5 10.2 31 11.8L31 30.5C27.5 29 23 27.8 20 28.5V9Z" fill="white" opacity="0.55"/>
        {/* Spine */}
        <rect x="19.5" y="9" width="1" height="19.5" fill="rgba(255,255,255,0.3)"/>
        {/* Ledger lines — left page */}
        <line x1="11" y1="16.5" x2="18.5" y2="15.8" stroke="rgba(79,70,229,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="11" y1="20"   x2="18.5" y2="19.3" stroke="rgba(79,70,229,0.6)" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="11" y1="23.5" x2="18.5" y2="22.8" stroke="rgba(79,70,229,0.4)" strokeWidth="1.1" strokeLinecap="round"/>
        {/* Trend line — right page */}
        <polyline points="21.5,27 24.5,22 27,24 30.5,17.5"
          stroke="rgba(124,58,237,0.7)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <circle cx="30.5" cy="17.5" r="1.6" fill="white" opacity="0.85"/>
      </svg>
    );
  }

  // Default — gradient square mark
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Solo Books">
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#4F46E5"/>
          <stop offset="100%" stopColor="#7C3AED"/>
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.18)"/>
          <stop offset="60%"  stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="40" height="40" rx="9" fill={`url(#${bgId})`}/>
      {/* Top-left gloss */}
      <rect width="40" height="40" rx="9" fill={`url(#${shineId})`}/>

      {/* Open book — left page */}
      <path d="M20 9C17 9 12.5 10.2 9 11.8L9 30.5C12.5 29 17 27.8 20 28.5V9Z" fill="white"/>
      {/* Open book — right page (slightly transparent for depth) */}
      <path d="M20 9C23 9 27.5 10.2 31 11.8L31 30.5C27.5 29 23 27.8 20 28.5V9Z" fill="white" opacity="0.6"/>
      {/* Spine shadow */}
      <rect x="19.5" y="9" width="1" height="19.5" fill="rgba(79,70,229,0.25)"/>

      {/* Ledger lines — left page */}
      <line x1="11" y1="16.5" x2="18.5" y2="15.8" stroke="#4F46E5" strokeWidth="1.4" strokeLinecap="round" opacity="0.65"/>
      <line x1="11" y1="20"   x2="18.5" y2="19.3" stroke="#4F46E5" strokeWidth="1.4" strokeLinecap="round" opacity="0.65"/>
      <line x1="11" y1="23.5" x2="18.5" y2="22.8" stroke="#4F46E5" strokeWidth="1.1" strokeLinecap="round" opacity="0.45"/>

      {/* Trend sparkline — right page */}
      <polyline points="21.5,27 24.5,22 27,24 30.5,17.5"
        stroke="rgba(109,40,217,0.75)" strokeWidth="1.55"
        strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="30.5" cy="17.5" r="1.6" fill="white" opacity="0.9"/>
    </svg>
  );
};

export default SoloBooksLogo;
