import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useData } from './DataContext';
import { useTabs, pathLabel } from './TabsContext';
// All page components — rendered inside keep-alive tabs
import Dashboard from './Dashboard';
import Parties from './Parties';
import Items from './Items';
import Sales from './Sales';
import POS from './POS';
import Expenses from './Expenses';
import Cash from './Cash';
import Calculator from './Calculator';
import Opticals from './Opticals';
import Estimates from './Estimates';
import CreditNotes from './CreditNotes';
import DebitNotes from './DebitNotes';
import DeliveryNotes from './DeliveryNotes';
import CustomSection from './CustomSection';
import StaffPage from './StaffPage';
import PaymentEntry from './PaymentEntry';
import Reports from './Reports';
import Backup from './Backup';
import SettingsPage from './Settings';
import Admin from './Admin';
import LedgerPage from './Ledger';
import MembershipPage from './Membership';
import Help from './Help';
import {
  Box, Drawer, AppBar, Toolbar, List, Typography, Divider, IconButton,
  ListItem, ListItemButton, ListItemIcon, ListItemText, Avatar, Menu, MenuItem,
  Tooltip, useTheme, useMediaQuery, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, alpha, Popover, BottomNavigation, BottomNavigationAction, Paper,
  CircularProgress, Stack, Chip
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
  ChevronDown,
  Check,
  ShieldCheck,
  CreditCard,
  Crown,
  Keyboard,
  Wallet,
  Calculator as CalculatorIcon,
  X as TabClose,
  HelpCircle,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBusiness } from './BusinessContext';
import { useAuth } from './AuthContext';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import SectionIcon from './SectionIcon';
import { useDialog } from './DialogContext';
import BusinessSetupDialog from './BusinessSetupDialog';
import TallyKraftLogo from './TallyKraftLogo';
import { useI18n } from './i18n/I18nContext';

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
  '/credit-notes': 'creditNotes',
  '/debit-notes': 'debitNotes',
  '/delivery-notes': 'deliveryNotes',
  '/ledger': 'ledger',
  '/membership': 'membership',
  '/opticals': 'opticals',
};

// ── Tab content renderer — maps a path to its page component ────────────────
const TabPageRenderer = ({ path }) => {
  const { staffSession } = useAuth();

  if (staffSession) {
    const isCustomSection = path?.startsWith('/section/');
    const featureKey = isCustomSection ? null : STAFF_ROUTE_FEATURES[path];
    const isListed = isCustomSection || Object.prototype.hasOwnProperty.call(STAFF_ROUTE_FEATURES, path);
    // Block if: route is admin-only (not listed) OR required feature not granted
    const blocked = !isListed || (featureKey !== null && !staffSession.features?.[featureKey]);
    if (blocked) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 2, color: 'text.secondary' }}>
          <ShieldCheck size={48} strokeWidth={1.2} />
          <Typography variant="h6" fontWeight={700} color="text.primary">Access Restricted</Typography>
          <Typography variant="body2" textAlign="center" maxWidth={320}>
            You don&apos;t have permission to view this section. Contact your admin to request access.
          </Typography>
        </Box>
      );
    }
  }

  if (path === '/') return <Dashboard />;
  if (path === '/parties') return <Parties />;
  if (path === '/items') return <Items />;
  if (path === '/pos') return <POS />;
  if (path === '/sales') return <Sales />;
  if (path === '/purchases') return <Sales mode="purchase" />;
  if (path === '/expenses') return <Expenses />;
  if (path === '/cash') return <Cash />;
  if (path === '/calculator') return <Calculator />;
  if (path === '/payment-in') return <PaymentEntry mode="payment-in" />;
  if (path === '/payment-out') return <PaymentEntry mode="payment-out" />;
  if (path === '/opticals') return <Opticals />;
  if (path === '/estimates') return <Estimates />;
  if (path === '/credit-notes') return <CreditNotes />;
  if (path === '/debit-notes') return <DebitNotes />;
  if (path === '/delivery-notes') return <DeliveryNotes />;
  if (path === '/staff') return <StaffPage />;
  if (path === '/ledger') return <LedgerPage />;
  if (path === '/membership') return <MembershipPage />;
  if (path === '/reports') return <Reports />;
  if (path === '/backup') return <Backup />;
  if (path === '/help') return <Help />;
  if (path === '/settings') return <SettingsPage />;
  if (path === '/admin') return <Admin />;
  if (path?.startsWith('/section/')) return <CustomSection sectionId={path.replace('/section/', '')} />;
  return <Dashboard />;
};

