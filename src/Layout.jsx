import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useData } from './DataContext';
import { useTabs, pathLabel } from './TabsContext';

// After a new build is deployed, a tab still running the OLD index chunk
// asks for a page chunk whose hashed filename no longer exists on the
// server — the dynamic import() then rejects with a "Failed to fetch
// dynamically imported module" / ChunkLoadError. Without handling, React
// unmounts the whole <Suspense> subtree and the section goes blank until a
// manual reload (which fetches the fresh index.html + new chunk names).
//
// lazyWithRetry:
//   1. Retries the import once after a short delay (covers a transient
//      network blip mid-fetch, not just stale deploys).
//   2. On a genuine chunk-load failure, does a ONE-TIME hard reload (guarded
//      by a sessionStorage flag so it can't loop) — the reload pulls the
//      current index.html and the correct chunk names, and the user lands
//      back where they were.
const CHUNK_RELOAD_FLAG = 'tk_chunkReloadedAt';
const isChunkLoadError = (err) => {
  const msg = String(err?.message || err || '');
  return (
    err?.name === 'ChunkLoadError' ||
    /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg)
  );
};
const lazyWithRetry = (importer) =>
  lazy(() =>
    importer().catch(async (err) => {
      // one quiet retry
      await new Promise((r) => setTimeout(r, 400));
      try {
        return await importer();
      } catch (err2) {
        if (isChunkLoadError(err2 || err)) {
          let last = 0;
          try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_FLAG)) || 0; } catch { /* ignore */ }
          // Only auto-reload if we haven't already done so in the last 10s
          // (prevents a reload loop if the deploy is genuinely broken).
          if (Date.now() - last > 10000) {
            try { sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(Date.now())); } catch { /* ignore */ }
            window.location.reload();
            // Return a never-resolving module so nothing renders before the
            // reload takes effect.
            return new Promise(() => {});
          }
        }
        throw err2 || err;
      }
    })
  );

// All page components — lazy-loaded so each page's JS is only fetched the
// first time its tab is opened (mountedIds gate), instead of every page
// being bundled into the single main chunk every user downloads on load.
const Dashboard = lazyWithRetry(() => import('./Dashboard'));
const Parties = lazyWithRetry(() => import('./Parties'));
const Items = lazyWithRetry(() => import('./Items'));
const Sales = lazyWithRetry(() => import('./Sales'));
const POS = lazyWithRetry(() => import('./POS'));
const Expenses = lazyWithRetry(() => import('./Expenses'));
const Cash = lazyWithRetry(() => import('./Cash'));
const Calculator = lazyWithRetry(() => import('./Calculator'));
const Opticals = lazyWithRetry(() => import('./Opticals'));
const Estimates = lazyWithRetry(() => import('./Estimates'));
const Orders = lazyWithRetry(() => import('./Orders'));
const CreditNotes = lazyWithRetry(() => import('./CreditNotes'));
const DebitNotes = lazyWithRetry(() => import('./DebitNotes'));
const DeliveryNotes = lazyWithRetry(() => import('./DeliveryNotes'));
const CustomSection = lazyWithRetry(() => import('./CustomSection'));
const StaffPage = lazyWithRetry(() => import('./StaffPage'));
const PaymentEntry = lazyWithRetry(() => import('./PaymentEntry'));
const Reports = lazyWithRetry(() => import('./Reports'));
const Backup = lazyWithRetry(() => import('./Backup'));
const MigrateData = lazyWithRetry(() => import('./MigrateData'));
const SettingsPage = lazyWithRetry(() => import('./Settings'));
const Admin = lazyWithRetry(() => import('./Admin'));
const LedgerPage = lazyWithRetry(() => import('./Ledger'));
const MembershipPage = lazyWithRetry(() => import('./Membership'));
const InvestorsPage = lazyWithRetry(() => import('./Investors'));
const Help = lazyWithRetry(() => import('./Help'));
import {
  Box, Drawer, AppBar, Toolbar, List, Typography, Divider, IconButton,
  ListItem, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Avatar, Menu, MenuItem,
  Tooltip, useTheme, useMediaQuery, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, alpha, BottomNavigation, BottomNavigationAction, Paper,
  CircularProgress, Stack, Chip, Snackbar
} from '@mui/material';
import {
  Menu as MenuIcon,
  LayoutDashboard,
  Users,
  Package,
  ReceiptText,
  ShoppingBag,
  FileText,
  Settings,
  Database,
  ChevronLeft,
  Store,
  Plus,
  Download,
  Eye,
  FileSearch,
  RotateCcw,
  CornerUpLeft,
  Truck,
  BookOpen,
  LogOut,
  DollarSign,
  ShieldCheck,
  CloudOff,
  CreditCard,
  Crown,
  Keyboard,
  Wallet,
  Calculator as CalculatorIcon,
  X as TabClose,
  HelpCircle,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  RefreshCw,
  Handshake,
  ClipboardList,
  QrCode,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBusiness } from './BusinessContext';
import { useAuth } from './AuthContext';
import { useBusinessAuthDoc } from './businessCode';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import SectionIcon from './SectionIcon';
import { useDialog } from './DialogContext';
import BusinessSetupDialog from './BusinessSetupDialog';
import TallyKraftLogo from './TallyKraftLogo';
import { BRAND } from './theme';
import { useI18n } from './i18n/I18nContext';
import { buildUpiUri } from './upiUtils';
import UpiQrImage from './UpiQrImage';

const drawerWidth = 240;
const miniWidth = 64; // collapsed sidebar — icons only
const APP_BAR_H = 52; // single unified bar height

// Routes accessible to staff and the feature key required in staffSession.features.
// Routes not listed here are admin-only and will be blocked for all staff sessions.
const STAFF_ROUTE_FEATURES = {
  '/': 'dashboard',
  '/parties': 'parties',
  '/items': 'items',
  '/pos': 'pos',
  '/sales': 'sales',
  '/purchases': 'purchases',
  '/expenses': 'expenses',
  '/payment-in': 'payments',
  '/payment-out': 'payments',
  '/cash': 'cash',
  '/calculator': null, // always allowed
  '/help': null, // always allowed
  '/reports': 'reports',
  '/estimates': 'estimates',
  '/orders': 'orders',
  '/credit-notes': 'creditNotes',
  '/debit-notes': 'debitNotes',
  '/delivery-notes': 'deliveryNotes',
  '/ledger': 'ledger',
  '/membership': 'membership',
  '/investors': 'investors',
  '/opticals': 'opticals',
};

// ── No-permission full screen shown when a staff member hits a blocked page ──
const NoPermissionScreen = ({ firstAllowedPath, firstAllowedLabel, onNavigate }) => {
  const { logout } = useAuth();
  return (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      bgcolor: 'background.default', p: 3, gap: 2,
    }}>
      <Box sx={{ p: 2, borderRadius: '50%', bgcolor: 'error.50', display: 'flex', mb: 1 }}>
        <ShieldCheck size={48} strokeWidth={1.2} color="#dc2626" />
      </Box>
      <Typography variant="h5" fontWeight={800} textAlign="center">
        Access Restricted
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" maxWidth={360}>
        You don&apos;t have permission to view this section. Please contact your administrator to request access.
      </Typography>
      <Box sx={{ mt: 1, p: 2.5, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', maxWidth: 360, width: '100%' }}>
        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>Need access?</Typography>
        <Typography variant="caption" color="text.secondary">
          Ask your admin to enable this section for your account in Staff Management → Edit Staff → Features.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        {firstAllowedPath && (
          <Button variant="contained" startIcon={<LayoutDashboard size={16} />}
            onClick={() => onNavigate(firstAllowedPath, firstAllowedLabel)}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, bgcolor: BRAND.teal, '&:hover': { bgcolor: BRAND.tealDark } }}>
            Go to {firstAllowedLabel}
          </Button>
        )}
        <Button variant="outlined" color="error" startIcon={<LogOut size={16} />} onClick={logout}
          sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}>
          Sign Out
        </Button>
      </Box>
    </Box>
  );
};

