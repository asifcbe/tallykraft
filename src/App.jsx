import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CssBaseline, Box, Paper, Typography, Button } from '@mui/material';
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
import { FinancialYearProvider } from './FinancialYearContext';
import { DialogProvider } from './DialogContext';
import { useData } from './DataContext';
import { TabsProvider } from './TabsContext';

const BeforeUnloadGuard = () => {
  const { backupNow } = useData();
  useEffect(() => {
    const handler = () => { backupNow?.(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [backupNow]);
  return null;
};

const AppContent = () => {
  const { isAuthenticated, loading, isAuthorized, authError, isAdmin, logout, staffSession } = useAuth();
  const { currentBusiness } = useBusiness();
  const { config } = useConfig();
  const { hasAnySubscription, subLoading } = useSubscription();
  const [_showLogin, setShowLogin] = React.useState(false);

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
    <Routes>
      <Route path="/subscribe" element={<SubscriptionPage businessId={currentBusiness?.id || 1} />} />
      <Route path="*" element={<Layout />} />
    </Routes>
  );
};

function App() {
  return (
    <I18nProvider>
    <AuthProvider>
      <BillingProvider>
      <SubscriptionProvider>
        <ConfigProvider>
          <ThemeProviderWrapper>
            <CssBaseline />
            <DataProvider>
              <BusinessProvider>
                <FinancialYearProvider>
                  <DialogProvider>
                    <BrowserRouter>
                      <TabsProvider>
                        <BeforeUnloadGuard />
                        <AppContent />
                      </TabsProvider>
                    </BrowserRouter>
                  </DialogProvider>
                </FinancialYearProvider>
              </BusinessProvider>
            </DataProvider>
          </ThemeProviderWrapper>
        </ConfigProvider>
      </SubscriptionProvider>
      </BillingProvider>
    </AuthProvider>
    </I18nProvider>
  );
}

export default App;
