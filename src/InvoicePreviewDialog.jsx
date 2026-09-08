import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  Box, Dialog, DialogActions, Typography, IconButton, TextField, MenuItem, Menu,
  Stack, Button, useTheme, useMediaQuery, alpha, Tooltip,
  ListItemIcon, ListItemText, Snackbar, Alert, InputBase,
} from '@mui/material';
import { X, Eye, Printer, Share2, FileDown, ImageDown, Edit, Wallet, Trash2, Banknote, Landmark, CheckCircle2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import InvoiceTemplate, { PAPER_SIZES, getPaperWidthPx, getPaperWidthMm, getJsPdfFormat } from './InvoiceTemplate';
import SplitPaymentInput from './SplitPaymentInput';
import { useData } from './DataContext';
import { useDialog } from './DialogContext';
import { useTabs } from './TabsContext';
import { dispatchQuickNew } from './quickNewBridge';
import { waitForQrReady } from './qrReady';

const getTokens = (theme) => {
  const p = theme.palette.primary;
  return { primary: p.main, primaryLight: p.light || p.main, primaryDark: p.dark || p.main };
};

// navigator.canShare({ files }) reports `true` on some desktop browsers
// (Chrome/Edge on Windows) even though invoking navigator.share there opens
// an OS share sheet whose default/save target writes the file to disk as its
// own side effect — producing a second, indistinguishable "download" for a
// single click. The Web Share API for files is really a mobile/touch
// affordance, so only take that path on platforms that are actually mobile;
// desktop always goes through the single deterministic <a download> click.
const canUseFileShare = (fileOrFiles) => {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (!navigator.canShare?.({ files })) return false;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const isMobilePlatform = navigator.userAgentData?.mobile;
  return isMobilePlatform ?? isMobileUA;
};

const GradientBtn = ({ children, tokens, onClick, disabled, startIcon, size = 'small', sx = {} }) => (
  <Button
    variant="contained" size={size} disabled={disabled} onClick={onClick} startIcon={startIcon}
    sx={{
      background: disabled ? undefined : tokens.primary,
      fontWeight: 800, textTransform: 'none', borderRadius: 1.5, flexShrink: 0,
      '&:hover': { background: tokens.primaryDark },
      ...sx,
    }}
  >
    {children}
  </Button>
);

const InvoicePreviewDialog = ({
  open, onClose, transaction, business, parties = [], config = {}, isSale = true,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const tokens = useMemo(() => getTokens(theme), [theme]);
  const { getItems, addItem, updateItem, deleteItem } = useData();
  const { confirm, showAlert } = useDialog();
  const { openTab } = useTabs();

  const printRef = useRef();
  const pdfRef = useRef();
  // Guards against a fast double-tap firing two concurrent html2canvas/share
  // calls on the same off-screen node — this dialog had no such guard while
  // Sales.jsx's equivalent did, which made it the more frequent site of
  // "share not working."
  const _shareInFlight = useRef(false);

  const [paperSize, setPaperSize] = useState(config.defaultPaperSize || 'A4');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMenuAnchor, setShareMenuAnchor] = useState(null);
  const [receivePayDialogOpen, setReceivePayDialogOpen] = useState(false);
  const [receivePayMode, setReceivePayMode] = useState('Cash');
  const [receivePaySplitCash, setReceivePaySplitCash] = useState('');
  const [receivePaySplitBank, setReceivePaySplitBank] = useState('');
  const [receivePayDate, setReceivePayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receivePayLess, setReceivePayLess] = useState('');
  const [receivePayNotes, setReceivePayNotes] = useState('');
  const [receivePaySaving, setReceivePaySaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const previewZoom = useMemo(() => {
    const maxW = isMobile ? (window.innerWidth - 24) : Math.min(window.innerWidth * 0.55, 700);
    return Math.min(1, maxW / getPaperWidthPx(paperSize));
  }, [paperSize, isMobile]);

  // onBeforePrint is awaited by react-to-print before it snapshots the DOM —
  // waiting on the payment QR canvas here closes an async draw-vs-print race
  // (see qrReady.js) that could otherwise print the QR blank on a cold first print.
  const handlePrint = useReactToPrint({ contentRef: printRef, onBeforePrint: waitForQrReady });

  // Prefetch the PDF/image export libraries as soon as the dialog opens so
  // they're already loaded by the time the user taps a share/download button.
  useEffect(() => {
    if (!open) return;
    import('html2canvas');
    import('jspdf');
  }, [open]);

  const partyBalance = transaction
    ? (parties.find(p => p.id === transaction.partyId)?.balance ?? 0)
    : undefined;

  const tableName = isSale ? 'sales' : 'purchases';
  const outstanding = transaction ? Number(transaction.totalAmount || 0) - Number(transaction.advance || 0) : 0;

  // Edit — this dialog has no invoice-editing form of its own (item rows,
  // GST, party select, etc. only exist in Sales.jsx), so Edit navigates
  // there and hands off which transaction to open via the same
  // "dashboard-quick-new" event Dashboard's own quick-actions already use,
  // instead of duplicating hundreds of lines of form UI a second time.
  const handleEdit = () => {
    if (!transaction) return;
    const path = isSale ? '/sales' : '/purchases';
    openTab(path, isSale ? 'Sales' : 'Purchases', { duplicate: false });
    dispatchQuickNew({ path, intent: 'editTx', txId: transaction.id });
    onClose?.();
  };

  // "Received Payment" (Sales) / "Payment Made" (Purchases) — same logic as
  // Sales.jsx's handleReceivePayment, duplicated here since this dialog is
  // used from Dashboard/other pages that don't have that function in scope.
  const handleReceivePaymentClick = async () => {
    if (!transaction || transaction.status === 'paid') return;
    if (outstanding <= 0) {
      await updateItem(tableName, transaction.id, { status: 'paid', dueDate: '' });
      setSnack({ open: true, message: `${transaction.invoiceNumber} marked as paid.`, severity: 'success' });
      onClose?.();
      return;
    }
    setReceivePayMode('Cash');
    setReceivePaySplitCash('');
    setReceivePaySplitBank('');
    setReceivePayDate(new Date().toISOString().split('T')[0]);
    setReceivePayLess('');
    setReceivePayNotes('');
    setReceivePayDialogOpen(true);
  };

  // "Mark Paid without Payment" — same as Sales.jsx's version: flips the
  // invoice's paid/due-date flag without touching the party balance or
  // recording a payment. For bills settled outside the app / reconciled
  // later, where the user will add the actual payment manually.
  const markPaidWithoutPayment = async () => {
    if (!transaction) return;
    setReceivePaySaving(true);
    try {
      await updateItem(tableName, transaction.id, { status: 'paid', dueDate: '', paidDate: receivePayDate });
      setReceivePayDialogOpen(false);
      setSnack({ open: true, message: `${transaction.invoiceNumber} marked as paid on ${new Date(receivePayDate).toLocaleDateString('en-IN')} — no payment recorded, add it manually via Payment Entry when received.`, severity: 'info' });
      onClose?.();
    } catch (err) {
      console.error('Error marking as paid:', err);
      await showAlert({ title: 'Save error', message: 'An error occurred. Please try again.', variant: 'danger' });
    } finally {
      setReceivePaySaving(false);
    }
  };

  const confirmReceivePayment = async () => {
    if (!transaction) return;
    const lessNum = parseFloat(receivePayLess) || 0;
    const amountNum = Math.max(0, outstanding - lessNum); // actual cash/bank collected, after the write-off
    let paymentSplit = null;
    if (receivePayMode === 'Split') {
      const cashNum = parseFloat(receivePaySplitCash) || 0;
      const bankNum = parseFloat(receivePaySplitBank) || 0;
      if (Math.abs(cashNum + bankNum - amountNum) > 0.01) {
        await showAlert({ title: 'Split does not match', message: `Cash + Bank must add up to ₹${amountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.`, variant: 'warning' });
        return;
      }
      paymentSplit = { cash: cashNum, bank: bankNum, bankMode: 'Bank' };
    }
    setReceivePaySaving(true);
    try {
      const party = transaction.partyId ? getItems('parties').find((p) => p.id === transaction.partyId) : null;
      const paymentData = {
        businessId: business?.id,
        partyId: transaction.partyId || null,
        partyName: transaction.partyName || (party?.name ?? ''),
        type: isSale ? 'PaymentIn' : 'PaymentOut',
        totalAmount: amountNum,
        ...(lessNum > 0 ? { lessAmount: lessNum } : {}),
        date: receivePayDate,
        paymentMode: receivePayMode,
        ...(paymentSplit ? { paymentSplit } : {}),
        referenceNo: `RCV-${transaction.invoiceNumber}`,
        notes: receivePayNotes || `Payment received against invoice #${transaction.invoiceNumber}`,
      };
      await addItem('payments', paymentData);
      if (party) {
        await updateItem('parties', party.id, { balance: (party.balance || 0) + (isSale ? -outstanding : outstanding) });
      }
      await updateItem(tableName, transaction.id, { status: 'paid', dueDate: '', paidDate: receivePayDate });
      setReceivePayDialogOpen(false);
      setSnack({
        open: true,
        message: isSale ? 'Payment received — invoice marked paid.' : 'Payment made — bill marked paid.',
        severity: 'success',
      });
      // Close the invoice preview too — the action is complete and the
      // underlying transaction/list the user came from (Dashboard's recent
      // activity, due-soon list, etc.) already reflects the new paid status.
      onClose?.();
    } catch (err) {
      console.error('Error recording received payment:', err);
      await showAlert({ title: 'Save error', message: 'An error occurred while recording the payment. Please try again.', variant: 'danger' });
    } finally {
      setReceivePaySaving(false);
    }
  };

  const handleDeleteTx = async () => {
    if (!transaction) return;
    const ok = await confirm({
      title: `Delete ${isSale ? 'Invoice' : 'Bill'}`,
      message: `Invoice #${transaction.invoiceNumber} will be permanently deleted and stock / balance will be reversed. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const party = transaction.partyId ? getItems('parties').find((p) => p.id === transaction.partyId) : null;
      // Mirror Sales.jsx's handleSave/handleDelete balance logic: a Cash/Bank
      // ('paid') transaction never touched the party balance (fully settled
      // via Payment Mode at creation), and a credit transaction's net effect
      // was totalAmount minus whatever advance had already been collected.
      const txNet = transaction.saleType === 'paid' ? 0 : (Number(transaction.totalAmount) || 0) - (Number(transaction.advance) || 0);
      if (party) {
        await updateItem('parties', transaction.partyId, { balance: (party.balance || 0) + (isSale ? -txNet : txNet) });
      }
      for (const item of transaction.items || []) {
        if (item.itemId) {
          const q = Number(item.qty) || 0;
          const stockItem = getItems('items').find((i) => i.id === item.itemId);
          if (stockItem) await updateItem('items', item.itemId, { stock: stockItem.stock + (isSale ? q : -q) });
        }
      }
      const advRef = `ADV-${transaction.invoiceNumber}`;
      const splRef = `SPL-${transaction.invoiceNumber}`;
      const rcvRef = `RCV-${transaction.invoiceNumber}`;
      const linkedPayments = getItems('payments').filter((p) => p.businessId === business?.id && (p.referenceNo === advRef || p.referenceNo === splRef || p.referenceNo === rcvRef));
      for (const p of linkedPayments) await deleteItem('payments', p.id);
      await deleteItem(tableName, transaction.id);
      onClose?.();
    } catch (err) {
      console.error('Error deleting transaction:', err);
      await showAlert({ title: 'Delete failed', message: 'An error occurred while deleting. Please try again.', variant: 'danger' });
    }
  };

  // The off-screen invoice template re-renders whenever `transaction` changes,
  // and any <img> inside it (logo, barcode/QR data URLs) may still be
  // mid-decode. Capturing before both have settled produced blank/stale
  // captures intermittently rather than reliably failing outright.
  const waitForCaptureReady = async (el) => {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    const imgs = Array.from(el.querySelectorAll('img'));
    await Promise.all(imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (typeof img.decode === 'function') return img.decode().catch(() => {});
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
    // <img> readiness above doesn't cover the payment QR — it's drawn onto a
    // <canvas> asynchronously (see qrReady.js), which html2canvas snapshots
    // synchronously just like react-to-print does.
    await waitForQrReady();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };

  const captureCanvas = async () => {
    const { default: html2canvas } = await import('html2canvas');
    await waitForCaptureReady(pdfRef.current);
    return html2canvas(pdfRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
  };

  const downloadInvoicePDF = async () => {
    if (!pdfRef.current || !transaction || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setPdfLoading(true);
    try {
      const [{ jsPDF }] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const canvas = await captureCanvas();
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfW = getPaperWidthMm(paperSize);
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const namedFormat = getJsPdfFormat(paperSize);
      const pdf = new jsPDF({ unit: 'mm', format: namedFormat || [pdfW, pdfH] });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      pdf.save(`${transaction.invoiceNumber || 'invoice'}.pdf`);
    } catch (err) {
      console.error('PDF failed', err);
      if (err?.name !== 'AbortError') alert('Could not generate the PDF. Please try again.');
    }
    finally { setPdfLoading(false); _shareInFlight.current = false; }
  };

  const shareAsPDF = async () => {
    if (!pdfRef.current || !transaction || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const [canvas, { jsPDF }] = await Promise.all([captureCanvas(), import('jspdf').then(m => ({ jsPDF: m.jsPDF }))]);
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfW = getPaperWidthMm(paperSize);
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const namedFormat = getJsPdfFormat(paperSize);
      const pdf = new jsPDF({ unit: 'mm', format: namedFormat || [pdfW, pdfH] });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      const fileName = `${transaction.invoiceNumber || 'invoice'}.pdf`;
      const blob = pdf.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (canUseFileShare(file)) { await navigator.share({ files: [file], title: fileName }); }
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error('Share PDF failed', err); alert('Could not share the PDF. Please try again.'); }
    }
    finally { setShareLoading(false); _shareInFlight.current = false; }
  };

  const shareAsImage = async () => {
    if (!pdfRef.current || !transaction || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const canvas = await captureCanvas();
      await new Promise((res, rej) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { rej(new Error('No blob')); return; }
          const fileName = `${transaction.invoiceNumber || 'invoice'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          if (canUseFileShare(file)) { await navigator.share({ files: [file], title: fileName }); }
          else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
          res();
        }, 'image/png');
      });
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error('Share image failed', err); alert('Could not share the image. Please try again.'); }
    }
    finally { setShareLoading(false); _shareInFlight.current = false; }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : 2.5,
            overflow: 'hidden',
            maxHeight: isMobile ? '100vh' : '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
          },
        }}
      >
        {/* Gradient header */}
        <Box sx={{
          background: '#ffffff', borderBottom: '1px solid #e4e8ee',
          px: 3, py: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0,
        }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(51,65,85,0.08)', display: 'flex', mt: 0.5, flexShrink: 0 }}>
            <Eye size={18} color="#334155" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: '#475569', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.1em', lineHeight: 1 }}>
              {isSale ? 'Invoice Preview' : 'Bill Preview'}
            </Typography>
            <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 800, mt: 0.5, fontSize: '1.05rem', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
              {transaction?.invoiceNumber || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              {transaction?.partyName && (
                <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>{transaction.partyName}</Typography>
              )}
              {transaction?.date && (
                <Typography variant="caption" sx={{ color: '#475569' }}>{transaction.date}</Typography>
              )}
              {transaction?.totalAmount != null && (
                <Box sx={{ px: 1.25, py: 0.25, bgcolor: 'rgba(51,65,85,0.08)', borderRadius: '100px', border: '1px solid #e4e8ee' }}>
                  <Typography variant="caption" sx={{ color: '#1e293b', fontWeight: 800, fontSize: '0.8rem' }}>
                    ₹{transaction.totalAmount.toLocaleString('en-IN')}
                  </Typography>
                </Box>
              )}
              {transaction && config.features?.billPaymentStatusChip !== false && (() => {
                const isOverdue = transaction.dueDate && transaction.status !== 'paid' && new Date(transaction.dueDate + 'T00:00:00') < new Date();
                const label = transaction.status === 'paid' ? 'Paid' : isOverdue ? 'Overdue' : 'Unpaid';
                return (
                  <Box sx={{ px: 1, py: 0.2, bgcolor: isOverdue ? '#fee2e2' : 'rgba(51,65,85,0.08)', borderRadius: '100px', border: isOverdue ? '1px solid #fecaca' : '1px solid #e4e8ee' }}>
                    <Typography variant="caption" sx={{ color: isOverdue ? '#7f1d1d' : 'white', fontWeight: 800, fontSize: '0.68rem' }}>
                      {label}
                    </Typography>
                  </Box>
                );
              })()}
            </Box>
          </Box>
          <Tooltip title="Edit">
            <IconButton onClick={handleEdit} size="small" sx={{ color: '#475569', mt: -0.5, '&:hover': { color: '#1e293b', bgcolor: 'rgba(51,65,85,0.08)' } }}>
              <Edit size={17} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton onClick={handleDeleteTx} size="small" sx={{ color: '#475569', mt: -0.5, '&:hover': { color: '#fecaca', bgcolor: 'rgba(220,38,38,0.18)' } }}>
              <Trash2 size={17} />
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose} size="small" sx={{ color: '#475569', mt: -0.5, mr: -0.5, '&:hover': { color: '#1e293b', bgcolor: 'rgba(51,65,85,0.08)' } }}>
            <X size={18} />
          </IconButton>
        </Box>

        {/* Toolbar */}
        <Box sx={{
          px: { xs: 1.5, sm: 2.5 }, py: 1, display: 'flex', alignItems: 'center',
          gap: { xs: 1, sm: 1.5 }, borderBottom: '1px solid rgba(0,0,0,0.08)',
          bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0, flexWrap: 'nowrap', minWidth: 0,
        }}>
          {transaction && transaction.status !== 'paid' && transaction.partyId && (
            <Tooltip title={isSale ? 'Received Payment' : 'Payment Made'}>
              <IconButton
                onClick={handleReceivePaymentClick} size="small"
                sx={{ border: '1px solid rgba(22,163,74,0.28)', borderRadius: 1.5, color: '#16a34a', px: 1, flexShrink: 0, '&:hover': { bgcolor: 'rgba(22,163,74,0.06)' } }}
              >
                <Wallet size={17} />
              </IconButton>
            </Tooltip>
          )}
          <TextField
            select size="small" value={paperSize} onChange={(e) => setPaperSize(e.target.value)}
            sx={{ minWidth: { xs: 90, sm: 120 }, flexShrink: 0, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
          >
            {PAPER_SIZES.map(ps => (
              <MenuItem key={ps.value} value={ps.value}>{ps.value}</MenuItem>
            ))}
          </TextField>

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Share">
            <IconButton
              onClick={(e) => setShareMenuAnchor(e.currentTarget)}
              disabled={shareLoading} size="small"
              sx={{ border: '1px solid rgba(22,163,74,0.28)', borderRadius: 1.5, color: '#16a34a', px: 1, '&:hover': { bgcolor: 'rgba(22,163,74,0.06)' } }}
            >
              <Share2 size={17} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={shareMenuAnchor} open={Boolean(shareMenuAnchor)} onClose={() => setShareMenuAnchor(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{ elevation: 6, sx: { borderRadius: 2, mt: 0.5, minWidth: 180 } }}
          >
            <MenuItem onClick={() => { shareAsPDF(); setShareMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
              <ListItemIcon sx={{ minWidth: 'unset' }}><FileDown size={16} /></ListItemIcon>
              <ListItemText primary="Share as PDF" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }} />
            </MenuItem>
            <MenuItem onClick={() => { shareAsImage(); setShareMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
              <ListItemIcon sx={{ minWidth: 'unset' }}><ImageDown size={16} /></ListItemIcon>
              <ListItemText primary="Share as Image" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }} />
            </MenuItem>
          </Menu>

          <Tooltip title="Download as PDF">
            <IconButton
              onClick={() => downloadInvoicePDF()} disabled={pdfLoading} size="small"
              sx={{ border: '1px solid rgba(124,58,237,0.28)', borderRadius: 1.5, color: '#3f3f46', px: 1, '&:hover': { bgcolor: 'rgba(124,58,237,0.06)' } }}
            >
              <FileDown size={17} />
            </IconButton>
          </Tooltip>

          <GradientBtn tokens={tokens} startIcon={<Printer size={15} />} onClick={() => handlePrint()} sx={{ px: { xs: 1.5, sm: 2.5 } }}>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Print</Box>
          </GradientBtn>
        </Box>

        {/* Scrollable preview area */}
        <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#e8eaed', p: { xs: 1.5, sm: 3 }, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <Box sx={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.18))', transformOrigin: 'top center', transform: `scale(${previewZoom})`, mb: `${(previewZoom - 1) * 100}%` }}>
            <InvoiceTemplate
              transaction={transaction}
              business={business}
              paperSize={paperSize}
              printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
              partyBalance={partyBalance}
            />
          </Box>
        </Box>
      </Dialog>

      {/* Received Payment / Payment Made — pick Cash / Bank / Split before settling */}
      <Dialog
        open={receivePayDialogOpen}
        onClose={() => { if (!receivePaySaving) setReceivePayDialogOpen(false); }}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 2.5 } } }}
      >
        <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            {isSale ? 'Received Payment' : 'Payment Made'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Invoice #{transaction?.invoiceNumber} · {transaction?.partyName}
          </Typography>
          <Typography sx={{ mt: 1.5, fontWeight: 800, fontSize: '1.5rem', color: '#16a34a' }}>
            ₹{outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>
        </Box>
        <Box sx={{ px: 3, pb: 1 }}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
            Received Via
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
            {[
              { value: 'Cash', icon: <Banknote size={14} />, color: '#16a34a' },
              { value: 'Bank', icon: <Landmark size={14} />, color: '#27272a' },
              { value: 'Split', icon: <Wallet size={14} />, color: '#7c3aed' },
            ].map((opt) => {
              const sel = receivePayMode === opt.value;
              return (
                <Box
                  key={opt.value}
                  onClick={() => setReceivePayMode(opt.value)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, borderRadius: '8px',
                    border: '1.5px solid', cursor: 'pointer', userSelect: 'none', transition: 'all 0.12s',
                    fontWeight: 700, fontSize: '0.8rem',
                    borderColor: sel ? opt.color : 'divider',
                    bgcolor: sel ? alpha(opt.color, 0.07) : 'transparent',
                    color: sel ? opt.color : 'text.secondary',
                    '&:hover': { borderColor: opt.color, color: opt.color, bgcolor: alpha(opt.color, 0.05) },
                  }}
                >
                  {opt.icon}{opt.value}
                </Box>
              );
            })}
          </Box>
          {receivePayMode === 'Split' && (
            <SplitPaymentInput
              cash={receivePaySplitCash} onCashChange={setReceivePaySplitCash}
              bank={receivePaySplitBank} onBankChange={setReceivePaySplitBank}
              total={Math.max(0, outstanding - (parseFloat(receivePayLess) || 0))}
            />
          )}
          <TextField
            fullWidth size="small" type="date" label="Payment Date"
            value={receivePayDate}
            onChange={(e) => setReceivePayDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: new Date().toISOString().split('T')[0] } }}
            sx={{ mt: 1.5 }}
          />
          <Box sx={{ mt: 1.5, border: '1.5px solid', borderColor: receivePayLess ? '#d97706' : 'divider', borderRadius: '10px', px: 1.5, py: 0.75, bgcolor: receivePayLess ? alpha('#d97706', 0.05) : 'transparent', transition: 'all 0.15s' }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: receivePayLess ? '#d97706' : 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
              Less (Discount / Write-off)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: receivePayLess ? '#d97706' : '#cbd5e1' }}>₹</Typography>
              <InputBase
                fullWidth type="number" placeholder="0 (optional)"
                value={receivePayLess}
                onChange={(e) => setReceivePayLess(e.target.value)}
                slotProps={{ input: { min: 0, max: outstanding, step: '0.01' } }}
                sx={{ fontSize: '0.9rem', fontWeight: 600 }}
              />
            </Box>
          </Box>
          {parseFloat(receivePayLess) > 0 && (
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.5 }}>
              Collecting ₹{Math.max(0, outstanding - (parseFloat(receivePayLess) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} · writing off ₹{(parseFloat(receivePayLess) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} — invoice still marked fully paid.
            </Typography>
          )}
          <TextField
            fullWidth size="small" label="Notes (optional)" placeholder="e.g. Paid via GPay, ref #123"
            value={receivePayNotes}
            onChange={(e) => setReceivePayNotes(e.target.value)}
            sx={{ mt: 1.5 }}
          />
        </Box>
        <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setReceivePayDialogOpen(false)} disabled={receivePaySaving} sx={{ fontWeight: 600 }}>Cancel</Button>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Marks the invoice as paid without recording any payment — add it manually via Payment Entry later.">
            <span>
              <Button
                onClick={markPaidWithoutPayment}
                disabled={receivePaySaving}
                variant="outlined"
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
              >
                Mark Paid without Payment
              </Button>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            onClick={confirmReceivePayment}
            disabled={receivePaySaving}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, bgcolor: '#16a34a', '&:hover': { bgcolor: '#16a34a' } }}
          >
            {receivePaySaving ? 'Saving…' : (isSale ? 'Confirm Received' : 'Confirm Paid')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rendered outside both Dialogs so it stays visible even after
          confirmReceivePayment closes the preview dialog via onClose(). */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          {...(snack.severity === 'success' ? { icon: <CheckCircle2 size={18} /> } : {})}
          sx={{ width: '100%', fontWeight: 700 }}
        >
          {snack.message}
        </Alert>
      </Snackbar>

      {/* Off-screen print target (display:none — react-to-print handles visibility) */}
      <div style={{ display: 'none' }}>
        <InvoiceTemplate
          ref={printRef}
          transaction={transaction}
          business={business}
          paperSize={paperSize}
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
          partyBalance={partyBalance}
        />
      </div>

      {/* Off-screen PDF capture — NOT display:none so html2canvas can render it */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <InvoiceTemplate
          ref={pdfRef}
          transaction={transaction}
          business={business}
          paperSize={paperSize}
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
          partyBalance={partyBalance}
        />
      </div>
    </>
  );
};

export default InvoicePreviewDialog;