// ── Suspense fallback while a lazy-loaded page's JS is being fetched ────────
const PageLoadingFallback = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
    <CircularProgress size={28} sx={{ color: BRAND.teal }} />
  </Box>
);

// ── Per-tab error boundary ────────────────────────────────────────────────
// Without this, ANY error thrown while a lazy page loads or renders (a stale
// chunk after a deploy, a transient render bug, bad data shape) unmounts the
// whole content area and the section goes blank until a manual reload. This
// keeps the app shell (sidebar/topbar/tabs) intact and gives the user a
// one-click recovery. Keyed on the tab's path by the parent so switching
// sections resets a boundary that had errored.
class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error('[TabErrorBoundary] page crashed:', error);
    // A chunk-load error here means lazyWithRetry's own reload guard already
    // fired and was rate-limited — surface the manual reload button instead
    // of looping.
  }
  handleReload = () => window.location.reload();
  handleRetry = () => this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkLoadError(this.state.error);
    return (
      <Box sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '50vh', p: 3, gap: 1.5, textAlign: 'center',
      }}>
        <Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: 'error.50', display: 'flex' }}>
          <AlertTriangle size={36} strokeWidth={1.4} color="#dc2626" />
        </Box>
        <Typography variant="h6" fontWeight={800}>
          {chunk ? 'This section needs a refresh' : "This section couldn't load"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380 }}>
          {chunk
            ? 'The app was updated in the background. Reload to get the latest version — your data is safe.'
            : 'Something went wrong displaying this page. Your data is safe. Try again, or reload the app.'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
          {!chunk && (
            <Button variant="outlined" onClick={this.handleRetry}
              sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}>
              Try again
            </Button>
          )}
          <Button variant="contained" onClick={this.handleReload}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, bgcolor: BRAND.teal, '&:hover': { bgcolor: BRAND.tealDark } }}>
            Reload app
          </Button>
        </Box>
      </Box>
    );
  }
}

// ── Tab content renderer — maps a path to its page component ────────────────
const TabPageRenderer = ({ path, tabId }) => {
  const { staffSession } = useAuth();
  const { openTab } = useTabs();

  if (staffSession && staffSession.role !== 'admin') {
    const isCustomSection = path?.startsWith('/section/');
    const featureKey = isCustomSection ? null : STAFF_ROUTE_FEATURES[path];
    const isListed = isCustomSection || Object.prototype.hasOwnProperty.call(STAFF_ROUTE_FEATURES, path);
    // Block if: route is admin-only (not listed) OR required feature not granted
    const blocked = !isListed || (featureKey !== null && !staffSession.features?.[featureKey]);
    if (blocked) {
      // Find the first route the staff member can access
      const feats = staffSession.features || {};
      const allowedEntry = Object.entries(STAFF_ROUTE_FEATURES).find(
        ([, fKey]) => fKey === null || feats[fKey] === true
      );
      const firstPath = allowedEntry ? allowedEntry[0] : '/';
      const firstLabel = pathLabel(firstPath);
      return (
        <NoPermissionScreen
          firstAllowedPath={firstPath}
          firstAllowedLabel={firstLabel}
          onNavigate={(p, label) => openTab(p, label, { duplicate: false })}
        />
      );
    }
  }

  if (path === '/') return <Dashboard />;
  if (path === '/parties') return <Parties />;
  if (path === '/items') return <Items />;
  if (path === '/pos') return <POS />;
  if (path === '/sales') return <Sales tabId={tabId} />;
  if (path === '/purchases') return <Sales mode="purchase" tabId={tabId} />;
  if (path === '/expenses') return <Expenses />;
  if (path === '/cash') return <Cash />;
  if (path === '/calculator') return <Calculator />;
  if (path === '/payment-in') return <PaymentEntry mode="payment-in" />;
  if (path === '/payment-out') return <PaymentEntry mode="payment-out" />;
  if (path === '/opticals') return <Opticals />;
  if (path === '/estimates') return <Estimates />;
  if (path === '/orders') return <Orders />;
  if (path === '/credit-notes') return <CreditNotes />;
  if (path === '/debit-notes') return <DebitNotes />;
  if (path === '/delivery-notes') return <DeliveryNotes />;
  if (path === '/staff') return <StaffPage />;
  if (path === '/ledger') return <LedgerPage />;
  if (path === '/membership') return <MembershipPage />;
  if (path === '/investors') return <InvestorsPage />;
  if (path === '/reports') return <Reports />;
  if (path === '/backup') return <Backup />;
  if (path === '/migrate') return <MigrateData />;
  if (path === '/help') return <Help />;
  if (path === '/settings') return <SettingsPage />;
  if (path === '/admin') return <Admin />;
  if (path?.startsWith('/section/')) return <CustomSection sectionId={path.replace('/section/', '')} />;
  return <Dashboard />;
};

// ── Multi-instance tab sub-strip ─────────────────────────────────────────────
const MultiTabStrip = ({ activeTabPath }) => {
  const { tabs, activeTabId, activateTab, closeTab, openTab } = useTabs();

  // Only show tabs that belong to the currently active page
  const stripTabs = tabs.filter(t => t.path === activeTabPath);
  if (!stripTabs.length || (activeTabPath !== '/sales' && activeTabPath !== '/reports')) return null;

  const newLabel = activeTabPath === '/sales' ? 'New Invoice' : 'New Report';

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center',
      gap: 0.4, px: 2.5, py: 0.5,
      bgcolor: 'background.paper',
      borderBottom: '1px solid',
      borderColor: 'divider',
      overflowX: 'auto',
      '&::-webkit-scrollbar': { display: 'none' },
      scrollbarWidth: 'none',
    }}>
      {stripTabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        const isFirst = idx === 0;
        return (
          <Box
            key={tab.id}
            onClick={() => activateTab(tab.id)}
            title={tab.label}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              px: 1.1, height: 28, borderRadius: '6px',
              minWidth: 72, maxWidth: 160, flexShrink: 0,
              cursor: 'pointer', userSelect: 'none',
              transition: 'all 0.14s ease',
              border: '1px solid',
              ...(isActive ? {
                bgcolor: alpha(BRAND.teal, 0.1),
                borderColor: alpha(BRAND.teal, 0.28),
              } : {
                bgcolor: 'transparent',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover', borderColor: alpha(BRAND.teal, 0.18) },
              }),
            }}
          >
            <Typography noWrap sx={{
              fontSize: '0.71rem', fontWeight: isActive ? 700 : 500, flex: 1, minWidth: 0,
              color: isActive ? 'primary.main' : 'text.secondary', lineHeight: 1,
            }}>
              {tab.label}
            </Typography>
            {!isFirst && (
              <Box
                component="span"
                onClick={e => closeTab(tab.id, e)}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, borderRadius: '3px', flexShrink: 0,
                  color: isActive ? 'primary.main' : 'text.disabled',
                  opacity: isActive ? 0.7 : 0.45,
                  '&:hover': { opacity: 1, bgcolor: alpha(BRAND.teal, 0.12), color: 'primary.main' },
                }}
              >
                <TabClose size={9} />
              </Box>
            )}
          </Box>
        );
      })}
      {/* + button to open a new instance of the current page */}
      <Tooltip title={newLabel}>
        <Box
          onClick={() => openTab(activeTabPath, newLabel, { duplicate: true })}
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: '6px', flexShrink: 0,
            cursor: 'pointer', border: '1px dashed', borderColor: 'divider',
            color: 'text.disabled',
            '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: alpha(BRAND.teal, 0.06) },
            transition: 'all 0.14s',
          }}
        >
          <Plus size={13} />
        </Box>
      </Tooltip>
    </Box>
  );
};

