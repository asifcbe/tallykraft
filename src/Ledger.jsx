import React, { useState, useMemo, useRef } from 'react';
import {
  Box, Typography, Paper, Stack, Divider, Button, MenuItem,
  TextField, Chip, alpha, useTheme, IconButton, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, FormControl, InputLabel, Tooltip, CircularProgress,
  Menu, ListItemIcon, ListItemText,
} from '@mui/material';
import {
  BookOpen, Search, Printer, Download, ChevronLeft, ChevronRight,
  ArrowUpCircle, ArrowDownCircle, FileText, CreditCard, User,
  TrendingUp, TrendingDown, Calendar, X, Share2, ListChecks,
} from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useReactToPrint } from 'react-to-print';
import { exportToExcel } from './exportUtils';
import SendDialog from './SendDialog';
import { byTxTimeAsc, formatCreatedTime } from './txTimeUtils';
import { captureElement, canvasToPdf } from './pdfCapture';

// Mirrors the deliverFile pattern used elsewhere (Sales.jsx etc.) — kept
// local since none of those helpers are exported/shared across files.
const canUseFileShare = (file) => {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch { return false; }
};
const cleanWaPhone = (raw = '') => {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};
const canCopyFileToClipboard = (file) => {
  try {
    return typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write && /^image\//.test(file.type);
  } catch { return false; }
};
const deliverLedgerFile = async (file, { toWhatsApp = false, phone = '' } = {}) => {
  if (canUseFileShare(file)) {
    await navigator.share({ files: [file], title: file.name });
    return { method: 'share' };
  }
  if (toWhatsApp && canCopyFileToClipboard(file)) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
      const num = cleanWaPhone(phone);
      window.open(num ? `https://wa.me/${num}` : 'https://wa.me/', '_blank');
      return { method: 'clipboard' };
    } catch (err) {
      console.error('Clipboard copy failed, falling back to download', err);
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (toWhatsApp) {
    const num = cleanWaPhone(phone);
    window.open(num ? `https://wa.me/${num}` : 'https://wa.me/', '_blank');
    return { method: 'download+chat', fileName: file.name };
  }
  return { method: 'download', fileName: file.name };
};

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};
const fmtAmt = (n) => {
  const v = Number(n) || 0;
  return '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const TYPE_META = {
  sale:        { label: 'Sale Invoice',    icon: FileText,       color: '#16a34a', bg: '#dcfce7', drCr: 'DR' },
  purchase:    { label: 'Purchase Bill',   icon: FileText,       color: '#dc2626', bg: '#fee2e2', drCr: 'CR' },
  paymentIn:   { label: 'Payment Received',icon: ArrowDownCircle,color: '#5c1f22', bg: '#dbeafe', drCr: 'CR' },
  paymentOut:  { label: 'Payment Made',    icon: ArrowUpCircle,  color: '#5c1f22', bg: '#ede9fe', drCr: 'DR' },
  creditNote:  { label: 'Credit Note',     icon: CreditCard,     color: '#b45309', bg: '#fef3c7', drCr: 'CR' },
  debitNote:   { label: 'Debit Note',      icon: CreditCard,     color: '#5c1f22', bg: '#fce7f3', drCr: 'DR' },
};