// ── Multi-instance tab sub-strip ─────────────────────────────────────────────
// Shown below the AppBar only when there are 2+ tabs open for the same path
// (Sales or Reports). Each chip = one open instance; × closes it.
const MultiTabStrip = () => {
  const { tabs, activeTabId, activateTab, closeTab } = useTabs();
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const salesTabs = tabs.filter(t => t.path === '/sales');
  const reportTabs = tabs.filter(t => t.path === '/reports');
  const multiTabs = [
    ...(salesTabs.length >= 2 ? salesTabs : []),
    ...(reportTabs.length >= 2 ? reportTabs : []),
  ];
  if (multiTabs.length === 0) return null;

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
      {multiTabs.map(tab => {
        const isActive = tab.id === activeTabId;
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
                bgcolor: alpha(primary, 0.1),
                borderColor: alpha(primary, 0.28),
              } : {
                bgcolor: 'transparent',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover', borderColor: alpha(primary, 0.18) },
              }),
            }}
          >
            <Typography noWrap sx={{
              fontSize: '0.71rem', fontWeight: isActive ? 700 : 500, flex: 1, minWidth: 0,
              color: isActive ? 'primary.main' : 'text.secondary', lineHeight: 1,
            }}>
              {tab.label}
            </Typography>
            <Box
              component="span"
              onClick={e => closeTab(tab.id, e)}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '3px', flexShrink: 0,
                color: isActive ? 'primary.main' : 'text.disabled',
                opacity: isActive ? 0.7 : 0.45,
                '&:hover': { opacity: 1, bgcolor: alpha(primary, 0.12), color: 'primary.main' },
              }}
            >
              <TabClose size={9} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

const NavSectionLabel = ({ label }) => (
  <Typography
    variant="overline"
    sx={{
      display: 'block',
      px: 1.5,
      pt: 2,
      pb: 0.5,
      fontSize: '0.625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: 'text.disabled',
      userSelect: 'none',
    }}
  >
    {label}
  </Typography>
);

const NavItem = ({ item, isActive, onClick }) => (
  <ListItem disablePadding sx={{ mb: 0.25 }}>
    <ListItemButton
      dense
      onClick={onClick}
      selected={isActive}
      sx={{
        borderRadius: 1.5,
        py: 0.75,
        px: 1.25,
        position: 'relative',
        '&.Mui-selected': {
          bgcolor: 'rgba(79,70,229,0.08)',
          color: 'primary.main',
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0, top: '20%', bottom: '20%',
            width: 3,
            borderRadius: '0 2px 2px 0',
            backgroundColor: 'currentColor',
          },
          '&:hover': { bgcolor: 'rgba(79,70,229,0.12)' },
          '& .MuiListItemIcon-root': { color: 'primary.main' },
        },
        '&:not(.Mui-selected)': {
          color: 'text.secondary',
          '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 34, color: isActive ? 'primary.main' : 'text.disabled' }}>
        {item.icon}
      </ListItemIcon>
      <ListItemText
        primary={item.text}
        primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400 }}
      />
    </ListItemButton>
  </ListItem>
);