// Shows "Saving…" while a write is in flight, then "Saved" for 1.5 s, then
// disappears. A failed cloud sync previously only logged to the console —
// this looked identical to a successful save from the user's side (the
// "Saving…" chip just cleared either way), so a genuinely failed write
// (rejected field value, permission error, network blip) left data stuck
// local-only with no visible indication. The "sync failed" state doesn't
// auto-hide, unlike "Saved" — it needs the user's attention.
const AutoSaveChip = React.memo(() => {
  const { saving, syncError, syncWarning } = useData();
  const [label, setLabel] = React.useState(null);
  const hideTimer = React.useRef(null);
  const savingTimer = React.useRef(null);
  const lastErrorAtRef = React.useRef(null);

  const lastWarnAtRef = React.useRef(null);

  React.useEffect(() => {
    if (saving) {
      clearTimeout(hideTimer.current);
      clearTimeout(savingTimer.current);
      setLabel('saving');
    } else if (syncError && syncError.at !== lastErrorAtRef.current) {
      lastErrorAtRef.current = syncError.at;
      clearTimeout(hideTimer.current);
      clearTimeout(savingTimer.current);
      setLabel('error');
    } else if (label === 'saving') {
      savingTimer.current = setTimeout(() => {
        // A fresh soft-size advisory takes the post-save slot instead of the
        // plain "Saved ✓", then auto-hides the same way. Never overrides an
        // active error.
        const warnFresh = syncWarning && syncWarning.at !== lastWarnAtRef.current;
        if (warnFresh) lastWarnAtRef.current = syncWarning.at;
        setLabel(warnFresh ? 'warn' : 'saved');
        hideTimer.current = setTimeout(() => setLabel(null), warnFresh ? 4000 : 1500);
      }, 50);
    }
    return () => {
      clearTimeout(hideTimer.current);
      clearTimeout(savingTimer.current);
    };
  }, [saving, syncError, syncWarning]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!label) return null;

  const isError = label === 'error';
  const isWarn = label === 'warn';
  const color = label === 'saving' || isWarn ? 'warning' : isError ? 'error' : 'success';

  return (
    <Box
      title={
        isError ? (syncError?.message || 'Failed to sync to cloud')
        : isWarn ? (syncWarning?.message || 'This business has a lot of synced data')
        : undefined
      }
      sx={{
        display: { xs: 'none', sm: 'flex' },
        alignItems: 'center',
        gap: 0.5,
        mr: 1,
        px: 1,
        py: 0.4,
        borderRadius: 100,
        bgcolor: `${color}.light`,
        border: '1px solid',
        borderColor: `${color}.main`,
        transition: 'background-color 0.15s, border-color 0.15s',
        cursor: isError || isWarn ? 'help' : 'default',
      }}
    >
      {label === 'saving'
        ? <CircularProgress size={10} thickness={5} sx={{ color: 'warning.dark' }} />
        : isError
        ? <CloudOff size={11} color="#991b1b" />
        : isWarn
        ? <AlertTriangle size={11} color="#92400e" />
        : <ShieldCheck size={11} color="#166534" />}
      <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: `${color}.dark`, lineHeight: 1 }}>
        {label === 'saving' ? 'Saving…' : isError ? 'Sync failed' : isWarn ? 'Large data' : 'Saved ✓'}
      </Typography>
    </Box>
  );
});

