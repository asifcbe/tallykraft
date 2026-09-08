import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Alert, TextField,
  InputAdornment, IconButton, Divider
} from '@mui/material';
import { Visibility, VisibilityOff, ArrowBack } from '@mui/icons-material';
import { useAuth } from './AuthContext';
import TallyKraftLogo from './TallyKraftLogo';
import { firestore } from './db';
import { doc, getDoc } from 'firebase/firestore';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const FEATURES = [
  { text: 'Sales, purchases & expense tracking' },
  { text: 'GST reports & party ledgers' },
  { text: 'Works fully offline — data stays yours' },
  { text: 'Multi-business support in one place' },
];

const ORB_CONFIGS = [
  { size: 300, top: '-8%',  left: '-10%', dur: '14s', delay: '0s'  },
  { size: 220, bottom: '2%', right: '-8%', dur: '18s', delay: '3s'  },
  { size: 130, top: '40%',  right: '10%', dur: '11s', delay: '6s'  },
];

const Login = ({ onBack }) => {
  const { loginWithGoogle, loginAsStaff, loginAsAdmin } = useAuth();
  const [tab, setTab]                   = useState('owner');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [isDark, setIsDark]             = useState(() => localStorage.getItem('tallykraft_landing_dark') === 'true');
  const [businessCode, setBusinessCode] = useState('');
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [useAdminPwd, setUseAdminPwd]   = useState(false);
  const [adminCode, setAdminCode]       = useState('');
  const [adminPwd, setAdminPwd]         = useState('');
  const [showAdminPwd, setShowAdminPwd] = useState(false);

  useEffect(() => {
    getDoc(doc(firestore, 'globalConfig', 'landing'))
      .then(snap => {
        if (snap.exists()) {
          const dark = snap.data().theme === 'dark';
          setIsDark(dark);
          localStorage.setItem('tallykraft_landing_dark', dark ? 'true' : 'false');
        }
      })
      .catch(() => {});
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true); setError('');
    const result = await loginWithGoogle();
    if (!result.success) setError(result.error);
    setLoading(false);
  };

  const handleAdminPasswordLogin = async (e) => {
    e?.preventDefault();
    if (!adminCode.trim()) { setError('Business code is required.'); return; }
    if (!adminPwd)         { setError('Password is required.'); return; }
    setLoading(true); setError('');
    const result = await loginAsAdmin(adminCode, adminPwd);
    if (!result.success) setError(result.error);
    setLoading(false);
  };

  const handleStaffLogin = async (e) => {
    e?.preventDefault();
    if (!businessCode.trim()) { setError('Business code is required.'); return; }
    if (!username.trim())     { setError('Username is required.'); return; }
    if (!password)            { setError('Password is required.'); return; }
    setLoading(true); setError('');
    const result = await loginAsStaff(businessCode, username, password);
    if (!result.success) setError(result.error);
    setLoading(false);
  };

  /* ── form-panel theme tokens ── */
  const T = isDark ? {
    panelBg:          '#09090f',
    panelDot:         'rgba(255,255,255,0.022)',
    cardBg:           'rgba(255,255,255,0.038)',
    cardBorder:       'rgba(255,255,255,0.08)',
    cardShadow:       '0 0 0 1px rgba(255,255,255,0.05), 0 24px 64px rgba(0,0,0,0.6)',
    title:            '#f8fafc',
    sub:              'rgba(255,255,255,0.42)',
    tabWrap:          'rgba(255,255,255,0.05)',
    tabText:          'rgba(255,255,255,0.38)',
    tabActiveBg:      'rgba(255,255,255,0.09)',
    tabActiveText:    '#ffffff',
    tabActiveShadow:  '0 2px 10px rgba(0,0,0,0.45)',
    lbl:              'rgba(255,255,255,0.38)',
    inputBg:          'rgba(255,255,255,0.055)',
    inputBorder:      'rgba(255,255,255,0.09)',
    inputBorderHov:   'rgba(255,255,255,0.2)',
    inputFocus:       '#a5b4fc',
    inputText:        '#f1f5f9',
    eyeColor:         'rgba(255,255,255,0.35)',
    googleBg:         'rgba(255,255,255,0.07)',
    googleBorder:     'rgba(255,255,255,0.1)',
    googleText:       '#ffffff',
    googleHov:        'rgba(255,255,255,0.11)',
    divider:          'rgba(255,255,255,0.07)',
    caption:          'rgba(255,255,255,0.25)',
    footerText:       'rgba(255,255,255,0.2)',
    backColor:        'rgba(255,255,255,0.4)',
    backHovBg:        'rgba(255,255,255,0.07)',
    backHovColor:     'rgba(255,255,255,0.85)',
  } : {
    panelBg:          '#f0f4ff',
    panelDot:         'rgba(129,140,248,0.06)',
    cardBg:           '#ffffff',
    cardBorder:       'rgba(129,140,248,0.13)',
    cardShadow:       '0 0 0 1px rgba(129,140,248,0.07), 0 24px 64px rgba(129,140,248,0.11)',
    title:            '#0f172a',
    sub:              '#64748b',
    tabWrap:          '#e8edff',
    tabText:          '#94a3b8',
    tabActiveBg:      '#ffffff',
    tabActiveText:    '#818cf8',
    tabActiveShadow:  '0 2px 10px rgba(129,140,248,0.14)',
    lbl:              '#64748b',
    inputBg:          '#f8faff',
    inputBorder:      'rgba(129,140,248,0.16)',
    inputBorderHov:   'rgba(129,140,248,0.38)',
    inputFocus:       '#818cf8',
    inputText:        '#0f172a',
    eyeColor:         '#94a3b8',
    googleBg:         '#ffffff',
    googleBorder:     'rgba(0,0,0,0.1)',
    googleText:       '#1e293b',
    googleHov:        '#f8faff',
    divider:          'rgba(129,140,248,0.1)',
    caption:          '#94a3b8',
    footerText:       '#cbd5e1',
    backColor:        '#94a3b8',
    backHovBg:        'rgba(129,140,248,0.07)',
    backHovColor:     '#818cf8',
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: T.inputBg,
      borderRadius: '11px',
      transition: 'all 0.18s',
      '& .MuiInputBase-input': {
        color: T.inputText,
        fontSize: '0.9rem',
        py: 1.45,
        px: 1.8,
        '&::placeholder': { color: T.lbl, opacity: 1 },
      },
      '& fieldset': { borderColor: T.inputBorder, borderWidth: '1.5px', transition: 'border-color 0.18s' },
      '&:hover fieldset':      { borderColor: T.inputBorderHov },
      '&.Mui-focused fieldset': { borderColor: T.inputFocus, borderWidth: '2px' },
      '& .MuiIconButton-root': { color: T.eyeColor },
    },
  };

  const labelSx = {
    color: T.lbl,
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.11em',
    textTransform: 'uppercase',
    display: 'block',
    mb: 0.8,
  };

  return (
    <Box sx={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <style>{`
        @keyframes lg-float  { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-20px) scale(1.04)} }
        @keyframes lg-ring   { 0%{transform:scale(1);opacity:.65} 100%{transform:scale(1.75);opacity:0} }
        @keyframes lg-blink  { 0%,100%{opacity:.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes lg-fadein { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes lg-up     { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ═══════════ BRAND PANEL ═══════════ */}
      <Box sx={{
        display:       { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent:'center',
        alignItems:    'center',
        width:         '44%',
        flexShrink:    0,
        position:      'relative',
        overflow:      'hidden',
        background:    'linear-gradient(155deg, #1e1b4b 0%, #3730a3 42%, #4c1d95 100%)',
        p:             5,
      }}>
        {/* Grid overlay */}
        <Box sx={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)',
          backgroundSize: '44px 44px',
        }} />

        {/* Floating orbs */}
        {ORB_CONFIGS.map((o, i) => (
          <Box key={i} sx={{
            position: 'absolute',
            width: o.size, height: o.size,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(129,140,248,0.28) 0%, transparent 70%)',
            top: o.top, left: o.left, right: o.right, bottom: o.bottom,
            filter: 'blur(44px)',
            animation: `lg-float ${o.dur} ease-in-out infinite`,
            animationDelay: o.delay,
            zIndex: 0,
          }} />
        ))}

        {/* Content */}
        <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 340 }}>

          {/* Logo with pulse rings */}
          <Box sx={{ position: 'relative', display: 'inline-flex', mb: 3.5 }}>
            {[{ inset: -14, delay: '0s' }, { inset: -26, delay: '0.6s' }].map((r, i) => (
              <Box key={i} sx={{
                position: 'absolute', inset: r.inset,
                borderRadius: '50%',
                border: '1.5px solid rgba(129,140,248,0.45)',
                animation: 'lg-ring 2.8s ease-out infinite',
                animationDelay: r.delay,
              }} />
            ))}
            <Box sx={{
              width: 84, height: 84, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 40px rgba(129,140,248,0.45)',
            }}>
              <TallyKraftLogo size={80} />
            </Box>
          </Box>

          <Typography sx={{
            fontSize: '2.1rem', fontWeight: 800, color: '#fff',
            letterSpacing: '0.08em', lineHeight: 1, mb: 0.6,
            animation: 'lg-fadein 0.55s ease both',
          }}>
            TALLYKRAFT
          </Typography>
          <Typography sx={{
            color: 'rgba(199,210,254,0.75)', fontSize: '0.88rem', mb: 4.5,
            animation: 'lg-fadein 0.65s ease both', animationDelay: '0.08s',
          }}>
            Premium Business Accounting
          </Typography>

          {/* Feature list */}
          <Box sx={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {FEATURES.map((f, i) => (
              <Box key={f.text} sx={{
                display: 'flex', alignItems: 'center', gap: 1.6,
                animation: 'lg-fadein 0.55s ease both',
                animationDelay: `${0.18 + i * 0.08}s`,
              }}>
                <Box sx={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(129,140,248,0.22)',
                  border: '1px solid rgba(129,140,248,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="11" height="9" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5l3.5 3.5L11 1" stroke="#c7d2fe" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Box>
                <Typography sx={{ color: 'rgba(199,210,254,0.88)', fontSize: '0.84rem', fontWeight: 500, lineHeight: 1.45 }}>
                  {f.text}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Offline badge */}
          <Box sx={{
            mt: 5, display: 'inline-flex', alignItems: 'center', gap: 1.2,
            bgcolor: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: 100, px: 2.2, py: 0.9,
            animation: 'lg-fadein 0.6s ease both', animationDelay: '0.5s',
          }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#4ade80', animation: 'lg-blink 2.2s ease-in-out infinite' }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.73rem', fontWeight: 600, letterSpacing: '0.04em' }}>
              All data processed locally
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ═══════════ FORM PANEL ═══════════ */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        bgcolor: T.panelBg,
        backgroundImage: `radial-gradient(${T.panelDot} 1px, transparent 1px)`,
        backgroundSize: '22px 22px',
        overflowY: 'auto',
        p: { xs: 2.5, sm: 3 },
      }}>
        {/* Back button */}
        {onBack && (
          <Button
            onClick={onBack}
            startIcon={<ArrowBack sx={{ fontSize: '0.95rem !important' }} />}
            sx={{
              position: 'absolute', top: 18, left: 18, zIndex: 20,
              color: T.backColor, textTransform: 'none',
              fontWeight: 600, fontSize: '0.82rem',
              px: 1.4, py: 0.65, borderRadius: '10px', minWidth: 0,
              '&:hover': { color: T.backHovColor, bgcolor: T.backHovBg },
            }}
          >
            Back
          </Button>
        )}

        {/* Mobile-only header */}
        <Box sx={{
          display: { xs: 'flex', md: 'none' },
          flexDirection: 'column', alignItems: 'center', mb: 3.5,
          animation: 'lg-up 0.5s ease both',
        }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: '18px',
            background: 'linear-gradient(135deg, #818cf8 0%, #8b5cf6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(129,140,248,0.4)', mb: 1.5,
          }}>
            <TallyKraftLogo size={52} />
          </Box>
          <Typography sx={{ fontWeight: 800, color: T.title, letterSpacing: '0.07em', fontSize: '1.25rem', lineHeight: 1 }}>
            TALLYKRAFT
          </Typography>
          <Typography sx={{ color: T.sub, fontSize: '0.77rem', mt: 0.4 }}>
            Premium Business Accounting
          </Typography>
        </Box>

        {/* Card */}
        <Box sx={{
          width: '100%', maxWidth: 408,
          bgcolor: T.cardBg,
          backdropFilter: isDark ? 'blur(20px)' : 'none',
          borderRadius: '20px',
          border: `1px solid ${T.cardBorder}`,
          boxShadow: T.cardShadow,
          p: { xs: 3, sm: 3.5 },
          animation: 'lg-up 0.48s ease both',
          animationDelay: '0.06s',
        }}>
          {/* Card header */}
          <Typography sx={{ fontWeight: 700, color: T.title, fontSize: '1.18rem', mb: 0.35, lineHeight: 1.2 }}>
            Welcome back
          </Typography>
          <Typography sx={{ color: T.sub, fontSize: '0.82rem', mb: 2.8, lineHeight: 1.5 }}>
            {tab === 'owner'
              ? useAdminPwd
                ? 'Sign in with your Business Code and admin password.'
                : 'Sign in with your Google account to access your workspace.'
              : 'Enter your staff credentials provided by your employer.'}
          </Typography>

          {/* Pill tab toggle */}
          <Box sx={{
            display: 'flex', gap: 0.5, p: 0.5,
            bgcolor: T.tabWrap, borderRadius: 100, mb: 2.8,
          }}>
            {[
              { value: 'owner', label: 'Owner / Admin' },
              { value: 'staff', label: 'Staff / Auditor' },
            ].map(t => (
              <Button
                key={t.value}
                onClick={() => { setTab(t.value); setError(''); }}
                fullWidth disableElevation
                sx={{
                  borderRadius: 100, py: 0.8, minHeight: 36,
                  bgcolor:    tab === t.value ? T.tabActiveBg   : 'transparent',
                  color:      tab === t.value ? T.tabActiveText : T.tabText,
                  fontWeight: 600, fontSize: '0.78rem', textTransform: 'none',
                  boxShadow:  tab === t.value ? T.tabActiveShadow : 'none',
                  transition: 'all 0.18s',
                  '&:hover': { bgcolor: tab === t.value ? T.tabActiveBg : 'transparent', opacity: 0.88 },
                }}
              >
                {t.label}
              </Button>
            ))}
          </Box>

          {error && (
            <Alert severity="error" variant="filled"
              sx={{ mb: 2.2, borderRadius: '10px', fontSize: '0.8rem', py: 0.5 }}>
              {error}
            </Alert>
          )}

          {/* ── Owner tab ── */}
          {tab === 'owner' && !useAdminPwd && (
            <>
              <Button
                onClick={handleGoogleSignIn}
                disabled={loading}
                fullWidth
                disableElevation
                sx={{
                  py: 1.65, borderRadius: '12px',
                  bgcolor: T.googleBg,
                  color: T.googleText,
                  border: `1.5px solid ${T.googleBorder}`,
                  textTransform: 'none', fontSize: '0.95rem', fontWeight: 600,
                  boxShadow: isDark ? '0 4px 18px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.07)',
                  transition: 'all 0.22s',
                  gap: 1.5,
                  '&:hover': {
                    bgcolor: T.googleHov,
                    transform: 'translateY(-1px)',
                    boxShadow: isDark ? '0 8px 28px rgba(0,0,0,0.5)' : '0 6px 20px rgba(0,0,0,0.1)',
                  },
                  '&:active': { transform: 'translateY(0)' },
                  '&.Mui-disabled': { opacity: 0.55 },
                }}
                startIcon={!loading && <GoogleIcon />}
              >
                {loading ? 'Signing in…' : 'Continue with Google'}
              </Button>
              <Divider sx={{ borderColor: T.divider, my: 2 }} />
              <Button
                fullWidth disableElevation
                onClick={() => { setUseAdminPwd(true); setError(''); }}
                sx={{
                  py: 1.2, borderRadius: '12px', textTransform: 'none',
                  fontSize: '0.88rem', fontWeight: 600,
                  color: T.tabActiveText,
                  border: `1.5px solid ${isDark ? 'rgba(129,140,248,0.22)' : 'rgba(129,140,248,0.25)'}`,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: isDark ? 'rgba(129,140,248,0.07)' : 'rgba(129,140,248,0.05)' },
                }}
              >
                Use Business Code + Password instead
              </Button>
            </>
          )}

          {tab === 'owner' && useAdminPwd && (
            <Box component="form" onSubmit={handleAdminPasswordLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography sx={labelSx}>Business Code</Typography>
                <TextField
                  fullWidth
                  value={adminCode}
                  onChange={e => setAdminCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  slotProps={{ htmlInput: { maxLength: 6, style: { letterSpacing: 5, fontWeight: 700, fontSize: '1.05rem' } } }}
                  placeholder="ABC123"
                  sx={inputSx}
                />
              </Box>
              <Box>
                <Typography sx={labelSx}>Admin Password</Typography>
                <TextField
                  fullWidth
                  type={showAdminPwd ? 'text' : 'password'}
                  value={adminPwd}
                  onChange={e => setAdminPwd(e.target.value)}
                  placeholder="Your admin password"
                  autoComplete="current-password"
                  slotProps={{ input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowAdminPwd(v => !v)} edge="end" tabIndex={-1}
                          sx={{ color: T.eyeColor, '&:hover': { color: T.inputText } }}>
                          {showAdminPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    )
                  } }}
                  sx={inputSx}
                />
              </Box>
              <Button
                type="submit" disabled={loading} fullWidth disableElevation
                sx={{
                  mt: 0.5, py: 1.6, borderRadius: '12px',
                  background: 'linear-gradient(135deg, #818cf8 0%, #8b5cf6 100%)',
                  color: 'white', textTransform: 'none',
                  fontSize: '0.95rem', fontWeight: 700,
                  boxShadow: '0 4px 20px rgba(129,140,248,0.38)',
                  transition: 'all 0.22s',
                  '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 8px 28px rgba(129,140,248,0.48)', filter: 'brightness(1.06)' },
                  '&:active': { transform: 'translateY(0)' },
                  '&.Mui-disabled': { opacity: 0.55, color: 'rgba(255,255,255,0.7)' },
                }}
              >
                {loading ? 'Signing in…' : 'Sign In as Admin'}
              </Button>
              <Button
                fullWidth disableElevation
                onClick={() => { setUseAdminPwd(false); setError(''); setAdminCode(''); setAdminPwd(''); }}
                sx={{ textTransform: 'none', fontSize: '0.82rem', color: T.caption }}
              >
                Back to Google Sign-In
              </Button>
            </Box>
          )}

          {/* ── Staff tab ── */}
          {tab === 'staff' && (
            <Box component="form" onSubmit={handleStaffLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography sx={labelSx}>Business Code</Typography>
                <TextField
                  fullWidth
                  value={businessCode}
                  onChange={e => setBusinessCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  slotProps={{ htmlInput: { maxLength: 6, style: { letterSpacing: 5, fontWeight: 700, fontSize: '1.05rem' } } }}
                  placeholder="ABC123"
                  sx={inputSx}
                />
              </Box>
              <Box>
                <Typography sx={labelSx}>Username</Typography>
                <TextField
                  fullWidth
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Your username"
                  autoComplete="username"
                  sx={inputSx}
                />
              </Box>
              <Box>
                <Typography sx={labelSx}>Password</Typography>
                <TextField
                  fullWidth
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  slotProps={{ input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(v => !v)} edge="end" tabIndex={-1}
                          sx={{ color: T.eyeColor, '&:hover': { color: T.inputText } }}>
                          {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    )
                  } }}
                  sx={inputSx}
                />
              </Box>

              <Button
                type="submit" disabled={loading} fullWidth disableElevation
                sx={{
                  mt: 0.5, py: 1.6, borderRadius: '12px',
                  background: 'linear-gradient(135deg, #818cf8 0%, #8b5cf6 100%)',
                  color: 'white', textTransform: 'none',
                  fontSize: '0.95rem', fontWeight: 700,
                  boxShadow: '0 4px 20px rgba(129,140,248,0.38)',
                  transition: 'all 0.22s',
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    boxShadow: '0 8px 28px rgba(129,140,248,0.48)',
                    filter: 'brightness(1.06)',
                  },
                  '&:active': { transform: 'translateY(0)' },
                  '&.Mui-disabled': { opacity: 0.55, color: 'rgba(255,255,255,0.7)' },
                }}
              >
                {loading ? 'Signing in…' : 'Sign In as Staff'}
              </Button>

              <Divider sx={{ borderColor: T.divider }} />
              <Typography sx={{ color: T.caption, fontSize: '0.74rem', textAlign: 'center', lineHeight: 1.6 }}>
                Get your Business Code and credentials from your employer.
              </Typography>
            </Box>
          )}
        </Box>

        {/* Footer */}
        <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 1, animation: 'lg-up 0.5s ease both', animationDelay: '0.18s' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.footerText} strokeWidth="2.2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <Typography sx={{ color: T.footerText, fontSize: '0.7rem', letterSpacing: '0.09em' }}>
            SECURE ACCESS · END-TO-END ENCRYPTED
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