// Shows "Saving…" while a write is in flight, then "Saved" for 1.5 s, then disappears.
// Uses a stable ref-based approach so rapid saving=true/false flips (React batching
// timing) don't flash the chip multiple times — only one cycle per user action.
const AutoSaveChip = React.memo(() => {
  const { saving } = useData();
  const [label, setLabel] = React.useState(null); // null = hidden
  const hideTimer = React.useRef(null);
  const savingTimer = React.useRef(null);

  React.useEffect(() => {
    if (saving) {
      // Show "Saving…" immediately and cancel any pending hide.
      clearTimeout(hideTimer.current);
      clearTimeout(savingTimer.current);
      setLabel('saving');
    } else if (label === 'saving') {
      // Transition to "Saved" only if we were showing "Saving…".
      // Small delay avoids a one-frame flicker when saving=true→false very fast.
      savingTimer.current = setTimeout(() => {
        setLabel('saved');
        hideTimer.current = setTimeout(() => setLabel(null), 1500);
      }, 50);
    }
    return () => {
      clearTimeout(hideTimer.current);
      clearTimeout(savingTimer.current);
    };
  }, [saving]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!label) return null;

  return (
    <Box
      sx={{
        display: { xs: 'none', sm: 'flex' },
        alignItems: 'center',
        gap: 0.5,
        mr: 1,
        px: 1,
        py: 0.4,
        borderRadius: 100,
        bgcolor: label === 'saving' ? 'warning.light' : 'success.light',
        border: '1px solid',
        borderColor: label === 'saving' ? 'warning.main' : 'success.main',
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
    >
      {label === 'saving'
        ? <CircularProgress size={10} thickness={5} sx={{ color: 'warning.dark' }} />
        : <ShieldCheck size={11} color="#166534" />}
      <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: label === 'saving' ? 'warning.dark' : 'success.dark', lineHeight: 1 }}>
        {label === 'saving' ? 'Saving…' : 'Saved ✓'}
      </Typography>
    </Box>
  );
});

