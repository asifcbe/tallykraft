import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CssBaseline, Box, Paper, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputAdornment, IconButton, Alert } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { ThemeProviderWrapper } from './ThemeContext';
import { ConfigProvider, useConfig } from './ConfigContext';
import { DataProvider } from './DataContext';
import Layout from './Layout';
import { BusinessProvider, useBusiness } from './BusinessContext';
import { AuthProvider, useAuth } from './AuthContext';
import { SubscriptionProvider, useSubscription } from './SubscriptionContext';
import { BillingProvider } from './BillingContext';
import { I18nProvider } from './i18n/I18nContext';
import SubscriptionPage from './SubscriptionPage';
import Login from './Login';
import LandingPage from './LandingPage';
import PrivacyPolicy from './PrivacyPolicy';
import { DialogProvider } from './DialogContext';
import { useData } from './DataContext';
import { TabsProvider } from './TabsContext';
import { NetworkProvider } from './NetworkContext';
import NetworkStatusBanner from './NetworkStatusBanner';

const BeforeUnloadGuard = () => {
  useData(); // keep context wired; the data layer now write-throughs to
             // IndexedDB immediately on every mutation, so no beforeunload
             // flush is needed.
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

const AppContent = () => {
  const { isAuthenticated, loading, isAuthorized, authError, isAdmin, logout, staffSession } = useAuth();
  const { currentBusiness } = useBusiness();
  const { config } = useConfig();
  const { hasAnySubscription, subLoading } = useSubscription();
  const [_showLogin, setShowLogin] = useState(false);

  // Public legal page — reachable at /privacy regardless of auth state (the rest
  // of the app sits behind the auth gate / BrowserRouter below).
  const isPrivacyRoute = typeof window !== 'undefined' && window.location.pathname === '/privacy';
  if (isPrivacyRoute) {
    return <PrivacyPolicy onBack={() => { window.history.length > 1 ? window.history.back() : (window.location.href = '/'); }} />;
  }

  if (loading) return null;

  if (!isAuthenticated) {
    if (_showLogin) return <Login onBack={() => setShowLogin(false)} />;
    return <LandingPage onLoginClick={() => setShowLogin(true)} />;
  }

  if (!isAuthorized) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
        <Paper elevation={6} sx={{ maxWidth: 420, width: '100%', p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Access Denied</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {authError || 'Your email is not authorized to access this application.'}
          </Typography>
          <Button variant="contained" fullWidth onClick={logout}>Logout</Button>
        </Paper>
      </Box>
    );
  }

  if (!isAdmin && !staffSession) {
    if (subLoading) return null;
    if (!hasAnySubscription) return <SubscriptionPage businessId={currentBusiness?.id || 1} />;
  }

  // ── All authenticated routes render via the tab-based Layout ──────────────
  // Layout manages its own internal navigation via TabsContext.
  // /subscribe is the only route outside of Layout.
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