const Layout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(!isMobile);
  const collapsed = !open && !isMobile;
  const [businessMenuAnchor, setBusinessMenuAnchor] = useState(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [passwordDialog, setPasswordDialog] = useState({ open: false, business: null, password: '', error: '' });
  const navigate = useNavigate();
  const location = useLocation();
  const { tabs, activeTabId, openTab, activateTab } = useTabs();
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);
  const { mountedIds } = useTabs();
  const { currentBusiness, businesses, switchBusiness } = useBusiness();
  const { logout, currentUser, isAdmin, staffSession, currentBusiness: authBusiness } = useAuth();
  // Scoped per the currently-selected LOCAL business (not authBusiness, which
  // is a single account-wide doc) — used for the business code chip.
  const ownerUid = currentUser?.uid || authBusiness?.ownerId;
  const scopedBiz = useBusinessAuthDoc(currentBusiness, ownerUid);
  const [codeCopied, setCodeCopied] = useState(false);
  const [paymentQrOpen, setPaymentQrOpen] = useState(false);
  const [paymentQrAmount, setPaymentQrAmount] = useState('');
  const { config } = useConfig();
  const { t } = useI18n();
  const { getBusinessState, isBusinessActive, daysLeftForBusiness } = useSubscription();
  const currentBizId = currentBusiness?.id;
  const bizState = currentBizId ? getBusinessState(currentBizId) : 'none';
  const bizActive = currentBizId ? isBusinessActive(currentBizId) : false;
  const daysLeft = currentBizId ? daysLeftForBusiness(currentBizId) : null;
  const isActiveTrial = bizState === 'trial';
  const isExpired = bizState === 'expired' || bizState === 'trial_expired';
  const showSubscribePill = isActiveTrial || isExpired;
  const { confirm } = useDialog();
  const { getItems } = useData();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const calculatorEnabled = config.features?.calculator !== false;
  const [calcOpen, setCalcOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };
  const gModeRef = useRef(false);
  const gModeTimerRef = useRef(null);
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  // PWA install
  const [installPrompt, setInstallPrompt] = useState(null);
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;
  const showInstallButton = !isStandalone && (installPrompt || isIOS);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) { setIosInstallOpen(true); return; }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && (e.code === 'KeyC' || e.key?.toLowerCase() === 'c')) {
        if (config.features?.calculator !== false) {
          e.preventDefault();
          setCalcOpen((o) => !o);
        }
        return;
      }
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
      if (isTyping) return;
      if (e.code === 'Slash' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setShortcutsOpen(true);
        return;
      }
      if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        gModeRef.current = true;
        clearTimeout(gModeTimerRef.current);
        gModeTimerRef.current = setTimeout(() => { gModeRef.current = false; }, 800);
        return;
      }
      if (gModeRef.current) {
        gModeRef.current = false;
        clearTimeout(gModeTimerRef.current);
        if (e.code === 'KeyN') {
          e.preventDefault();
          openTab('/sales', 'New Invoice', { duplicate: false });
          return;
        }
        if (e.code === 'KeyB') {
          e.preventDefault();
          openTab('/purchases', 'New Purchase', { duplicate: false });
          return;
        }
        const goMap = { KeyH: '/', KeyS: '/sales', KeyP: '/purchases', KeyE: '/expenses', KeyR: '/reports', KeyA: '/parties', KeyI: '/items', KeyJ: '/payment-in' };
        const dest = goMap[e.code];
        if (dest) { e.preventDefault(); openTab(dest, pathLabel(dest)); }
      }
    };
    const handleOpenShortcuts = () => setShortcutsOpen(true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-shortcuts', handleOpenShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-shortcuts', handleOpenShortcuts);
      clearTimeout(gModeTimerRef.current);
    };
  }, [navigate, config.features?.calculator]);

  // Global hardware barcode/QR scanner — when the active tab is NOT POS/Sales/Purchases,
  // navigate to POS and relay the scanned code via a 'barcode-scan' CustomEvent so POS
  // can add the item directly without requiring focus on any input.
  const openTabRef = useRef(openTab);
  useEffect(() => { openTabRef.current = openTab; }, [openTab]);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => {
    let buf = [];
    const onKey = (e) => {
      const activePath = activeTabRef.current?.path;
      // POS and Sales/Purchases handle their own scanners — don't intercept there
      if (activePath === '/pos' || activePath === '/sales' || activePath === '/purchases') return;
      // Don't intercept while any dialog/modal is open (e.g. ItemFormDialog, PartyFormDialog)
      if (document.querySelector('.MuiDialog-root')) return;

      if (e.key === 'Enter') {
        if (buf.length >= 3) {
          let allFast = true;
          for (let i = 1; i < buf.length; i++) {
            if (buf[i].time - buf[i - 1].time >= 50) { allFast = false; break; }
          }
          if (allFast) {
            e.preventDefault();
            const code = buf.map(b => b.char).join('').trim();
            buf = [];
            openTabRef.current('/pos', 'POS', { duplicate: false });
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('barcode-scan', { detail: code }));
            }, 200);
            return;
          }
        }
        buf = [];
        return;
      }

      if (e.key.length !== 1) return;
      buf.push({ char: e.key, time: Date.now() });
      if (buf.length > 1 && buf[buf.length - 1].time - buf[buf.length - 2].time > 500) {
        buf = [buf[buf.length - 1]];
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrawerToggle = () => setOpen(!open);

  // For staff sessions: only show nav items the staff member has access to.
  // Admin logins (role === 'admin') bypass all feature gating — same as Google sign-in admin.
  const isAdminSession = staffSession?.role === 'admin';
  const sf = (!staffSession || isAdminSession) ? null : (staffSession.features || {});
  const canStaff = (key) => !sf || !!sf[key];

  const navGroups = [
    {
      items: [
        ...(config.features?.dashboard && canStaff('dashboard') ? [{ text: t('nav.dashboard'), icon: <LayoutDashboard size={18} />, path: '/' }] : []),
        ...(config.features?.parties && canStaff('parties') ? [{ text: t('nav.parties'), icon: <Users size={18} />, path: '/parties' }] : []),
        ...(config.features?.items && canStaff('items') ? [{ text: t('nav.items'), icon: <Package size={18} />, path: '/items' }] : []),
      ],
    },
    {
      label: t('nav.transactions'),
      items: [
        ...(config.features?.pos && canStaff('pos') ? [{ text: t('nav.pos'), icon: <Store size={18} />, path: '/pos' }] : []),
        ...(config.features?.sales && canStaff('sales') ? [{ text: t('nav.sales'), icon: <ReceiptText size={18} />, path: '/sales' }] : []),
        ...(config.features?.purchases && canStaff('purchases') ? [{ text: t('nav.purchases'), icon: <ShoppingBag size={18} />, path: '/purchases' }] : []),
        ...(config.features?.expenses && canStaff('expenses') ? [{ text: t('nav.expenses'), icon: <DollarSign size={18} />, path: '/expenses' }] : []),
        ...(config.features?.payments && canStaff('payments') ? [{ text: t('nav.payments'), icon: <Download size={18} />, path: '/payment-in' }] : []),
        ...(!sf && config.features?.staff ? [{ text: t('nav.staff'), icon: <Users size={18} />, path: '/staff' }] : []),
      ],
    },
    {
      label: t('nav.documents'),
      items: [
        ...(config.features?.estimates && canStaff('estimates') ? [{ text: t('nav.estimates'), icon: <FileSearch size={18} />, path: '/estimates' }] : []),
        ...(config.features?.orders && canStaff('orders') ? [{ text: 'Orders', icon: <ClipboardList size={18} />, path: '/orders' }] : []),
        ...(config.features?.creditNotes && canStaff('creditNotes') ? [{ text: t('nav.creditNotes'), icon: <RotateCcw size={18} />, path: '/credit-notes' }] : []),
        ...(config.features?.debitNotes && canStaff('debitNotes') ? [{ text: t('nav.debitNotes'), icon: <CornerUpLeft size={18} />, path: '/debit-notes' }] : []),
        ...(config.features?.deliveryNotes && canStaff('deliveryNotes') ? [{ text: t('nav.deliveryNotes'), icon: <Truck size={18} />, path: '/delivery-notes' }] : []),
      ],
    },
    {
      label: t('nav.accounting'),
      items: [
        ...(config.features?.cash !== false && canStaff('cash') ? [{ text: 'Cash & Bank', icon: <Wallet size={18} />, path: '/cash' }] : []),
        ...(config.features?.calculator !== false ? [{ text: t('nav.calculator'), icon: <CalculatorIcon size={18} />, path: '/calculator' }] : []),
        ...(config.features?.ledger && canStaff('ledger') ? [{ text: t('nav.ledger'), icon: <BookOpen size={18} />, path: '/ledger' }] : []),
        ...(config.features?.membership && canStaff('membership') ? [{ text: t('nav.membership'), icon: <CreditCard size={18} />, path: '/membership' }] : []),
        ...(config.features?.investors && canStaff('investors') ? [{ text: 'Investors', icon: <Handshake size={18} />, path: '/investors' }] : []),
        ...(config.features?.opticals && config.businessType === 'opticals' && canStaff('opticals') ? [{ text: t('nav.opticals'), icon: <Eye size={18} />, path: '/opticals' }] : []),
        ...(config.customSections || []).map(section => ({
          text: section.name,
          icon: <SectionIcon name={section.icon} size={18} />,
          path: `/section/${section.id}`,
        })),
      ],
    },
    {
      label: t('nav.analytics'),
      items: [
        ...(config.features?.reports && canStaff('reports') ? [{ text: t('nav.reports'), icon: <FileText size={18} />, path: '/reports' }] : []),
      ],
    },
    {
      label: t('nav.system'),
      items: [
        ...(!sf ? [{ text: t('nav.backup'), icon: <Database size={18} />, path: '/backup' }] : []),
        ...(!sf ? [{ text: 'Migrate Data', icon: <RefreshCw size={18} />, path: '/migrate' }] : []),
        { text: t('nav.help'), icon: <HelpCircle size={18} />, path: '/help' },
        ...(!sf && config.features?.settings ? [{ text: t('nav.settings'), icon: <Settings size={18} />, path: '/settings' }] : []),
        ...(currentUser && isAdmin ? [{ text: t('nav.admin'), icon: <Settings size={18} />, path: '/admin' }] : []),
      ],
    },
  ];

  const allItems = navGroups.flatMap(g => g.items);

  // Apply the user's custom sidebar order (Settings → Reorder Sidebar), if
  // any: items are sorted by their position in config.sidebarOrder, with
  // unlisted items (new features, custom sections) kept in their original
  // relative order and appended after the ones the user has placed. Group
  // headers are preserved but re-derived from this new order — a header is
  // shown whenever the item's original group differs from the previous
  // item's, so headers stay meaningful even after cross-group dragging.
  const flatWithGroup = navGroups.flatMap(g => g.items.map(item => ({ ...item, _group: g.label || null })));
  const savedOrder = config.sidebarOrder || [];
  const orderedFlat = savedOrder.length
    ? [...flatWithGroup].sort((a, b) => {
        const ai = savedOrder.indexOf(a.path);
        const bi = savedOrder.indexOf(b.path);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : flatWithGroup;
  const displayGroups = [];
  orderedFlat.forEach((item) => {
    const last = displayGroups[displayGroups.length - 1];
    if (last && last._group === item._group) last.items.push(item);
    else displayGroups.push({ label: item._group, _group: item._group, items: [item] });
  });

  // Redirect to first available section when active tab is on a disabled/hidden path
  useEffect(() => {
    if (!activeTab) return;
    const activePath = activeTab.path;
    // Only redirect for paths that are feature-gated (i.e. in the nav system)
    // Always-accessible paths (help, settings, admin, calculator) are excluded
    const alwaysAllowed = ['/settings', '/admin', '/help', '/calculator'];
    if (alwaysAllowed.includes(activePath) || activePath?.startsWith('/section/')) return;
    const navPaths = allItems.map(i => i.path);
    if (!navPaths.includes(activePath)) {
      // Find first available nav item to redirect to
      const fallback = allItems.find(i => i.path !== activePath);
      if (fallback) openTab(fallback.path, fallback.text);
    }
  }, [allItems, activeTab?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPageTitle =
    activeTab?.label ||
    allItems.find(i => i.path === location.pathname)?.text ||
    config.customSections?.find(s => location.pathname === `/section/${s.id}`)?.name ||
    'Accounting';

  const isStaff = !!staffSession;
  const isAdminSessionTop = staffSession?.role === 'admin';
  // For an admin business-code login, staffSession.name is business.name from
  // WHICHEVER business the session was originally created against — stamped
  // once at login and never updated, so it goes stale (still shows the OLD
  // business's name/initial) the instant the user switches to a different
  // local business. currentBusiness (live, from useBusiness()) is the
  // correct source once that's happened — Dashboard already reads from
  // there, which is why it stayed correct while this dropdown didn't.
  // Shown as "Admin" here (matching the Sales/POS "Billed By" convention)
  // since the business name itself is already shown in the caption line
  // below — a genuine non-admin staff member's own name is a person, not a
  // business, so it's unaffected by switching businesses either way.
  const userDisplayName = isAdminSessionTop
    ? 'Admin'
    : isStaff ? staffSession.name : (currentUser?.displayName || 'User');
  const userEmail = isStaff ? `@${staffSession.username}` : currentUser?.email;
  const userInitial = isAdminSessionTop
    ? ((currentBusiness?.name || staffSession.name)?.[0] || 'A').toUpperCase()
    : isStaff
      ? (staffSession.name?.[0] || 'S').toUpperCase()
      : (currentUser?.displayName?.[0] || currentUser?.email?.[0] || 'U').toUpperCase();

  // Scoped to whichever business the switcher is currently prompting for a
  // password to switch INTO — distinct from currentBusiness (the active one).
  const targetBiz = useBusinessAuthDoc(passwordDialog.business, ownerUid);

  // Once the target business's own auth doc resolves, auto-switch immediately
  // if it turns out to have no password set (no prompt needed for that one).
  useEffect(() => {
    if (passwordDialog.open && passwordDialog.business && targetBiz && !targetBiz.adminPassword) {
      switchBusiness(passwordDialog.business._key);
      setPasswordDialog({ open: false, business: null, password: '', error: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordDialog.open, passwordDialog.business, targetBiz]);

  const handlePasswordSubmit = () => {
    if (passwordDialog.business && targetBiz?.adminPassword === passwordDialog.password) {
      switchBusiness(passwordDialog.business._key);
      setPasswordDialog({ open: false, business: null, password: '', error: '' });
    } else {
      setPasswordDialog({ ...passwordDialog, error: 'Incorrect password' });
    }
  };

  const handlePasswordClose = () => {
    setPasswordDialog({ open: false, business: null, password: '', error: '' });
  };

  const drawer = (
    <Box sx={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: BRAND.gradient,
      color: '#fff',
      position: 'relative',
      '&::before': {
        content: '""', position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(120% 60% at 0% 0%, rgba(255,255,255,0.10), transparent 60%)',
      },
    }}>
      {/* Logo */}
      <Box
        sx={{
          px: collapsed ? 0 : 1.75,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          minHeight: APP_BAR_H,
          flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          position: 'relative', zIndex: 1,
        }}
      >
        {collapsed ? (
          <Tooltip title="Expand sidebar" placement="right">
            <IconButton
              size="small"
              onClick={handleDrawerToggle}
              sx={{ p: 0.5, borderRadius: 1.5, bgcolor: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.88)' } }}
            >
              <TallyKraftLogo size={26} variant="icon" />
            </IconButton>
          </Tooltip>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ bgcolor: '#fff', borderRadius: 1.5, p: 0.5, display: 'flex', lineHeight: 0 }}>
                <TallyKraftLogo size={24} variant="icon" />
              </Box>
              <Box component="span" sx={{ fontSize: '1.05rem', lineHeight: 1, letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap', userSelect: 'none' }}>
                <Box component="span" sx={{ fontWeight: 800 }}>Tally</Box>
                <Box component="span" sx={{ fontWeight: 300 }}>Kraft</Box>
              </Box>
            </Box>
            <Tooltip title="Collapse sidebar" placement="right">
              <IconButton
                size="small"
                onClick={handleDrawerToggle}
                sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}
              >
                <ChevronLeft size={16} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Navigation */}
      <Box sx={{
        flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', px: collapsed ? 0 : 1, py: 1,
        position: 'relative', zIndex: 1,
        '&::-webkit-scrollbar': { width: 5 },
        '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.18)', borderRadius: 3 },
      }}>
        {displayGroups.map((group, groupIdx) => (
          <React.Fragment key={groupIdx}>
            {group.label && !collapsed && (
              <Typography variant="overline" sx={{ display: 'block', px: 1.5, pt: 2, pb: 0.5, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', userSelect: 'none' }}>
                {group.label}
              </Typography>
            )}
            {group.label && collapsed && groupIdx > 0 && <Divider sx={{ my: 1, mx: 0.5, borderColor: 'rgba(255,255,255,0.12)' }} />}
            <List dense disablePadding>
              {group.items.map((item) => {
                const isDuplicate = item.path === '/sales' || item.path === '/reports';
                const newLabel = item.path === '/sales' ? 'New Invoice' : 'New Report';
                const selected = activeTab?.path === item.path;
                return (
                  <ListItem key={item.text} disablePadding sx={{ mb: 0.25 }}>
                    <Tooltip title={collapsed ? item.text : ''} placement="right" disableHoverListener={!collapsed}>
                      <ListItemButton
                        dense
                        selected={selected}
                        onClick={() => {
                          openTab(item.path, item.text, { duplicate: false });
                          if (isMobile) setOpen(false);
                        }}
                        sx={{
                          borderRadius: 2, py: 1, px: collapsed ? 0 : 1.25, position: 'relative', flex: 1, minWidth: 0,
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          color: 'rgba(255,255,255,0.78)',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                          '&.Mui-selected': {
                            bgcolor: 'rgba(255,255,255,0.16)', color: '#fff',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
                            '&::before': collapsed ? {} : { content: '""', position: 'absolute', left: -4, top: '22%', bottom: '22%', width: 3, borderRadius: '0 3px 3px 0', backgroundColor: '#fff' },
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.22)' },
                            '& .MuiListItemIcon-root': { color: '#fff' },
                          },
                          '&:not(.Mui-selected)': { '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', color: '#fff', '& .MuiListItemIcon-root': { color: '#fff' } } },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, justifyContent: 'center', color: selected ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                          {item.icon}
                        </ListItemIcon>
                        {!collapsed && (
                          <ListItemText
                            primary={item.text}
                            primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: selected ? 700 : 400, noWrap: true }}
                          />
                        )}
                      </ListItemButton>
                    </Tooltip>

                  </ListItem>
                );
              })}
            </List>
          </React.Fragment>
        ))}
      </Box>

      {/* Business Switcher Footer — hidden for non-admin staff sessions only; admin
          business-code sessions get the same access as Google-auth admins */}
      {config.multiBusiness && (!isStaff || isAdminSession) && (
        <Box sx={{ flexShrink: 0, position: 'relative', zIndex: 1 }}>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
          <Box sx={{ p: collapsed ? 0.75 : 1.25 }}>
            <Tooltip title={collapsed ? (currentBusiness?.name || 'Select Business') : ''} placement="right" disableHoverListener={!collapsed}>
              <ListItemButton
                dense
                onClick={(e) => setBusinessMenuAnchor(e.currentTarget)}
                sx={{
                  borderRadius: 2,
                  border: '1px solid rgba(255,255,255,0.18)',
                  bgcolor: 'rgba(255,255,255,0.06)',
                  py: 0.875,
                  px: collapsed ? 0 : 1.25,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 32, justifyContent: 'center' }}>
                  <Box sx={{ width: 26, height: 26, borderRadius: 1.25, bgcolor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={14} color={BRAND.tealDark} />
                  </Box>
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={currentBusiness?.name || 'Select Business'}
                    secondary="Switch business"
                    primaryTypographyProps={{ fontSize: '0.75rem', fontWeight: 700, noWrap: true, color: '#fff' }}
                    secondaryTypographyProps={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.55)' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      {/* Business Menu — Google-auth sessions and admin business-code sessions alike */}
      {(!isStaff || isAdminSession) && (
        <Menu
          anchorEl={businessMenuAnchor}
          open={Boolean(businessMenuAnchor)}
          onClose={() => setBusinessMenuAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          {businesses.map((biz) => (
            <MenuItem
              key={biz._key}
              selected={biz._key === currentBusiness?._key}
              onClick={() => {
                if (biz._key === currentBusiness?._key) {
                  setBusinessMenuAnchor(null);
                  return;
                }
                setBusinessMenuAnchor(null);
                // "Business Switch Lock" (Settings → Access Control, off by
                // default) — when off, switching is always free regardless
                // of whether this business happens to have an admin
                // password set. When on, fall back to the existing
                // per-business password dialog (which itself still
                // auto-switches for any business that has no password set).
                if (!config.features?.businessSwitchLock) {
                  switchBusiness(biz._key);
                  return;
                }
                setPasswordDialog({ open: true, business: biz, password: '', error: '' });
              }}
            >
              {biz.name}
            </MenuItem>
          ))}
          {config.multiBusiness && <Divider sx={{ my: 0.5 }} />}
          {config.multiBusiness && !isStaff && (
            <MenuItem onClick={() => { openTab('/settings', 'Settings'); setBusinessMenuAnchor(null); }}>
              <ListItemIcon><Plus size={16} /></ListItemIcon>
              Add New Business
            </MenuItem>
          )}
          {config.multiBusiness && isAdminSession && (
            <MenuItem disabled sx={{ opacity: '0.65 !important', whiteSpace: 'normal', fontSize: '0.75rem' }}>
              Log in with email to add a new business
            </MenuItem>
          )}
        </Menu>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          width: { xs: '100%', md: `calc(100% - ${collapsed ? miniWidth : drawerWidth}px)` },
          ml: { xs: 0, md: `${collapsed ? miniWidth : drawerWidth}px` },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          bgcolor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar disableGutters sx={{ px: { xs: 1.5, md: 2 }, minHeight: `${APP_BAR_H}px !important` }}>
          {/* Mobile menu toggle */}
          {isMobile && !open && (
            <IconButton
              color="inherit"
              size="small"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 1.5, color: 'text.secondary' }}
            >
              <MenuIcon size={20} />
            </IconButton>
          )}

          {/* Current page title */}
          <Typography
            noWrap
            sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.95rem', color: 'text.primary', px: 0.5 }}
          >
            {currentPageTitle}
          </Typography>

          {/* Business name pill (desktop only) */}
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              mr: 1,
              px: 1.25,
              py: 0.375,
              borderRadius: 100,
              bgcolor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem' }}>
              {currentBusiness?.name}
            </Typography>
          </Box>

          {/* Payment QR shortcut — quick "scan & pay" for a walk-in customer
              without needing to open a Sales/POS tab first. */}
          {currentBusiness?.upiId && (
            <Tooltip title="Show Payment QR">
              <IconButton
                size="small"
                onClick={() => { setPaymentQrAmount(''); setPaymentQrOpen(true); }}
                sx={{ mr: 1, display: { xs: 'none', sm: 'flex' }, color: BRAND.tealDark, bgcolor: alpha(BRAND.teal, 0.08), border: '1px solid', borderColor: alpha(BRAND.teal, 0.2), '&:hover': { bgcolor: alpha(BRAND.teal, 0.14) } }}
              >
                <QrCode size={16} />
              </IconButton>
            </Tooltip>
          )}

          {/* Business code chip — click to copy */}
          {scopedBiz?.businessCode && (
            <Tooltip title={codeCopied ? 'Copied!' : 'Click to copy business code'}>
              <Chip
                size="small"
                icon={codeCopied ? <Check size={12} /> : <Copy size={12} />}
                label={scopedBiz.businessCode}
                onClick={() => {
                  navigator.clipboard.writeText(scopedBiz.businessCode).catch(() => {});
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                sx={{
                  mr: 1,
                  display: { xs: 'none', sm: 'flex' },
                  height: 24,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  bgcolor: codeCopied ? 'success.light' : alpha(BRAND.teal, 0.1),
                  color: codeCopied ? 'success.dark' : BRAND.tealDark,
                  border: '1px solid',
                  borderColor: codeCopied ? 'success.light' : alpha(BRAND.teal, 0.25),
                  '& .MuiChip-icon': { color: 'inherit' },
                  transition: 'all 0.2s ease',
                }}
              />
            </Tooltip>
          )}

          {/* Auto-save status */}
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <AutoSaveChip />
          </Box>

          {/* Install app button */}
          {showInstallButton && (
            <Tooltip title={isIOS ? 'Install on iPhone / iPad' : 'Install App'}>
              <IconButton
                size="small"
                onClick={handleInstall}
                sx={{
                  mr: 0.75,
                  color: 'primary.main',
                  border: '1px solid',
                  borderColor: 'primary.main',
                  borderRadius: 1.5,
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              >
                <Download size={18} />
              </IconButton>
            </Tooltip>
          )}

          {/* Calculator button */}
          {calculatorEnabled && (
            <Tooltip title="Calculator (Alt+C)">
              <IconButton
                size="small"
                onClick={() => setCalcOpen(true)}
                sx={{ mr: 0.75, color: 'text.secondary', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
              >
                <CalculatorIcon size={16} />
              </IconButton>
            </Tooltip>
          )}

          {/* Fullscreen button */}
          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <IconButton
              size="small"
              onClick={toggleFullscreen}
              sx={{ mr: 0.75, color: 'text.secondary', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
          </Tooltip>

          {/* Shortcuts button */}
          <Tooltip title="Keyboard shortcuts (?)">
            <IconButton
              size="small"
              onClick={() => setShortcutsOpen(true)}
              sx={{ mr: 0.75, color: 'text.secondary', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
            >
              <Keyboard size={16} />
            </IconButton>
          </Tooltip>

          {/* Subscription status pill — trial or expired */}
          {showSubscribePill && (
            <Box
              onClick={() => navigate(`/subscribe?bId=${currentBizId || 1}`)}
              sx={{
                mr: 1, display: 'flex', alignItems: 'center', gap: 0.6,
                px: { xs: 1, sm: 1.25 }, height: 28, borderRadius: '100px',
                cursor: 'pointer', userSelect: 'none', border: '1px solid',
                transition: 'all 0.15s ease',
                ...(isExpired ? {
                  bgcolor: alpha('#ef4444', 0.08), borderColor: alpha('#ef4444', 0.3), color: '#dc2626',
                  '&:hover': { bgcolor: alpha('#ef4444', 0.14), borderColor: alpha('#ef4444', 0.5) },
                } : {
                  bgcolor: alpha('#f59e0b', 0.08), borderColor: alpha('#f59e0b', 0.3), color: '#b45309',
                  '&:hover': { bgcolor: alpha('#f59e0b', 0.14), borderColor: alpha('#f59e0b', 0.5) },
                }),
              }}
            >
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                bgcolor: isExpired ? '#ef4444' : '#f59e0b',
                boxShadow: `0 0 0 0 ${isExpired ? '#ef444466' : '#f59e0b66'}`,
                animation: 'pulse-ring 1.8s ease-out infinite',
                '@keyframes pulse-ring': {
                  '0%': { boxShadow: `0 0 0 0 ${isExpired ? '#ef444455' : '#f59e0b55'}` },
                  '70%': { boxShadow: `0 0 0 5px transparent` },
                  '100%': { boxShadow: `0 0 0 0 transparent` },
                },
              }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', lineHeight: 1, whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>
                {isExpired ? 'Expired · Renew' : daysLeft !== null ? `${daysLeft}d left · Upgrade` : 'Trial · Upgrade'}
              </Typography>
              <Crown size={12} style={{ flexShrink: 0 }} />
            </Box>
          )}

          {/* User avatar + menu */}
          <Tooltip title={userEmail || 'Account'}>
            <IconButton
              size="small"
              onClick={(e) => setUserMenuAnchor(e.currentTarget)}
              sx={{ p: 0.5 }}
            >
              <Avatar
                src={!isStaff ? currentUser?.photoURL : undefined}
                sx={{
                  width: 30, height: 30, fontSize: '0.75rem', fontWeight: 700,
                  bgcolor: '#fff',
                  color: BRAND.tealDark,
                  border: `1.5px solid ${BRAND.teal}`,
                }}
              >
                {userInitial}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={() => setUserMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { minWidth: 220, mt: 0.75 } }}
          >
            <ListSubheader disableSticky sx={{ px: 2, py: 1.5, lineHeight: 1.4, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Typography variant="subtitle2" noWrap sx={{ color: 'text.primary' }}>
                {userDisplayName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {userEmail}
              </Typography>
              {isStaff && (
                <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                  {isAdminSessionTop ? 'Admin' : 'Staff'} · {currentBusiness?.name || staffSession.businessName}
                </Typography>
              )}
            </ListSubheader>
            <MenuItem
              onClick={() => { setUserMenuAnchor(null); setSignOutOpen(true); }}
              sx={{ mt: 0.5, color: 'error.main', '& .MuiListItemIcon-root': { color: 'error.main' } }}
            >
              <ListItemIcon><LogOut size={16} /></ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>

        {/* Multi-instance sub-strip — only visible when active tab is sales or reports */}
        {!isMobile && <MultiTabStrip activeTabPath={activeTab?.path} />}
      </AppBar>

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{
          width: { xs: 0, md: collapsed ? miniWidth : drawerWidth },
          flexShrink: { md: 0 },
          transition: 'width 0.25s ease',
        }}
      >
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? open : true}
          onClose={handleDrawerToggle}
          sx={{
            '& .MuiDrawer-paper': {
              width: isMobile ? drawerWidth : (collapsed ? miniWidth : drawerWidth),
              boxSizing: 'border-box',
              overflowX: 'hidden',
              transition: 'width 0.25s ease',
              border: 'none',
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: '100%', md: `calc(100% - ${collapsed ? miniWidth : drawerWidth}px)` },
          mt: (() => {
            if (isMobile) return `${APP_BAR_H}px`;
            const hasStrip = (activeTab?.path === '/sales' || activeTab?.path === '/reports') && tabs.some(t => t.path === activeTab?.path);
            return `${APP_BAR_H + (hasStrip ? 38 : 0)}px`;
          })(),
          minWidth: 0,
          transition: 'margin-top 0.15s ease',
          display: 'flex', flexDirection: 'column', minHeight: `calc(100vh - ${APP_BAR_H}px)`,
        }}
      >
        {/* Read-only banner — shown when subscription is expired */}
        {isExpired && (
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5,
            px: 2, py: 0.75, bgcolor: alpha('#ef4444', 0.08),
            borderBottom: `1px solid ${alpha('#ef4444', 0.2)}`,
          }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ef4444', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.775rem', fontWeight: 600, color: '#dc2626' }}>
              Your subscription has expired. Data is read-only — renew to create, edit, print, or export.
            </Typography>
            <Button size="small" variant="outlined" onClick={() => navigate(`/subscribe?bId=${currentBizId || 1}`)}
              sx={{ flexShrink: 0, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', borderColor: alpha('#ef4444', 0.5), color: '#dc2626', borderRadius: 1.5, py: 0.25, px: 1, '&:hover': { bgcolor: alpha('#ef4444', 0.08), borderColor: '#dc2626' } }}>
              Renew Now
            </Button>
          </Box>
        )}
        {/* Keep-alive tab content — all mounted tabs rendered, only active one visible */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          {tabs.map(tab => (
            <Box
              key={tab.id}
              sx={{
                display: activeTabId === tab.id ? 'block' : 'none',
                p: { xs: 1.5, sm: 2, md: 2.5 },
                pb: { xs: isXs ? '72px' : 1.5, sm: 2, md: 2.5 },
              }}
            >
              {mountedIds.has(tab.id) && (
                <TabErrorBoundary key={tab.id}>
                  <Suspense fallback={<PageLoadingFallback />}>
                    <TabPageRenderer path={tab.path} tabId={tab.id} />
                  </Suspense>
                </TabErrorBoundary>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Mobile bottom navigation bar (xs only) */}
      {isXs && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            zIndex: theme.zIndex.appBar,
            borderTop: '1px solid', borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <BottomNavigation
            value={activeTab?.path || '/'}
            onChange={(_, path) => openTab(path, pathLabel(path), { duplicate: false })}
            sx={{ height: 60, pr: '64px' }}
          >
            {config.features?.dashboard && (
              <BottomNavigationAction label="Home" value="/" icon={<LayoutDashboard size={22} />} sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }} />
            )}
            {config.features?.sales && (
              <BottomNavigationAction label="Sales" value="/sales" icon={<ReceiptText size={22} />} sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }} />
            )}
            {config.features?.purchases && (
              <BottomNavigationAction label="Purchases" value="/purchases" icon={<ShoppingBag size={22} />} sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }} />
            )}
            {config.features?.parties && (
              <BottomNavigationAction label="Parties" value="/parties" icon={<Users size={22} />} sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }} />
            )}
            {config.features?.items && (
              <BottomNavigationAction label="Items" value="/items" icon={<Package size={22} />} sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }} />
            )}
          </BottomNavigation>

          <Box
            onClick={() => setOpen(true)}
            sx={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 64,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.25,
              cursor: 'pointer', color: 'text.secondary',
              borderLeft: '1px solid', borderColor: 'divider',
              userSelect: 'none', bgcolor: 'background.paper',
              '&:active': { bgcolor: 'action.selected' },
            }}
          >
            <MenuIcon size={22} />
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 500, lineHeight: 1 }}>More</Typography>
          </Box>
        </Paper>
      )}

      {/* Business Switch Password Dialog */}
      <Dialog open={passwordDialog.open} onClose={handlePasswordClose} maxWidth="xs" fullWidth>
        <DialogTitle>Switch to {passwordDialog.business?.name}</DialogTitle>
        <DialogContent>
          {targetBiz === null ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 0.5 }}>
                Enter the password for this business to switch to it.
              </Typography>
              <TextField
                fullWidth label="Password" type="password"
                value={passwordDialog.password}
                onChange={(e) => setPasswordDialog({ ...passwordDialog, password: e.target.value, error: '' })}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                error={!!passwordDialog.error}
                helperText={passwordDialog.error}
                autoFocus
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePasswordClose} variant="outlined">Cancel</Button>
          <Button onClick={handlePasswordSubmit} variant="contained" disabled={targetBiz === null}>Switch Business</Button>
        </DialogActions>
      </Dialog>

      {/* Payment QR shortcut — an amount is optional; leaving it blank
          generates an "any amount" QR the customer can fill in themselves. */}
      <Dialog open={paymentQrOpen} onClose={() => setPaymentQrOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem' }}>Scan & Pay</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 3 }}>
          <TextField
            fullWidth
            size="small"
            type="number"
            label="Amount (optional)"
            placeholder="Leave blank for any amount"
            value={paymentQrAmount}
            onChange={(e) => setPaymentQrAmount(e.target.value)}
            onFocus={(e) => e.target.select()}
            autoFocus
            slotProps={{ input: { startAdornment: <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>₹</Typography>, min: 0, step: 0.01 } }}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'inline-flex', p: 1.5, bgcolor: '#fff', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <UpiQrImage
              value={buildUpiUri({
                upiId: currentBusiness?.upiId,
                payeeName: currentBusiness?.name,
                amount: Number(paymentQrAmount) || undefined,
              })}
              size={220}
            />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', color: BRAND.tealDark, mt: 1.5 }}>
            {Number(paymentQrAmount) > 0 ? `₹${Number(paymentQrAmount).toFixed(2)}` : 'Any amount'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            Scan with any UPI app to pay
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentQrOpen(false)} sx={{ textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Calculator Popup */}
      {calculatorEnabled && (
        <Dialog
          open={calcOpen}
          onClose={() => setCalcOpen(false)}
          maxWidth="xs" fullWidth fullScreen={isXs}
          PaperProps={{ sx: { borderRadius: { xs: 0, sm: 3 } } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.5, pb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.primary.main, 0.75)} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalculatorIcon size={17} color="#fff" />
              </Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Calculator</Typography>
            </Box>
            <Tooltip title="Close (Esc / Alt+C)">
              <IconButton size="small" onClick={() => setCalcOpen(false)} sx={{ color: 'text.secondary' }}>
                <TabClose size={18} />
              </IconButton>
            </Tooltip>
          </Box>
          <DialogContent sx={{ pt: 1 }}>
            <Suspense fallback={<PageLoadingFallback />}>
              <Calculator embedded />
            </Suspense>
          </DialogContent>
        </Dialog>
      )}

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 800, pb: 1 }}>
          <Box sx={{ p: 0.875, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'flex' }}>
            <Keyboard size={18} color={theme.palette.primary.main} />
          </Box>
          Keyboard Shortcuts
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          {[
            {
              title: 'Navigation — press G then a letter',
              color: BRAND.tealDark,
              seq: true,
              items: [
                { keys: ['G', 'H'], label: 'Dashboard (Home)' },
                { keys: ['G', 'S'], label: 'Sales' },
                { keys: ['G', 'P'], label: 'Purchases' },
                { keys: ['G', 'E'], label: 'Expenses' },
                { keys: ['G', 'R'], label: 'Reports' },
                { keys: ['G', 'A'], label: 'Parties' },
                { keys: ['G', 'I'], label: 'Items' },
                { keys: ['G', 'J'], label: 'Payments' },
              ],
            },
            {
              title: 'Sales & Invoicing',
              color: '#4f46e5',
              items: [
                { keys: ['G', 'N'], label: 'New sales invoice (in list view)', seq: true },
                { keys: ['G', 'B'], label: 'New purchase bill (in list view)', seq: true },
                { keys: ['Ctrl', 'S'], label: 'Save', macKeys: ['⌘', 'S'] },
                { keys: ['Ctrl', '↵'], label: 'Save & create new', macKeys: ['⌘', '↵'] },
                { keys: ['Esc'], label: 'Cancel / Back to list' },
              ],
            },
            {
              title: 'General',
              color: '#d97706',
              items: [
                ...(calculatorEnabled ? [{ keys: ['Alt', 'C'], label: 'Open / close calculator' }] : []),
                { keys: ['?'], label: 'Show keyboard shortcuts' },
              ],
            },
          ].map((group) => (
            <Box key={group.title} sx={{ mb: 2.5 }}>
              <Typography variant="overline" sx={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', color: group.color, display: 'block', mb: 1 }}>
                {group.title}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {group.items.map((item) => {
                  const isMac = /mac/i.test(navigator.platform);
                  const displayKeys = isMac && item.macKeys ? item.macKeys : item.keys;
                  const sep = (item.seq ?? group.seq) ? 'then' : '+';
                  return (
                    <Stack key={item.label} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.625, px: 1.25, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.primary' }}>{item.label}</Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {displayKeys.map((k, i) => (
                          <React.Fragment key={`${k}-${i}`}>
                            <Chip label={k} size="small" sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace', bgcolor: 'action.selected', border: '1px solid', borderColor: 'divider', borderRadius: 1, '& .MuiChip-label': { px: 0.875 } }} />
                            {i < displayKeys.length - 1 && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem', lineHeight: 1 }}>{sep}</Typography>}
                          </React.Fragment>
                        ))}
                      </Stack>
                    </Stack>
                  );
                })}
              </Box>
            </Box>
          ))}
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1, fontSize: '0.7rem' }}>
            Shortcuts do not trigger when typing in a text field.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShortcutsOpen(false)} variant="contained" disableElevation sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>
            Got it
          </Button>
        </DialogActions>
      </Dialog>

      <BusinessSetupDialog />

      {/* iOS install instructions */}
      <Dialog open={iosInstallOpen} onClose={() => setIosInstallOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Download size={20} />
          Install on iPhone / iPad
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Safari is required to install this app. Follow these steps:
          </Typography>
          {[
            'Open this page in Safari (not Chrome)',
            'Tap the Share button at the bottom of the screen',
            'Scroll down and tap "Add to Home Screen"',
            'Tap "Add" in the top-right corner',
          ].map((step, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.25, alignItems: 'flex-start' }}>
              <Box sx={{ minWidth: 24, height: 24, borderRadius: '50%', bgcolor: 'primary.main', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                {i + 1}
              </Box>
              <Typography variant="body2">{step}</Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIosInstallOpen(false)} variant="contained" disableElevation>Got it</Button>
        </DialogActions>
      </Dialog>

      {/* Sign-out confirmation */}
      <Dialog open={signOutOpen} onClose={() => setSignOutOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}>
          <ShieldCheck size={22} color="#16a34a" />
          Sign Out
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">Are you sure you want to sign out?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, gap: 1 }}>
          <Button onClick={() => setSignOutOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained" color="error"
            startIcon={<LogOut size={16} />}
            onClick={() => { setSignOutOpen(false); logout(); }}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Sign Out
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Layout;
