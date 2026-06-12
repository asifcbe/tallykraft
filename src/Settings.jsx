import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, Grid,
  Divider, List, ListItem, ListItemText, IconButton, Alert, Avatar,
  FormControl, InputLabel, Select, MenuItem, Chip, FormControlLabel, Switch,
  InputAdornment, Stack, Tooltip, alpha, useTheme, useMediaQuery, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab
} from '@mui/material';
import { Save, Plus, Trash2, Building2, Check, Image, QrCode, FileSearch, RotateCcw, CornerUpLeft, Truck, BookOpen, CalendarRange, Printer, Users, Copy, KeyRound, Download, FileDown, SlidersHorizontal, Palette, Package, ReceiptText, Barcode, HardDrive, Clock, RefreshCw, Crown } from 'lucide-react';
import { exportFullBusinessToExcel, exportToTallyXML } from './exportUtils';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useBusiness } from './BusinessContext';
import { useThemeContext } from './ThemeContext';
import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { useDialog } from './DialogContext';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import SectionBuilder from './SectionBuilder';
import BillingPayments from './BillingPayments';
import AddBusinessDialog from './AddBusinessDialog';
import { useI18n } from './i18n/I18nContext';
import { firestore } from './db';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY || 'rzp_test_SgTH0ctSdvsPBb';

const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Plan tiers for the Add-Business payment dialog
const BIZ_PLAN_TIERS = [
  {
    name: 'Basic',
    tagline: 'All features · local data only · no online backup',
    plans: [
      { id: 'monthly', label: 'Monthly', price: 99, period: '/month', amount: 9900, isPro: false },
      { id: 'yearly', label: 'Yearly', price: 999, period: '/year', amount: 99900, isPro: false, badge: 'Save 16%' },
    ],
  },
  {
    name: 'Pro',
    tagline: 'All features + online cloud backup & multi-device sync',
    highlight: true,
    plans: [
      { id: 'monthly_pro', label: 'Monthly', price: 299, period: '/month', amount: 29900, isPro: true },
      { id: 'yearly_pro', label: 'Yearly', price: 2999, period: '/year', amount: 299900, isPro: true, badge: 'Best Value' },
    ],
  },
];

const STAFF_FEATURE_KEYS = [
  'dashboard', 'parties', 'items', 'pos', 'sales', 'purchases', 'expenses',
  'opticals', 'payments', 'reports', 'backup', 'settings', 'barcode',
  'backupExportFile', 'backupRestoreFile', 'backupOnline', 'backupRestoreOnline',
  'viewPurchasePrice'
];

const STAFF_FEATURE_LABELS = {
  dashboard: 'Dashboard', parties: 'Parties', items: 'Items', pos: 'POS', sales: 'Sales',
  purchases: 'Purchases', expenses: 'Expenses', opticals: 'Opticals',
  payments: 'Payments', reports: 'Reports', backup: 'Backup / Restore', settings: 'Settings', barcode: 'Barcode',
  backupExportFile: 'Export File', backupRestoreFile: 'Restore File',
  backupOnline: 'Backup Online', backupRestoreOnline: 'Restore Online',
  viewPurchasePrice: 'View Purchase Price',
};

const defaultStaffFeatures = () =>
  STAFF_FEATURE_KEYS.reduce((acc, key) => ({
    ...acc,
    [key]: !['backup', 'backupOnline', 'backupRestoreOnline', 'backupExportFile', 'backupRestoreFile', 'viewPurchasePrice'].includes(key)
  }), {});

