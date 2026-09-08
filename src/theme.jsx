import { createTheme } from '@mui/material/styles';

const createAppTheme = (mode = 'light', primaryColor = 'indigo') => {
  const colorPalettes = {
    // TallyKraft — "Oxblood": deep burgundy primary, warm-stone accent, ivory ground.
    indigo: {
      primary: { main: '#5c1f22', light: '#8a3a3d', dark: '#3f1417' },
      secondary: { main: '#a9803f' }, // warm stone — used sparingly for highlights / CTAs
    },
    blue: {
      primary: { main: '#2563eb', light: '#60a5fa', dark: '#1d4ed8' },
      secondary: { main: '#a9803f' },
    },
    green: {
      primary: { main: '#059669', light: '#34d399', dark: '#047857' },
      secondary: { main: '#a9803f' },
    },
    purple: {
      primary: { main: '#7c3aed', light: '#a78bfa', dark: '#6d28d9' },
      secondary: { main: '#a9803f' },
    },
  };

  const palette = colorPalettes[primaryColor] || colorPalettes.indigo;
  const isLight = mode === 'light';
  const primaryRgb = primaryColor === 'indigo' ? '92,31,34' : primaryColor === 'blue' ? '37,99,235' : primaryColor === 'green' ? '5,150,105' : '124,58,237';

  // Refined shadows — flat, oxblood-toned
  const shadows = [
    'none',
    '0 1px 2px rgba(63,20,23,0.05)',
    '0 1px 4px rgba(63,20,23,0.08), 0 1px 2px rgba(63,20,23,0.04)',
    '0 2px 8px rgba(63,20,23,0.1), 0 1px 3px rgba(63,20,23,0.05)',
    '0 4px 12px rgba(63,20,23,0.1), 0 2px 4px rgba(63,20,23,0.06)',
    '0 6px 16px rgba(63,20,23,0.12), 0 3px 6px rgba(63,20,23,0.06)',
    '0 8px 24px rgba(63,20,23,0.12), 0 4px 8px rgba(63,20,23,0.06)',
    '0 12px 32px rgba(63,20,23,0.14), 0 6px 10px rgba(63,20,23,0.06)',
    '0 16px 40px rgba(63,20,23,0.14), 0 8px 12px rgba(63,20,23,0.07)',
    '0 20px 48px rgba(63,20,23,0.16), 0 10px 14px rgba(63,20,23,0.07)',
    '0 24px 56px rgba(63,20,23,0.16), 0 12px 16px rgba(63,20,23,0.08)',
    '0 28px 64px rgba(63,20,23,0.18), 0 14px 18px rgba(63,20,23,0.08)',
    '0 32px 72px rgba(63,20,23,0.18), 0 16px 20px rgba(63,20,23,0.08)',
    '0 36px 80px rgba(63,20,23,0.2), 0 18px 22px rgba(63,20,23,0.09)',
    '0 40px 88px rgba(63,20,23,0.2), 0 20px 24px rgba(63,20,23,0.09)',
    '0 44px 96px rgba(63,20,23,0.22), 0 22px 26px rgba(63,20,23,0.1)',
    '0 48px 104px rgba(63,20,23,0.22), 0 24px 28px rgba(63,20,23,0.1)',
    '0 52px 112px rgba(63,20,23,0.24), 0 26px 30px rgba(63,20,23,0.1)',
    '0 56px 120px rgba(63,20,23,0.24), 0 28px 32px rgba(63,20,23,0.11)',
    '0 60px 128px rgba(63,20,23,0.26), 0 30px 34px rgba(63,20,23,0.11)',
    '0 64px 136px rgba(63,20,23,0.26), 0 32px 36px rgba(63,20,23,0.12)',
    '0 68px 144px rgba(63,20,23,0.28), 0 34px 38px rgba(63,20,23,0.12)',
    '0 72px 152px rgba(63,20,23,0.28), 0 36px 40px rgba(63,20,23,0.12)',
    '0 76px 160px rgba(63,20,23,0.3), 0 38px 42px rgba(63,20,23,0.13)',
    '0 80px 168px rgba(63,20,23,0.3), 0 40px 44px rgba(63,20,23,0.14)',
  ];

  const borderColor = isLight ? '#ece2db' : '#5c1f22';
  const borderStrong = isLight ? '#ddd0c9' : '#5c1f22';
  const focusRing = `0 0 0 3px rgba(${primaryRgb},0.14)`;

  return createTheme({
    palette: {
      mode,
      primary: {
        ...palette.primary,
        contrastText: '#ffffff',
      },
      secondary: {
        ...palette.secondary,
        contrastText: '#ffffff',
      },
      background: {
        default: isLight ? '#faf7f4' : '#0a0f1e',
        paper: isLight ? '#ffffff' : '#111827',
      },
      success: { main: '#059669', light: '#d1fae5', dark: '#047857', contrastText: '#fff' },
      error: { main: '#dc2626', light: '#fef2f2', dark: '#b91c1c', contrastText: '#fff' },
      warning: { main: '#d97706', light: '#fffbeb', dark: '#b45309', contrastText: '#fff' },
      info: { main: '#0284c7', light: '#e0f2fe', dark: '#0369a1', contrastText: '#fff' },
      text: {
        primary: isLight ? '#2a2320' : '#f6efe9',
        secondary: isLight ? '#6b5550' : '#b9a9a2',
        disabled: isLight ? '#a89b95' : '#8a7a73',
      },
      divider: borderColor,
      action: {
        hover: isLight ? `rgba(${primaryRgb},0.05)` : 'rgba(248,250,252,0.04)',
        selected: isLight ? `rgba(${primaryRgb},0.09)` : 'rgba(148,163,184,0.12)',
        disabledBackground: isLight ? '#f6efe9' : '#5c1f22',
        focus: isLight ? `rgba(${primaryRgb},0.10)` : 'rgba(248,250,252,0.08)',
      },
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
      fontSize: 13,
      h4: { fontWeight: 700, fontSize: '1.375rem', letterSpacing: '-0.02em', lineHeight: 1.3 },
      h5: { fontWeight: 600, fontSize: '1.125rem', letterSpacing: '-0.01em' },
      h6: { fontWeight: 600, fontSize: '0.9375rem', letterSpacing: '-0.005em' },
      subtitle1: { fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.005em' },
      subtitle2: { fontSize: '0.75rem', fontWeight: 600 },
      body1: { fontSize: '0.8125rem', lineHeight: 1.5 },
      body2: { fontSize: '0.75rem', lineHeight: 1.5 },
      caption: { fontSize: '0.6875rem' },
      button: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem' },
      overline: { fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
    },
    shape: { borderRadius: 8 },
    spacing: 8,
    shadows,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*, *::before, *::after': { boxSizing: 'border-box' },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            padding: '6px 14px',
            minHeight: 34,
            boxShadow: 'none',
            borderRadius: 8,
            letterSpacing: '0.01em',
            '&:hover': { boxShadow: 'none' },
          },
          contained: {
            '&:hover': { boxShadow: `0 2px 8px rgba(${primaryRgb},0.28)` },
          },
          outlined: {
            borderColor: borderColor,
            '&:hover': {
              borderColor: borderStrong,
              backgroundColor: isLight ? `rgba(${primaryRgb},0.04)` : 'rgba(248,250,252,0.03)',
            },
          },
          sizeSmall: {
            padding: '4px 10px',
            minHeight: 28,
            fontSize: '0.75rem',
          },
          sizeLarge: {
            padding: '10px 20px',
            minHeight: 42,
            fontSize: '0.9375rem',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { padding: 6, borderRadius: 8 },
          sizeSmall: { padding: 4, borderRadius: 6 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: 8,
            boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
            border: `1px solid ${borderColor}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: 'none',
            border: `1px solid ${borderColor}`,
            backgroundImage: 'none',
            transition: 'box-shadow 0.2s ease',
            '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: { padding: 16, '&:last-child': { paddingBottom: 16 } },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small' },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
              fontSize: '0.8125rem',
              backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)',
              transition: 'box-shadow 0.15s ease',
              '& fieldset': { borderColor: borderColor, transition: 'border-color 0.15s ease' },
              '&:hover fieldset': { borderColor: borderStrong },
              '&.Mui-focused': { boxShadow: focusRing },
              '&.Mui-focused fieldset': { borderWidth: 1.5, borderColor: palette.primary.main },
              '&.Mui-error fieldset': { borderColor: '#dc2626' },
              '&.Mui-disabled': { backgroundColor: isLight ? '#f6efe9' : '#3f1417' },
            },
            '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            '& .MuiInputLabel-root.Mui-focused': { color: palette.primary.main },
            '& .MuiFormHelperText-root': { fontSize: '0.6875rem', marginTop: 4 },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: { borderRadius: 8 },
          select: { fontSize: '0.8125rem' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '& fieldset': { borderColor: borderColor },
            '&:hover fieldset': { borderColor: borderStrong },
            '&.Mui-focused': { boxShadow: focusRing },
            '&.Mui-focused fieldset': { borderWidth: 1.5, borderColor: palette.primary.main },
          },
          notchedOutline: { borderColor: borderColor },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { padding: '9px 12px', fontSize: '0.8125rem', borderColor: isLight ? '#f6efe9' : '#5c1f22' },
          head: {
            fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase',
            letterSpacing: '0.07em', backgroundColor: isLight ? '#f7f2ee' : '#0d1526',
            color: isLight ? '#6b5550' : '#9c8a84', padding: '8px 12px', lineHeight: 1.3,
            borderBottom: `1.5px solid ${borderStrong}`, whiteSpace: 'nowrap',
          },
          stickyHeader: { backgroundColor: isLight ? '#f7f2ee' : '#0d1526' },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:last-child td': { borderBottom: 'none' },
            '&.MuiTableRow-hover:hover': { backgroundColor: isLight ? '#f7f2ee' : 'rgba(248,250,252,0.02)' },
          },
          head: { backgroundColor: isLight ? '#f7f2ee' : '#0d1526' },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            '&::-webkit-scrollbar': { height: 6, width: 6 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: isLight ? '#ddd0c9' : '#5c1f22', borderRadius: 3 },
          },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: { borderTop: `1px solid ${borderColor}` },
          toolbar: { minHeight: 44, paddingLeft: 12, paddingRight: 12 },
          selectLabel: { fontSize: '0.75rem' },
          displayedRows: { fontSize: '0.75rem' },
          select: { fontSize: '0.75rem' },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 44 },
          indicator: { height: 2, borderRadius: 2 },
          flexContainer: { gap: 0 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.8125rem',
            minHeight: 44,
            padding: '0 16px',
            color: isLight ? '#6b5550' : '#9c8a84',
            '&.Mui-selected': {
              fontWeight: 600,
              color: palette.primary.main,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            height: 24,
            fontSize: '0.6875rem',
            fontWeight: 600,
            borderRadius: 6,
          },
          label: { paddingLeft: 8, paddingRight: 8 },
          sizeSmall: { height: 20, fontSize: '0.625rem' },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: 'none',
            borderBottom: `1px solid ${borderColor}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${borderColor}`,
            boxShadow: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            border: `1px solid ${borderColor}`,
            boxShadow: '0 24px 80px rgba(63,20,23,0.22), 0 10px 24px rgba(63,20,23,0.12)',
          },
          backdrop: {
            backgroundColor: 'rgba(63,20,23,0.4)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: '0.9375rem',
            fontWeight: 600,
            padding: '14px 20px',
            borderBottom: `1px solid ${borderColor}`,
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: { padding: '16px 20px' },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '10px 20px 14px',
            borderTop: `1px solid ${borderColor}`,
            gap: 8,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'background-color 0.15s ease, color 0.15s ease',
            '&.Mui-selected': {
              backgroundColor: `rgba(${primaryRgb},0.09)`,
              color: palette.primary.main,
              fontWeight: 600,
              '&:hover': { backgroundColor: `rgba(${primaryRgb},0.14)` },
              '& .MuiListItemIcon-root': { color: palette.primary.main },
            },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: { minWidth: 36 },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: { fontSize: '0.8125rem' },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: '52px !important',
            paddingLeft: '16px !important',
            paddingRight: '16px !important',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { fontSize: '0.8125rem', borderRadius: 8, padding: '8px 14px' },
          standardSuccess: { border: '1px solid rgba(5,150,105,0.25)', backgroundColor: isLight ? '#eef4f0' : 'rgba(5,150,105,0.08)' },
          standardError: { border: '1px solid rgba(220,38,38,0.25)', backgroundColor: isLight ? '#fbeae8' : 'rgba(220,38,38,0.08)' },
          standardWarning: { border: '1px solid rgba(217,119,6,0.25)', backgroundColor: isLight ? '#f7f1e2' : 'rgba(217,119,6,0.08)' },
          standardInfo: { border: '1px solid rgba(2,132,199,0.2)', backgroundColor: isLight ? '#f0f9ff' : 'rgba(2,132,199,0.08)' },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '0.8125rem',
            borderRadius: 6,
            margin: '1px 4px',
            minHeight: 36,
            '&.Mui-selected': {
              backgroundColor: isLight
                ? `rgba(${primaryColor === 'indigo' ? '92,31,34' : primaryColor === 'blue' ? '37,99,235' : primaryColor === 'green' ? '5,150,105' : '124,58,237'},0.08)`
                : 'rgba(148,163,184,0.12)',
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(63,20,23,0.12), 0 4px 8px rgba(63,20,23,0.06)',
            border: `1px solid ${borderColor}`,
            marginTop: 4,
          },
          list: { padding: '4px' },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { width: 36, height: 22, padding: 0 },
          switchBase: {
            padding: 2,
            '&.Mui-checked': { color: '#fff', '& + .MuiSwitch-track': { backgroundColor: palette.primary.main, opacity: 1 } },
          },
          thumb: { width: 18, height: 18 },
          track: { borderRadius: 11 },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: {
          tooltip: {
            fontSize: '0.6875rem',
            fontWeight: 500,
            borderRadius: 6,
            backgroundColor: isLight ? '#3f1417' : '#5c1f22',
            padding: '5px 10px',
          },
          arrow: {
            color: isLight ? '#3f1417' : '#5c1f22',
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontSize: '0.8125rem',
            fontWeight: 500,
            border: `1px solid ${borderColor}`,
            color: isLight ? '#6b5550' : '#9c8a84',
            '&.Mui-selected': {
              backgroundColor: palette.primary.main,
              color: '#ffffff',
              borderColor: palette.primary.main,
              '&:hover': {
                backgroundColor: palette.primary.dark,
                borderColor: palette.primary.dark,
              },
            },
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { borderRadius: 8 },
          grouped: {
            '&:not(:first-of-type)': { marginLeft: -1, borderLeftColor: borderColor },
            '&:first-of-type': { borderRadius: '8px 0 0 8px' },
            '&:last-of-type': { borderRadius: '0 8px 8px 0' },
            '&:only-child': { borderRadius: 8 },
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          // Make size="small" Autocomplete tall enough to be easy to click/tap
          inputRoot: {
            '&.MuiOutlinedInput-root.MuiInputBase-sizeSmall': {
              padding: '8px 9px',
            },
            '&.MuiOutlinedInput-root.MuiInputBase-sizeSmall .MuiAutocomplete-input': {
              padding: '1px 6px',
            },
          },
          // Dropdown list items — comfortable touch targets
          option: {
            fontSize: '0.8125rem',
            minHeight: 40,
            padding: '8px 12px',
          },
          listbox: {
            padding: '4px',
          },
          paper: {
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(63,20,23,0.12), 0 4px 8px rgba(63,20,23,0.06)',
            border: `1px solid ${borderColor}`,
            marginTop: 4,
          },
          noOptions: {
            fontSize: '0.8125rem',
            color: isLight ? '#6b5550' : '#9c8a84',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: borderColor },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 4, height: 6, backgroundColor: isLight ? '#ece2db' : '#5c1f22' },
          bar: { backgroundColor: palette.primary.main },
        },
      },
      MuiSkeleton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundColor: isLight ? 'rgba(63,20,23,0.06)' : 'rgba(248,250,252,0.06)',
          },
        },
      },
      MuiBadge: {
        styleOverrides: {
          badge: { fontSize: '0.625rem', fontWeight: 700, minWidth: 16, height: 16 },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            border: `1px solid ${borderColor}`,
            borderRadius: '8px !important',
            boxShadow: 'none',
            '&:before': { display: 'none' },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: { minHeight: 48, padding: '0 16px' },
          content: { margin: '12px 0' },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: { padding: '0 16px 16px' },
        },
      },
      MuiInputAdornment: {
        styleOverrides: {
          root: { color: isLight ? '#9c8a84' : '#7a2e30' },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: { fontSize: '0.8125rem' },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { fontSize: '0.8125rem' },
        },
      },
    },
  });
};

// Brand token object consumed by shared feature components merged from the
// sibling app (Layout, POS, Dashboard, CustomerPreviewPanel, App, …). Those
// files reference BRAND.teal / .tealDark / .tealLight / .emerald / .gradient —
// the KEY names are kept for import compatibility, but the VALUES are
// TallyKraft's "Midnight & Gold" brand (slate-navy primary + gold accent) so
// the shared components render in this app's palette without per-file edits.
// Do not rename the keys.
// TallyKraft — "Oxblood". Deep burgundy primary, warm-stone accent.
// Key names (teal/emerald) kept for merged-component import compatibility.
const TK_PRIMARY = '#5c1f22';       // oxblood-900 — main brand / interactive
const TK_PRIMARY_DARK = '#3f1417';  // oxblood-950 — hover / deepest chrome
const TK_PRIMARY_LIGHT = '#8a3a3d'; // oxblood-700 — lighter brand
const TK_ACCENT = '#a9803f';        // warm stone — highlights & the odd CTA, used sparingly
const TK_DEEP = '#3f1417';          // oxblood-950
export const BRAND = {
  teal: TK_PRIMARY,
  tealDark: TK_PRIMARY_DARK,
  tealLight: TK_PRIMARY_LIGHT,
  tealDeep: TK_DEEP,
  emerald: TK_ACCENT,        // <- warm-stone accent
  emeraldLight: '#e8ddd6',   // pale stone
  gold: TK_ACCENT,
  ink: '#2a2320',            // warm near-black
  // App chrome is light (white + hairline). "gradient" stays a flat white token
  // so merged components that spread BRAND.gradient get a white panel.
  gradient: '#ffffff',
  gradientVivid: `linear-gradient(135deg, ${TK_PRIMARY} 0%, ${TK_PRIMARY_DARK} 100%)`, // for a real burgundy CTA
  gradientSoft: '#faf7f4',
};

export const themes = {
  lightIndigo: createAppTheme('light', 'indigo'),
  lightBlue: createAppTheme('light', 'blue'),
  lightGreen: createAppTheme('light', 'green'),
  lightPurple: createAppTheme('light', 'purple'),
  darkIndigo: createAppTheme('dark', 'indigo'),
  darkBlue: createAppTheme('dark', 'blue'),
  darkGreen: createAppTheme('dark', 'green'),
  darkPurple: createAppTheme('dark', 'purple'),
};

export default themes.lightIndigo;
