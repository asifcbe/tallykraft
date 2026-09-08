import React, { useState } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Grid,
  CircularProgress, Alert, Paper
} from '@mui/material';
import { Download, Upload, CloudUpload, CloudDownload, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { useData } from './DataContext';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import { useBusiness } from './BusinessContext';
import { useDialog } from './DialogContext';
import { useI18n } from './i18n/I18nContext';
import { useTabs } from './TabsContext';
import { getAllImagesForBusiness, restoreReferenceImage } from './referenceImages';

const Backup = () => {
  const { confirm } = useDialog();
  const { openTab } = useTabs();
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
  const { t } = useI18n();
  const { currentBusiness } = useBusiness();
  const { isBusinessActive } = useSubscription();
  // Cloud backup/restore requires an active subscription for the current
  // business (every active plan is cloud-sync in TallyKraft).
  const isPro = isBusinessActive(currentBusiness?.id);
  const canExportFile = config.features?.backupExportFile !== false;
  const canRestoreFile = config.features?.backupRestoreFile !== false;
  const canBackupOnline = isPro && config.features?.backupOnline !== false;
  const canRestoreOnline = isPro && config.features?.backupRestoreOnline !== false;

  const [loading, setLoading] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

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
      const dateStamp = new Date().toISOString().split('T')[0];

      // Reference images (Sales/Purchases attachments) live only in local
      // IndexedDB — never in `biz`/Firestore — so they have to be pulled in
      // separately here rather than already being part of the payload above.
      const images = await getAllImagesForBusiness(currentBizKey).catch(() => []);

      let includeImages = false;
      if (images.length > 0) {
        includeImages = await confirm({
          title: 'Include reference images?',
          message: `This business has ${images.length} reference image${images.length !== 1 ? 's' : ''} attached to sales/purchases, stored only on this device. Include them in the backup as a .zip with an images/ folder? Choosing "No backup" exports the data only (JSON), without images.`,
          confirmLabel: 'Yes, include images',
          cancelLabel: 'No, data only',
        });
      }

      if (includeImages) {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        zip.file('data.json', JSON.stringify(payload, null, 2));
        const imagesFolder = zip.folder('images');
        // Human-readable filenames (INV-0001_A.jpg) go in images/ for the
        // user to browse directly, but restoring needs the real recordId
        // (filenames are built from invoice NUMBER, which isn't guaranteed
        // unique/stable the way the record's internal id is) — so a
        // manifest travels alongside mapping each file back to its record.
        const manifest = [];
        images.forEach((img) => {
          const fileName = img.fileName || `${img.recordId}_${img.letter || 'X'}.jpg`;
          imagesFolder.file(fileName, img.blob);
          manifest.push({
            fileName, recordId: img.recordId, table: img.table,
            businessId: img.businessId, letter: img.letter,
          });
        });
        zip.file('images-manifest.json', JSON.stringify(manifest, null, 2));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tallykraft_${safeName}_${dateStamp}.zip`;
        link.click();
        URL.revokeObjectURL(url);
        setMessage({ type: 'success', text: `Backup for "${currentBizName}" (with ${images.length} image${images.length !== 1 ? 's' : ''}) exported successfully!` });
      } else {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tallykraft_${safeName}_${dateStamp}.json`;
        link.click();
        URL.revokeObjectURL(url);
        setMessage({ type: 'success', text: `Backup for "${currentBizName}" exported successfully!` });
      }
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
      const isZip = file.name.toLowerCase().endsWith('.zip');
      let text;
      let pendingImages = null; // [{ fileName, recordId, table, businessId, letter, blob }]

      if (isZip) {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(file);
        const dataEntry = zip.file('data.json');
        if (!dataEntry) throw new Error('This .zip does not contain a data.json — not a valid TallyKraft backup.');
        text = await dataEntry.async('string');

        const manifestEntry = zip.file('images-manifest.json');
        if (manifestEntry) {
          const manifest = JSON.parse(await manifestEntry.async('string'));
          pendingImages = await Promise.all(manifest.map(async (m) => {
            const entry = zip.file(`images/${m.fileName}`);
            if (!entry) return null;
            const blob = await entry.async('blob');
            return { ...m, blob };
          }));
          pendingImages = pendingImages.filter(Boolean);
        }
      } else {
        text = await file.text();
      }

      const parsed = JSON.parse(text);
      const businesses = parsed.businesses && typeof parsed.businesses === 'object' ? parsed.businesses : null;

      if (businesses && Object.keys(businesses).length > 0) {
        const result = await restoreFromFile(businesses);
        if (result.success) {
          // restoreFromFile preserves each sale/purchase row's original id
          // (see DataContext.jsx), so images can be re-associated by the
          // recordId recorded in the manifest with no remapping needed.
          if (pendingImages?.length) {
            await Promise.all(pendingImages.map((img) =>
              restoreReferenceImage({
                recordId: img.recordId, table: img.table,
                businessId: currentBizKey, letter: img.letter,
                fileName: img.fileName, blob: img.blob,
              }).catch((e) => console.error('[importData] image restore failed:', img.fileName, e))
            ));
          }
          setMessage({
            type: 'success',
            text: pendingImages?.length
              ? `Data restored with ${pendingImages.length} image${pendingImages.length !== 1 ? 's' : ''} successfully! Reloading...`
              : 'Data restored successfully! Reloading...',
          });
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
    <Box sx={{ mx: 0 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', mb: 1 }}>{t('backup.title')}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        All backup and restore operations apply to the current business: <strong>{currentBizName}</strong>.
      </Typography>

      {/* Migration banner */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        p: 2, mb: 2.5, borderRadius: 2.5,
        background: '#ffffff', border: '1px solid #e4e8ee',
      }}>
        <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(51,65,85,0.08)', display: 'flex', flexShrink: 0 }}>
          <RefreshCw size={20} color="#334155" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ color: '#1e293b', fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2 }}>
            Switching from Vyapar or My Bill Book?
          </Typography>
          <Typography sx={{ color: '#64748b', fontSize: '0.8rem' }}>
            Import your Items, Customers, Vendors, Sales & Purchases in one step.
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={() => openTab('/migrate', 'Migrate Data')}
          endIcon={<ArrowRight size={15} />}
          sx={{
            textTransform: 'none', fontWeight: 700, borderRadius: 2, flexShrink: 0,
            bgcolor: '#94a3b8', color: '#1e293b', border: '1px solid #e4e8ee',
            '&:hover': { bgcolor: '#94a3b8' },
          }}
        >
          Migrate Data
        </Button>
      </Box>

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
                  <input type="file" hidden accept=".json,.zip" onChange={importData} />
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

      </Grid>

      <Paper sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1.5 }} variant="outlined">
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <AlertCircle size={20} color="text.secondary" />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>Auto-save is enabled</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Every change is automatically saved to the cloud (Firestore). Use &quot;Backup to Online&quot; for a manual snapshot, or &quot;Download&quot; to keep a local JSON copy.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default Backup;