const LedgerPage = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { getItems, data } = useData();
  const { currentBusiness } = useBusiness();
  const bId = currentBusiness?.id;
  const printRef = useRef();

  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const parties = useMemo(() =>
    getItems('parties').filter(p => p.businessId === bId).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.parties, bId]
  );

  const selectedParty = parties.find(p => p.id === selectedPartyId);

  // Gather all ledger entries for the selected party
  const rawEntries = useMemo(() => {
    if (!selectedPartyId) return [];
    const entries = [];

    // Sales (customer invoices) — debit (customer owes us)
    getItems('sales').filter(s => s.businessId === bId && s.partyId === selectedPartyId).forEach(s => {
      entries.push({ id: `sale_${s.id}`, type: 'sale', date: s.date, time: s.time || '', createdAt: s.createdAt, ref: s.invoiceNumber, amount: s.totalAmount || 0, notes: s.description || '', raw: s });
    });

    // Purchases (vendor bills) — credit (we owe vendor)
    getItems('purchases').filter(p => p.businessId === bId && p.partyId === selectedPartyId).forEach(p => {
      entries.push({ id: `pur_${p.id}`, type: 'purchase', date: p.date, time: p.time || '', createdAt: p.createdAt, ref: p.invoiceNumber, amount: p.totalAmount || 0, notes: p.description || '', raw: p });
    });

    // Payments In — credit (reduces what customer owes)
    getItems('payments').filter(p => p.businessId === bId && p.partyId === selectedPartyId && p.type === 'PaymentIn').forEach(p => {
      entries.push({ id: `pin_${p.id}`, type: 'paymentIn', date: p.date, time: '', createdAt: p.createdAt, ref: p.referenceNo || '—', amount: p.totalAmount || 0, notes: p.notes || '', raw: p });
    });

    // Payments Out — debit (reduces what we owe vendor)
    getItems('payments').filter(p => p.businessId === bId && p.partyId === selectedPartyId && p.type === 'PaymentOut').forEach(p => {
      entries.push({ id: `pout_${p.id}`, type: 'paymentOut', date: p.date, time: '', createdAt: p.createdAt, ref: p.referenceNo || '—', amount: p.totalAmount || 0, notes: p.notes || '', raw: p });
    });

    // Credit Notes — reduce customer balance
    getItems('creditNotes').filter(c => c.businessId === bId && c.partyId === selectedPartyId).forEach(c => {
      entries.push({ id: `cn_${c.id}`, type: 'creditNote', date: c.date, time: '', createdAt: c.createdAt, ref: c.noteNumber || '—', amount: c.totalAmount || 0, notes: c.reason || '', raw: c });
    });

    // Debit Notes — reduce vendor balance
    getItems('debitNotes').filter(d => d.businessId === bId && d.partyId === selectedPartyId).forEach(d => {
      entries.push({ id: `dn_${d.id}`, type: 'debitNote', date: d.date, time: '', createdAt: d.createdAt, ref: d.noteNumber || '—', amount: d.totalAmount || 0, notes: d.reason || '', raw: d });
    });

    // Sorted by date first, then the real creation timestamp (falls back to
    // date+time for records saved before createdAt existed) — previously
    // payments/notes had no `time` at all, so same-day entries tied and fell
    // back to insertion order instead of the order they actually happened in.
    return entries.sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return byTxTimeAsc(a, b);
    });
    // getItems identity changes on ANY table mutation app-wide; depend on the
    // specific tables this memo actually reads so an unrelated edit elsewhere
    // doesn't rebuild the whole ledger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartyId, bId, data.sales, data.purchases, data.payments, data.creditNotes, data.debitNotes]);

  const openingBalance = selectedParty ? (Number(selectedParty.openingBalance) || 0) : 0;
  const openingBalanceType = selectedParty?.balanceType || 'receivable';

  const filteredEntries = useMemo(() => {
    return rawEntries.filter(e => {
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!e.ref?.toLowerCase().includes(s) && !e.notes?.toLowerCase().includes(s) && !TYPE_META[e.type]?.label.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rawEntries, dateFrom, dateTo, typeFilter, search]);

  // Running balance
  const entriesWithBalance = useMemo(() => {
    let balance = openingBalanceType === 'receivable' ? openingBalance : -openingBalance;
    return filteredEntries.map(entry => {
      const { drCr } = TYPE_META[entry.type] || {};
      if (drCr === 'DR') balance += entry.amount;
      else balance -= entry.amount;
      return { ...entry, runningBalance: balance };
    });
  }, [filteredEntries, openingBalance, openingBalanceType]);

  const closingBalance = entriesWithBalance.length > 0
    ? entriesWithBalance[entriesWithBalance.length - 1].runningBalance
    : (openingBalanceType === 'receivable' ? openingBalance : -openingBalance);

  const totalDebit = filteredEntries.filter(e => TYPE_META[e.type]?.drCr === 'DR').reduce((s, e) => s + e.amount, 0);
  const totalCredit = filteredEntries.filter(e => TYPE_META[e.type]?.drCr === 'CR').reduce((s, e) => s + e.amount, 0);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const handleExport = () => {
    exportToExcel(entriesWithBalance, [
      { header: 'Date', value: r => r.date },
      { header: 'Type', value: r => TYPE_META[r.type]?.label || r.type },
      { header: 'Reference', value: r => r.ref },
      { header: 'DR/CR', value: r => TYPE_META[r.type]?.drCr || '' },
      { header: 'Amount', value: r => r.amount },
      { header: 'Balance', value: r => r.runningBalance },
      { header: 'Notes', value: r => r.notes },
    ], `ledger_${selectedParty?.name || 'party'}.xlsx`);
  };

  // ── WhatsApp / Email / PDF / Image share ──────────────────────────────────
  const [sendOpen, setSendOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  // 'summary' = one line per entry (compact); 'full' = every sale/purchase's
  // line items + every payment's mode, so the recipient can see exactly what
  // was billed and how each payment was settled without opening each bill.
  const [sendMode, setSendMode] = useState('summary');
  const [shareMenuAnchor, setShareMenuAnchor] = useState(null);
  // On-screen equivalent of "Share Complete Statement" — shows each entry's
  // line items (sales/purchases) or payment mode/split (payments) inline in
  // the table itself, not just when sharing.
  const [showFullDetail, setShowFullDetail] = useState(false);

  const buildLedgerMessage = () => {
    const periodLabel = dateFrom && dateTo ? `${fmtDate(dateFrom)} to ${fmtDate(dateTo)}` : 'All dates';
    const lines = [
      `*${currentBusiness?.name || 'Business'} — Account Statement*`,
      '',
      `Party: *${selectedParty?.name || ''}*`,
      `Period: ${periodLabel}`,
      '',
    ];
    if (entriesWithBalance.length === 0) {
      lines.push('No transactions for this period.');
    } else {
      entriesWithBalance.slice(-20).forEach(e => {
        const meta = TYPE_META[e.type] || {};
        const isDR = meta.drCr === 'DR';
        lines.push(`${fmtDate(e.date)}  ${meta.label || e.type}  ${e.ref || ''}  ${isDR ? '+' : '-'}${fmtAmt(e.amount)}`);
      });
      if (entriesWithBalance.length > 20) lines.push(`…and ${entriesWithBalance.length - 20} more entries (see attached PDF/image for full statement)`);
    }
    lines.push('');
    lines.push(`Total Debit: ${fmtAmt(totalDebit)}`);
    lines.push(`Total Credit: ${fmtAmt(totalCredit)}`);
    lines.push(`*Closing Balance: ${fmtAmt(Math.abs(closingBalance))} ${closingBalance >= 0 ? `DR (owed to ${currentBusiness?.name || 'us'})` : `CR (${currentBusiness?.name || 'we'} owe)`}*`);
    lines.push('');
    lines.push('_Sent via BillDheko_');
    return lines.join('\n');
  };

  // Full statement — every sale/purchase's line items and every payment's
  // mode, not just a one-line-per-entry total. Uses the same `.raw` record
  // each ledger entry already carries (the actual sale/purchase/payment doc).
  const buildFullLedgerMessage = () => {
    const periodLabel = dateFrom && dateTo ? `${fmtDate(dateFrom)} to ${fmtDate(dateTo)}` : 'All dates';
    const lines = [
      `*${currentBusiness?.name || 'Business'} — Complete Statement*`,
      '',
      `Party: *${selectedParty?.name || ''}*`,
      `Period: ${periodLabel}`,
      '',
    ];
    if (openingBalance !== 0) {
      lines.push(`Opening Balance: ${fmtAmt(openingBalance)} ${openingBalanceType === 'receivable' ? 'DR' : 'CR'}`);
      lines.push('');
    }
    if (entriesWithBalance.length === 0) {
      lines.push('No transactions for this period.');
    } else {
      entriesWithBalance.forEach(e => {
        const meta = TYPE_META[e.type] || {};
        const isDR = meta.drCr === 'DR';
        lines.push(`*${fmtDate(e.date)} — ${meta.label || e.type} ${e.ref || ''}*`);
        if (e.type === 'sale' || e.type === 'purchase') {
          (e.raw?.items || []).forEach(item => {
            // A qty derived from a typed Amount (Sales.jsx's Amount→Qty
            // auto-calc) can carry more precision than 2dp — keep the raw
            // value for the qty×rate fallback math, round only what's shown.
            const rawQty = Number(item.qty) || 0;
            const qty = Math.round(rawQty * 100) / 100;
            const rate = Number(item.price) || 0;
            const lineTotal = Number(item.total) || rawQty * rate;
            lines.push(`  • ${item.name} × ${qty}${item.unit ? ` ${item.unit}` : ''} @ ₹${rate.toFixed(2)} = ₹${lineTotal.toFixed(2)}`);
          });
        } else if (e.type === 'paymentIn' || e.type === 'paymentOut') {
          const mode = e.raw?.paymentMode;
          const split = e.raw?.paymentSplit;
          if (mode === 'Split' && split) {
            lines.push(`  Paid via: Split — Cash ₹${Number(split.cash || 0).toFixed(2)} + ${split.bankMode || 'Bank'} ₹${Number(split.bank || 0).toFixed(2)}`);
          } else if (mode) {
            lines.push(`  Paid via: ${mode}`);
          }
          if (e.notes) lines.push(`  Note: ${e.notes}`);
        } else if (e.notes) {
          lines.push(`  ${e.notes}`);
        }
        lines.push(`  ${isDR ? 'Debit' : 'Credit'}: ${fmtAmt(e.amount)}  |  Balance: ${fmtAmt(Math.abs(e.runningBalance))} ${e.runningBalance >= 0 ? 'DR' : 'CR'}`);
        lines.push('');
      });
    }
    lines.push(`Total Debit: ${fmtAmt(totalDebit)}`);
    lines.push(`Total Credit: ${fmtAmt(totalCredit)}`);
    lines.push(`*Closing Balance: ${fmtAmt(Math.abs(closingBalance))} ${closingBalance >= 0 ? `DR (owed to ${currentBusiness?.name || 'us'})` : `CR (${currentBusiness?.name || 'we'} owe)`}*`);
    lines.push('');
    lines.push('_Sent via BillDheko_');
    return lines.join('\n');
  };

  const captureLedgerCanvas = async () => {
    return captureElement(printRef.current, { scale: 1.5 });
  };

  const shareLedgerAsPDF = async (opts = {}) => {
    if (!printRef.current) return;
    setShareLoading(true);
    try {
      const [canvas, { jsPDF }] = await Promise.all([
        captureLedgerCanvas(),
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
      ]);
      const pdf = canvasToPdf(canvas, jsPDF, 'A4');
      const fileName = `ledger_${selectedParty?.name || 'party'}.pdf`;
      const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
      await deliverLedgerFile(file, opts);
    } catch (err) {
      console.error('Share ledger as PDF failed', err);
      alert('Could not generate the ledger PDF. Please try again.');
    } finally { setShareLoading(false); }
  };

  const shareLedgerAsImage = async (opts = {}) => {
    if (!printRef.current) return;
    setShareLoading(true);
    try {
      const canvas = await captureLedgerCanvas();
      await new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error('No blob')); return; }
          const fileName = `ledger_${selectedParty?.name || 'party'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          await deliverLedgerFile(file, opts);
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      console.error('Share ledger as Image failed', err);
      alert('Could not generate the ledger image. Please try again.');
    } finally { setShareLoading(false); }
  };

  const openLedgerSendDialog = (mode = 'summary') => {
    setSendMode(mode);
    setSendOpen(true);
    import('html2canvas');
    import('jspdf');
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, mx: 0 }}>
      {/* Hero */}
      <Box sx={{
        borderRadius: 3, background: '#ffffff', border: '1px solid #ece2db',
        p: { xs: 2.5, md: 3.5 }, mb: 3, position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', bgcolor: 'transparent', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(92,31,34,0.08)', display: 'flex' }}><BookOpen size={20} color="#5c1f22" /></Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#5c1f22', lineHeight: 1.1 }}>Ledger</Typography>
            <Typography variant="body2" sx={{ color: '#57433e' }}>Party-wise account statement</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {[
            { label: 'Total Debit', value: fmtAmt(totalDebit), color: '#fca5a5' },
            { label: 'Total Credit', value: fmtAmt(totalCredit), color: '#86efac' },
            { label: 'Entries', value: filteredEntries.length, color: '#bfdbfe' },
            { label: 'Closing Balance', value: fmtAmt(Math.abs(closingBalance)), color: closingBalance >= 0 ? '#fde68a' : '#f9a8d4' },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(92,31,34,0.05)', borderRadius: 2, p: 1.5, border: '1px solid #ece2db' }}>
              <Typography variant="caption" sx={{ color: '#57433e', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}>{label}</Typography>
              <Typography sx={{ color, fontWeight: 800, fontSize: { xs: '0.9rem', sm: '1rem' }, mt: 0.5 }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Select Party</InputLabel>
            <Select value={selectedPartyId} onChange={e => setSelectedPartyId(e.target.value)} label="Select Party"
              startAdornment={<InputAdornment position="start"><User size={14} /></InputAdornment>}>
              <MenuItem value="">— Select —</MenuItem>
              {parties.filter(p => p.type === 'Customer' || p.type === 'Both').length > 0 && [
                <MenuItem key="cust-header" disabled sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.disabled', letterSpacing: 1 }}>CUSTOMERS</MenuItem>,
                ...parties.filter(p => p.type === 'Customer' || p.type === 'Both').map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))
              ]}
              {parties.filter(p => p.type === 'Vendor' || p.type === 'Both').length > 0 && [
                <MenuItem key="vend-header" disabled sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.disabled', letterSpacing: 1 }}>VENDORS</MenuItem>,
                ...parties.filter(p => p.type === 'Vendor' || p.type === 'Both').map(p => (
                  <MenuItem key={`v_${p.id}`} value={p.id}>{p.name}</MenuItem>
                ))
              ]}
            </Select>
          </FormControl>
          <TextField size="small" type="date" label="From" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Calendar size={13} /></InputAdornment> } }}
            sx={{ minWidth: 150 }} />
          <TextField size="small" type="date" label="To" value={dateTo} onChange={e => setDateTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Calendar size={13} /></InputAdornment> } }}
            sx={{ minWidth: 150 }} />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Type</InputLabel>
            <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} label="Type">
              <MenuItem value="all">All Types</MenuItem>
              {Object.entries(TYPE_META).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" placeholder="Search ref / notes…" value={search} onChange={e => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 150 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>, endAdornment: search ? <IconButton size="small" onClick={() => setSearch('')}><X size={13} /></IconButton> : null } }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            <Tooltip title={showFullDetail ? 'Showing complete statement — click to collapse' : 'Show complete statement (line items + payment mode per entry)'}>
              <span>
                <Button
                  size="small"
                  variant={showFullDetail ? 'contained' : 'outlined'}
                  onClick={() => setShowFullDetail(v => !v)}
                  disabled={!selectedPartyId}
                  startIcon={<ListChecks size={15} />}
                  sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Complete Statement
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Print">
              <span><IconButton size="small" onClick={handlePrint} disabled={!selectedPartyId}><Printer size={17} /></IconButton></span>
            </Tooltip>
            <Tooltip title="Export Excel">
              <span><IconButton size="small" onClick={handleExport} disabled={!selectedPartyId}><Download size={17} /></IconButton></span>
            </Tooltip>
            <Tooltip title="Share ledger (WhatsApp / Email / PDF / Image)">
              <span>
                <IconButton size="small" onClick={(e) => setShareMenuAnchor(e.currentTarget)} disabled={!selectedPartyId} sx={{ color: '#25D366' }}>
                  <Share2 size={17} />
                </IconButton>
              </span>
            </Tooltip>
            <Menu anchorEl={shareMenuAnchor} open={Boolean(shareMenuAnchor)} onClose={() => setShareMenuAnchor(null)}>
              <MenuItem onClick={() => { setShareMenuAnchor(null); openLedgerSendDialog('summary'); }}>
                <ListItemIcon><Share2 size={16} /></ListItemIcon>
                <ListItemText primary="Share Summary" secondary="One line per entry — quick overview" />
              </MenuItem>
              <MenuItem onClick={() => { setShareMenuAnchor(null); openLedgerSendDialog('full'); }}>
                <ListItemIcon><ListChecks size={16} /></ListItemIcon>
                <ListItemText primary="Share Complete Statement" secondary="Every bill's items + every payment's mode" />
              </MenuItem>
            </Menu>
          </Box>
        </Stack>
      </Paper>

      {/* Table */}
      {!selectedPartyId ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
          <User size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>Select a party to view ledger</Typography>
        </Box>
      ) : (
        <Paper elevation={0} ref={printRef} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          {/* Print header */}
          <Box sx={{ display: 'none', '@media print': { display: 'block' }, p: 2, borderBottom: '1px solid #ddd' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{currentBusiness?.name}</Typography>
            <Typography variant="body2">Ledger: {selectedParty?.name}</Typography>
            <Typography variant="caption">{dateFrom && dateTo ? `${fmtDate(dateFrom)} to ${fmtDate(dateTo)}` : 'All dates'}</Typography>
          </Box>

          {/* Party info bar */}
          <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(primary, 0.05), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{selectedParty?.name}</Typography>
              <Typography variant="caption" color="text.secondary">{selectedParty?.type} {selectedParty?.phone && `· ${selectedParty.phone}`}</Typography>
            </Box>
            {openingBalance !== 0 && (
              <Chip size="small" label={`Opening: ${fmtAmt(openingBalance)} ${openingBalanceType === 'receivable' ? 'DR' : 'CR'}`} color="default" sx={{ fontWeight: 600 }} />
            )}
            <Chip size="small"
              label={`Closing: ${fmtAmt(Math.abs(closingBalance))} ${closingBalance >= 0 ? 'DR' : 'CR'}`}
              color={closingBalance > 0 ? 'success' : closingBalance < 0 ? 'error' : 'default'}
              sx={{ fontWeight: 700 }} />
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(primary, 0.04) }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 100 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 140 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 120 }}>Reference</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Notes</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', width: 120, color: '#dc2626' }}>Debit (DR)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', width: 120, color: '#16a34a' }}>Credit (CR)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', width: 130 }}>Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Opening balance row */}
                {openingBalance !== 0 && (
                  <TableRow sx={{ bgcolor: alpha("#111111", 0.04) }}>
                    <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>—</TableCell>
                    <TableCell><Chip size="small" label="Opening Balance" sx={{ fontSize: '0.68rem', fontWeight: 600 }} /></TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: 600, color: openingBalanceType === 'receivable' ? '#dc2626' : 'text.secondary' }}>
                      {openingBalanceType === 'receivable' ? fmtAmt(openingBalance) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: 600, color: openingBalanceType === 'payable' ? '#16a34a' : 'text.secondary' }}>
                      {openingBalanceType === 'payable' ? fmtAmt(openingBalance) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                      {fmtAmt(openingBalance)} <Typography component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'text.secondary', ml: 0.25 }}>{openingBalanceType === 'receivable' ? 'DR' : 'CR'}</Typography>
                    </TableCell>
                  </TableRow>
                )}

                {entriesWithBalance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.disabled' }}>No transactions found for the selected filters.</TableCell>
                  </TableRow>
                )}

                {entriesWithBalance.map((entry) => {
                  const meta = TYPE_META[entry.type] || {};
                  const isDR = meta.drCr === 'DR';
                  const Icon = meta.icon || FileText;
                  const split = entry.raw?.paymentSplit;
                  const paymentMode = entry.raw?.paymentMode;
                  const items = (entry.type === 'sale' || entry.type === 'purchase') ? (entry.raw?.items || []) : [];
                  return (
                    <React.Fragment key={entry.id}>
                      <TableRow hover sx={{ '&:hover': { bgcolor: alpha(primary, 0.03) } }}>
                        <TableCell sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          {fmtDate(entry.date)}
                          {(entry.time || formatCreatedTime(entry.raw)) && (
                            <Typography component="div" sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>
                              {entry.time || formatCreatedTime(entry.raw)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box sx={{ p: 0.5, borderRadius: 1, bgcolor: meta.bg, display: 'flex', flexShrink: 0 }}>
                              <Icon size={12} style={{ color: meta.color }} />
                            </Box>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: meta.color }}>{meta.label}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>{entry.ref}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', maxWidth: 200 }}>
                          <Typography variant="caption" sx={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entry.notes || '—'}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: isDR ? 700 : 400, color: isDR ? '#dc2626' : 'text.disabled' }}>
                          {isDR ? fmtAmt(entry.amount) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.82rem', fontWeight: !isDR ? 700 : 400, color: !isDR ? '#16a34a' : 'text.disabled' }}>
                          {!isDR ? fmtAmt(entry.amount) : '—'}
                        </TableCell>
                        <TableCell align="right">
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: entry.runningBalance >= 0 ? '#16a34a' : '#dc2626' }}>
                            {fmtAmt(Math.abs(entry.runningBalance))}
                            <Typography component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, ml: 0.25, color: 'text.secondary' }}>
                              {entry.runningBalance >= 0 ? 'DR' : 'CR'}
                            </Typography>
                          </Typography>
                        </TableCell>
                      </TableRow>
                      {showFullDetail && (items.length > 0 || paymentMode) && (
                        <TableRow sx={{ bgcolor: alpha(meta.color || primary, 0.03) }}>
                          <TableCell />
                          <TableCell colSpan={6} sx={{ py: 1, borderBottom: '1px dashed', borderColor: 'divider' }}>
                            {items.length > 0 && (
                              <Stack spacing={0.25}>
                                {items.map((item, ii) => {
                                  // A qty derived from a typed Amount can carry more precision than
                                  // 2dp — keep the raw value for the fallback math, round only the display.
                                  const rawQty = Number(item.qty) || 0;
                                  const qty = Math.round(rawQty * 100) / 100;
                                  const rate = Number(item.price) || 0;
                                  const lineTotal = Number(item.total) || rawQty * rate;
                                  return (
                                    <Typography key={ii} sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                                      • {item.name} × {qty}{item.unit ? ` ${item.unit}` : ''} @ {fmtAmt(rate)} = {fmtAmt(lineTotal)}
                                    </Typography>
                                  );
                                })}
                              </Stack>
                            )}
                            {paymentMode && (
                              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 600 }}>
                                {paymentMode === 'Split' && split
                                  ? `Paid via: Split — Cash ${fmtAmt(split.cash)} + ${split.bankMode || 'Bank'} ${fmtAmt(split.bank)}`
                                  : `Paid via: ${paymentMode}`}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Totals row */}
                {entriesWithBalance.length > 0 && (
                  <TableRow sx={{ bgcolor: alpha(primary, 0.06), borderTop: '2px solid', borderColor: alpha(primary, 0.2) }}>
                    <TableCell colSpan={4} sx={{ fontWeight: 700, fontSize: '0.82rem' }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#dc2626' }}>{fmtAmt(totalDebit)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#16a34a' }}>{fmtAmt(totalCredit)}</TableCell>
                    <TableCell align="right">
                      <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', color: closingBalance >= 0 ? '#16a34a' : '#dc2626' }}>
                        {fmtAmt(Math.abs(closingBalance))}
                        <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, ml: 0.3, color: 'text.secondary' }}>
                          {closingBalance >= 0 ? 'DR' : 'CR'}
                        </Typography>
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        tx={{ invoiceNumber: `Ledger — ${selectedParty?.name || ''}`, partyName: selectedParty?.name, totalAmount: Math.abs(closingBalance) }}
        party={selectedParty}
        businessName={currentBusiness?.name || 'BillDheko'}
        isSale
        dialogTitle={sendMode === 'full' ? 'Share Complete Statement' : 'Share Ledger'}
        initialMessage={sendMode === 'full' ? buildFullLedgerMessage() : buildLedgerMessage()}
        onSharePDF={() => shareLedgerAsPDF()}
        onShareImage={() => shareLedgerAsImage()}
        onSharePDFToWhatsApp={() => shareLedgerAsPDF({ toWhatsApp: true, phone: selectedParty?.phone })}
        onShareImageToWhatsApp={() => shareLedgerAsImage({ toWhatsApp: true, phone: selectedParty?.phone })}
        shareLoading={shareLoading}
      />
    </Box>
  );
};

export default LedgerPage;
