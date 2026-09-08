import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Grid,
  CircularProgress, Alert, Paper, TextField, Switch, FormControlLabel,
  InputAdornment
} from '@mui/material';
import { Download, Upload, CloudUpload, CloudDownload, AlertCircle, Folder, Crown } from 'lucide-react';
import { useData } from './DataContext';
import { useConfig } from './ConfigContext';
import { useDialog } from './DialogContext';
import { useSubscription } from './SubscriptionContext';
import { useI18n } from './i18n/I18nContext';

const Backup = () => {
  const { confirm } = useDialog();
  const {
    data,
    allBusinessData,
    currentBusinessId,
    addItem,
    deleteItem,
    reloadData,
    backupToFirestore,
    restoreFromFirestore,
    restoreFromFile
  } = useData();

  const currentBizKey = String(currentBusinessId);
  const currentBizName = allBusinessData[currentBizKey]?.name || 'Business';
  const { config } = useConfig();
  const { isBusinessProPlan } = useSubscription();
  const { t } = useI18n();
  // Online/cloud backup is a Pro (₹299) feature, per business.
  const isPro = isBusinessProPlan(currentBusinessId);
  const canExportFile = config.features?.backupExportFile !== false;
  const canRestoreFile = config.features?.backupRestoreFile !== false;
  const canBackupOnline = isPro && config.features?.backupOnline !== false;
  const canRestoreOnline = isPro && config.features?.backupRestoreOnline !== false;

  const [loading, setLoading] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [autoBackup, setAutoBackup] = useState(() => localStorage.getItem('tallykraft_autoBackup') === 'true');
  const [backupFolder, setBackupFolder] = useState(() => localStorage.getItem('tallykraft_backupFolder') || '');

  useEffect(() => {
    localStorage.setItem('tallykraft_autoBackup', autoBackup);
  }, [autoBackup]);

  useEffect(() => {
    localStorage.setItem('tallykraft_backupFolder', backupFolder);
  }, [backupFolder]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const bKey = String(currentBusinessId);
      const biz = allBusinessData?.[bKey];
      if (autoBackup && biz) {
        try {
          const payload = JSON.stringify({ businesses: { [bKey]: biz }, exportedAt: new Date().toISOString() });
          localStorage.setItem('tallykraft_autobackup', payload);
        } catch (_) {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [autoBackup, allBusinessData, currentBusinessId]);

  const exportData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const biz = allBusinessData[currentBizKey];
      if (!biz) {
        setMessage({ type: 'error', text: 'No data for current business.' });
        setLoading(false);
        return;
      }
      const payload = {
        businesses: { [currentBizKey]: biz },
        exportedAt: new Date().toISOString()
      };
      const safeName = currentBizName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tallykraft_${safeName}_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `Backup for "${currentBizName}" exported successfully!` });
    } catch (error) {
      setMessage({ type: 'error', text: 'Export failed: ' + error.message });
    }
    setLoading(false);
  };

  const importData = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const ok = await confirm({ title: 'Restore Current Business', message: `This will overwrite data for "${currentBizName}" with the imported file. Other businesses are not affected. This action cannot be undone. Are you sure?`, confirmLabel: 'Overwrite', variant: 'danger' });
    if (!ok) return;

    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const businesses = parsed.businesses && typeof parsed.businesses === 'object' ? parsed.businesses : null;

      if (businesses && Object.keys(businesses).length > 0) {
        const result = await restoreFromFile(businesses);
        if (result.success) {
          setMessage({ type: 'success', text: 'Data restored successfully! Reloading...' });
          event.target.value = '';
          setTimeout(() => window.location.reload(), 1200);
        } else {
          setMessage({ type: 'error', text: result.error || 'Restore failed.' });
          setLoading(false);
          event.target.value = '';
        }
        return;
      }

      const parties = parsed.parties || [];
      const items = parsed.items || [];
      const sales = parsed.sales || parsed.transactions || [];
      const purchases = parsed.purchases || [];
      const expenses = parsed.expenses || [];
      const opticals = parsed.opticals || [];
      const payments = parsed.payments || [];

      const currentParties = data.parties || [];
      const currentItems = data.items || [];
      const currentSales = data.sales || [];
      const currentPurchases = data.purchases || [];
      const currentExpenses = data.expenses || [];
      const currentOpticals = data.opticals || [];
      const currentPayments = data.payments || [];

      for (const p of currentParties) await deleteItem('parties', p.id);
      for (const i of currentItems) await deleteItem('items', i.id);
      for (const s of currentSales) await deleteItem('sales', s.id);
      for (const p of currentPurchases) await deleteItem('purchases', p.id);
      for (const e of currentExpenses) await deleteItem('expenses', e.id);
      for (const o of currentOpticals) await deleteItem('opticals', o.id);
      for (const p of currentPayments) await deleteItem('payments', p.id);

      for (const p of parties) await addItem('parties', p);
      for (const i of items) await addItem('items', i);
      for (const s of sales) await addItem('sales', s);
      for (const p of purchases) await addItem('purchases', p);
      for (const e of expenses) await addItem('expenses', e);
      for (const o of opticals) await addItem('opticals', o);
      for (const p of payments) await addItem('payments', p);

      setMessage({ type: 'success', text: 'Backup restored successfully! Your data has been saved on this device.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Restore failed: ' + error.message });
    }
    setLoading(false);
    event.target.value = '';
  };

  const handleBackupToOnline = async () => {
    setOnlineLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const result = await backupToFirestore();
      if (result.success) {
        setMessage({ type: 'success', text: `"${currentBizName}" backed up to cloud successfully!` });
      } else {
        setMessage({ type: 'error', text: result.error || 'Backup to online failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Backup to online failed.' });
    }
    setOnlineLoading(false);
  };

  const handleRestoreFromOnline = async () => {
    const ok = await confirm({ title: 'Restore from Online Backup', message: `This will replace local data for "${currentBizName}" with the last online backup. Other businesses are not affected.`, confirmLabel: 'Restore', variant: 'warning' });
    if (!ok) return;
    setOnlineLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const result = await restoreFromFirestore();
      if (result.success) {
        setMessage({ type: 'success', text: `"${currentBizName}" restored from cloud backup. Reloading...` });
        await reloadData();
      } else {
        setMessage({ type: 'error', text: result.error || 'Restore from online failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Restore from online failed.' });
    }
    setOnlineLoading(false);
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', mb: 1 }}>{t('backup.title')}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        All backup and restore operations apply to the current business: <strong>{currentBizName}</strong>.
      </Typography>

      {message.text && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage({ type: '', text: '' })}>
          {message.text}
        </Alert>
      )}

      <Grid container spacing={2}>
        {canExportFile && (
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ py: 2, px: 2, textAlign: 'center' }}>
                <Box sx={{ color: 'primary.main', mb: 1 }}><Download size={40} /></Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Export to File</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Download JSON for current business
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  size="small"
                  onClick={exportData}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} /> : <Download size={16} />}
                >
                  Download
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        {canRestoreFile && (
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ py: 2, px: 2, textAlign: 'center' }}>
                <Box sx={{ color: 'secondary.main', mb: 1 }}><Upload size={40} /></Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Restore from File</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Restore current business from file
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  size="small"
                  component="label"
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} /> : <Upload size={16} />}
                >
                  Upload
                  <input type="file" hidden accept=".json" onChange={importData} />
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        {canBackupOnline && (
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ py: 2, px: 2, textAlign: 'center' }}>
                <Box sx={{ color: 'info.main', mb: 1 }}><CloudUpload size={40} /></Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Backup to Online</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Save current business to cloud
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  color="info"
                  size="small"
                  onClick={handleBackupToOnline}
                  disabled={onlineLoading}
                  startIcon={onlineLoading ? <CircularProgress size={16} /> : <CloudUpload size={16} />}
                >
                  Backup Online
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        {canRestoreOnline && (
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ py: 2, px: 2, textAlign: 'center' }}>
                <Box sx={{ color: 'info.dark', mb: 1 }}><CloudDownload size={40} /></Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Restore from Online</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Restore current business from cloud
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  color="info"
                  size="small"
                  onClick={handleRestoreFromOnline}
                  disabled={onlineLoading}
                  startIcon={onlineLoading ? <CircularProgress size={16} /> : <CloudDownload size={16} />}
                >
                  Restore Online
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Upsell — online backup is a Pro (₹299) feature */}
        {!isPro && (
          <Grid item xs={12} sm={6} md={6}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px dashed', borderColor: 'warning.main', bgcolor: (t) => t.palette.mode === 'light' ? '#fffbeb' : 'rgba(217,119,6,0.08)' }}>
              <CardContent sx={{ py: 2, px: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ color: 'warning.main', flexShrink: 0 }}><Crown size={34} /></Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>Online cloud backup is a Pro feature</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Upgrade this business to the <strong>Pro plan (₹299/mo)</strong> to back up & restore from the cloud and sync across devices. Local file backup stays free.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  color="warning"
                  size="small"
                  startIcon={<Crown size={16} />}
                  onClick={() => { window.location.href = `/subscribe?bId=${currentBusinessId || 1}`; }}
                  sx={{ flexShrink: 0, fontWeight: 700, textTransform: 'none' }}
                >
                  Upgrade
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12}>
          <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ py: 2, px: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Options</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Backup folder hint"
                    value={backupFolder}
                    onChange={(e) => setBackupFolder(e.target.value)}
                    helperText="Reminder where you save backups."
                    InputProps={{ startAdornment: <InputAdornment position="start"><Folder size={18} /></InputAdornment> }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={<Switch checked={autoBackup} onChange={(e) => setAutoBackup(e.target.checked)} color="primary" />}
                    label={<Typography variant="body2">Snapshot on close</Typography>}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1.5 }} variant="outlined">
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <AlertCircle size={20} color="text.secondary" />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>Why backup?</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Your data is stored on this device. Use &quot;Backup to Online&quot; or &quot;Download&quot; to keep a copy.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default Backup;