const Layout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(!isMobile);
  // On desktop the sidebar never fully hides — when "closed" it shrinks to an
  // icons-only rail. On mobile it remains a temporary overlay that toggles fully.
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
  const { logout, currentUser, isAdmin, staffSession } = useAuth();
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
  const { getItems, backupNow } = useData();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const calculatorEnabled = config.features?.calculator !== false;
  const [calcOpen, setCalcOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
      // Calculator popup toggle (Alt+C) — works even while typing so it can be
      // dismissed from anywhere. Gated on the feature being enabled.
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
          openTab('/sales', 'New Invoice', { duplicate: true });
          return;
        }
        if (e.code === 'KeyB') {
          e.preventDefault();
          openTab('/purchases', 'New Purchase', { duplicate: true });
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

  const handleDrawerToggle = () => setOpen(!open);

  // For staff sessions: only show nav items the staff member has access to
  const sf = staffSession?.features || null;
  const canStaff = (key) => !sf || !!sf[key];

  // Navigation groups — all existing items preserved
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
        { text: t('nav.help'), icon: <HelpCircle size={18} />, path: '/help' },
        ...(!sf && config.features?.settings ? [{ text: t('nav.settings'), icon: <Settings size={18} />, path: '/settings' }] : []),
        ...(currentUser && isAdmin ? [{ text: t('nav.admin'), icon: <Settings size={18} />, path: '/admin' }] : []),
      ],
    },
  ];

  const visibleGroups = navGroups.filter(g => g.items.length > 0);

  // Flat list of all items for finding the current page title
  const allItems = navGroups.flatMap(g => g.items);

  const currentPageTitle =
    allItems.find(i => i.path === location.pathname)?.text ||
    config.customSections?.find(s => location.pathname === `/section/${s.id}`)?.name ||
    'Accounting';

  const isStaff = !!staffSession;
  const userDisplayName = isStaff ? staffSession.name : (currentUser?.displayName || 'User');
  const userEmail = isStaff ? `@${staffSession.username}` : currentUser?.email;
  const userInitial = isStaff
    ? (staffSession.name?.[0] || 'S').toUpperCase()
    : (currentUser?.displayName?.[0] || currentUser?.email?.[0] || 'U').toUpperCase();

  const handlePasswordSubmit = () => {
    if (passwordDialog.business && passwordDialog.business.password === passwordDialog.password) {
      switchBusiness(passwordDialog.business.id);
      setPasswordDialog({ open: false, business: null, password: '', error: '' });
    } else {
      setPasswordDialog({ ...passwordDialog, error: 'Incorrect password' });
    }
  };

  const handlePasswordClose = () => {
    setPasswordDialog({ open: false, business: null, password: '', error: '' });
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Logo */}
      <Box
        sx={{
          px: collapsed ? 0 : 1.75,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          minHeight: APP_BAR_H,
          flexShrink: 0,
          borderBottom: '1.5px solid',
          borderColor: 'divider',
        }}
      >
        {collapsed ? (
          // Mini rail: show the icon-only logo; clicking it expands the sidebar.
          <Tooltip title="Expand sidebar" placement="right">
            <IconButton
              size="small"
              onClick={handleDrawerToggle}
              sx={{ p: 0.5, borderRadius: 1.5 }}
            >
              <TallyKraftLogo size={30} variant="icon" />
            </IconButton>
          </Tooltip>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <TallyKraftLogo size={44} variant="wordmark" />
            </Box>
            <Tooltip title="Collapse sidebar" placement="right">
              <IconButton
                size="small"
                onClick={handleDrawerToggle}
                sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
              >
                <ChevronLeft size={16} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      <Divider />

      {/* Navigation */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', px: collapsed ? 0.75 : 1, py: 1 }}>
        {visibleGroups.map((group, groupIdx) => (
          <React.Fragment key={groupIdx}>
            {group.label && !collapsed && <NavSectionLabel label={group.label} />}
            {group.label && collapsed && groupIdx > 0 && <Divider sx={{ my: 1, mx: 0.5 }} />}
            <List dense disablePadding>
              {group.items.map((item) => {
                const isDuplicate = item.path === '/sales' || item.path === '/purchases' || item.path === '/reports';
                const newLabel = item.path === '/sales' ? 'New Invoice' : item.path === '/purchases' ? 'New Purchase' : 'New Report';
                return (
                  <ListItem key={item.text} disablePadding sx={{ mb: 0.25 }}>
                    {/* Main nav button */}
                    <Tooltip title={collapsed ? item.text : ''} placement="right" disableHoverListener={!collapsed}>
                      <ListItemButton
                        dense
                        selected={activeTab?.path === item.path}
                        onClick={() => {
                          openTab(item.path, item.text, { duplicate: false });
                          if (isMobile) setOpen(false);
                        }}
                        sx={{
                          borderRadius: 1.5, py: 0.75, px: collapsed ? 0 : 1.25, position: 'relative', flex: 1, minWidth: 0,
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          '&.Mui-selected': {
                            bgcolor: 'rgba(79,70,229,0.08)', color: 'primary.main',
                            '&::before': collapsed ? {} : { content: '""', position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: '0 2px 2px 0', backgroundColor: 'currentColor' },
                            '&:hover': { bgcolor: 'rgba(79,70,229,0.12)' },
                            '& .MuiListItemIcon-root': { color: 'primary.main' },
                          },
                          '&:not(.Mui-selected)': { color: 'text.secondary', '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, justifyContent: 'center', color: activeTab?.path === item.path ? 'primary.main' : 'text.disabled' }}>
                          {item.icon}
                        </ListItemIcon>
                        {!collapsed && (
                          <ListItemText
                            primary={item.text}
                            primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: activeTab?.path === item.path ? 600 : 400, noWrap: true }}
                          />
                        )}
                      </ListItemButton>
                    </Tooltip>

                    {/* + button — only for Sales and Purchases (hidden when collapsed or on mobile) */}
                    {isDuplicate && !collapsed && !isMobile && (
                      <Tooltip title={newLabel} placement="right">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTab(item.path, newLabel, { duplicate: true });
                            if (isMobile) setOpen(false);
                          }}
                          sx={{
                            ml: 0.25, mr: 0.25, width: 26, height: 26, flexShrink: 0,
                            color: 'text.disabled', borderRadius: 1.25,
                            '&:hover': { color: 'primary.main', bgcolor: 'rgba(79,70,229,0.08)' },
                          }}
                        >
                          <Plus size={14} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </ListItem>
                );
              })}
            </List>
          </React.Fragment>
        ))}
      </Box>

      {/* Business Switcher Footer — hidden for staff (they always belong to one business) */}
      {config.multiBusiness && !isStaff && (
        <Box sx={{ flexShrink: 0 }}>
          <Divider />
          <Box sx={{ p: collapsed ? 0.75 : 1.25 }}>
            <Tooltip title={collapsed ? (currentBusiness?.name || 'Select Business') : ''} placement="right" disableHoverListener={!collapsed}>
              <ListItemButton
                dense
                onClick={(e) => setBusinessMenuAnchor(e.currentTarget)}
                sx={{
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  py: 0.875,
                  px: collapsed ? 0 : 1.25,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 32, justifyContent: 'center' }}>
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: 1,
                      bgcolor: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Store size={13} color="white" />
                  </Box>
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={currentBusiness?.name || 'Select Business'}
                    secondary="Switch business"
                    primaryTypographyProps={{ fontSize: '0.75rem', fontWeight: 700, noWrap: true, color: 'text.primary' }}
                    secondaryTypographyProps={{ fontSize: '0.625rem', color: 'text.disabled' }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      {/* Business Menu */}
      <Menu
        anchorEl={businessMenuAnchor}
        open={Boolean(businessMenuAnchor)}
        onClose={() => setBusinessMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {businesses.map((biz) => (
          <MenuItem
            key={biz.id}
            selected={biz.id === currentBusiness?.id}
            onClick={() => {
              if (biz.id === currentBusiness?.id) {
                setBusinessMenuAnchor(null);
                return;
              }
              if (biz.password) {
                setPasswordDialog({ open: true, business: biz, password: '', error: '' });
              } else {
                switchBusiness(biz.id);
              }
              setBusinessMenuAnchor(null);
            }}
          >
            {biz.name}
          </MenuItem>
        ))}
        {config.multiBusiness && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem onClick={() => { openTab('/settings', 'Settings'); setBusinessMenuAnchor(null); }}>
              <ListItemIcon><Plus size={16} /></ListItemIcon>
              Add New Business
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
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
        }}
      >
        <Toolbar disableGutters sx={{ px: { xs: 1.5, md: 2 }, minHeight: `${APP_BAR_H}px !important` }}>
          {/* Menu toggle — mobile only (desktop has its own collapse toggle in the
              sidebar, which now stays visible as an icon rail). */}
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
              mr: 1.5,
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

          {/* Auto-save status indicator — hidden on mobile */}
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <AutoSaveChip />
          </Box>



          {/* Install app button — icon only on mobile */}
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
                cursor: 'pointer', userSelect: 'none',
                border: '1px solid',
                transition: 'all 0.15s ease',
                ...(isExpired ? {
                  bgcolor: alpha('#ef4444', 0.08),
                  borderColor: alpha('#ef4444', 0.3),
                  color: '#dc2626',
                  '&:hover': { bgcolor: alpha('#ef4444', 0.14), borderColor: alpha('#ef4444', 0.5) },
                } : {
                  bgcolor: alpha('#f59e0b', 0.08),
                  borderColor: alpha('#f59e0b', 0.3),
                  color: '#b45309',
                  '&:hover': { bgcolor: alpha('#f59e0b', 0.14), borderColor: alpha('#f59e0b', 0.5) },
                }),
              }}
            >
              {/* Pulsing dot */}
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                bgcolor: isExpired ? '#ef4444' : '#f59e0b',
                boxShadow: `0 0 0 0 ${isExpired ? '#ef444466' : '#f59e0b66'}`,
                animation: 'pulse-ring 1.8s ease-out infinite',
                '@keyframes pulse-ring': {
                  '0%':   { boxShadow: `0 0 0 0 ${isExpired ? '#ef444455' : '#f59e0b55'}` },
                  '70%':  { boxShadow: `0 0 0 5px transparent` },
                  '100%': { boxShadow: `0 0 0 0 transparent` },
                },
              }} />
              <Typography sx={{
                fontWeight: 700, fontSize: '0.72rem', lineHeight: 1,
                whiteSpace: 'nowrap',
                display: { xs: 'none', sm: 'block' },
              }}>
                {isExpired
                  ? 'Expired · Renew'
                  : daysLeft !== null
                    ? `${daysLeft}d left · Upgrade`
                    : 'Trial · Upgrade'}
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
                  width: 30,
                  height: 30,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  bgcolor: isStaff ? 'secondary.main' : 'primary.main',
                  color: '#fff',
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
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" noWrap sx={{ color: 'text.primary' }}>
                {userDisplayName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {userEmail}
              </Typography>
              {isStaff && (
                <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                  Staff · {staffSession.businessName}
                </Typography>
              )}
            </Box>
            <MenuItem
              onClick={() => { setUserMenuAnchor(null); setSignOutOpen(true); }}
              sx={{ mt: 0.5, color: 'error.main', '& .MuiListItemIcon-root': { color: 'error.main' } }}
            >
              <ListItemIcon><LogOut size={16} /></ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>

        {/* Multi-instance sub-strip — only visible when ≥2 Sales or Reports tabs are open */}
        {!isMobile && <MultiTabStrip />}

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
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main content — offset for the unified AppBar + optional multi-tab strip */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: '100%', md: `calc(100% - ${collapsed ? miniWidth : drawerWidth}px)` },
          mt: (() => {
            if (isMobile) return `${APP_BAR_H}px`;
            const salesTabs = tabs.filter(t => t.path === '/sales');
            const reportTabs = tabs.filter(t => t.path === '/reports');
            const hasStrip = salesTabs.length >= 2 || reportTabs.length >= 2;
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
              {mountedIds.has(tab.id) && <TabPageRenderer path={tab.path} />}
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Mobile bottom navigation bar (xs only) ── */}
      {isXs && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: theme.zIndex.appBar,
            borderTop: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <BottomNavigation
            value={activeTab?.path || '/'}
            onChange={(_, path) => openTab(path, pathLabel(path), { duplicate: false })}
            sx={{ height: 60, pr: '64px' }}
          >
            {config.features?.dashboard && (
              <BottomNavigationAction
                label="Home"
                value="/"
                icon={<LayoutDashboard size={22} />}
                sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }}
              />
            )}
            {config.features?.sales && (
              <BottomNavigationAction
                label="Sales"
                value="/sales"
                icon={<ReceiptText size={22} />}
                sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }}
              />
            )}
            {config.features?.purchases && (
              <BottomNavigationAction
                label="Purchases"
                value="/purchases"
                icon={<ShoppingBag size={22} />}
                sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }}
              />
            )}
            {config.features?.parties && (
              <BottomNavigationAction
                label="Parties"
                value="/parties"
                icon={<Users size={22} />}
                sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }}
              />
            )}
            {config.features?.items && (
              <BottomNavigationAction
                label="Items"
                value="/items"
                icon={<Package size={22} />}
                sx={{ minWidth: 0, '& .MuiBottomNavigationAction-label': { fontSize: '0.62rem' } }}
              />
            )}
          </BottomNavigation>

          {/* "More" drawer trigger — lives outside BottomNavigation so it never hijacks the route value */}
          <Box
            onClick={() => setOpen(true)}
            sx={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 64,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              cursor: 'pointer',
              color: 'text.secondary',
              borderLeft: '1px solid',
              borderColor: 'divider',
              userSelect: 'none',
              bgcolor: 'background.paper',
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
        <DialogTitle>
          Switch to {passwordDialog.business?.name}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 0.5 }}>
            Enter the password for this business to switch to it.
          </Typography>
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={passwordDialog.password}
            onChange={(e) => setPasswordDialog({ ...passwordDialog, password: e.target.value, error: '' })}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
            error={!!passwordDialog.error}
            helperText={passwordDialog.error}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePasswordClose} variant="outlined">Cancel</Button>
          <Button onClick={handlePasswordSubmit} variant="contained">
            Switch Business
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Calculator Popup ── */}
      {calculatorEnabled && (
        <Dialog
          open={calcOpen}
          onClose={() => setCalcOpen(false)}
          maxWidth="xs"
          fullWidth
          fullScreen={isXs}
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
            <Calculator embedded />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Keyboard Shortcuts Dialog ── */}
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
              color: '#4f46e5',
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
              color: '#059669',
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

      {/* Sign-out confirmation with backup notice */}
      <Dialog open={signOutOpen} onClose={() => !backingUp && setSignOutOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}>
          <ShieldCheck size={22} color="#16a34a" />
          Sign Out
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2">
              Are you sure you want to sign out?
            </Typography>
            <Alert
              severity="success"
              icon={<ShieldCheck size={18} />}
              sx={{ borderRadius: 2 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
                Your data will be backed up automatically
              </Typography>
              <Typography variant="caption" color="text.secondary">
                All your business data is saved on this device before signing out, so nothing is lost.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setSignOutOpen(false)}
            disabled={backingUp}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={backingUp}
            startIcon={backingUp ? <CircularProgress size={16} color="inherit" /> : <LogOut size={16} />}
            onClick={async () => {
              setBackingUp(true);
              await backupNow?.();
              setBackingUp(false);
              setSignOutOpen(false);
              logout();
            }}
            sx={{ textTransform: 'none', fontWeight: 700, minWidth: 150 }}
          >
            {backingUp ? 'Backing up…' : 'Back Up & Sign Out'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Layout;
