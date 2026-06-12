import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, Grid,
  Switch, FormControlLabel, Chip, IconButton, Tooltip, Divider, Alert,
  Tabs, Tab, Stack, Paper, MenuItem, alpha, Dialog, DialogTitle,
  DialogContent, DialogActions, InputAdornment, LinearProgress
} from '@mui/material';
import {
  Plus, Save, Trash2, ShieldCheck, ChevronUp, ChevronDown, X,
  Ruler, Scissors, Heart, Star, Wrench, Briefcase,
  Home, Zap, Leaf, Music, Camera, Globe, Activity,
  ShoppingBag, Truck, FileText, Package, Car, Coffee, Layers, Eye,
  Users, CreditCard, Award, Calendar, Building2,
  CheckCircle2, XCircle, Gift, Search, BarChart3, TrendingUp, RefreshCw,
  Lock, Cloud, IndianRupee, Wallet
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { firestore } from './db';
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useDialog } from './DialogContext';
import AdminBilling from './AdminBilling';

// --- Constants ---
const featureKeys = [
  'dashboard', 'parties', 'items', 'sales', 'purchases', 'expenses',
  'opticals', 'payments', 'reports', 'backup', 'settings', 'barcode',
  'estimates', 'creditNotes', 'debitNotes', 'deliveryNotes', 'journal', 'staff',
  'ledger', 'membership', 'cash', 'calculator',
  'backupExportFile', 'backupRestoreFile', 'backupOnline', 'backupRestoreOnline'
];

const featureLabels = {
  dashboard: 'Dashboard', parties: 'Parties', items: 'Items', sales: 'Sales',
  purchases: 'Purchases', expenses: 'Expenses', opticals: 'Opticals',
  payments: 'Payments', reports: 'Reports', backup: 'Backup / Restore', settings: 'Settings', barcode: 'Barcode',
  estimates: 'Estimates', creditNotes: 'Credit Notes', debitNotes: 'Debit Notes',
  deliveryNotes: 'Delivery Notes', journal: 'Journal', staff: 'Staff',
  ledger: 'Ledger View', membership: 'Membership', cash: 'Cash', calculator: 'Calculator',
  backupExportFile: 'Export to File', backupRestoreFile: 'Restore from File',
  backupOnline: 'Backup to Online', backupRestoreOnline: 'Restore from Online',
};

// --- Subscription plan helpers ---
const PLAN_META = {
  monthly:      { label: 'Basic · ₹99/mo',   short: 'Basic',  color: '#059669', tier: 'basic' },
  yearly:       { label: 'Basic · ₹999/yr',  short: 'Basic',  color: '#059669', tier: 'basic' },
  monthly_pro:  { label: 'Pro · ₹299/mo',    short: 'Pro',    color: '#4f46e5', tier: 'pro' },
  yearly_pro:   { label: 'Pro · ₹2999/yr',   short: 'Pro',    color: '#4f46e5', tier: 'pro' },
  trial:        { label: 'Trial',            short: 'Trial',  color: '#f59e0b', tier: 'trial' },
  admin_granted:{ label: 'Admin Granted',    short: 'Admin',  color: '#8b5cf6', tier: 'admin' },
};

// Headline price (₹) and normalized monthly value (for MRR) per paid plan.
const PLAN_PRICE = {
  monthly: 99, yearly: 999, monthly_pro: 299, yearly_pro: 2999,
};
const PLAN_MRR = {
  monthly: 99, yearly: Math.round(999 / 12), monthly_pro: 299, yearly_pro: Math.round(2999 / 12),
};
const isBasicPlan = (plan) => plan === 'monthly' || plan === 'yearly';
const isProPlan = (plan) => plan === 'monthly_pro' || plan === 'yearly_pro';

const GRANT_PLAN_OPTIONS = [
  { value: 'trial',       label: 'Trial',          desc: '3-day free trial (all features)',          color: '#f59e0b' },
  { value: 'monthly',     label: 'Basic · ₹99/mo', desc: 'All features, NO online backup, 1 business', color: '#059669' },
  { value: 'yearly',      label: 'Basic · ₹999/yr',desc: 'All features, NO online backup, 1 business', color: '#059669' },
  { value: 'monthly_pro', label: 'Pro · ₹299/mo',  desc: 'All features + online cloud backup',         color: '#4f46e5' },
  { value: 'yearly_pro',  label: 'Pro · ₹2999/yr', desc: 'All features + online cloud backup',         color: '#4f46e5' },
];

const DURATION_OPTIONS = [
  { value: '7d',     label: '7 Days' },
  { value: '1m',     label: '1 Month' },
  { value: '3m',     label: '3 Months' },
  { value: '6m',     label: '6 Months' },
  { value: '1y',     label: '1 Year' },
  { value: 'custom', label: 'Custom Date' },
];

const parseBizSubsAdmin = (subDoc) => {
  if (!subDoc) return {};
  if (subDoc.businesses && typeof subDoc.businesses === 'object') return subDoc.businesses;
  if (subDoc.plan) return { '1': { plan: subDoc.plan, status: subDoc.status, endDate: subDoc.endDate || null } };
  return {};
};

const getSubBadge = (subDoc) => {
  if (!subDoc) return null;
  if (subDoc.adminGrantedAll) return { label: 'Admin Access', color: '#8b5cf6' };
  const bizSubs = parseBizSubsAdmin(subDoc);
  const entries = Object.values(bizSubs);
  if (!entries.length) return null;
  for (const biz of entries) {
    const meta = PLAN_META[biz.plan];
    if (!meta) continue;
    const active = biz.status === 'active' && (!biz.endDate || new Date(biz.endDate) > new Date());
    if (active) return { label: meta.label, color: meta.color };
  }
  return { label: 'Expired', color: '#ef4444' };
};

const isSubActive = (biz) =>
  biz?.status === 'active' && (!biz.endDate || new Date(biz.endDate) > new Date());

const daysLeft = (endDate) => {
  if (!endDate) return null;
  return Math.max(0, Math.ceil((new Date(endDate) - new Date()) / 86400000));
};

const computeEndDate = (durationType, customEndDate) => {
  if (durationType === 'custom') return customEndDate ? new Date(customEndDate) : null;
  const now = new Date();
  const map = { '7d': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
  const days = map[durationType] || 30;
  now.setDate(now.getDate() + days);
  return now;
};

const PRESET_COLORS = [
  '#1976d2', '#dc004e', '#388e3c', '#f57c00', '#7b1fa2',
  '#c62828', '#0097a7', '#5d4037', '#455a64', '#1a1c1e'
];

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'counter', label: 'Session Counter' },
  { value: 'penalty', label: 'Fine / Penalty' },
];

const SECTION_ICON_LIST = [
  { name: 'Ruler', Icon: Ruler },
  { name: 'Scissors', Icon: Scissors },
  { name: 'Heart', Icon: Heart },
  { name: 'Star', Icon: Star },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Home', Icon: Home },
  { name: 'Zap', Icon: Zap },
  { name: 'Leaf', Icon: Leaf },
  { name: 'Music', Icon: Music },
  { name: 'Camera', Icon: Camera },
  { name: 'Globe', Icon: Globe },
  { name: 'Activity', Icon: Activity },
  { name: 'ShoppingBag', Icon: ShoppingBag },
  { name: 'Truck', Icon: Truck },
  { name: 'FileText', Icon: FileText },
  { name: 'Package', Icon: Package },
  { name: 'Car', Icon: Car },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Layers', Icon: Layers },
  { name: 'Eye', Icon: Eye },
];

const defaultUserForm = () => ({
  email: '',
  allowed: true,
  isAdmin: false,
  grantAdminAccess: false,
  businessType: 'general',
  multiBusiness: true,
  maxBusinesses: 0,
  useIndexedDB: true,
  completeOffline: false,
  backupOnlineEnabled: false,
  themePrimary: '#1976d2',
  themeSecondary: '#dc004e',
  features: featureKeys.reduce((acc, key) => ({
    ...acc,
    [key]: !['barcode','estimates','creditNotes','debitNotes','deliveryNotes','journal','opticals','membership'].includes(key),
  }), {}),
  assignedSectionIds: []
});

const normalizeSectionTabs = (section) => {
  if (section?.tabs?.length > 0) {
    return section.tabs.map(tab => ({
      ...tab,
      fields: (tab.fields || []).map(f => ({
        ...f,
        options: Array.isArray(f.options) ? f.options.join(', ') : (f.options || '')
      }))
    }));
  }
  if (section?.fields?.length > 0) {
    return [{ id: 'tab_legacy', name: 'Details', fields: section.fields.map(f => ({
      ...f,
      options: Array.isArray(f.options) ? f.options.join(', ') : (f.options || '')
    })) }];
  }
  return [{ id: `tab_${Date.now()}`, name: 'Details', fields: [] }];
};

const defaultSectionForm = () => ({
  name: '',
  description: '',
  icon: 'FileText',
  color: '#1976d2',
  tabs: [{ id: `tab_${Date.now()}`, name: 'Details', fields: [] }]
});

const ICON_MAP = { Ruler, Scissors, Heart, Star, Wrench, Briefcase, Home, Zap, Leaf, Music, Camera, Globe, Activity, ShoppingBag, Truck, FileText, Package, Car, Coffee, Layers, Eye };
const AdminIcon = ({ name, size = 18, ...props }) => {
  const Icon = ICON_MAP[name] || FileText;
  return <Icon size={size} {...props} />;
};

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

