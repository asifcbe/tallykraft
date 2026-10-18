import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CssBaseline, Box, Paper, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputAdornment, IconButton, Alert, CircularProgress } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { ThemeProviderWrapper } from './ThemeContext';
import { BRAND } from './theme';
import { ConfigProvider, useConfig } from './ConfigContext';
import { DataProvider } from './DataContext';
import Layout from './Layout';
import { BusinessProvider, useBusiness } from './BusinessContext';
import { AuthProvider, useAuth } from './AuthContext';
import { SubscriptionProvider, useSubscription } from './SubscriptionContext';
import { BillingProvider } from './BillingContext';
import { I18nProvider } from './i18n/I18nContext';
import SubscriptionPage from './SubscriptionPage';
import BillDhekoLogo from './BillDhekoLogo';
import Login from './Login';
import LandingPage from './LandingPage';
import PrivacyPolicy from './PrivacyPolicy';
import { DialogProvider } from './DialogContext';
import { useData } from './DataContext';
import { TabsProvider } from './TabsContext';
import { NetworkProvider } from './NetworkContext';
import NetworkStatusBanner from './NetworkStatusBanner';
import OverflowTooltip from './OverflowTooltip';
import { warmQrModule } from './qrReady';

const BeforeUnloadGuard = () => {
  useData(); // keep context wired; the data layer write-throughs to IndexedDB
             // immediately on every mutation, so no beforeunload flush is needed.

  useEffect(() => {
    // Push a sentinel entry so the browser has somewhere to go "back" to inside the app.
    window.history.pushState({ appEntry: true }, '');

    const handlePopState = () => {
      // Re-push so the back button never leaves the app.
      window.history.pushState({ appEntry: true }, '');
      if (window.confirm('Are you sure you want to leave BillDheko?')) {
        window.history.go(-2); // actually navigate away
      }
      // MUI Dialogs set body overflow:hidden while open; native confirm() can
      // prevent the cleanup, killing page scroll. Always restore here.
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return null;
};

const AdminPasswordSetupDialog = () => {
  const { needsPasswordSetup, setNeedsPasswordSetup, setAdminPassword, currentBusiness } = useAuth();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (pwd.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    if (pwd !== confirm) { setErr('Passwords do not match.'); return; }
    setSaving(true);
    const result = await setAdminPassword(pwd);
    setSaving(false);
    if (!result.success) { setErr(result.error); return; }
    setPwd(''); setConfirm(''); setErr('');
  };

  if (!needsPasswordSetup || !currentBusiness) return null;

  return (
    <Dialog open maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Set Admin Password</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
          Your business code is <strong>{currentBusiness.businessCode}</strong>. Set a password so you can log in next time without Google.
        </Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <TextField
          fullWidth label="Password" type={show ? 'text' : 'password'} size="small" sx={{ mb: 2 }}
          value={pwd} onChange={e => setPwd(e.target.value)}
          slotProps={{ input: { endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setShow(v => !v)} tabIndex={-1}>
                {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ) } }}
        />
        <TextField
          fullWidth label="Confirm Password" type={show ? 'text' : 'password'} size="small"
          value={confirm} onChange={e => setConfirm(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={() => setNeedsPasswordSetup(false)} sx={{ textTransform: 'none' }}>Skip for now</Button>
        <Button variant="contained" disableElevation onClick={handleSave} disabled={saving} sx={{ textTransform: 'none', fontWeight: 700 }}>
          {saving ? 'Saving…' : 'Set Password'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Shown while auth/config is bootstrapping — previously `return null` left a
// blank white screen for the entire duration, which reads as a frozen/broken
// app rather than a loading one, especially on slow connections.
const AppLoadingSplash = () => (
  <Box sx={{
    width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2.5, bgcolor: '#ffffff',
  }}>
    <BillDhekoLogo size={56} variant="icon" />
    <CircularProgress size={26} sx={{ color: BRAND.teal }} />
  </Box>
);

const AppContent = () => {
  const { isAuthenticated, loading, isAuthorized, authError, isAdmin, logout, staffSession } = useAuth();
  const { currentBusiness, switchBusiness } = useBusiness();
  const { config } = useConfig(); // eslint-disable-line no-unused-vars
  const { hasAnySubscription, subLoading, getBusinessState } = useSubscription();
  const [_showLogin, setShowLogin] = useState(false);

  // When staff logs in, auto-switch to their assigned local business.
  useEffect(() => {
    if (staffSession?.localBusinessId != null) {
      switchBusiness(String(staffSession.localBusinessId));
    }
  }, [staffSession?.localBusinessId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fetch the `qrcode` package the moment the app shell is up, so the
  // first payment QR to render isn't paying that import cost cold (see
  // qrReady.js — react-to-print/html2canvas snapshot the QR canvas
  // synchronously and don't wait for the dynamic import + draw).
  useEffect(() => {
    if (isAuthenticated) warmQrModule();
  }, [isAuthenticated]);

  // Public legal page — reachable at /privacy regardless of auth state.
  const isPrivacyRoute = typeof window !== 'undefined' && window.location.pathname === '/privacy';
  if (isPrivacyRoute) {
    return <PrivacyPolicy onBack={() => { window.history.length > 1 ? window.history.back() : (window.location.href = '/'); }} />;
  }

  if (loading) return <AppLoadingSplash />;

  if (!isAuthenticated) {
    if (_showLogin) return <Login onBack={() => setShowLogin(false)} />;
    return <LandingPage onLoginClick={() => setShowLogin(true)} />;
  }

  if (!isAuthorized) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
        <Paper elevation={6} sx={{ maxWidth: 420, width: '100%', p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2.5 }}>
            <BillDhekoLogo size={56} variant="icon" />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Access Denied</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {authError || 'Your email is not authorized to access this application.'}
          </Typography>
          <Button variant="contained" fullWidth onClick={logout}>Logout</Button>
          {authError && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
                Or try reloading the page
              </Typography>
              <Button variant="outlined" fullWidth onClick={() => window.location.reload()}>Reload Page</Button>
            </>
          )}
        </Paper>
      </Box>
    );
  }

  // ── Subscription gate (paid model) ───────────────────────────────────────
  // Admins and staff bypass billing entirely. For a normal owner:
  //   • no subscription record at all  → onboarding SubscriptionPage
  //   • current business expired / lapsed / has no plan → SubscriptionPage
  //     (funnels them to pay; the data layer + Layout also enforce read-only,
  //     but sending them straight to the plans screen is the intended flow)
  // A business that is trial / subscribed / admin-granted falls through to
  // the app as normal.
  if (!isAdmin && !staffSession) {
    if (subLoading) return <AppLoadingSplash />;
    const bizState = currentBusiness?.id ? getBusinessState(currentBusiness.id) : 'none';
    const bizInactive = ['none', 'expired', 'trial_expired'].includes(bizState);
    if (!hasAnySubscription || bizInactive) {
      return <SubscriptionPage businessId={currentBusiness?.id || 1} />;
    }
  }

  // ── All authenticated routes render via the tab-based Layout ──────────────
  // /subscribe is the only route outside of Layout (reached from the Layout
  // subscription pill / expired banner so an active user can still manage or
  // upgrade their plan).
  return (
    <>
      {isAdmin && !staffSession && <AdminPasswordSetupDialog />}
      <Routes>
        <Route path="/subscribe" element={<SubscriptionPage businessId={currentBusiness?.id || 1} />} />
        <Route path="*" element={<Layout />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <I18nProvider>
    <NetworkProvider>
    <AuthProvider>
      <BillingProvider>
      <SubscriptionProvider>
        <ConfigProvider>
          <ThemeProviderWrapper>
            <CssBaseline />
            <DataProvider>
              <BusinessProvider>
                <DialogProvider>
                  <BrowserRouter>
                    <TabsProvider>
                      <BeforeUnloadGuard />
                      <NetworkStatusBanner />
                      <OverflowTooltip />
                      <AppContent />
                    </TabsProvider>
                  </BrowserRouter>
                </DialogProvider>
              </BusinessProvider>
            </DataProvider>
          </ThemeProviderWrapper>
        </ConfigProvider>
      </SubscriptionProvider>
      </BillingProvider>
    </AuthProvider>
    </NetworkProvider>
    </I18nProvider>
  );
}

export default App;