const SettingsPage = () => {
  const { currentBusiness, businesses, switchBusiness, setCurrentBusinessId } = useBusiness();
  const { mode, primaryColor, updateTheme } = useThemeContext();
  const { t, lang, setLang, languages } = useI18n();
  const { config, saveConfig } = useConfig();
  const { data, addBusiness, updateBusiness, deleteBusiness: deleteBusinessFromData, deleteItem, getItems, createLocalBackup, listLocalBackups, restoreFromLocalBackup, deleteLocalBackup, backupToFirestore, allBusinessData, clearAllLocalData } = useData();
  const { confirm, showAlert } = useDialog();
  const { currentBusiness: authBusiness, isAdmin, staffSession, currentUser } = useAuth();
  const { activateSubscription } = useSubscription();
  const [uploading, setUploading] = useState({ logo: false, qrCode: false });
  const [activeTab, setActiveTab] = useState('profile'); // Settings tab key
  // "Delete all data on this device" confirmation.
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wiping, setWiping] = useState(false);
  const [formData, setFormData] = useState({
    name: '', gstNumber: '', address: '', phone: '', email: '', state: '',
    username: '', password: '', confirmPassword: '', fyStartMonth: 3
  });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isNew, setIsNew] = useState(false);
  const [featuresSaving, setFeaturesSaving] = useState(false);
  const [newExpenseCat, setNewExpenseCat] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  // Staff management state
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({
    name: '', username: '', password: '', active: true, features: defaultStaffFeatures()
  });
  const [showStaffPwd, setShowStaffPwd] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [staffMsg, setStaffMsg] = useState({ type: '', text: '' });

  // Local backup state
  const [localBackups, setLocalBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupMsg, setBackupMsg] = useState({ type: '', text: '' });
  const [backupLabel, setBackupLabel] = useState('');
  const [restoringId, setRestoringId] = useState(null);

  // Add-business payment dialog state
  const [showBizPayModal, setShowBizPayModal] = useState(false);
  const [pendingBizData, setPendingBizData] = useState(null);
  const [bizPaying, setBizPaying] = useState(null);
  const [bizPayError, setBizPayError] = useState('');
  const [showLock, setShowLock] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark || primary;
  const baseRadius = Number(theme.shape?.borderRadius) || 8;
  const cardSx = {
    elevation: 0,
    sx: {
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: `${baseRadius + 8}px`,
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)',
      transition: 'box-shadow .2s ease, border-color .2s ease',
      '&:hover': { boxShadow: '0 2px 6px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.08)' },
    },
  };
  const accentCardSx = {
    ...cardSx,
    sx: {
      ...cardSx.sx,
      borderTop: `3px solid ${primary}`,
      background: `linear-gradient(180deg, ${alpha(primary, 0.025)} 0%, transparent 120px)`,
    },
  };
  const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: `${baseRadius + 2}px` } };

  // Load staff from Firestore when business is available
  useEffect(() => {
    if (!authBusiness?.id) return;
    const ref = collection(firestore, 'businesses', authBusiness.id, 'staff');
    const unsub = onSnapshot(ref,
      snap => setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('Staff load error:', err)
    );
    return unsub;
  }, [authBusiness]);

  const resetStaffForm = () => {
    setSelectedStaff(null);
    setStaffForm({ name: '', username: '', password: '', active: true, features: defaultStaffFeatures() });
    setShowStaffPwd(false);
  };

  const loadStaff = (staff) => {
    setSelectedStaff(staff);
    setStaffForm({
      name: staff.name || '',
      username: staff.username || '',
      password: '',
      active: staff.active !== false,
      features: { ...defaultStaffFeatures(), ...(staff.features || {}) }
    });
    setShowStaffPwd(false);
  };

  const handleSaveStaff = async () => {
    if (!authBusiness?.id) { setStaffMsg({ type: 'error', text: 'No business linked to your account yet.' }); return; }
    if (!staffForm.name.trim()) { setStaffMsg({ type: 'error', text: 'Name is required.' }); return; }
    if (!staffForm.username.trim()) { setStaffMsg({ type: 'error', text: 'Username is required.' }); return; }
    if (!selectedStaff && !staffForm.password) { setStaffMsg({ type: 'error', text: 'Password is required for new staff.' }); return; }

    const username = staffForm.username.trim().toLowerCase();
    const duplicate = staffList.find(s => s.username === username && s.id !== selectedStaff?.id);
    if (duplicate) { setStaffMsg({ type: 'error', text: 'Username already taken.' }); return; }

    try {
      const staffId = selectedStaff?.id || `staff_${Date.now()}`;
      const staffData = {
        id: staffId,
        name: staffForm.name.trim(),
        username,
        active: staffForm.active,
        features: staffForm.features,
        ...(staffForm.password ? { password: staffForm.password } : {})
      };
      await setDoc(doc(firestore, 'businesses', authBusiness.id, 'staff', staffId), staffData, { merge: true });
      setStaffMsg({ type: 'success', text: selectedStaff ? 'Staff updated.' : 'Staff account created.' });
      if (!selectedStaff) resetStaffForm();
      else setSelectedStaff({ ...selectedStaff, ...staffData });
      setTimeout(() => setStaffMsg({ type: '', text: '' }), 3000);
    } catch (err) {
      setStaffMsg({ type: 'error', text: 'Failed: ' + err.message });
    }
  };

  const handleDeleteStaff = async (staff) => {
    if (!authBusiness?.id) return;
    const ok = await confirm({
      title: `Remove: ${staff.name}`,
      message: `Remove ${staff.name}'s account? They will no longer be able to log in.`,
      confirmLabel: 'Remove', variant: 'danger'
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(firestore, 'businesses', authBusiness.id, 'staff', staff.id));
      if (selectedStaff?.id === staff.id) resetStaffForm();
      setStaffMsg({ type: 'success', text: 'Staff account removed.' });
      setTimeout(() => setStaffMsg({ type: '', text: '' }), 3000);
    } catch (err) {
      setStaffMsg({ type: 'error', text: 'Failed: ' + err.message });
    }
  };

  const copyCode = () => {
    if (authBusiness?.businessCode) {
      navigator.clipboard.writeText(authBusiness.businessCode).catch(() => {});
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleFeatureToggle = async (featureKey, checked) => {
    const newFeatures = { ...(config.features || {}), [featureKey]: checked };
    setFeaturesSaving(true);
    try {
      await saveConfig({ features: newFeatures });
      setMsg({ type: 'success', text: 'Features updated.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to update features.' });
    } finally {
      setFeaturesSaving(false);
    }
  };

  // Keep the inline edit form in sync with the active business.
  useEffect(() => {
    if (currentBusiness) {
      setFormData({
        name: currentBusiness.name || '',
        gstNumber: currentBusiness.gstNumber || '',
        address: currentBusiness.address || '',
        phone: currentBusiness.phone || '',
        email: currentBusiness.email || '',
        state: currentBusiness.state || '',
        username: currentBusiness.username || '',
        password: '',
        confirmPassword: '',
        fyStartMonth: currentBusiness.fyStartMonth ?? 3,
        openingCash: currentBusiness.openingCash ?? 0
      });
      setShowLock(!!currentBusiness.password);
    }
  }, [currentBusiness]);

  useEffect(() => { loadLocalBackupsList(); }, []);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentBusiness?.id) return;
    setUploading(u => ({ ...u, logo: true }));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateBusiness(currentBusiness.id, { logo: reader.result });
        setMsg({ type: 'success', text: 'Logo updated.' });
      } catch (err) {
        setMsg({ type: 'error', text: 'Failed to update logo.' });
      }
      setUploading(u => ({ ...u, logo: false }));
    };
    reader.onerror = () => { setUploading(u => ({ ...u, logo: false })); setMsg({ type: 'error', text: 'Failed to read file.' }); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleQrCodeUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentBusiness?.id) return;
    setUploading(u => ({ ...u, qrCode: true }));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateBusiness(currentBusiness.id, { qrCode: reader.result });
        setMsg({ type: 'success', text: 'QR code updated.' });
      } catch (err) {
        setMsg({ type: 'error', text: 'Failed to update QR code.' });
      }
      setUploading(u => ({ ...u, qrCode: false }));
    };
    reader.onerror = () => { setUploading(u => ({ ...u, qrCode: false })); setMsg({ type: 'error', text: 'Failed to read file.' }); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = async () => {
    if (!currentBusiness?.id) return;
    try {
      await updateBusiness(currentBusiness.id, { logo: '' });
      setMsg({ type: 'success', text: 'Logo removed.' });
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to remove logo.' });
    }
  };

  const handleRemoveQrCode = async () => {
    if (!currentBusiness?.id) return;
    try {
      await updateBusiness(currentBusiness.id, { qrCode: '' });
      setMsg({ type: 'success', text: 'QR code removed.' });
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to remove QR code.' });
    }
  };

  // Create-new flow now lives in the AddBusinessDialog popup. It hands us the
  // assembled payload; we validate limits, then open the payment modal.
  const handleCreateBusiness = (businessData) => {
    if (!config.multiBusiness) {
      setMsg({ type: 'error', text: 'Multiple businesses feature is disabled. Please enable it in the admin panel.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
      return;
    }
    const maxBiz = config.maxBusinesses || 0;
    if (maxBiz > 0 && Object.keys(allBusinessData || {}).length >= maxBiz) {
      setMsg({ type: 'error', text: `Business limit reached (max ${maxBiz}). Contact your administrator to increase your limit.` });
      setTimeout(() => setMsg({ type: '', text: '' }), 5000);
      return;
    }
    setIsNew(false); // close the add dialog
    setPendingBizData(businessData);
    setBizPayError('');
    setShowBizPayModal(true);
  };

  const handleSaveListUpdate = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name || formData.name.trim() === '') {
      setMsg({ type: 'error', text: 'Business name is required!' });
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
      return;
    }

    try {
      if (currentBusiness?.id) {
        const updateData = {
          name: formData.name,
          gstNumber: formData.gstNumber || '',
          address: formData.address || '',
          phone: formData.phone || '',
          email: formData.email || '',
          state: formData.state || 'Unknown',
          fyStartMonth: Number(formData.fyStartMonth ?? 3),
          openingCash: Number(formData.openingCash) || 0,
          username: formData.username?.trim() || '',
          password: formData.password || currentBusiness.password || '',
        };
        
        const saved = await updateBusiness(currentBusiness.id, updateData);
        if (saved) {
          setMsg({ type: 'success', text: 'Business profile updated successfully!' });
        } else {
          setMsg({ type: 'error', text: 'Failed to update business. Please try again.' });
        }
      }
    } catch (err) {
      console.error("Save failed:", err);
      setMsg({ type: 'error', text: 'Failed to save: ' + (err.message || 'Unknown error') });
    }
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  };

  const handleBizSubscribe = async (plan) => {
    setBizPayError('');
    const loaded = await loadRazorpay();
    if (!loaded) { setBizPayError('Could not load payment gateway. Check your connection.'); return; }
    if (!RAZORPAY_KEY) { setBizPayError('Payment gateway not configured. Contact support.'); return; }

    setBizPaying(plan.id);
    const tierName = plan.isPro ? 'Pro' : 'Basic';
    const options = {
      key: RAZORPAY_KEY,
      amount: plan.amount,
      currency: 'INR',
      name: 'TallyKraft',
      description: `${tierName} ${plan.label} Plan${pendingBizData?.name ? ` — ${pendingBizData.name}` : ''}`,
      prefill: { email: currentUser?.email || '', name: currentUser?.displayName || '' },
      theme: { color: primary },
      modal: { ondismiss: () => setBizPaying(null) },
      handler: async (response) => {
        try {
          const id = await addBusiness(pendingBizData);
          if (!id) { setBizPayError('Business creation failed after payment. Contact support with ID: ' + response.razorpay_payment_id); setBizPaying(null); return; }
          await activateSubscription(String(id), plan.id, response.razorpay_payment_id);
          // Business plan: immediately push local data to Firestore so cloud sync is active.
          if (plan.isPro) {
            await backupToFirestore().catch(() => {});
          }
          setCurrentBusinessId(id);
          setIsNew(false);
          setShowBizPayModal(false);
          setPendingBizData(null);
          setMsg({ type: 'success', text: `"${pendingBizData?.name}" created with ${tierName} plan!` });
          setTimeout(() => setMsg({ type: '', text: '' }), 4000);
        } catch (err) {
          setBizPayError('Payment received but activation failed. Contact support with ID: ' + response.razorpay_payment_id);
        }
        setBizPaying(null);
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', () => { setBizPayError('Payment failed. Please try again.'); setBizPaying(null); });
    rzp.open();
  };

  const handleDeleteBusiness = async (id) => {
    const bizToDelete = businesses.find(b => b.id === id);
    if (!bizToDelete) return;

    if (businesses.length <= 1) {
      await showAlert({ title: 'Cannot delete', message: 'You need at least one business at all times.', variant: 'warning' });
      return;
    }

    const ok = await confirm({
      title: `Delete "${bizToDelete.name}"`,
      message: `EXTREME CAUTION: This will permanently delete "${bizToDelete.name}" along with ALL its parties, items, invoices, and transactions. This cannot be undone.`,
      confirmLabel: 'Delete Business',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const otherBusiness = businesses.find(b => b.id !== id);
      
      // Delete all related data
      const parties = getItems('parties').filter(p => p.businessId === id);
      const items = getItems('items').filter(i => i.businessId === id);
      const sales = getItems('sales').filter(s => s.businessId === id);
      const purchases = getItems('purchases').filter(p => p.businessId === id);
      const expenses = getItems('expenses').filter(e => e.businessId === id);
      const payments = getItems('payments').filter(p => p.businessId === id);
      const opticals = getItems('opticals').filter(o => o.businessId === id);
      
      // Delete all related data (in parallel for better performance)
      await Promise.all([
        ...parties.map(party => deleteItem('parties', party.id)),
        ...items.map(item => deleteItem('items', item.id)),
        ...sales.map(sale => deleteItem('sales', sale.id)),
        ...purchases.map(purchase => deleteItem('purchases', purchase.id)),
        ...expenses.map(expense => deleteItem('expenses', expense.id)),
        ...payments.map(payment => deleteItem('payments', payment.id)),
        ...opticals.map(optical => deleteItem('opticals', optical.id))
      ]);

      // Delete the business
      const deleted = await deleteBusinessFromData(id);
      
      if (deleted) {
        if (id === currentBusiness?.id && otherBusiness) {
          switchBusiness(otherBusiness.id);
        }
        setMsg({ type: 'success', text: 'Business and all its data deleted.' });
      } else {
        setMsg({ type: 'error', text: 'Failed to delete business. Please try again.' });
      }
    } catch (err) {
      console.error("Deletion failed:", err);
      setMsg({ type: 'error', text: 'Deletion failed: ' + (err.message || 'Unknown error') });
    }
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  };

  // Load local backups
  const loadLocalBackupsList = async () => {
    setBackupsLoading(true);
    try {
      const list = await listLocalBackups();
      setLocalBackups(list);
    } catch (_) {}
    setBackupsLoading(false);
  };

  const handleCreateBackup = async () => {
    setBackupCreating(true);
    setBackupMsg({ type: '', text: '' });
    const result = await createLocalBackup(backupLabel.trim());
    if (result.success) {
      setBackupLabel('');
      setBackupMsg({ type: 'success', text: 'Backup created successfully.' });
      await loadLocalBackupsList();
    } else {
      setBackupMsg({ type: 'error', text: result.error || 'Backup failed.' });
    }
    setBackupCreating(false);
    setTimeout(() => setBackupMsg({ type: '', text: '' }), 3500);
  };

  const handleRestoreBackup = async (id, label) => {
    const ok = await confirm({ title: 'Restore Backup', message: `Restore "${label}"? Current data will be replaced.`, confirmLabel: 'Restore', variant: 'danger' });
    if (!ok) return;
    setRestoringId(id);
    const result = await restoreFromLocalBackup(id);
    if (result.success) {
      setBackupMsg({ type: 'success', text: 'Backup restored. Reload the page to see the changes.' });
      await loadLocalBackupsList();
    } else {
      setBackupMsg({ type: 'error', text: result.error || 'Restore failed.' });
    }
    setRestoringId(null);
    setTimeout(() => setBackupMsg({ type: '', text: '' }), 4000);
  };

  const handleDeleteBackup = async (id, label) => {
    const ok = await confirm({ title: 'Delete Backup', message: `Delete backup "${label}"? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    await deleteLocalBackup(id);
    await loadLocalBackupsList();
  };

  // Shared section-header renderer
  const SH = ({ icon: Icon, title, subtitle, action }) => (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            p: 1, borderRadius: `${baseRadius + 4}px`,
            background: `linear-gradient(135deg, ${alpha(primary, 0.18)} 0%, ${alpha(primary, 0.08)} 100%)`,
            border: `1px solid ${alpha(primary, 0.22)}`, display: 'flex', flexShrink: 0,
          }}>
            <Icon size={17} color={primary} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: 'block', mt: 0.1 }}>{subtitle}</Typography>}
          </Box>
        </Box>
        {action}
      </Box>
      <Box sx={{ mt: 1.5, height: 1, background: `linear-gradient(90deg, ${alpha(primary, 0.25)} 0%, transparent 70%)`, borderRadius: 1 }} />
    </Box>
  );

  // Shared primary gradient button sx
  const gradBtnSx = {
    borderRadius: `${baseRadius + 2}px`,
    background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
    boxShadow: `0 4px 12px ${alpha(primary, 0.32)}`,
    fontWeight: 700,
    '&:hover': { boxShadow: `0 6px 18px ${alpha(primary, 0.42)}`, opacity: 0.93, background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)` },
  };

  return (
    <>
    <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 8 }}>

      {/* ── Page header banner ── */}
      <Box sx={{
        background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
        borderRadius: `${baseRadius + 10}px`,
        px: 3, py: 2.5, mb: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap',
        boxShadow: `0 8px 32px ${alpha(primary, 0.22)}`,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', right: 40, bottom: -30, width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.18)', borderRadius: '12px', p: 1, display: 'flex' }}>
            <SlidersHorizontal size={22} color="white" />
          </Box>
          <Box>
            <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2 }}>Settings</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.82rem' }}>Configure your business profile and app preferences</Typography>
          </Box>
        </Box>
        {currentBusiness && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: `${baseRadius + 4}px`, px: 1.5, py: 0.75 }}>
            <Avatar sx={{ width: 24, height: 24, fontSize: '0.68rem', fontWeight: 800, bgcolor: 'rgba(255,255,255,0.3)', color: 'white' }}>
              {(currentBusiness.name?.[0] || '?').toUpperCase()}
            </Avatar>
            <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.8rem' }}>{currentBusiness.name}</Typography>
          </Box>
        )}
      </Box>

      {msg.text && (
        <Alert severity={msg.type} variant="filled" sx={{ mb: 3, borderRadius: `${baseRadius + 4}px` }}>
          {msg.text}
        </Alert>
      )}

      {/* ── Settings tabs ── */}
      <Box sx={{ mb: 3, p: 0.5, borderRadius: `${baseRadius + 6}px`, border: '1px solid', borderColor: 'divider', bgcolor: alpha(primary, 0.02) }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          TabIndicatorProps={{ sx: { display: 'none' } }}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              textTransform: 'none', fontWeight: 700, minHeight: 40, fontSize: '0.85rem',
              borderRadius: `${baseRadius + 3}px`, mr: 0.5, color: 'text.secondary',
              transition: 'all .15s ease',
              '&:hover': { bgcolor: alpha(primary, 0.06), color: 'text.primary' },
            },
            '& .Mui-selected': {
              color: '#fff !important',
              background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
              boxShadow: `0 4px 12px ${alpha(primary, 0.35)}`,
            },
          }}
        >
          <Tab value="profile" icon={<Building2 size={16} />} iconPosition="start" label={t('settings.profile')} />
          <Tab value="features" icon={<Package size={16} />} iconPosition="start" label={t('settings.features')} />
          <Tab value="invoice" icon={<ReceiptText size={16} />} iconPosition="start" label={t('settings.invoice')} />
          {isAdmin && !staffSession && <Tab value="staff" icon={<Users size={16} />} iconPosition="start" label={t('nav.staff')} />}
          <Tab value="billing" icon={<ReceiptText size={16} />} iconPosition="start" label={t('settings.billing')} />
          <Tab value="appearance" icon={<Palette size={16} />} iconPosition="start" label={t('settings.appearance')} />
          <Tab value="data" icon={<HardDrive size={16} />} iconPosition="start" label={t('settings.data')} />
        </Tabs>
      </Box>

      {/* ── Business Profile ── */}
      <Box sx={{ mb: 5, display: activeTab === 'profile' ? 'block' : 'none' }}>
        <SH icon={Building2} title="Business Profile" subtitle="Your business details printed on every invoice" />
        <Grid container spacing={3}>
          <Grid item xs={12} md={config.multiBusiness ? 7 : 12}>
            <Card elevation={0} sx={{ ...accentCardSx.sx }}>
              <CardContent sx={{ p: 3 }}>
                <form onSubmit={handleSaveListUpdate}>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12}>
                      <TextField size="small" fullWidth label="Business Name *" required
                        placeholder="e.g. Acme Traders"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        sx={fieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField size="small" fullWidth label="GSTIN" placeholder="Optional"
                        value={formData.gstNumber}
                        onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                        sx={fieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField size="small" fullWidth label="Phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        sx={fieldSx} />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField size="small" fullWidth label="Address" multiline rows={2}
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        sx={fieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Financial Year Start</InputLabel>
                        <Select value={formData.fyStartMonth} label="Financial Year Start"
                          onChange={(e) => setFormData({ ...formData, fyStartMonth: e.target.value })}
                          MenuProps={{ PaperProps: { sx: { minWidth: 260 } } }}>
                          <MenuItem value={3}>April (India standard)</MenuItem>
                          <MenuItem value={0}>January (Calendar year)</MenuItem>
                          <MenuItem value={6}>July</MenuItem>
                          <MenuItem value={9}>October</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        size="small" fullWidth type="number"
                        label={t('cash.opening')}
                        value={formData.openingCash ?? 0}
                        onChange={(e) => setFormData({ ...formData, openingCash: e.target.value })}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                        helperText="Cash on hand when you start tracking"
                        sx={fieldSx} />
                    </Grid>

                    {(
                      <>
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, mb: 0.5 }}>
                            <Image size={13} color={primary} />
                            <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.63rem', lineHeight: 1 }}>
                              Branding
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Box sx={{ border: '1px dashed', borderColor: alpha(primary, 0.3), borderRadius: `${baseRadius + 4}px`, p: 2, textAlign: 'center', bgcolor: alpha(primary, 0.02) }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>Business Logo</Typography>
                            {currentBusiness?.logo ? (
                              <Box>
                                <img src={currentBusiness.logo} alt="Logo" style={{ maxHeight: 72, maxWidth: '100%', objectFit: 'contain' }} />
                                <Box sx={{ mt: 1, display: 'flex', gap: 1, justifyContent: 'center' }}>
                                  <Button size="small" variant="outlined" component="label" disabled={uploading.logo} sx={{ borderRadius: `${baseRadius}px` }}>
                                    Change<input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                                  </Button>
                                  <Button size="small" color="error" onClick={handleRemoveLogo} sx={{ borderRadius: `${baseRadius}px` }}>Remove</Button>
                                </Box>
                              </Box>
                            ) : (
                              <Button size="small" variant="outlined" component="label" startIcon={<Image size={14} />} disabled={uploading.logo} sx={{ borderRadius: `${baseRadius}px` }}>
                                Upload Logo<input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                              </Button>
                            )}
                          </Box>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Box sx={{ border: '1px dashed', borderColor: alpha(primary, 0.3), borderRadius: `${baseRadius + 4}px`, p: 2, textAlign: 'center', bgcolor: alpha(primary, 0.02) }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>Payment QR Code</Typography>
                            {currentBusiness?.qrCode ? (
                              <Box>
                                <img src={currentBusiness.qrCode} alt="QR" style={{ width: 72, height: 72, objectFit: 'contain' }} />
                                <Box sx={{ mt: 1, display: 'flex', gap: 1, justifyContent: 'center' }}>
                                  <Button size="small" variant="outlined" component="label" disabled={uploading.qrCode} sx={{ borderRadius: `${baseRadius}px` }}>
                                    Change<input type="file" hidden accept="image/*" onChange={handleQrCodeUpload} />
                                  </Button>
                                  <Button size="small" color="error" onClick={handleRemoveQrCode} sx={{ borderRadius: `${baseRadius}px` }}>Remove</Button>
                                </Box>
                              </Box>
                            ) : (
                              <Button size="small" variant="outlined" component="label" startIcon={<QrCode size={14} />} disabled={uploading.qrCode} sx={{ borderRadius: `${baseRadius}px` }}>
                                Upload QR Code<input type="file" hidden accept="image/*" onChange={handleQrCodeUpload} />
                              </Button>
                            )}
                          </Box>
                        </Grid>
                      </>
                    )}

                    <Grid item xs={12}>
                      <Box sx={{
                        mt: 1, borderRadius: `${baseRadius + 4}px`,
                        border: `1px dashed ${showLock ? alpha(primary, 0.35) : 'divider'}`,
                        bgcolor: showLock ? alpha(primary, 0.03) : 'transparent',
                        overflow: 'hidden', transition: 'all 0.2s',
                      }}>
                        <Box
                          onClick={() => { setShowLock(v => !v); if (showLock) { setFormData(f => ({ ...f, password: '', confirmPassword: '', username: '' })); } }}
                          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, cursor: 'pointer',
                            '&:hover': { bgcolor: alpha(primary, 0.04) } }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <KeyRound size={14} color={showLock ? primary : '#999'} />
                            <Typography variant="body2" sx={{ fontWeight: 700, color: showLock ? primary : 'text.secondary', fontSize: '0.85rem' }}>
                              {showLock ? 'Business Lock Enabled' : 'Add Business Lock'}
                            </Typography>
                            {!showLock && <Typography variant="caption" color="text.disabled">— optional</Typography>}
                          </Box>
                          <Typography variant="caption" sx={{ color: primary, fontWeight: 700, fontSize: '0.72rem' }}>
                            {showLock ? 'Remove ✕' : 'Set up →'}
                          </Typography>
                        </Box>
                        {showLock && (
                          <Box sx={{ px: 2, pb: 2 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, lineHeight: 1.5 }}>
                              A password prompt appears when switching to this business from another.
                            </Typography>
                            <Grid container spacing={1.5}>
                              <Grid item xs={12} sm={4}>
                                <TextField size="small" fullWidth label="Username" placeholder="Optional"
                                  value={formData.username}
                                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                  sx={fieldSx} />
                              </Grid>
                              <Grid item xs={12} sm={4}>
                                <TextField size="small" fullWidth label="New Password" type="password"
                                  placeholder={currentBusiness?.password ? 'Blank = keep current' : 'Required'}
                                  value={formData.password}
                                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                  sx={fieldSx} />
                              </Grid>
                              <Grid item xs={12} sm={4}>
                                <TextField size="small" fullWidth label="Confirm" type="password"
                                  placeholder="Re-enter"
                                  value={formData.confirmPassword}
                                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                  error={formData.password !== formData.confirmPassword && formData.confirmPassword !== ''}
                                  helperText={formData.password !== formData.confirmPassword && formData.confirmPassword !== '' ? 'Mismatch' : ''}
                                  sx={fieldSx} />
                              </Grid>
                            </Grid>
                          </Box>
                        )}
                      </Box>
                    </Grid>

                    <Grid item xs={12} sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Button type="submit" variant="contained" fullWidth startIcon={<Save size={16} />} sx={gradBtnSx}>
                        Save Profile
                      </Button>
                    </Grid>
                  </Grid>
                </form>
              </CardContent>
            </Card>
          </Grid>

          {config.multiBusiness && (
            <Grid item xs={12} md={5}>
              <Card elevation={0} sx={{ ...cardSx.sx, height: '100%' }}>
                <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Building2 size={15} color={primary} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>Businesses</Typography>
                  </Box>
                  <Button size="small" startIcon={<Plus size={14} />}
                    sx={{ borderRadius: `${baseRadius}px`, fontSize: '0.75rem' }}
                    onClick={() => setIsNew(true)}>
                    Add New
                  </Button>
                </Box>
                <Box sx={{ p: 1.5 }}>
                  {businesses.map((biz) => {
                    const isActive = biz.id === currentBusiness?.id;
                    return (
                      <Box key={biz.id} sx={{
                        mb: 1, p: 1.5, borderRadius: `${baseRadius + 4}px`,
                        border: '1px solid', borderColor: isActive ? alpha(primary, 0.4) : 'divider',
                        bgcolor: isActive ? alpha(primary, 0.05) : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        cursor: isActive ? 'default' : 'pointer',
                        transition: 'all 0.15s',
                        '&:hover': !isActive ? { borderColor: alpha(primary, 0.25), bgcolor: alpha(primary, 0.02) } : {},
                      }} onClick={() => { if (!isActive) { setIsNew(false); switchBusiness(biz.id); } }}>
                        <Avatar sx={{ width: 34, height: 34, fontSize: '0.8rem', bgcolor: isActive ? primary : alpha(primary, 0.15), color: isActive ? 'white' : primary, fontWeight: 700 }}>
                          {(biz.name?.[0] || '?').toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: isActive ? primary : 'text.primary', lineHeight: 1.2 }}>{biz.name}</Typography>
                            {biz.password && <Tooltip title="Password protected"><KeyRound size={11} color={isActive ? primary : '#aaa'} /></Tooltip>}
                          </Box>
                          <Typography variant="caption" color="text.secondary">{biz.gstNumber || 'No GSTIN'}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          {isActive ? (
                            <Chip label="Active" size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: alpha(primary, 0.12), color: primary, fontWeight: 700 }} />
                          ) : (
                            <Tooltip title="Switch"><IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); setIsNew(false); switchBusiness(biz.id); }}><Check size={15} /></IconButton></Tooltip>
                          )}
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" disabled={businesses.length <= 1}
                              onClick={(e) => { e.stopPropagation(); handleDeleteBusiness(biz.id); }}>
                              <Trash2 size={15} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Card>
            </Grid>
          )}
        </Grid>
      </Box>

      {/* ── Features / Modules ── */}
      <Box sx={{ mb: 5, display: activeTab === 'features' ? 'block' : 'none' }}>
        <SH icon={Package} title={t("settings.features")} subtitle="Enable or disable modules — disabled ones are hidden from the menu" />
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <CardContent sx={{ p: 2.5 }}>
            <Grid container spacing={1.25}>
              {[
                { key: 'estimates',     icon: FileSearch,   label: 'Estimates',      desc: 'Quotes & pro-forma invoices' },
                { key: 'creditNotes',   icon: RotateCcw,    label: 'Credit Notes',   desc: 'Sales returns & credit memos' },
                { key: 'debitNotes',    icon: CornerUpLeft, label: 'Debit Notes',    desc: 'Purchase returns & debit memos' },
                { key: 'deliveryNotes', icon: Truck,        label: 'Delivery Notes', desc: 'Delivery challans' },
                { key: 'journal',       icon: BookOpen,     label: 'Journal',        desc: 'Double-entry journal entries' },
                { key: 'barcode',       icon: Barcode,      label: 'Barcodes',       desc: 'Barcode generation & scanning' },
                { key: 'staff',         icon: Users,        label: 'Staff Management', desc: 'Track staff, attendance & salary' },
              ].map(({ key, icon: Icon, label, desc }) => {
                const on = !!config.features?.[key];
                return (
                  <Grid item xs={12} sm={6} md={4} key={key}>
                    <Box
                      onClick={() => !featuresSaving && handleFeatureToggle(key, !on)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        p: 1.75, borderRadius: `${baseRadius + 4}px`,
                        border: '1px solid', borderColor: on ? alpha(primary, 0.35) : 'divider',
                        bgcolor: on ? alpha(primary, 0.05) : 'transparent',
                        cursor: featuresSaving ? 'default' : 'pointer',
                        transition: 'all 0.18s',
                        '&:hover': { borderColor: on ? alpha(primary, 0.5) : alpha(primary, 0.2), bgcolor: on ? alpha(primary, 0.07) : alpha(primary, 0.02) },
                      }}
                    >
                      <Box sx={{ p: 0.75, borderRadius: '8px', bgcolor: on ? alpha(primary, 0.12) : 'rgba(0,0,0,0.05)', display: 'flex', flexShrink: 0 }}>
                        <Icon size={15} color={on ? primary : '#999'} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: on ? primary : 'text.primary', lineHeight: 1.2 }}>{label}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{desc}</Typography>
                      </Box>
                      <Switch size="small" checked={on} disabled={featuresSaving}
                        onChange={(e) => { e.stopPropagation(); handleFeatureToggle(key, e.target.checked); }}
                        sx={{ flexShrink: 0 }} />
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      </Box>

      {/* ── Custom Sections (builder + templates) ── */}
      <Box sx={{ mb: 5, display: activeTab === 'features' ? 'block' : 'none' }}>
        <SH icon={Package} title="Custom Sections" subtitle="Build your own section or start from a ready-made business template" />
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <CardContent sx={{ p: 2.5 }}>
            <SectionBuilder />
          </CardContent>
        </Card>
      </Box>

      {/* ── Lists & Categories ── */}
      <Box sx={{ mb: 5, display: activeTab === 'invoice' ? 'block' : 'none' }}>
        <SH icon={BookOpen} title="Lists & Categories" subtitle="Customize dropdown options used across the app" />
        <Grid container spacing={2.5}>
          {[
            {
              label: 'Expense Categories', placeholder: 'New category…',
              items: config.expenseCategories || [], val: newExpenseCat, setVal: setNewExpenseCat,
              onAdd: async (v) => { const cats = config.expenseCategories || []; if (!cats.includes(v)) await saveConfig({ ...config, expenseCategories: [...cats, v] }); },
              onDelete: async (v) => { await saveConfig({ ...config, expenseCategories: (config.expenseCategories || []).filter(c => c !== v) }); },
            },
            {
              label: 'Item Units', placeholder: 'New unit… (e.g. Ream)',
              items: config.itemUnits || [], val: newItemUnit, setVal: setNewItemUnit,
              onAdd: async (v) => { const units = config.itemUnits || []; if (!units.includes(v)) await saveConfig({ ...config, itemUnits: [...units, v] }); },
              onDelete: async (v) => { await saveConfig({ ...config, itemUnits: (config.itemUnits || []).filter(u => u !== v) }); },
            },
          ].map(({ label, placeholder, items, val, setVal, onAdd, onDelete }) => (
            <Grid item xs={12} md={6} key={label}>
              <Card elevation={0} sx={{ ...cardSx.sx, height: '100%' }}>
                <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{label}</Typography>
                </Box>
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <TextField size="small" fullWidth placeholder={placeholder}
                      value={val}
                      onChange={e => setVal(e.target.value)}
                      onKeyDown={async e => { if (e.key === 'Enter' && val.trim()) { await onAdd(val.trim()); setVal(''); } }}
                      sx={fieldSx} />
                    <Button variant="contained" disableElevation size="small" startIcon={<Plus size={14} />}
                      sx={{ borderRadius: `${baseRadius + 2}px`, px: 1.5, flexShrink: 0 }}
                      onClick={async () => { if (!val.trim()) return; await onAdd(val.trim()); setVal(''); }}>
                      Add
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {items.map(item => (
                      <Chip key={item} label={item} size="small"
                        sx={{ borderRadius: `${baseRadius}px`, border: `1px solid ${alpha(primary, 0.25)}`, bgcolor: alpha(primary, 0.05), color: primary, fontWeight: 600, fontSize: '0.72rem' }}
                        onDelete={async () => onDelete(item)} />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── Print & Invoice ── */}
      <Box sx={{ mb: 5, display: activeTab === 'invoice' ? 'block' : 'none' }}>
        <SH icon={ReceiptText} title="Print & Invoice" subtitle="Default settings used when printing bills and documents" />
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          {/* Paper size + date format row */}
          <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Box sx={{ minWidth: 180 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.75 }}>Default Paper Size</Typography>
              <FormControl fullWidth size="small" sx={fieldSx}>
                <Select value={config.defaultPaperSize || 'A4'} displayEmpty
                  onChange={async (e) => { await saveConfig({ ...config, defaultPaperSize: e.target.value }); }}>
                  {['A4', 'A5', 'Letter', 'Legal', 'Thermal 80mm', 'Thermal 58mm'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ minWidth: 180 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.75 }}>Date Format</Typography>
              <FormControl fullWidth size="small" sx={fieldSx}>
                <Select value={config.billPrintOptions?.dateFormat || 'DD/MM/YYYY'}
                  onChange={async (e) => { await saveConfig({ ...config, billPrintOptions: { ...(config.billPrintOptions || {}), dateFormat: e.target.value } }); }}>
                  {['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD MMM YYYY'].map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          </Box>

          {/* Bill print toggles */}
          {(() => {
            const bpo = config.billPrintOptions || {};
            const toggle = async (key) => { await saveConfig({ ...config, billPrintOptions: { ...bpo, [key]: !bpo[key] } }); };
            const options = [
              { key: 'showLogo',           label: 'Business Logo',        desc: 'Logo at the top of the bill' },
              { key: 'showGSTIN',          label: 'GSTIN Number',         desc: 'Print GST registration number' },
              { key: 'showInvoiceNumber',  label: 'Invoice Number',       desc: 'Show bill / invoice number' },
              { key: 'showDate',           label: 'Date',                 desc: 'Print the bill date' },
              { key: 'showGSTColumn',      label: 'GST % Column',         desc: 'GST% column in items table' },
              { key: 'showDiscountColumn', label: 'Discount % Column',    desc: 'Disc% column in items table' },
              { key: 'showCGSTSGST',       label: 'CGST & SGST Split',    desc: 'Separate CGST + SGST lines (intra-state)' },
              { key: 'showIGST',           label: 'IGST',                 desc: 'Show IGST line (inter-state)' },
              { key: 'showOldBalance',     label: 'Opening Balance',      desc: 'Include pending / opening balance' },
              { key: 'showTerms',          label: 'Terms & Conditions',   desc: 'Print terms at the bottom' },
              { key: 'showSignature',      label: 'Signature Block',      desc: 'Authorized signatory section' },
            ];
            return (
              <Box sx={{ p: 2.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1.5 }}>
                  Bill Sections
                </Typography>
                <Grid container spacing={1.25}>
                  {options.map(({ key, label, desc }) => {
                    const isDefaultFalse = key === 'showOldBalance' || key === 'showCGSTSGST' || key === 'showIGST';
                    const isChecked = isDefaultFalse ? (bpo[key] === true) : (bpo[key] !== false);
                    return (
                      <Grid item xs={12} sm={6} key={key}>
                        <Box
                          onClick={() => toggle(key)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 1.5,
                            p: 1.5, borderRadius: `${baseRadius + 4}px`, cursor: 'pointer',
                            border: '1px solid', borderColor: isChecked ? alpha(primary, 0.35) : 'divider',
                            bgcolor: isChecked ? alpha(primary, 0.04) : 'transparent',
                            transition: 'all 0.18s',
                            '&:hover': { borderColor: alpha(primary, isChecked ? 0.5 : 0.2) },
                          }}
                        >
                          <Switch size="small" checked={isChecked} onChange={() => toggle(key)} sx={{ flexShrink: 0 }} />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2, color: isChecked ? primary : 'text.primary' }}>{label}</Typography>
                            <Typography variant="caption" color="text.secondary">{desc}</Typography>
                          </Box>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            );
          })()}
        </Card>
      </Box>

      {/* ── Staff Management ── */}
      {isAdmin && !staffSession && (
        <Box sx={{ mb: 5, display: activeTab === 'staff' ? 'block' : 'none' }}>
          <SH icon={Users} title={t("nav.staff")} subtitle="Create accounts and control feature access per staff member" />

          {authBusiness?.businessCode && (
            <Box sx={{
              mb: 3, p: 2.5, borderRadius: `${baseRadius + 6}px`,
              background: `linear-gradient(135deg, ${alpha(primary, 0.08)} 0%, ${alpha(primary, 0.03)} 100%)`,
              border: `1px solid ${alpha(primary, 0.2)}`,
              display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap',
            }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: primary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Business Code — Share with Staff
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                  <Typography sx={{ fontWeight: 900, letterSpacing: 8, fontFamily: 'monospace', color: primary, fontSize: '1.6rem' }}>
                    {authBusiness.businessCode}
                  </Typography>
                  <Tooltip title={copiedCode ? 'Copied!' : 'Copy code'}>
                    <IconButton size="small" color="primary" onClick={copyCode}
                      sx={{ bgcolor: alpha(primary, 0.1), '&:hover': { bgcolor: alpha(primary, 0.18) } }}>
                      {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 280, lineHeight: 1.5 }}>
                Staff enter this code + their username + password on the Staff Login tab.
              </Typography>
            </Box>
          )}

          {!authBusiness?.businessCode && (
            <Alert severity="warning" sx={{ mb: 3, borderRadius: `${baseRadius + 4}px` }}>
              Your business profile is not linked yet. Sign out and sign back in to complete setup.
            </Alert>
          )}

          {staffMsg.text && (
            <Alert severity={staffMsg.type} sx={{ mb: 2, borderRadius: `${baseRadius + 4}px` }} onClose={() => setStaffMsg({ type: '', text: '' })}>
              {staffMsg.text}
            </Alert>
          )}

          <Grid container spacing={2.5}>
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ ...cardSx.sx }}>
                <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Users size={14} color={primary} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>Staff Accounts</Typography>
                  </Box>
                  <Button size="small" startIcon={<Plus size={13} />} onClick={resetStaffForm}
                    sx={{ borderRadius: `${baseRadius}px`, fontSize: '0.75rem' }}>New</Button>
                </Box>
                <Box sx={{ p: 1.5, maxHeight: 400, overflowY: 'auto' }}>
                  {staffList.length === 0 && (
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                      <Users size={28} style={{ opacity: 0.12, display: 'block', margin: '0 auto 8px' }} />
                      <Typography variant="body2" color="text.secondary">No staff yet.</Typography>
                      <Typography variant="caption" color="text.secondary">Click "New" to get started.</Typography>
                    </Box>
                  )}
                  {staffList.map(s => {
                    const isSelected = selectedStaff?.id === s.id;
                    return (
                      <Box key={s.id} onClick={() => loadStaff(s)} sx={{
                        mb: 1, p: 1.5, borderRadius: `${baseRadius + 4}px`,
                        border: '1px solid', cursor: 'pointer',
                        borderColor: isSelected ? alpha(primary, 0.4) : 'divider',
                        bgcolor: isSelected ? alpha(primary, 0.05) : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 1.25,
                        transition: 'all 0.15s', '&:hover': { borderColor: alpha(primary, 0.25) },
                      }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: '0.78rem', fontWeight: 700, bgcolor: s.active !== false ? primary : 'text.disabled' }}>
                          {(s.name?.[0] || '?').toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{s.name}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            @{s.username}
                            <Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: s.active !== false ? 'success.main' : 'text.disabled', display: 'inline-block', ml: 0.5 }} />
                          </Typography>
                        </Box>
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" onClick={e => { e.stopPropagation(); handleDeleteStaff(s); }}
                            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}>
                            <Trash2 size={14} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    );
                  })}
                </Box>
              </Card>
            </Grid>

            <Grid item xs={12} md={8}>
              <Card elevation={0} sx={{ ...cardSx.sx }}>
                <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {selectedStaff ? `Editing: ${selectedStaff.name}` : 'New Staff Account'}
                  </Typography>
                </Box>
                <CardContent sx={{ p: 2.5 }}>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6}>
                      <TextField size="small" label="Full Name *" fullWidth
                        value={staffForm.name}
                        onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Rahul Kumar" sx={fieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField size="small" label="Username *" fullWidth
                        value={staffForm.username}
                        onChange={e => setStaffForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                        placeholder="e.g. rahul"
                        helperText="Lowercase, no spaces"
                        sx={fieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField size="small" fullWidth
                        label={selectedStaff ? 'New Password (blank = keep)' : 'Password *'}
                        type={showStaffPwd ? 'text' : 'password'}
                        value={staffForm.password}
                        onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))}
                        InputProps={{
                          startAdornment: <InputAdornment position="start"><KeyRound size={14} style={{ opacity: 0.4 }} /></InputAdornment>,
                          endAdornment: <InputAdornment position="end"><IconButton size="small" onClick={() => setShowStaffPwd(v => !v)}>{showStaffPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}</IconButton></InputAdornment>
                        }}
                        sx={fieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25, borderRadius: `${baseRadius + 2}px`, border: '1px solid', borderColor: staffForm.active ? 'success.light' : 'divider', bgcolor: staffForm.active ? alpha('#059669', 0.05) : 'transparent' }}>
                        <Switch size="small" checked={staffForm.active} color="success"
                          onChange={e => setStaffForm(f => ({ ...f, active: e.target.checked }))} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: staffForm.active ? 'success.main' : 'text.secondary' }}>
                          {staffForm.active ? 'Account Active' : 'Account Inactive'}
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={12}>
                      <Divider sx={{ mb: 1.5 }} />
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1 }}>
                        Allowed Features
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {STAFF_FEATURE_KEYS.map(key => {
                          const on = !!staffForm.features[key];
                          return (
                            <Chip key={key} label={STAFF_FEATURE_LABELS[key] || key} clickable size="small"
                              onClick={() => setStaffForm(f => ({ ...f, features: { ...f.features, [key]: !f.features[key] } }))}
                              sx={{
                                borderRadius: `${baseRadius}px`, fontSize: '0.72rem', fontWeight: 700,
                                border: `1px solid ${on ? alpha(primary, 0.4) : 'rgba(0,0,0,0.15)'}`,
                                bgcolor: on ? alpha(primary, 0.1) : 'transparent',
                                color: on ? primary : 'text.secondary',
                                '&:hover': { bgcolor: on ? alpha(primary, 0.15) : 'rgba(0,0,0,0.06)' },
                              }} />
                          );
                        })}
                      </Box>
                    </Grid>

                    <Grid item xs={12} sx={{ mt: 0.5 }}>
                      <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                        <Button variant="outlined" onClick={resetStaffForm} sx={{ borderRadius: `${baseRadius + 2}px` }}>Cancel</Button>
                        <Button variant="contained" startIcon={<Save size={16} />} onClick={handleSaveStaff} sx={gradBtnSx}>
                          {selectedStaff ? 'Update Staff' : 'Create Account'}
                        </Button>
                      </Stack>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ── Billing & Payments ── */}
      <Box sx={{ mb: 5, display: activeTab === 'billing' ? 'block' : 'none' }}>
        <SH icon={ReceiptText} title={t("settings.billing")} subtitle="Your subscription payments and downloadable GST receipts" />
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <CardContent sx={{ p: 2.5 }}>
            <BillingPayments />
          </CardContent>
        </Card>
      </Box>

      {/* ── Appearance ── */}
      <Box sx={{ mb: 5, display: activeTab === 'appearance' ? 'block' : 'none' }}>
        <SH icon={Palette} title={t("settings.appearance")} subtitle="Customize the look and feel of your application" />
        <Grid container spacing={2.5}>
          {/* Language */}
          <Grid item xs={12}>
            <Card elevation={0} sx={cardSx.sx}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.62rem', mb: 0.5, display: 'block' }}>
                  {t('settings.language')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  {t('settings.languageHint')}
                </Typography>
                <TextField
                  select
                  size="small"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  sx={{ minWidth: 240 }}
                >
                  {languages.map((l) => (
                    <MenuItem key={l.code} value={l.code}>
                      {l.native}{l.native !== l.label ? ` · ${l.label}` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              </CardContent>
            </Card>
          </Grid>
          {/* Theme mode */}
          <Grid item xs={12} md={5}>
            <Card elevation={0} sx={cardSx.sx}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.62rem', mb: 1.5, display: 'block' }}>Theme Mode</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {[
                    { value: 'light', label: 'Light', desc: 'White background', icon: '☀️' },
                    { value: 'dark', label: 'Dark', desc: 'Easy on eyes', icon: '🌙' },
                  ].map((opt) => {
                    const active = mode === opt.value;
                    return (
                      <Box key={opt.value} onClick={() => updateTheme(opt.value, primaryColor)} sx={{
                        flex: '1 1 120px', cursor: 'pointer', border: '2px solid',
                        borderColor: active ? primary : 'divider',
                        borderRadius: `${baseRadius + 6}px`, p: 1.75,
                        transition: 'all 0.18s',
                        bgcolor: active ? alpha(primary, 0.06) : 'transparent',
                        '&:hover': { borderColor: alpha(primary, 0.5), bgcolor: alpha(primary, 0.03) },
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                          <Typography sx={{ fontSize: '1.1rem', lineHeight: 1 }}>{opt.icon}</Typography>
                          {active && <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={10} color="white" strokeWidth={3} /></Box>}
                        </Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', mt: 0.75 }}>{opt.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{opt.desc}</Typography>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          {/* Primary color */}
          <Grid item xs={12} md={7}>
            <Card elevation={0} sx={cardSx.sx}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.62rem', mb: 1.5, display: 'block' }}>Accent Color</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {[
                    { value: 'indigo', label: 'Indigo', color: '#4f46e5' },
                    { value: 'blue', label: 'Blue', color: '#2563eb' },
                    { value: 'green', label: 'Green', color: '#059669' },
                    { value: 'purple', label: 'Purple', color: '#7c3aed' },
                  ].map((c) => {
                    const active = primaryColor === c.value;
                    return (
                      <Box key={c.value} onClick={() => updateTheme(mode, c.value)} sx={{
                        flex: '1 1 80px', cursor: 'pointer', borderRadius: `${baseRadius + 6}px`,
                        border: `2px solid ${active ? c.color : 'transparent'}`,
                        p: 1.5, textAlign: 'center', transition: 'all 0.18s',
                        bgcolor: active ? alpha(c.color, 0.08) : alpha(c.color, 0.04),
                        boxShadow: active ? `0 4px 14px ${c.color}33` : 'none',
                        '&:hover': { border: `2px solid ${c.color}`, bgcolor: alpha(c.color, 0.1), transform: 'translateY(-1px)' },
                      }}>
                        <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: c.color, mx: 'auto', mb: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 8px ${c.color}55` }}>
                          {active && <Check size={14} color="white" strokeWidth={3} />}
                        </Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: active ? c.color : 'text.secondary' }}>{c.label}</Typography>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* ── Local Backups ── */}
      <Box sx={{ mb: 5, display: activeTab === 'data' ? 'block' : 'none' }}>
        <SH icon={HardDrive} title="Local Backups" subtitle="Versioned snapshots on this device — not uploaded to the cloud"
          action={
            <Button size="small" variant="outlined" onClick={loadLocalBackupsList} disabled={backupsLoading}
              startIcon={backupsLoading ? <CircularProgress size={12} color="inherit" /> : <RefreshCw size={13} />}
              sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none', fontSize: '0.78rem' }}>
              {backupsLoading ? 'Loading…' : 'Refresh'}
            </Button>
          }
        />
        <Card elevation={0} sx={cardSx.sx}>
          {/* Create row */}
          <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start">
              <TextField size="small" fullWidth
                placeholder="Snapshot label (e.g. Before GST filing)"
                value={backupLabel}
                onChange={e => setBackupLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateBackup(); }}
                sx={fieldSx} />
              <Button variant="contained" onClick={handleCreateBackup} disabled={backupCreating}
                startIcon={backupCreating ? <CircularProgress size={14} color="inherit" /> : <HardDrive size={15} />}
                sx={{ ...gradBtnSx, textTransform: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {backupCreating ? 'Saving…' : 'Save Snapshot'}
              </Button>
            </Stack>
            {backupMsg.text && (
              <Alert severity={backupMsg.type} sx={{ mt: 1.5, borderRadius: `${baseRadius + 2}px` }} onClose={() => setBackupMsg({ type: '', text: '' })}>
                {backupMsg.text}
              </Alert>
            )}
          </Box>

          {/* Snapshot list */}
          <Box sx={{ p: 2.5 }}>
            {localBackups.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center' }}>
                <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(primary, 0.07), width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1.5 }}>
                  <HardDrive size={24} color={alpha(primary, 0.5)} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }} color="text.secondary">No snapshots yet</Typography>
                <Typography variant="caption" color="text.disabled">Enter a label above and click Save Snapshot to create your first backup.</Typography>
              </Box>
            ) : (
              <Stack spacing={1}>
                {localBackups.map((bk, idx) => {
                  const sizeKB = bk.sizeBytes ? (bk.sizeBytes / 1024).toFixed(1) : '—';
                  return (
                    <Box key={bk.id} sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      p: 1.5, borderRadius: `${baseRadius + 4}px`,
                      border: '1px solid', borderColor: 'divider',
                      bgcolor: idx === 0 ? alpha(primary, 0.02) : 'transparent',
                      flexWrap: 'wrap', transition: 'all 0.15s',
                      '&:hover': { borderColor: alpha(primary, 0.25), bgcolor: alpha(primary, 0.03) },
                    }}>
                      <Box sx={{ p: 0.9, borderRadius: `${baseRadius}px`, bgcolor: alpha(primary, 0.08), border: `1px solid ${alpha(primary, 0.12)}`, display: 'flex', flexShrink: 0 }}>
                        <HardDrive size={14} color={primary} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.87rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {bk.label}
                          </Typography>
                          {idx === 0 && <Chip label="Latest" size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700, bgcolor: alpha(primary, 0.12), color: primary }} />}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(bk.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {sizeKB} KB
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.75} flexShrink={0}>
                        <Button size="small" variant="outlined"
                          onClick={() => handleRestoreBackup(bk.id, bk.label)}
                          disabled={restoringId === bk.id}
                          startIcon={restoringId === bk.id ? <CircularProgress size={12} color="inherit" /> : <RotateCcw size={12} />}
                          sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none', fontSize: '0.78rem' }}>
                          {restoringId === bk.id ? 'Restoring…' : 'Restore'}
                        </Button>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDeleteBackup(bk.id, bk.label)}>
                            <Trash2 size={14} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Card>
      </Box>

      {/* ── Export Business Data ── */}
      <Box sx={{ mb: 5, display: activeTab === 'data' ? 'block' : 'none' }}>
        <SH icon={Download} title="Export Data" subtitle="Download your data as Excel or Tally XML" />
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={6}>
            <Card elevation={0} sx={{ ...accentCardSx.sx, borderTop: '3px solid #059669', height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box sx={{ p: 1, borderRadius: `${baseRadius}px`, bgcolor: alpha('#059669', 0.1), border: `1px solid ${alpha('#059669', 0.2)}`, display: 'flex' }}>
                    <Download size={18} color="#059669" />
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>Export to Excel</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
                  Download all Items, Parties, Sales, Purchases and Expenses as a single Excel workbook (.xlsx) with separate sheets.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Download size={16} />}
                  onClick={() => {
                    const biz = currentBusiness;
                    if (!biz) return;
                    exportFullBusinessToExcel({ businessName: biz.name, businessId: biz.id, allData: data, customSections: config.customSections || [] });
                  }}
                  sx={{ borderRadius: `${baseRadius + 2}px`, background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: '0 4px 12px rgba(5,150,105,0.32)', fontWeight: 700, textTransform: 'none', '&:hover': { boxShadow: '0 6px 18px rgba(5,150,105,0.42)', opacity: 0.93, background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' } }}
                >
                  Export Entire Business (Excel)
                </Button>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card {...accentCardSx} sx={{ ...accentCardSx.sx, height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box sx={{ p: 1, borderRadius: `${baseRadius}px`, bgcolor: alpha(primary, 0.1), border: `1px solid ${alpha(primary, 0.18)}`, display: 'flex' }}>
                    <FileDown size={18} color={primary} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>Export to Tally</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
                  Export all Sales and Purchase vouchers as a Tally-compatible XML file. Import directly via <strong>Gateway → Import Data → Vouchers</strong>.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<FileDown size={16} />}
                  onClick={() => {
                    const biz = currentBusiness;
                    if (!biz) return;
                    exportToTallyXML({ sales: getItems('sales').filter(s => s.businessId === biz.id), purchases: getItems('purchases').filter(p => p.businessId === biz.id), businessName: biz.name, filename: `${biz.name}_tally_export.xml` });
                  }}
                  sx={{ ...gradBtnSx, textTransform: 'none' }}
                >
                  Export All Vouchers (Tally XML)
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* ── Danger Zone: delete all data on this device ── */}
      <Box sx={{ mb: 5, display: activeTab === 'data' ? 'block' : 'none' }}>
        <SH icon={Trash2} title="Danger Zone" subtitle="Permanently remove all data stored on this device" />
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'error.main', borderRadius: `${baseRadius + 4}px`, bgcolor: (t) => t.palette.mode === 'light' ? '#fef2f2' : 'rgba(220,38,38,0.08)' }}>
          <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography sx={{ fontWeight: 700, color: 'error.main', mb: 0.5 }}>Delete all data on this device</Typography>
              <Typography variant="caption" color="text.secondary">
                Removes every business, invoice, item, party and saved backup stored on this device. This cannot be undone. Export a backup first if you might need it.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Trash2 size={16} />}
              onClick={() => { setWipeConfirm(''); setWipeOpen(true); }}
              sx={{ fontWeight: 700, textTransform: 'none', flexShrink: 0 }}
            >
              Delete all data
            </Button>
          </CardContent>
        </Card>
      </Box>

    </Box>

    {/* ── Delete-all-local-data confirmation ─────────────────────── */}
    <Dialog open={wipeOpen} onClose={() => { if (!wiping) setWipeOpen(false); }} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>Delete all data?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This permanently deletes all data stored on this device and cannot be undone.
          Type <strong>delete</strong> below to confirm.
        </Typography>
        <TextField
          fullWidth
          autoFocus
          size="small"
          placeholder="Type delete to confirm"
          value={wipeConfirm}
          onChange={(e) => setWipeConfirm(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setWipeOpen(false)} disabled={wiping} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          disabled={wipeConfirm.trim().toLowerCase() !== 'delete' || wiping}
          onClick={async () => {
            setWiping(true);
            const res = await clearAllLocalData();
            setWiping(false);
            setWipeOpen(false);
            if (res?.success) {
              setMsg({ type: 'success', text: 'All data on this device has been deleted.' });
              setTimeout(() => window.location.reload(), 800);
            } else {
              setMsg({ type: 'error', text: res?.error || 'Could not delete data. Please try again.' });
            }
          }}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {wiping ? 'Deleting…' : 'Delete everything'}
        </Button>
      </DialogActions>
    </Dialog>

    {/* ── Add-Business popup (collects details, then opens payment) ── */}
    <AddBusinessDialog open={isNew} onClose={() => setIsNew(false)} onCreate={handleCreateBusiness} />

    {/* ── Add-Business Payment Dialog ─────────────────────────────── */}
    <Dialog open={showBizPayModal} onClose={() => { if (!bizPaying) { setShowBizPayModal(false); setBizPayError(''); } }} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: `${baseRadius + 8}px`, p: 0.5 } }}>
      <DialogTitle sx={{ fontWeight: 800, fontSize: '1.05rem', pb: 0 }}>
        Activate "{pendingBizData?.name}"
      </DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ fontSize: '0.85rem', mb: 2.5 }}>
          Each business requires its own subscription. <strong>Basic (₹99/mo)</strong>: all features, local only, no online backup. <strong>Pro (₹299/mo)</strong>: all features plus online cloud backup &amp; multi-device sync.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
          {BIZ_PLAN_TIERS.map((tier) => (
            <Box key={tier.name} sx={{ flex: '1 1 230px', border: '2px solid', borderColor: tier.highlight ? primary : 'divider', borderRadius: `${baseRadius + 8}px`, p: 2.5, position: 'relative', overflow: 'visible', boxShadow: tier.highlight ? `0 6px 24px ${alpha(primary, 0.14)}` : 'none' }}>
              {tier.highlight && (
                <Chip icon={<Crown size={11} />} label="Recommended" size="small" sx={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: `linear-gradient(135deg, ${primary} 0%, ${theme.palette.primary.dark || primary} 100%)`, color: 'white', fontWeight: 700, fontSize: '0.65rem', '& .MuiChip-icon': { color: 'white' } }} />
              )}
              <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: tier.highlight ? primary : 'text.primary', mb: 0.25 }}>{tier.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontSize: '0.75rem' }}>{tier.tagline}</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {tier.plans.map((plan) => (
                  <Button
                    key={plan.id}
                    fullWidth
                    variant={tier.highlight ? 'contained' : 'outlined'}
                    onClick={() => handleBizSubscribe(plan)}
                    disabled={bizPaying !== null}
                    sx={tier.highlight
                      ? { borderRadius: `${baseRadius + 2}px`, background: `linear-gradient(135deg, ${primary} 0%, ${theme.palette.primary.dark || primary} 100%)`, fontWeight: 700, textTransform: 'none', py: 1, justifyContent: 'space-between', '&:hover': { opacity: 0.92 }, '&.Mui-disabled': { opacity: 0.6 } }
                      : { borderRadius: `${baseRadius + 2}px`, fontWeight: 700, textTransform: 'none', py: 1, borderColor: alpha(primary, 0.35), color: primary, justifyContent: 'space-between', '&:hover': { borderColor: primary, bgcolor: alpha(primary, 0.04) }, '&.Mui-disabled': { opacity: 0.5 } }
                    }
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {bizPaying === plan.id && <CircularProgress size={13} color="inherit" />}
                      <span>{bizPaying === plan.id ? 'Opening…' : plan.label}</span>
                      {plan.badge && <Chip label={plan.badge} size="small" sx={{ height: 17, fontSize: '0.6rem', fontWeight: 700, bgcolor: tier.highlight ? alpha('#fff', 0.22) : alpha(primary, 0.1), color: tier.highlight ? 'white' : primary }} />}
                    </Box>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.95rem' }}>₹{plan.price.toLocaleString('en-IN')}{plan.period}</Typography>
                  </Button>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        {bizPayError && (
          <Typography color="error" variant="body2" sx={{ mt: 2, textAlign: 'center' }}>{bizPayError}</Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, fontSize: '0.72rem', lineHeight: 1.5 }}>
          No auto-renewal. Pay once and your plan stays active for the period. Renew only when you're ready, or stop anytime.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => { setShowBizPayModal(false); setBizPayError(''); }} disabled={bizPaying !== null} sx={{ textTransform: 'none', color: 'text.secondary' }}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>

    </>
  );
};

export default SettingsPage;