// ─── Compact secondary stat (small KPI chip) ────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color, sublabel }) => (
  <Card
    elevation={0}
    sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: 2.5, height: '100%',
      transition: 'border-color .15s, box-shadow .15s, transform .15s',
      '&:hover': { borderColor: alpha(color, 0.5), boxShadow: `0 6px 20px ${alpha(color, 0.12)}`, transform: 'translateY(-2px)' },
    }}
  >
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Stack direction="row" alignItems="center" spacing={1.25}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: alpha(color, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} color={color} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.05, color: 'text.primary' }}>{value}</Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block' }}>{label}</Typography>
          {sublabel && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>{sublabel}</Typography>}
        </Box>
      </Stack>
    </CardContent>
  </Card>
);

// ─── Hero metric (large headline KPI) ────────────────────────────────────────
const HeroMetric = ({ icon: Icon, label, value, color, sublabel }) => (
  <Card
    elevation={0}
    sx={{
      borderRadius: 3, height: '100%', position: 'relative', overflow: 'hidden',
      border: '1px solid', borderColor: alpha(color, 0.25),
      background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, ${alpha(color, 0.02)} 60%)`,
    }}
  >
    {/* faint corner glow */}
    <Box aria-hidden sx={{ position: 'absolute', top: -30, right: -30, width: 110, height: 110, borderRadius: '50%', background: alpha(color, 0.12), filter: 'blur(8px)' }} />
    <CardContent sx={{ p: 2.75, position: 'relative' }}>
      <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: alpha(color, 0.18), display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.75 }}>
        <Icon size={22} color={color} />
      </Box>
      <Typography sx={{ fontWeight: 900, fontSize: '2rem', lineHeight: 1, letterSpacing: '-0.02em', color: 'text.primary' }}>{value}</Typography>
      <Typography sx={{ fontWeight: 700, mt: 0.75, color: 'text.primary', fontSize: '0.9rem' }}>{label}</Typography>
      {sublabel && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{sublabel}</Typography>}
    </CardContent>
  </Card>
);

// ─── Chart Card wrapper ─────────────────────────────────────────────────────
const ChartCard = ({ title, subtitle, icon: Icon, color, children, empty, action }) => (
  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '100%' }}>
    <CardContent sx={{ p: 2.75 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          {Icon && <Box sx={{ width: 34, height: 34, borderRadius: 1.5, bgcolor: alpha(color, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={17} color={color} /></Box>}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
        </Stack>
        {action}
      </Stack>
      {empty ? (
        <Box sx={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'text.disabled' }}>
          <BarChart3 size={28} style={{ opacity: 0.4 }} />
          <Typography variant="body2" color="text.disabled">No data yet</Typography>
        </Box>
      ) : children}
    </CardContent>
  </Card>
);

// ─── Tier dashboard card (Basic vs Pro) ─────────────────────────────────────
const TierCard = ({ tier, color, icon: Icon, activeCount, mrr, priceLabel, share }) => (
  <Card elevation={0} sx={{ borderRadius: 3, height: '100%', overflow: 'hidden', border: '1px solid', borderColor: alpha(color, 0.3) }}>
    {/* gradient header strip */}
    <Box sx={{ px: 2.5, py: 1.75, background: `linear-gradient(135deg, ${color} 0%, ${alpha(color, 0.78)} 100%)`, display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color="#fff" />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{tier}</Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>{priceLabel}</Typography>
      </Box>
      {share != null && (
        <Chip label={`${share}%`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.22)', color: '#fff', fontWeight: 700, height: 22 }} />
      )}
    </Box>
    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
      <Stack direction="row" spacing={3}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 900, fontSize: '1.9rem', color, lineHeight: 1 }}>{activeCount}</Typography>
          <Typography variant="caption" color="text.secondary">Active subscribers</Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 900, fontSize: '1.9rem', color: 'text.primary', lineHeight: 1 }}>{inr(mrr)}</Typography>
          <Typography variant="caption" color="text.secondary">Monthly recurring</Typography>
        </Box>
      </Stack>
    </CardContent>
  </Card>
);

// ─── Main Component ────────────────────────────────────────────────────────────
const Admin = () => {
  const { currentUser, isAdmin } = useAuth();
  const { confirm } = useDialog();

  const [adminTab, setAdminTab] = useState('overview');

  // Users state
  const [users, setUsers] = useState([]);
  const [subscriptions, setSubscriptions] = useState({});
  const [selectedEmail, setSelectedEmail] = useState('');
  const [form, setForm] = useState(defaultUserForm());
  const [message, setMessage] = useState({ type: '', text: '' });
  const [userSearch, setUserSearch] = useState('');

  // Sections state
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [sectionForm, setSectionForm] = useState(defaultSectionForm());
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [orphanedSections, setOrphanedSections] = useState([]);

  // Global settings state
  const [landingTheme, setLandingTheme] = useState('light');
  const [globalSettingsSaving, setGlobalSettingsSaving] = useState(false);

  // Grant subscription dialog state
  const [grantDialog, setGrantDialog] = useState({ open: false, email: '' });
  const [grantForm, setGrantForm] = useState({ plan: 'monthly', businessId: '1', durationType: '1m', customEndDate: '' });
  const [grantSaving, setGrantSaving] = useState(false);

  // Subscription search
  const [subSearch, setSubSearch] = useState('');

  // ── Firestore listeners ────────────────────────────────────────────────────
  useEffect(() => {
    getDoc(doc(firestore, 'globalConfig', 'landing'))
      .then(snap => { if (snap.exists()) setLandingTheme(snap.data().theme || 'light'); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ref = collection(firestore, 'userConfig');
    return onSnapshot(ref, snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('Error loading userConfig:', err));
  }, []);

  useEffect(() => {
    const ref = collection(firestore, 'subscriptions');
    return onSnapshot(ref, snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setSubscriptions(map);
    }, () => {});
  }, []);

  useEffect(() => {
    const ref = collection(firestore, 'adminSections');
    return onSnapshot(ref, snap => setSections(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('Error loading adminSections:', err));
  }, []);

  // ── Computed stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let active = 0, expired = 0, trial = 0, adminGranted = 0, noSub = 0;
    users.forEach(u => {
      const email = u.email || u.id;
      const sub = subscriptions[email];
      if (!sub) { noSub++; return; }
      if (sub.adminGrantedAll) { adminGranted++; return; }
      const bizSubs = parseBizSubsAdmin(sub);
      const entries = Object.values(bizSubs);
      if (!entries.length) { noSub++; return; }
      let hasActive = false, hasTrial = false;
      entries.forEach(biz => {
        const a = isSubActive(biz);
        if (biz.plan === 'trial' && a) hasTrial = true;
        else if (a) hasActive = true;
      });
      if (hasActive) active++;
      else if (hasTrial) trial++;
      else expired++;
    });
    return { active, expired, trial, adminGranted, noSub, total: users.length };
  }, [users, subscriptions]);

  // ── Revenue & plan analytics (charts + tier split) ──────────────────────────
  // Computed straight from the subscriptions collection: each business sub holds
  // a live plan/status plus a `payments[]` history (date, plan, total). We derive
  // active Basic vs Pro counts, MRR, lifetime revenue, and monthly time series.
  const analytics = useMemo(() => {
    let basicActive = 0, proActive = 0;        // active paid subscriptions by tier
    let basicMrr = 0, proMrr = 0;              // monthly-normalized recurring revenue
    let payingCustomers = 0;                   // distinct emails with ≥1 active paid plan
    let lifetimeRevenue = 0;                   // sum of all recorded payments
    const revByMonth = {};                     // 'YYYY-MM' → ₹ collected
    const subsByMonth = {};                    // 'YYYY-MM' → new paid activations

    Object.values(subscriptions).forEach((sub) => {
      if (!sub || sub.adminGrantedAll) return;
      const bizSubs = parseBizSubsAdmin(sub);
      let userHasActivePaid = false;

      Object.values(bizSubs).forEach((biz) => {
        const active = isSubActive(biz);
        if (active && isBasicPlan(biz.plan)) { basicActive++; basicMrr += PLAN_MRR[biz.plan] || 0; userHasActivePaid = true; }
        if (active && isProPlan(biz.plan))   { proActive++;   proMrr   += PLAN_MRR[biz.plan] || 0; userHasActivePaid = true; }

        // Payment history → revenue & signup time series.
        const pays = Array.isArray(biz.payments) ? biz.payments : [];
        pays.forEach((p) => {
          const amount = Number(p.total) || PLAN_PRICE[p.plan] || 0;
          lifetimeRevenue += amount;
          const d = p.date ? new Date(p.date) : null;
          if (d && !isNaN(d.getTime())) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            revByMonth[key] = (revByMonth[key] || 0) + amount;
            subsByMonth[key] = (subsByMonth[key] || 0) + 1;
          }
        });
      });
      if (userHasActivePaid) payingCustomers++;
    });

    // Build the last 6 months (oldest → newest) so charts read left-to-right.
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: d.toLocaleDateString('en-IN', { month: 'short' }),
        revenue: Math.round(revByMonth[key] || 0),
        signups: subsByMonth[key] || 0,
      });
    }

    const planDistribution = [
      { name: 'Basic (₹99)', value: basicActive, color: '#059669' },
      { name: 'Pro (₹299)', value: proActive, color: '#4f46e5' },
      { name: 'Trial', value: stats.trial, color: '#f59e0b' },
      { name: 'Expired', value: stats.expired, color: '#ef4444' },
    ].filter((s) => s.value > 0);

    return {
      basicActive, proActive,
      basicMrr, proMrr, mrr: basicMrr + proMrr,
      payingCustomers, lifetimeRevenue,
      months, planDistribution,
    };
  }, [subscriptions, stats.trial, stats.expired]);

  // ── Global settings ────────────────────────────────────────────────────────
  const handleSaveGlobalSettings = async () => {
    setGlobalSettingsSaving(true);
    try {
      await setDoc(doc(firestore, 'globalConfig', 'landing'), { theme: landingTheme }, { merge: true });
      localStorage.setItem('sb_landing_dark', landingTheme === 'dark' ? 'true' : 'false');
      setMessage({ type: 'success', text: 'Global settings saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save: ' + err.message });
    } finally {
      setGlobalSettingsSaving(false);
    }
  };

  // ── User handlers ──────────────────────────────────────────────────────────
  const resetUserForm = () => {
    setSelectedEmail('');
    setForm(defaultUserForm());
    setOrphanedSections([]);
  };

  const loadUser = (user) => {
    const cfg = user.config || {};
    const userSections = cfg.customSections || [];
    const orphaned = userSections.filter(s => !sections.some(as => as.id === s.id));
    setOrphanedSections(orphaned);
    const email = user.email || user.id;
    setSelectedEmail(email);
    setForm({
      email,
      allowed: user.allowed !== false,
      isAdmin: !!user.isAdmin,
      grantAdminAccess: !!(subscriptions[email]?.adminGrantedAll),
      businessType: cfg.businessType || 'general',
      multiBusiness: cfg.multiBusiness !== false,
      maxBusinesses: cfg.maxBusinesses || 0,
      useIndexedDB: cfg.useIndexedDB !== false,
      completeOffline: !!cfg.completeOffline,
      backupOnlineEnabled: cfg.backupOnlineEnabled === true,
      themePrimary: cfg.theme?.primaryColor || '#1976d2',
      themeSecondary: cfg.theme?.secondaryColor || '#dc004e',
      features: {
        ...featureKeys.reduce((acc, key) => ({
          ...acc,
          [key]: !['barcode','estimates','creditNotes','debitNotes','deliveryNotes','journal','opticals','membership'].includes(key),
        }), {}),
        ...(cfg.features || {})
      },
      assignedSectionIds: userSections
        .filter(s => sections.some(as => as.id === s.id))
        .map(s => s.id)
    });
  };

  const handleSaveUser = async () => {
    if (!form.email) { setMessage({ type: 'error', text: 'Email is required.' }); return; }
    try {
      const assignedSections = sections
        .filter(s => form.assignedSectionIds.includes(s.id))
        .map(s => {
          const tabs = normalizeSectionTabs(s).map(tab => ({
            id: tab.id,
            name: tab.name,
            fields: tab.fields.map(f => ({
              ...f,
              options: typeof f.options === 'string'
                ? f.options.split(',').map(o => o.trim()).filter(Boolean)
                : (f.options || [])
            }))
          }));
          return {
            id: s.id,
            name: s.name,
            icon: s.icon || 'FileText',
            color: s.color || '#1976d2',
            description: s.description || '',
            tabs,
            fields: tabs.flatMap(t => t.fields)
          };
        });

      await setDoc(doc(firestore, 'userConfig', form.email), {
        email: form.email,
        allowed: form.allowed,
        isAdmin: form.isAdmin,
        config: {
          businessType: form.businessType,
          multiBusiness: form.multiBusiness,
          maxBusinesses: Number(form.maxBusinesses) || 0,
          useIndexedDB: form.useIndexedDB,
          completeOffline: form.completeOffline,
          backupOnlineEnabled: form.backupOnlineEnabled,
          theme: { primaryColor: form.themePrimary, secondaryColor: form.themeSecondary },
          features: form.features,
          customSections: assignedSections
        }
      }, { merge: true });

      await setDoc(doc(firestore, 'subscriptions', form.email), {
        email: form.email,
        adminGrantedAll: form.grantAdminAccess,
        ...(form.grantAdminAccess ? { grantedBy: currentUser?.email || 'admin', grantedAt: new Date().toISOString() } : {}),
      }, { merge: true });

      setMessage({ type: 'success', text: 'User configuration saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save: ' + (err.message || 'Unknown error') });
    }
  };

  const handleDeleteUser = async (email) => {
    const ok = await confirm({ title: 'Remove User Access', message: `Remove access for ${email}? They will no longer be able to log in.`, confirmLabel: 'Remove', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(firestore, 'userConfig', email));
      if (selectedEmail === email) resetUserForm();
      setMessage({ type: 'success', text: 'User removed.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete: ' + (err.message || 'Unknown error') });
    }
  };

  // ── Subscription grant handlers ────────────────────────────────────────────
  const openGrantDialog = (email) => {
    setGrantForm({ plan: 'monthly', businessId: '1', durationType: '1m', customEndDate: '' });
    setGrantDialog({ open: true, email });
  };

  const handleGrantSubscription = async () => {
    const { email } = grantDialog;
    const { plan, businessId, durationType, customEndDate } = grantForm;
    if (!businessId.trim()) {
      setMessage({ type: 'error', text: 'Business ID is required.' });
      return;
    }
    const endDate = computeEndDate(durationType, customEndDate);
    if (!endDate || isNaN(endDate.getTime())) {
      setMessage({ type: 'error', text: 'Please select a valid end date.' });
      return;
    }
    setGrantSaving(true);
    try {
      const now = new Date();
      const sub = subscriptions[email] || {};
      const bizSubs = parseBizSubsAdmin(sub);
      await setDoc(doc(firestore, 'subscriptions', email), {
        email,
        businesses: {
          ...bizSubs,
          [businessId.trim()]: {
            plan,
            status: 'active',
            startDate: now.toISOString(),
            endDate: endDate.toISOString(),
            grantedBy: currentUser?.email || 'admin',
            grantedAt: now.toISOString(),
          },
        },
      }, { merge: true });
      setGrantDialog({ open: false, email: '' });
      setMessage({ type: 'success', text: `${PLAN_META[plan]?.label || plan} granted to ${email} (Business ${businessId}) — expires ${endDate.toLocaleDateString('en-IN')}.` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to grant subscription: ' + err.message });
    } finally {
      setGrantSaving(false);
    }
  };

  const handleRevokeBizSub = async (email, bizId) => {
    const ok = await confirm({
      title: 'Revoke Subscription',
      message: `Revoke subscription for Business ${bizId} of ${email}? The user will lose access immediately.`,
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const sub = subscriptions[email] || {};
      const bizSubs = parseBizSubsAdmin(sub);
      const updated = { ...bizSubs };
      updated[bizId] = { ...updated[bizId], status: 'expired' };
      await setDoc(doc(firestore, 'subscriptions', email), { businesses: updated }, { merge: true });
      setMessage({ type: 'success', text: `Subscription revoked for Business ${bizId}.` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to revoke: ' + err.message });
    }
  };

  const handleQuickAdminGrant = async (email, grant) => {
    try {
      await setDoc(doc(firestore, 'subscriptions', email), {
        email,
        adminGrantedAll: grant,
        ...(grant ? { grantedBy: currentUser?.email || 'admin', grantedAt: new Date().toISOString() } : {}),
      }, { merge: true });
      setMessage({ type: 'success', text: grant ? `Admin access granted to ${email}.` : `Admin access revoked from ${email}.` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed: ' + err.message });
    }
  };

  // ── Section handlers ───────────────────────────────────────────────────────
  const resetSectionForm = () => {
    setSelectedSection(null);
    setSectionForm(defaultSectionForm());
    setActiveTabIdx(0);
  };

  const loadSection = (section) => {
    setSelectedSection(section);
    setSectionForm({
      name: section.name || '',
      description: section.description || '',
      icon: section.icon || 'FileText',
      color: section.color || '#1976d2',
      tabs: normalizeSectionTabs(section)
    });
    setActiveTabIdx(0);
  };

  const addTab = () => {
    setSectionForm(f => {
      const newTabs = [...f.tabs, { id: `tab_${Date.now()}`, name: 'New Tab', fields: [] }];
      setActiveTabIdx(newTabs.length - 1);
      return { ...f, tabs: newTabs };
    });
  };

  const removeTab = (tabIdx) => {
    setSectionForm(f => {
      if (f.tabs.length <= 1) return f;
      const newTabs = f.tabs.filter((_, i) => i !== tabIdx);
      setActiveTabIdx(prev => Math.min(prev, newTabs.length - 1));
      return { ...f, tabs: newTabs };
    });
  };

  const updateTabName = (tabIdx, name) => {
    setSectionForm(f => {
      const tabs = [...f.tabs];
      tabs[tabIdx] = { ...tabs[tabIdx], name };
      return { ...f, tabs };
    });
  };

  const moveTab = (tabIdx, dir) => {
    setSectionForm(f => {
      const tabs = [...f.tabs];
      const newIdx = tabIdx + dir;
      if (newIdx < 0 || newIdx >= tabs.length) return f;
      [tabs[tabIdx], tabs[newIdx]] = [tabs[newIdx], tabs[tabIdx]];
      return { ...f, tabs };
    });
  };

  const addField = (tabIdx) => {
    setSectionForm(f => {
      const tabs = [...f.tabs];
      tabs[tabIdx] = {
        ...tabs[tabIdx],
        fields: [...tabs[tabIdx].fields, { id: Date.now().toString(), name: '', type: 'text', unit: '', required: false, options: '' }]
      };
      return { ...f, tabs };
    });
  };

  const removeField = (tabIdx, fieldId) => {
    setSectionForm(f => {
      const tabs = [...f.tabs];
      tabs[tabIdx] = { ...tabs[tabIdx], fields: tabs[tabIdx].fields.filter(field => field.id !== fieldId) };
      return { ...f, tabs };
    });
  };

  const updateField = (tabIdx, fieldIdx, key, value) => {
    setSectionForm(f => {
      const tabs = [...f.tabs];
      const fields = [...tabs[tabIdx].fields];
      fields[fieldIdx] = { ...fields[fieldIdx], [key]: value };
      tabs[tabIdx] = { ...tabs[tabIdx], fields };
      return { ...f, tabs };
    });
  };

  const moveField = (tabIdx, fieldIdx, dir) => {
    setSectionForm(f => {
      const tabs = [...f.tabs];
      const fields = [...tabs[tabIdx].fields];
      const newIdx = fieldIdx + dir;
      if (newIdx < 0 || newIdx >= fields.length) return f;
      [fields[fieldIdx], fields[newIdx]] = [fields[newIdx], fields[fieldIdx]];
      tabs[tabIdx] = { ...tabs[tabIdx], fields };
      return { ...f, tabs };
    });
  };

  const handleSaveSection = async () => {
    if (!sectionForm.name.trim()) { setMessage({ type: 'error', text: 'Section name is required.' }); return; }
    try {
      const normalizeField = (f) => ({
        id: f.id,
        name: f.name.trim(),
        type: f.type,
        unit: f.unit || '',
        required: !!f.required,
        options: f.type === 'select'
          ? (typeof f.options === 'string' ? f.options.split(',').map(o => o.trim()).filter(Boolean) : (f.options || []))
          : [],
        ratePerDay: f.type === 'penalty' ? (Number(f.ratePerDay) || 0) : 0,
      });

      const saveTabs = sectionForm.tabs.map(tab => ({
        id: tab.id,
        name: tab.name || 'Tab',
        fields: (tab.fields || []).filter(f => f.name.trim()).map(normalizeField)
      }));
      const flatFields = saveTabs.flatMap(t => t.fields);
      const sectionData = {
        name: sectionForm.name.trim(),
        description: sectionForm.description.trim(),
        icon: sectionForm.icon,
        color: sectionForm.color,
        tabs: saveTabs,
        fields: flatFields
      };

      let savedId;
      if (selectedSection) {
        savedId = selectedSection.id;
        await setDoc(doc(firestore, 'adminSections', savedId), sectionData, { merge: true });
      } else {
        savedId = `section_${Date.now()}`;
        await setDoc(doc(firestore, 'adminSections', savedId), { ...sectionData, id: savedId });
      }
      setSelectedSection({ id: savedId, ...sectionData });
      setMessage({ type: 'success', text: 'Section saved successfully.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save section: ' + err.message });
    }
  };

  const confirmDeleteSection = async (sectionId, sectionName) => {
    const ok = await confirm({
      title: `Delete "${sectionName}"`,
      message: `This section will be permanently deleted and removed from all users who have access to it. This cannot be undone.`,
      confirmLabel: 'Delete Section',
      variant: 'danger',
    });
    if (!ok) return;
    handleDeleteSection(sectionId);
  };

  const handleDeleteSection = async (sectionId) => {
    try {
      await deleteDoc(doc(firestore, 'adminSections', sectionId));
      const affectedUsers = users.filter(u =>
        (u.config?.customSections || []).some(s => s.id === sectionId)
      );
      await Promise.all(affectedUsers.map(u => {
        const updatedSections = (u.config?.customSections || []).filter(s => s.id !== sectionId);
        return setDoc(doc(firestore, 'userConfig', u.email || u.id), {
          config: { customSections: updatedSections }
        }, { merge: true });
      }));
      if (selectedSection?.id === sectionId) resetSectionForm();
      const msg = affectedUsers.length > 0
        ? `Section deleted and removed from ${affectedUsers.length} user(s).`
        : 'Section deleted.';
      setMessage({ type: 'success', text: msg });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete: ' + err.message });
    }
  };

  // ── Filtered lists ─────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() =>
    users.filter(u => {
      const q = userSearch.toLowerCase();
      return !q || (u.email || u.id).toLowerCase().includes(q);
    }), [users, userSearch]);

  const filteredSubUsers = useMemo(() =>
    users.filter(u => {
      const q = subSearch.toLowerCase();
      return !q || (u.email || u.id).toLowerCase().includes(q);
    }), [users, subSearch]);

  if (!isAdmin) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>Admin Access Required</Typography>
        <Typography variant="body1" color="text.secondary">Only administrators can access this panel.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 6 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Admin Panel</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage users, subscriptions, and custom sections.
          </Typography>
        </Box>
        <Chip icon={<ShieldCheck size={16} />} label={currentUser?.email || 'Admin'} color="primary" variant="outlined" />
      </Stack>

      {message.text && (
        <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage({ type: '', text: '' })}>
          {message.text}
        </Alert>
      )}

      {/* Tabs */}
      <Paper elevation={0} sx={{ mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Tabs value={adminTab} onChange={(_, v) => setAdminTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{ '& .MuiTabs-indicator': { height: 3 } }}>
          <Tab value="overview"       label="Overview"        sx={{ fontWeight: 600, minHeight: 52 }} />
          <Tab value="users"          label="Users"           sx={{ fontWeight: 600, minHeight: 52 }} />
          <Tab value="subscriptions"  label="Subscriptions"   sx={{ fontWeight: 600, minHeight: 52 }} />
          <Tab value="sections"       label="Section Builder" sx={{ fontWeight: 600, minHeight: 52 }} />
          <Tab value="billing"        label="Billing & Tax"   sx={{ fontWeight: 600, minHeight: 52 }} />
          <Tab value="global"         label="Global Settings" sx={{ fontWeight: 600, minHeight: 52 }} />
        </Tabs>
      </Paper>

      {/* ===================== OVERVIEW TAB ===================== */}
      {adminTab === 'overview' && (
        <Box>
          {/* ── Hero revenue band ── */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Business Health</Typography>
              <Typography variant="caption" color="text.secondary">Live revenue &amp; subscription overview</Typography>
            </Box>
          </Stack>
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <HeroMetric icon={IndianRupee} label="MRR" value={inr(analytics.mrr)} color="#0891b2" sublabel="Monthly recurring revenue" />
            </Grid>
            <Grid item xs={6} md={3}>
              <HeroMetric icon={Wallet} label="Total Collected" value={inr(analytics.lifetimeRevenue)} color="#059669" sublabel="All payments to date" />
            </Grid>
            <Grid item xs={6} md={3}>
              <HeroMetric icon={Users} label="Paying Customers" value={analytics.payingCustomers} color="#4f46e5" sublabel="Active paid plans" />
            </Grid>
            <Grid item xs={6} md={3}>
              <HeroMetric icon={TrendingUp} label="On Trial" value={stats.trial} color="#f59e0b" sublabel="Evaluating the app" />
            </Grid>
          </Grid>

          {/* ── Tier dashboards: Basic (₹99) vs Pro (₹299) ── */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Plans by tier</Typography>
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <TierCard tier="Basic" priceLabel="₹99/mo · local-only" color="#059669" icon={Lock}
                activeCount={analytics.basicActive} mrr={analytics.basicMrr}
                share={analytics.basicActive + analytics.proActive > 0 ? Math.round((analytics.basicActive / (analytics.basicActive + analytics.proActive)) * 100) : null} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TierCard tier="Pro" priceLabel="₹299/mo · cloud backup" color="#4f46e5" icon={Cloud}
                activeCount={analytics.proActive} mrr={analytics.proMrr}
                share={analytics.basicActive + analytics.proActive > 0 ? Math.round((analytics.proActive / (analytics.basicActive + analytics.proActive)) * 100) : null} />
            </Grid>
          </Grid>

          {/* ── Charts ── */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Trends</Typography>
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Grid item xs={12} md={7}>
              <ChartCard title="Revenue over time" subtitle="Last 6 months" icon={IndianRupee} color="#0891b2"
                empty={analytics.lifetimeRevenue === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={analytics.months} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0891b2" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={48}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <ReTooltip formatter={(v) => [inr(v), 'Revenue']} />
                    <Area type="monotone" dataKey="revenue" stroke="#0891b2" strokeWidth={2} fill="url(#revFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid item xs={12} md={5}>
              <ChartCard title="Plan distribution" subtitle="Current mix" icon={BarChart3} color="#4f46e5"
                empty={analytics.planDistribution.length === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={analytics.planDistribution} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {analytics.planDistribution.map((s) => <Cell key={s.name} fill={s.color} />)}
                    </Pie>
                    <ReTooltip formatter={(v, n) => [v, n]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
            <Grid item xs={12}>
              <ChartCard title="New subscriptions" subtitle="Paid activations per month (last 6 months)" icon={TrendingUp} color="#059669"
                empty={analytics.months.every((m) => m.signups === 0)}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.months} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                    <ReTooltip formatter={(v) => [v, 'New subs']} />
                    <Bar dataKey="signups" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
          </Grid>

          {/* ── Secondary stats strip ── */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>User base</Typography>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={6} sm={4} md={2.4}>
              <StatCard icon={Users}        label="Total Users"     value={stats.total}        color="#1976d2" />
            </Grid>
            <Grid item xs={6} sm={4} md={2.4}>
              <StatCard icon={CheckCircle2} label="Active Plans"    value={stats.active}       color="#059669" />
            </Grid>
            <Grid item xs={6} sm={4} md={2.4}>
              <StatCard icon={XCircle}      label="Expired"         value={stats.expired}      color="#ef4444" />
            </Grid>
            <Grid item xs={6} sm={4} md={2.4}>
              <StatCard icon={Award}        label="Admin Granted"   value={stats.adminGranted} color="#8b5cf6" />
            </Grid>
            <Grid item xs={6} sm={4} md={2.4}>
              <StatCard icon={BarChart3}    label="No Subscription" value={stats.noSub}        color="#64748b" />
            </Grid>
          </Grid>

          {/* Quick actions */}
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Quick Actions</Typography>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {[
              { label: 'Manage Users',       desc: 'Edit access, features & limits',    tab: 'users',         icon: Users,        color: '#1976d2' },
              { label: 'Grant Subscription', desc: 'Manually activate plans for users', tab: 'subscriptions', icon: Gift,         color: '#059669' },
              { label: 'Build Sections',     desc: 'Create custom data sections',       tab: 'sections',      icon: Layers,       color: '#7c3aed' },
              { label: 'Global Settings',    desc: 'Landing page and app settings',     tab: 'global',        icon: Globe,        color: '#0891b2' },
            ].map(a => (
              <Grid item xs={12} sm={6} md={3} key={a.tab}>
                <Card elevation={0} onClick={() => setAdminTab(a.tab)} sx={{
                  border: '1px solid', borderColor: 'divider', borderRadius: 2, cursor: 'pointer',
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: a.color, bgcolor: alpha(a.color, 0.04), transform: 'translateY(-2px)', boxShadow: `0 4px 20px ${alpha(a.color, 0.15)}` }
                }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ p: 1.25, width: 44, height: 44, borderRadius: 1.5, bgcolor: alpha(a.color, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
                      <a.icon size={22} color={a.color} />
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{a.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{a.desc}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Recent users */}
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Users at a Glance</Typography>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ p: 0 }}>
              {users.slice(0, 8).map((u, i) => {
                const email = u.email || u.id;
                const badge = getSubBadge(subscriptions[email]);
                return (
                  <Box key={email} sx={{
                    px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 2,
                    borderBottom: i < Math.min(users.length, 8) - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: alpha('#1976d2', 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {email[0].toUpperCase()}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>{email}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                        {u.isAdmin && <Chip label="Admin" size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }} color="primary" />}
                        {u.allowed === false && <Chip label="Blocked" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem' }} />}
                      </Stack>
                    </Box>
                    {badge
                      ? <Chip label={badge.label} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha(badge.color, 0.12), color: badge.color }} />
                      : <Chip label="No Plan" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                    }
                  </Box>
                );
              })}
              {users.length === 0 && (
                <Box sx={{ py: 5, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">No users yet.</Typography>
                </Box>
              )}
              {users.length > 8 && (
                <Box sx={{ px: 2.5, py: 1.5, textAlign: 'center' }}>
                  <Button size="small" onClick={() => setAdminTab('users')}>View all {users.length} users →</Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* ===================== USERS TAB ===================== */}
      {adminTab === 'users' && (
        <Grid container spacing={3}>
          {/* Left: User list */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Users ({users.length})</Typography>
                  <Button size="small" startIcon={<Plus size={16} />} onClick={resetUserForm}>New</Button>
                </Stack>

                {/* Search */}
                <TextField
                  size="small" fullWidth placeholder="Search by email…"
                  value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  sx={{ mb: 2 }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }}
                />

                <Divider sx={{ mb: 2 }} />
                <Box sx={{ maxHeight: 480, overflowY: 'auto' }}>
                  {filteredUsers.map(u => (
                    <Box key={u.id} sx={{
                      mb: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', cursor: 'pointer',
                      borderColor: selectedEmail === (u.email || u.id) ? 'primary.main' : 'divider',
                      bgcolor: selectedEmail === (u.email || u.id) ? alpha('#1976d2', 0.06) : 'background.paper',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1
                    }} onClick={() => loadUser(u)}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                          {u.email || u.id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {u.allowed === false ? 'Blocked' : 'Allowed'}
                          {u.isAdmin ? ' · Admin' : ''}
                          {(u.config?.maxBusinesses || 0) > 0 ? ` · Max ${u.config.maxBusinesses} biz` : ''}
                        </Typography>
                        {(() => {
                          const badge = getSubBadge(subscriptions[u.email || u.id]);
                          if (!badge) return <Chip label="No plan" size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.6rem' }} />;
                          return <Chip label={badge.label} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.6rem', fontWeight: 700, bgcolor: alpha(badge.color, 0.12), color: badge.color }} />;
                        })()}
                      </Box>
                      <Tooltip title="Remove user">
                        <IconButton size="small" color="error" onClick={e => { e.stopPropagation(); handleDeleteUser(u.email || u.id); }}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                  {filteredUsers.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {userSearch ? 'No users match your search.' : 'No users configured yet.'}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Right: User config form */}
          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>User Configuration</Typography>
                <Grid container spacing={2.5}>
                  <Grid item xs={12}>
                    <TextField label="Email" fullWidth value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </Grid>

                  {/* Access flags */}
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel control={<Switch checked={form.allowed} onChange={e => setForm(f => ({ ...f, allowed: e.target.checked }))} />}
                      label="App Access" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel control={<Switch checked={form.isAdmin} onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))} />}
                      label="Admin Panel" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel
                      control={<Switch checked={form.grantAdminAccess} color="secondary"
                        onChange={e => setForm(f => ({ ...f, grantAdminAccess: e.target.checked }))} />}
                      label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Admin Subscription Grant</Typography>}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.5 }}>
                      Bypasses all plan checks — use for trusted users
                    </Typography>
                  </Grid>

                  {/* Business settings */}
                  <Grid item xs={12}>
                    <Divider sx={{ mb: 1 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Business Settings</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField label="Business Type" fullWidth value={form.businessType}
                      onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))} />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel control={<Switch checked={form.multiBusiness} onChange={e => setForm(f => ({ ...f, multiBusiness: e.target.checked }))} />}
                      label="Allow Multiple Businesses" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Max Businesses"
                      type="number"
                      fullWidth
                      value={form.maxBusinesses}
                      onChange={e => setForm(f => ({ ...f, maxBusinesses: Math.max(0, parseInt(e.target.value) || 0) }))}
                      inputProps={{ min: 0, step: 1 }}
                      helperText="0 = unlimited"
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><Building2 size={16} /></InputAdornment>
                      }}
                    />
                  </Grid>

                  {/* Subscription status */}
                  <Grid item xs={12}>
                    <Divider sx={{ mb: 1.5 }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Subscription Status</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary">Manage plans →</Typography>
                        <Button size="small" startIcon={<Gift size={14} />} variant="outlined"
                          onClick={() => { setAdminTab('subscriptions'); }}
                          sx={{ borderRadius: 2, fontSize: '0.72rem', textTransform: 'none' }}>
                          Subscriptions Tab
                        </Button>
                      </Stack>
                    </Stack>
                    {(() => {
                      const sub = subscriptions[form.email];
                      if (!sub) return <Typography variant="caption" color="text.disabled">No subscription record found for this email.</Typography>;
                      if (sub.adminGrantedAll) return (
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha('#8b5cf6', 0.08), border: `1px solid ${alpha('#8b5cf6', 0.25)}` }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#8b5cf6' }}>Admin Access Granted</Typography>
                          {sub.grantedBy && <Typography variant="caption" color="text.secondary">By {sub.grantedBy} · {sub.grantedAt ? new Date(sub.grantedAt).toLocaleDateString('en-IN') : ''}</Typography>}
                        </Box>
                      );
                      const bizSubs = parseBizSubsAdmin(sub);
                      const entries = Object.entries(bizSubs);
                      if (!entries.length) return <Typography variant="caption" color="text.disabled">No business subscriptions found.</Typography>;
                      return (
                        <Stack spacing={1}>
                          {entries.map(([bId, biz]) => {
                            const meta = PLAN_META[biz.plan] || { label: biz.plan, color: '#666', short: biz.plan };
                            const active = isSubActive(biz);
                            const dl = biz.endDate ? daysLeft(biz.endDate) : null;
                            return (
                              <Box key={bId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, borderRadius: 2, border: '1px solid', borderColor: active ? alpha(meta.color, 0.3) : 'divider', bgcolor: active ? alpha(meta.color, 0.04) : 'transparent' }}>
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: active ? meta.color : '#ccc', flexShrink: 0 }} />
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>Business {bId} · <span style={{ color: meta.color }}>{meta.label}</span></Typography>
                                  {biz.endDate && <Typography variant="caption" color="text.secondary">Expires {new Date(biz.endDate).toLocaleDateString('en-IN')}{dl !== null ? ` · ${dl}d left` : ''}</Typography>}
                                </Box>
                                <Chip label={active ? 'Active' : 'Expired'} size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, bgcolor: active ? alpha(meta.color, 0.12) : alpha('#ef4444', 0.1), color: active ? meta.color : '#ef4444' }} />
                              </Box>
                            );
                          })}
                        </Stack>
                      );
                    })()}
                  </Grid>

                  {/* Cloud backup */}
                  <Grid item xs={12}>
                    <Divider sx={{ mb: 1.5 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Cloud Backup Override</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                      Cloud sync is automatic for Business plan users. Use this to force-enable for Private plan users.
                    </Typography>
                    <FormControlLabel
                      control={<Switch checked={form.backupOnlineEnabled} onChange={e => setForm(f => ({ ...f, backupOnlineEnabled: e.target.checked }))} />}
                      label={<Typography variant="body2">Force enable online backup (overrides plan)</Typography>}
                    />
                  </Grid>

                  {/* Theme */}
                  <Grid item xs={12} sm={3}>
                    <TextField label="Primary Color" fullWidth value={form.themePrimary}
                      onChange={e => setForm(f => ({ ...f, themePrimary: e.target.value }))}
                      InputProps={{ startAdornment: <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: form.themePrimary, mr: 1, border: '1px solid rgba(0,0,0,.15)', flexShrink: 0 }} /> }} />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField label="Secondary Color" fullWidth value={form.themeSecondary}
                      onChange={e => setForm(f => ({ ...f, themeSecondary: e.target.value }))}
                      InputProps={{ startAdornment: <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: form.themeSecondary, mr: 1, border: '1px solid rgba(0,0,0,.15)', flexShrink: 0 }} /> }} />
                  </Grid>

                  {/* Feature flags */}
                  <Grid item xs={12}>
                    <Divider sx={{ mb: 1.5 }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Enabled Features</Typography>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" onClick={() => setForm(f => ({ ...f, features: featureKeys.reduce((a, k) => ({ ...a, [k]: true }), {}) }))}>All On</Button>
                        <Button size="small" onClick={() => setForm(f => ({ ...f, features: featureKeys.reduce((a, k) => ({ ...a, [k]: false }), {}) }))}>All Off</Button>
                      </Stack>
                    </Stack>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {featureKeys.map(key => (
                        <Chip key={key} label={featureLabels[key] || key} clickable
                          color={form.features[key] ? 'primary' : 'default'}
                          variant={form.features[key] ? 'filled' : 'outlined'}
                          onClick={() => setForm(f => ({ ...f, features: { ...f.features, [key]: !f.features[key] } }))}
                        />
                      ))}
                    </Box>
                  </Grid>

                  {/* Assigned Sections */}
                  {sections.length > 0 && (
                    <Grid item xs={12}>
                      <Divider sx={{ mb: 1.5 }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Custom Sections</Typography>

                      {form.assignedSectionIds.length > 0 && (
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Assigned — click × to remove
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {sections
                              .filter(sec => form.assignedSectionIds.includes(sec.id))
                              .map(sec => (
                                <Chip key={sec.id}
                                  label={sec.name}
                                  color="primary"
                                  icon={<AdminIcon name={sec.icon} size={14} />}
                                  onDelete={() => setForm(f => ({
                                    ...f,
                                    assignedSectionIds: f.assignedSectionIds.filter(id => id !== sec.id)
                                  }))}
                                />
                              ))
                            }
                          </Box>
                        </Box>
                      )}

                      {sections.some(sec => !form.assignedSectionIds.includes(sec.id)) && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Available — click to assign
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {sections
                              .filter(sec => !form.assignedSectionIds.includes(sec.id))
                              .map(sec => (
                                <Chip key={sec.id}
                                  label={sec.name}
                                  clickable
                                  variant="outlined"
                                  icon={<AdminIcon name={sec.icon} size={14} />}
                                  onClick={() => setForm(f => ({
                                    ...f,
                                    assignedSectionIds: [...f.assignedSectionIds, sec.id]
                                  }))}
                                />
                              ))
                            }
                          </Box>
                        </Box>
                      )}

                      {form.assignedSectionIds.length === 0 && orphanedSections.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          No sections assigned. Click a section above to assign it.
                        </Typography>
                      )}

                      {orphanedSections.length > 0 && (
                        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'warning.lighter', border: '1px solid', borderColor: 'warning.light' }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.dark', display: 'block', mb: 1 }}>
                            Deleted sections still assigned — save to remove them:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {orphanedSections.map(sec => (
                              <Chip key={sec.id}
                                label={sec.name}
                                color="warning"
                                size="small"
                                onDelete={() => setOrphanedSections(prev => prev.filter(s => s.id !== sec.id))}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Grid>
                  )}

                  <Grid item xs={12} sx={{ mt: 1 }}>
                    <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                      <Button variant="outlined" onClick={resetUserForm}>Cancel</Button>
                      <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSaveUser}>
                        Save Configuration
                      </Button>
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ===================== SUBSCRIPTIONS TAB ===================== */}
      {adminTab === 'subscriptions' && (
        <Box>
          {/* Stats row */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: 'Active Plans',    value: stats.active,       color: '#059669', icon: CheckCircle2 },
              { label: 'On Trial',        value: stats.trial,        color: '#f59e0b', icon: TrendingUp },
              { label: 'Expired',         value: stats.expired,      color: '#ef4444', icon: XCircle },
              { label: 'Admin Granted',   value: stats.adminGranted, color: '#8b5cf6', icon: Award },
            ].map(s => (
              <Grid item xs={6} sm={3} key={s.label}>
                <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha(s.color, 0.2), borderRadius: 2, bgcolor: alpha(s.color, 0.04) }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: s.color }}>{s.value}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                      </Box>
                      <s.icon size={20} color={s.color} />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Plan legend */}
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2.5, gap: 1 }}>
            {Object.entries(PLAN_META).map(([key, meta]) => (
              <Chip key={key} label={meta.label} size="small"
                sx={{ bgcolor: alpha(meta.color, 0.1), color: meta.color, fontWeight: 700, fontSize: '0.7rem', border: `1px solid ${alpha(meta.color, 0.25)}` }} />
            ))}
          </Stack>

          {/* Search */}
          <TextField
            size="small" placeholder="Search users by email…"
            value={subSearch} onChange={e => setSubSearch(e.target.value)}
            sx={{ mb: 2.5, maxWidth: 360 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }}
          />

          {/* User subscription cards */}
          <Stack spacing={2}>
            {filteredSubUsers.map(u => {
              const email = u.email || u.id;
              const sub = subscriptions[email];
              const bizSubs = sub ? parseBizSubsAdmin(sub) : {};
              const entries = Object.entries(bizSubs);
              const badge = getSubBadge(sub);
              return (
                <Card key={email} elevation={0} sx={{
                  border: '1px solid',
                  borderColor: badge ? alpha(badge.color, 0.2) : 'divider',
                  borderRadius: 2,
                  transition: 'box-shadow 0.15s',
                  '&:hover': { boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }
                }}>
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'flex-start' }} gap={2}>
                      {/* Left: user info + per-biz subs */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                          <Typography variant="body1" sx={{ fontWeight: 700, wordBreak: 'break-all' }}>{email}</Typography>
                          {u.isAdmin && <Chip label="Admin" size="small" color="primary" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }} />}
                          {u.allowed === false && <Chip label="Blocked" size="small" color="error" sx={{ height: 18, fontSize: '0.62rem' }} />}
                        </Stack>

                        {sub?.adminGrantedAll ? (
                          <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: alpha('#8b5cf6', 0.08), border: `1px solid ${alpha('#8b5cf6', 0.2)}`, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                            <Award size={14} color="#8b5cf6" />
                            <Typography variant="caption" sx={{ color: '#8b5cf6', fontWeight: 700 }}>
                              Admin Access — all businesses unrestricted
                              {sub.grantedBy ? ` · Granted by ${sub.grantedBy}` : ''}
                            </Typography>
                          </Box>
                        ) : entries.length > 0 ? (
                          <Stack spacing={0.75}>
                            {entries.map(([bId, biz]) => {
                              const meta = PLAN_META[biz.plan] || { label: biz.plan, color: '#666' };
                              const active = isSubActive(biz);
                              const dl = biz.endDate ? daysLeft(biz.endDate) : null;
                              return (
                                <Box key={bId} sx={{
                                  display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 1.5,
                                  border: '1px solid', borderColor: active ? alpha(meta.color, 0.25) : alpha('#ef4444', 0.2),
                                  bgcolor: active ? alpha(meta.color, 0.04) : alpha('#ef4444', 0.03),
                                }}>
                                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: active ? meta.color : '#ef4444', flexShrink: 0 }} />
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                      Business {bId} · <span style={{ color: meta.color }}>{meta.label}</span>
                                    </Typography>
                                    {biz.endDate && (
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
                                        {active ? 'Expires' : 'Expired'} {new Date(biz.endDate).toLocaleDateString('en-IN')}
                                        {dl !== null && active ? ` · ${dl} day${dl !== 1 ? 's' : ''} left` : ''}
                                        {biz.grantedBy ? ` · Granted by ${biz.grantedBy}` : ''}
                                      </Typography>
                                    )}
                                  </Box>
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Chip
                                      label={active ? 'Active' : 'Expired'} size="small"
                                      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700,
                                        bgcolor: active ? alpha(meta.color, 0.12) : alpha('#ef4444', 0.1),
                                        color: active ? meta.color : '#ef4444' }}
                                    />
                                    {active && (
                                      <Tooltip title="Revoke this subscription">
                                        <IconButton size="small" color="error"
                                          onClick={() => handleRevokeBizSub(email, bId)}
                                          sx={{ p: 0.4 }}>
                                          <XCircle size={14} />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Stack>
                                </Box>
                              );
                            })}
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.disabled">No subscription records.</Typography>
                        )}
                      </Box>

                      {/* Right: action buttons */}
                      <Stack spacing={1} sx={{ flexShrink: 0, alignItems: 'flex-end' }}>
                        <Button
                          size="small" variant="contained" startIcon={<Gift size={14} />}
                          onClick={() => openGrantDialog(email)}
                          sx={{ borderRadius: 2, fontSize: '0.75rem', textTransform: 'none', bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}>
                          Grant Subscription
                        </Button>
                        {sub?.adminGrantedAll ? (
                          <Button size="small" variant="outlined" color="error"
                            onClick={() => handleQuickAdminGrant(email, false)}
                            sx={{ borderRadius: 2, fontSize: '0.72rem', textTransform: 'none' }}>
                            Revoke Admin Grant
                          </Button>
                        ) : (
                          <Button size="small" variant="outlined" color="secondary"
                            onClick={() => handleQuickAdminGrant(email, true)}
                            sx={{ borderRadius: 2, fontSize: '0.72rem', textTransform: 'none' }}>
                            Grant Admin Access
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
            {filteredSubUsers.length === 0 && (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {subSearch ? 'No users match your search.' : 'No users yet.'}
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>
      )}

      {/* ===================== SECTION BUILDER TAB ===================== */}
      {adminTab === 'sections' && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Sections</Typography>
                  <Button size="small" startIcon={<Plus size={16} />} onClick={resetSectionForm}>New</Button>
                </Stack>
                <Divider sx={{ mb: 2 }} />

                {sections.length === 0 && (
                  <Box sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No sections yet.</Typography>
                    <Typography variant="caption" color="text.secondary">Click "New" to create your first section.</Typography>
                  </Box>
                )}

                <Stack spacing={1}>
                  {sections.map(sec => (
                    <Box key={sec.id} onClick={() => loadSection(sec)} sx={{
                      p: 1.5, borderRadius: 2, cursor: 'pointer', border: '1px solid',
                      borderColor: selectedSection?.id === sec.id ? 'primary.main' : 'divider',
                      bgcolor: selectedSection?.id === sec.id ? alpha('#1976d2', 0.06) : 'background.paper',
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      '&:hover': { borderColor: 'primary.main', bgcolor: alpha('#1976d2', 0.04) },
                      transition: 'all 0.15s'
                    }}>
                      <Box sx={{
                        width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                        bgcolor: sec.color || '#1976d2',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                      }}>
                        <AdminIcon name={sec.icon} size={18} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{sec.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {(() => {
                            const tabCount = (sec.tabs || []).length;
                            const totalFields = sec.tabs
                              ? sec.tabs.reduce((sum, t) => sum + (t.fields || []).length, 0)
                              : (sec.fields || []).length;
                            return tabCount > 1
                              ? `${tabCount} tabs · ${totalFields} fields`
                              : `${totalFields} field${totalFields !== 1 ? 's' : ''}`;
                          })()}
                          {sec.description ? ` · ${sec.description}` : ''}
                        </Typography>
                      </Box>
                      <IconButton size="small" color="error"
                        onClick={e => { e.stopPropagation(); confirmDeleteSection(sec.id, sec.name); }}>
                        <Trash2 size={14} />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2.5 }}>
                  {selectedSection ? `Editing: ${selectedSection.name}` : 'New Section'}
                </Typography>

                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Section Name *" value={sectionForm.name}
                      onChange={e => setSectionForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g., Measurements, Readings" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Description" value={sectionForm.description}
                      onChange={e => setSectionForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Short description of this section" />
                  </Grid>
                </Grid>

                {/* Color Picker */}
                <Box sx={{ mt: 3 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>Color</Typography>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                    {PRESET_COLORS.map(c => (
                      <Tooltip key={c} title={c}>
                        <Box onClick={() => setSectionForm(f => ({ ...f, color: c }))} sx={{
                          width: 30, height: 30, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                          border: '3px solid',
                          borderColor: sectionForm.color === c ? 'text.primary' : 'transparent',
                          boxShadow: sectionForm.color === c ? `0 0 0 2px white inset` : 'none',
                          transition: 'transform 0.15s',
                          '&:hover': { transform: 'scale(1.2)' }
                        }} />
                      </Tooltip>
                    ))}
                    <TextField size="small" label="Hex" value={sectionForm.color}
                      onChange={e => setSectionForm(f => ({ ...f, color: e.target.value }))}
                      sx={{ width: 120 }}
                      InputProps={{
                        startAdornment: <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: sectionForm.color, mr: 0.5, border: '1px solid rgba(0,0,0,.2)', flexShrink: 0 }} />
                      }} />
                  </Stack>
                </Box>

                {/* Icon Picker */}
                <Box sx={{ mt: 3 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>Icon</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 1 }}>
                    {SECTION_ICON_LIST.map(({ name, Icon }) => (
                      <Tooltip key={name} title={name}>
                        <Box onClick={() => setSectionForm(f => ({ ...f, icon: name }))} sx={{
                          height: 56, display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', gap: 0.5,
                          borderRadius: 1.5, cursor: 'pointer', border: '2px solid',
                          borderColor: sectionForm.icon === name ? sectionForm.color || 'primary.main' : 'divider',
                          bgcolor: sectionForm.icon === name ? alpha(sectionForm.color || '#1976d2', 0.08) : 'background.default',
                          '&:hover': { borderColor: sectionForm.color || 'primary.main', bgcolor: alpha(sectionForm.color || '#1976d2', 0.05) },
                          transition: 'all 0.15s'
                        }}>
                          <Icon size={20} color={sectionForm.icon === name ? sectionForm.color || '#1976d2' : '#666'} />
                          <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', textAlign: 'center', lineHeight: 1.2 }}>
                            {name}
                          </Typography>
                        </Box>
                      </Tooltip>
                    ))}
                  </Box>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Tabs & Fields Builder */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Tabs & Fields</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {sectionForm.tabs.length === 1
                        ? 'Single tab — users see fields directly with no tab bar.'
                        : `${sectionForm.tabs.length} tabs — users switch between tabs in the form.`}
                    </Typography>
                  </Box>
                  <Button size="small" startIcon={<Plus size={16} />} onClick={addTab}
                    variant="outlined" sx={{ borderRadius: 2, flexShrink: 0 }}>
                    Add Tab
                  </Button>
                </Stack>

                <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'stretch', overflowX: 'auto',
                    bgcolor: alpha(sectionForm.color || '#1976d2', 0.04),
                    borderBottom: '1px solid', borderColor: 'divider'
                  }}>
                    {sectionForm.tabs.map((tab, tabIdx) => {
                      const isActive = activeTabIdx === tabIdx;
                      return (
                        <Box key={tab.id} onClick={() => setActiveTabIdx(tabIdx)} sx={{
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none',
                          borderBottom: '3px solid',
                          borderBottomColor: isActive ? (sectionForm.color || 'primary.main') : 'transparent',
                          bgcolor: isActive ? alpha(sectionForm.color || '#1976d2', 0.10) : 'transparent',
                          color: isActive ? (sectionForm.color || 'primary.main') : 'text.secondary',
                          fontWeight: isActive ? 700 : 400,
                          fontSize: '0.8125rem',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s',
                          '&:hover': { bgcolor: alpha(sectionForm.color || '#1976d2', 0.07) }
                        }}>
                          {tab.name || `Tab ${tabIdx + 1}`}
                          <Chip size="small" label={tab.fields.length}
                            sx={{ height: 18, fontSize: '0.65rem', ml: 0.5,
                              bgcolor: isActive ? alpha(sectionForm.color || '#1976d2', 0.15) : 'transparent',
                              color: isActive ? (sectionForm.color || 'primary.main') : 'text.disabled'
                            }} />
                          {sectionForm.tabs.length > 1 && (
                            <IconButton size="small" color="error"
                              onClick={e => { e.stopPropagation(); removeTab(tabIdx); }}
                              sx={{ p: 0.2, ml: 0.25, opacity: isActive ? 1 : 0.4, '&:hover': { opacity: 1 } }}>
                              <X size={11} />
                            </IconButton>
                          )}
                        </Box>
                      );
                    })}
                  </Box>

                  {sectionForm.tabs[activeTabIdx] && (
                    <Box sx={{ p: 2 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                        <TextField
                          size="small" label="Tab Name" value={sectionForm.tabs[activeTabIdx].name}
                          onChange={e => updateTabName(activeTabIdx, e.target.value)}
                          sx={{ flex: 1 }}
                          inputProps={{ style: { fontWeight: 600 } }}
                        />
                        <Tooltip title="Move tab left">
                          <span>
                            <IconButton size="small" onClick={() => { moveTab(activeTabIdx, -1); setActiveTabIdx(i => Math.max(0, i - 1)); }}
                              disabled={activeTabIdx === 0}>
                              <ChevronUp size={16} style={{ transform: 'rotate(-90deg)' }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Move tab right">
                          <span>
                            <IconButton size="small" onClick={() => { moveTab(activeTabIdx, 1); setActiveTabIdx(i => Math.min(sectionForm.tabs.length - 1, i + 1)); }}
                              disabled={activeTabIdx === sectionForm.tabs.length - 1}>
                              <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>

                      {sectionForm.tabs[activeTabIdx].fields.length === 0 && (
                        <Box sx={{ py: 4, textAlign: 'center', border: '2px dashed', borderColor: 'divider', borderRadius: 2, mb: 1.5 }}>
                          <Typography variant="body2" color="text.secondary">No fields in this tab yet.</Typography>
                          <Typography variant="caption" color="text.secondary">Click "Add Field" to start.</Typography>
                        </Box>
                      )}

                      <Stack spacing={1.5}>
                        {sectionForm.tabs[activeTabIdx].fields.map((field, fieldIdx) => (
                          <Paper key={field.id} elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                              <Stack spacing={0} sx={{ flexShrink: 0 }}>
                                <IconButton size="small" onClick={() => moveField(activeTabIdx, fieldIdx, -1)} disabled={fieldIdx === 0} sx={{ p: 0.25 }}>
                                  <ChevronUp size={14} />
                                </IconButton>
                                <IconButton size="small" onClick={() => moveField(activeTabIdx, fieldIdx, 1)} disabled={fieldIdx === sectionForm.tabs[activeTabIdx].fields.length - 1} sx={{ p: 0.25 }}>
                                  <ChevronDown size={14} />
                                </IconButton>
                              </Stack>

                              <TextField size="small" label="Field Name" value={field.name}
                                onChange={e => updateField(activeTabIdx, fieldIdx, 'name', e.target.value)}
                                placeholder="e.g., Chest, Notes"
                                sx={{ flex: '2 1 130px', minWidth: 110 }} />

                              <TextField select size="small" label="Type" value={field.type}
                                onChange={e => updateField(activeTabIdx, fieldIdx, 'type', e.target.value)}
                                sx={{ flex: '1 1 110px', minWidth: 100 }}>
                                {FIELD_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                              </TextField>

                              {!['textarea', 'date', 'select', 'penalty'].includes(field.type) && (
                                <TextField size="small" label="Unit" value={field.unit}
                                  onChange={e => updateField(activeTabIdx, fieldIdx, 'unit', e.target.value)}
                                  placeholder="cm, kg…"
                                  sx={{ flex: '0 1 80px', width: 80 }} />
                              )}

                              <FormControlLabel
                                control={<Switch size="small" checked={!!field.required}
                                  onChange={e => updateField(activeTabIdx, fieldIdx, 'required', e.target.checked)}
                                  sx={{ ml: 0.5 }} />}
                                label={<Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>Required</Typography>}
                                sx={{ mx: 0, flexShrink: 0 }}
                              />

                              <IconButton size="small" color="error" onClick={() => removeField(activeTabIdx, field.id)} sx={{ flexShrink: 0 }}>
                                <X size={16} />
                              </IconButton>
                            </Stack>

                            {field.type === 'select' && (
                              <TextField fullWidth size="small" label="Options (comma-separated)" value={field.options}
                                onChange={e => updateField(activeTabIdx, fieldIdx, 'options', e.target.value)}
                                placeholder="Option 1, Option 2, Option 3"
                                sx={{ mt: 1.5 }} />
                            )}
                            {field.type === 'penalty' && (
                              <TextField fullWidth size="small" type="number" label="Rate per day (₹)"
                                value={field.ratePerDay || ''}
                                onChange={e => updateField(activeTabIdx, fieldIdx, 'ratePerDay', e.target.value)}
                                placeholder="e.g. 5"
                                helperText="Auto-calculates fine based on days past the due date field in the same form."
                                sx={{ mt: 1.5 }} />
                            )}
                            {field.type === 'counter' && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                                Counter tracks sessions used vs. total. Use the Unit field to label (e.g. sessions, classes, visits).
                              </Typography>
                            )}
                          </Paper>
                        ))}
                      </Stack>

                      <Button size="small" variant="outlined" startIcon={<Plus size={14} />}
                        onClick={() => addField(activeTabIdx)} sx={{ mt: 2, borderRadius: 2 }}>
                        Add Field to "{sectionForm.tabs[activeTabIdx].name || `Tab ${activeTabIdx + 1}`}"
                      </Button>
                    </Box>
                  )}
                </Paper>

                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  {selectedSection ? (
                    <Button variant="outlined" color="error" startIcon={<Trash2 size={16} />}
                      onClick={() => confirmDeleteSection(selectedSection.id, selectedSection.name || sectionForm.name)}>
                      Delete Section
                    </Button>
                  ) : <Box />}
                  <Stack direction="row" spacing={1.5}>
                    <Button variant="outlined" onClick={resetSectionForm}>Cancel</Button>
                    <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSaveSection}
                      sx={{ bgcolor: sectionForm.color || 'primary.main', '&:hover': { filter: 'brightness(0.9)', bgcolor: sectionForm.color || 'primary.main' } }}>
                      Save Section
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ===================== BILLING & TAX TAB ===================== */}
      {adminTab === 'billing' && (
        <Box sx={{ maxWidth: 880 }}>
          <AdminBilling />
        </Box>
      )}

      {/* ===================== GLOBAL SETTINGS TAB ===================== */}
      {adminTab === 'global' && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Landing Page Theme</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Controls the look of the public landing page seen by new visitors.
                </Typography>

                <Grid container spacing={2}>
                  {[
                    {
                      value: 'light',
                      title: 'Light Theme',
                      desc: 'Clean white background with soft shadows. Modern and professional.',
                      color: '#1976d2',
                      preview: { bg: '#f1f5f9', text: '#0f172a', accent: '#6366f1' },
                    },
                    {
                      value: 'dark',
                      title: 'Dark Theme',
                      desc: 'Deep dark background with glowing accents. Sleek and dramatic.',
                      color: '#7c3aed',
                      preview: { bg: '#090a0f', text: '#ffffff', accent: '#818cf8' },
                    },
                  ].map(opt => {
                    const selected = landingTheme === opt.value;
                    return (
                      <Grid item xs={12} sm={6} key={opt.value}>
                        <Box
                          onClick={() => setLandingTheme(opt.value)}
                          sx={{
                            border: '2px solid',
                            borderColor: selected ? opt.color : 'divider',
                            borderRadius: 2,
                            p: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            bgcolor: selected ? alpha(opt.color, 0.06) : 'background.paper',
                            '&:hover': { borderColor: opt.color, bgcolor: alpha(opt.color, 0.04) },
                          }}
                        >
                          <Box sx={{
                            height: 72, borderRadius: 1.5, mb: 1.5, overflow: 'hidden',
                            bgcolor: opt.preview.bg, border: '1px solid rgba(0,0,0,0.08)',
                            display: 'flex', flexDirection: 'column', p: 1, gap: 0.5,
                          }}>
                            <Box sx={{ height: 8, width: '60%', borderRadius: 1, bgcolor: opt.preview.accent, opacity: 0.9 }} />
                            <Box sx={{ height: 5, width: '80%', borderRadius: 1, bgcolor: opt.preview.text, opacity: 0.2 }} />
                            <Box sx={{ height: 5, width: '70%', borderRadius: 1, bgcolor: opt.preview.text, opacity: 0.15 }} />
                            <Box sx={{ mt: 'auto', height: 18, width: '45%', borderRadius: 1, bgcolor: opt.preview.accent, opacity: 0.85 }} />
                          </Box>

                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: selected ? opt.color : 'text.primary' }}>
                                {opt.title}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">{opt.desc}</Typography>
                            </Box>
                            {selected && (
                              <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: opt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ml: 1, mt: 0.3 }}>
                                <svg width="11" height="11" viewBox="0 0 12 10" fill="none">
                                  <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </Box>
                            )}
                          </Stack>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>

                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<Save size={16} />}
                    onClick={handleSaveGlobalSettings}
                    disabled={globalSettingsSaving}
                  >
                    {globalSettingsSaving ? 'Saving…' : 'Save Settings'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ===================== GRANT SUBSCRIPTION DIALOG ===================== */}
      <Dialog
        open={grantDialog.open}
        onClose={() => !grantSaving && setGrantDialog({ open: false, email: '' })}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#059669', 0.1) }}>
              <Gift size={20} color="#059669" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Grant Subscription</Typography>
              <Typography variant="caption" color="text.secondary">{grantDialog.email}</Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2.5 }}>
          <Stack spacing={3}>
            {/* Plan selection */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Select Plan</Typography>
              <Stack spacing={1}>
                {GRANT_PLAN_OPTIONS.map(opt => (
                  <Box
                    key={opt.value}
                    onClick={() => setGrantForm(f => ({ ...f, plan: opt.value }))}
                    sx={{
                      p: 1.5, borderRadius: 2, cursor: 'pointer', border: '2px solid',
                      borderColor: grantForm.plan === opt.value ? opt.color : 'divider',
                      bgcolor: grantForm.plan === opt.value ? alpha(opt.color, 0.06) : 'background.paper',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: opt.color, bgcolor: alpha(opt.color, 0.04) }
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: grantForm.plan === opt.value ? opt.color : 'text.primary' }}>
                        {opt.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{opt.desc}</Typography>
                    </Box>
                    {grantForm.plan === opt.value && (
                      <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: opt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="11" height="11" viewBox="0 0 12 10" fill="none">
                          <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>

            {/* Business ID */}
            <TextField
              label="Business ID"
              value={grantForm.businessId}
              onChange={e => setGrantForm(f => ({ ...f, businessId: e.target.value }))}
              helperText="Enter the business number (e.g., 1, 2, 3). Check the user's businesses in their app."
              fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start"><Building2 size={16} /></InputAdornment> }}
            />

            {/* Duration */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Duration</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                {DURATION_OPTIONS.map(d => (
                  <Chip
                    key={d.value}
                    label={d.label}
                    clickable
                    onClick={() => setGrantForm(f => ({ ...f, durationType: d.value }))}
                    color={grantForm.durationType === d.value ? 'primary' : 'default'}
                    variant={grantForm.durationType === d.value ? 'filled' : 'outlined'}
                    icon={<Calendar size={13} />}
                  />
                ))}
              </Box>

              {grantForm.durationType === 'custom' && (
                <TextField
                  label="End Date"
                  type="date"
                  fullWidth
                  value={grantForm.customEndDate}
                  onChange={e => setGrantForm(f => ({ ...f, customEndDate: e.target.value }))}
                  inputProps={{ min: new Date().toISOString().split('T')[0] }}
                  InputLabelProps={{ shrink: true }}
                />
              )}

              {grantForm.durationType !== 'custom' && (
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: alpha('#059669', 0.07), border: `1px solid ${alpha('#059669', 0.15)}` }}>
                  <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600 }}>
                    Expires: {(() => {
                      const end = computeEndDate(grantForm.durationType, '');
                      return end ? end.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
                    })()}
                  </Typography>
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setGrantDialog({ open: false, email: '' })} disabled={grantSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleGrantSubscription}
            disabled={grantSaving}
            startIcon={grantSaving ? <RefreshCw size={16} /> : <Gift size={16} />}
            sx={{ bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
          >
            {grantSaving ? 'Granting…' : 'Grant Subscription'}
          </Button>
        </DialogActions>
        {grantSaving && <LinearProgress color="success" />}
      </Dialog>
    </Box>
  );
};

export default Admin;
