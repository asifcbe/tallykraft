import React, { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, IconButton, TextField, Tooltip, Typography, alpha,
} from '@mui/material';
import { Banknote, Landmark, Wallet, CheckCircle2, Clock, X } from 'lucide-react';
import SplitPaymentInput from './SplitPaymentInput';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useDialog } from './DialogContext';
import { txOutstanding, txPaidSoFar, txWrittenOff } from './paymentUtils';

const SUCCESS = '#16a34a';
const AMBER = '#d97706';
const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().split('T')[0];

// "Received Payment" (Sales) / "Payment Made" (Purchases). Supports a custom
// (partial) amount: the bill stays Unpaid with the remainder still owed, and
// can be settled later in one or more further payments. The Paid/Unpaid
// toggle follows the amount automatically (full amount → Paid) but can be
// switched to Paid for a partial amount — the remainder is then written off.
const ReceivePaymentDialog = ({ open, tx, isSale, onClose, onDone }) => {
  const { getItems, addItem, updateItem } = useData();
  const { currentBusiness } = useBusiness();
  const { showAlert } = useDialog();

  const outstanding = txOutstanding(tx);
  const alreadyPaid = Number(tx?.amountPaid) || 0;

  const [mode, setMode] = useState('Cash');
  const [amount, setAmount] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitBank, setSplitBank] = useState('');
  const [date, setDate] = useState(todayStr);
  const [less, setLess] = useState('');
  const [notes, setNotes] = useState('');
  const [billPaid, setBillPaid] = useState(true);
  const [paidTouched, setPaidTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset every time the dialog opens for a (possibly different) invoice.
  useEffect(() => {
    if (!open) return;
    setMode('Cash');
    setAmount(String(outstanding));
    setSplitCash('');
    setSplitBank('');
    setDate(todayStr());
    setLess('');
    setNotes('');
    setBillPaid(true);
    setPaidTouched(false);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tx?.id]);

  const amountNum = Math.max(0, parseFloat(amount) || 0);
  const lessNum = Math.max(0, parseFloat(less) || 0);
  const settled = amountNum + lessNum;
  const isFull = settled >= outstanding - 0.01;
  const overpaid = settled > outstanding + 0.01;
  const remaining = Math.max(0, outstanding - settled);

  // Toggle follows the amount until the user flips it themselves; a full
  // amount always forces Paid (an "unpaid" bill with nothing left owed makes
  // no sense).
  useEffect(() => {
    if (isFull) setBillPaid(true);
    else if (!paidTouched) setBillPaid(false);
  }, [isFull, paidTouched]);

  const writeOff = billPaid ? Math.max(0, outstanding - amountNum) : lessNum;

  const handleConfirm = async () => {
    if (!tx || saving) return;
    if (overpaid) {
      await showAlert({ title: 'Amount too high', message: `Amount + Less cannot exceed the outstanding ₹${fmt(outstanding)}.`, variant: 'warning' });
      return;
    }
    if (amountNum <= 0) {
      await showAlert({ title: 'Enter an amount', message: `Enter the amount ${isSale ? 'received' : 'paid'}, or use "Mark Paid without Payment".`, variant: 'warning' });
      return;
    }
    let paymentSplit = null;
    if (mode === 'Split' && amountNum > 0) {
      const c = parseFloat(splitCash) || 0;
      const b = parseFloat(splitBank) || 0;
      if (Math.abs(c + b - amountNum) > 0.01) {
        await showAlert({ title: 'Split does not match', message: `Cash + Bank must add up to ₹${fmt(amountNum)}.`, variant: 'warning' });
        return;
      }
      paymentSplit = { cash: c, bank: b, bankMode: 'Bank' };
    }
    const balanceEffect = amountNum + writeOff; // how much of the party balance this settles
    setSaving(true);
    try {
      const party = tx.partyId ? getItems('parties').find((p) => p.id === tx.partyId) : null;
      {
        await addItem('payments', {
          businessId: currentBusiness?.id,
          partyId: tx.partyId || null,
          partyName: tx.partyName || (party?.name ?? ''),
          type: isSale ? 'PaymentIn' : 'PaymentOut',
          totalAmount: amountNum,
          ...(writeOff > 0 ? { lessAmount: writeOff } : {}),
          date,
          paymentMode: mode,
          ...(paymentSplit ? { paymentSplit } : {}),
          referenceNo: `RCV-${tx.invoiceNumber}`,
          notes: notes || `${billPaid ? 'Payment' : 'Part payment'} ${isSale ? 'received' : 'made'} against ${isSale ? 'invoice' : 'bill'} #${tx.invoiceNumber}`,
        });
        if (party) {
          await updateItem('parties', party.id, {
            balance: (party.balance || 0) + (isSale ? -balanceEffect : balanceEffect),
          });
        }
      }
      // amountPaid = total settled (drives the outstanding balance);
      // amountReceived = actual money in; amountWrittenOff = the "Less" part.
      const tracked = {
        amountPaid: alreadyPaid + balanceEffect,
        amountReceived: (tx.amountReceived != null ? Number(tx.amountReceived) : alreadyPaid) + amountNum,
        amountWrittenOff: (Number(tx.amountWrittenOff) || 0) + writeOff,
      };
      await updateItem(isSale ? 'sales' : 'purchases', tx.id, billPaid
        ? { status: 'paid', dueDate: '', paidDate: date, ...tracked }
        : { status: 'unpaid', lastPaymentDate: date, ...tracked });
      onDone?.({
        message: billPaid
          ? (isSale ? 'Payment received — invoice marked paid.' : 'Payment made — bill marked paid.')
          : `₹${fmt(amountNum)} recorded — ₹${fmt(remaining)} still ${isSale ? 'to collect' : 'to pay'}.`,
        severity: 'success',
      });
    } catch (err) {
      console.error('Error recording payment:', err);
      await showAlert({ title: 'Save error', message: 'An error occurred while recording the payment. Please try again.', variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  // Flips the bill to paid without recording a payment or touching the party
  // balance — for bills settled outside the app / reconciled later.
  const handleMarkPaidOnly = async () => {
    if (!tx || saving) return;
    setSaving(true);
    try {
      await updateItem(isSale ? 'sales' : 'purchases', tx.id, { status: 'paid', dueDate: '', paidDate: date });
      onDone?.({
        message: `${tx.invoiceNumber} marked as paid on ${new Date(date).toLocaleDateString('en-IN')} — no payment recorded, add it manually via Payment Entry when received.`,
        severity: 'info',
      });
    } catch (err) {
      console.error('Error marking as paid:', err);
      await showAlert({ title: 'Save error', message: 'An error occurred. Please try again.', variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const close = () => { if (!saving) onClose?.(); };
  const statusColor = billPaid ? SUCCESS : AMBER;

  const sectionLabel = { fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 };
  // One segmented-tile style shared by Bill Status and Received Via, so the
  // two rows line up edge to edge.
  const tileSx = (sel, color, disabled) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, height: 36,
    borderRadius: '8px', border: '1.5px solid', userSelect: 'none', transition: 'all 0.12s',
    fontWeight: 700, fontSize: '0.8rem',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
    borderColor: sel ? color : 'divider',
    bgcolor: sel ? alpha(color, 0.08) : 'transparent',
    color: sel ? color : 'text.secondary',
    '&:hover': disabled || sel ? {} : { borderColor: alpha(color, 0.5), color },
    '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
  });
  const billTotal = Number(tx?.totalAmount) || 0;
  const paidBefore = txPaidSoFar(tx);
  const writtenOffBefore = txWrittenOff(tx);

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      {/* Header */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.3 }}>
            {isSale ? 'Received Payment' : 'Payment Made'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {isSale ? 'Invoice' : 'Bill'} #{tx?.invoiceNumber} · {tx?.partyName}
          </Typography>
        </Box>
        <IconButton size="small" onClick={close} disabled={saving} sx={{ mt: -0.25, mr: -0.75 }}>
          <X size={18} />
        </IconButton>
      </Box>

      {/* Summary strip: total / already paid / outstanding */}
      <Box sx={{ mx: 2.5, mb: 2, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderRadius: '10px', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {[
          { label: 'Bill Total', value: billTotal, color: 'text.primary' },
          { label: isSale ? 'Received' : 'Paid', value: paidBefore, color: SUCCESS },
          { label: 'Outstanding', value: outstanding, color: '#b45309', strong: true },
        ].map((c, i) => (
          <Box key={c.label} sx={{ px: 1.25, py: 1, textAlign: 'center', borderLeft: i ? '1px solid' : 'none', borderColor: 'divider', bgcolor: c.strong ? alpha(AMBER, 0.06) : 'transparent' }}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</Typography>
            <Typography sx={{ fontSize: c.strong ? '1rem' : '0.88rem', fontWeight: 800, color: c.color, lineHeight: 1.35 }} noWrap>₹{fmt(c.value)}</Typography>
          </Box>
        ))}
      </Box>
      {writtenOffBefore > 0 && (
        <Typography sx={{ mx: 2.5, mt: -1.25, mb: 2, fontSize: '0.7rem', color: 'text.secondary', textAlign: 'right' }}>
          + ₹{fmt(writtenOffBefore)} written off earlier
        </Typography>
      )}

      <Box sx={{ px: 2.5, pb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Amount */}
        <TextField
          fullWidth size="small" type="number" autoFocus
          label={isSale ? 'Amount Received' : 'Amount Paid'}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onFocus={(e) => e.target.select()}
          error={overpaid}
          helperText={overpaid ? `Cannot exceed ₹${fmt(outstanding)}` : undefined}
          slotProps={{ htmlInput: { min: 0, step: '0.01' }, input: { startAdornment: <Typography sx={{ mr: 0.5, fontWeight: 700, color: 'text.secondary' }}>₹</Typography> } }}
        />

        {/* Bill Paid / Unpaid */}
        <Box>
          <Typography sx={sectionLabel}>Bill Status</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {[
              { value: true, label: 'Paid', icon: <CheckCircle2 size={14} />, color: SUCCESS, disabled: false },
              { value: false, label: 'Unpaid', icon: <Clock size={14} />, color: AMBER, disabled: isFull },
            ].map((opt) => {
              const pick = () => { if (!opt.disabled) { setBillPaid(opt.value); setPaidTouched(true); } };
              return (
                <Tooltip key={opt.label} title={opt.disabled ? 'Full amount entered — bill will be closed.' : ''}>
                  <Box role="button" tabIndex={opt.disabled ? -1 : 0} onClick={pick}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
                    sx={tileSx(billPaid === opt.value, opt.color, opt.disabled)}>
                    {opt.icon}{opt.label}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
          <Typography sx={{ fontSize: '0.72rem', color: statusColor, fontWeight: 600, mt: 0.75 }}>
            {billPaid
              ? (!isFull ? `Bill will be closed — remaining ₹${fmt(outstanding - amountNum)} written off.` : 'Bill will be closed.')
              : `Bill stays open — ₹${fmt(remaining)} still ${isSale ? 'to collect' : 'to pay'} later.`}
          </Typography>
        </Box>

        {/* Mode */}
        <Box>
          <Typography sx={sectionLabel}>{isSale ? 'Received Via' : 'Paid Via'}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {[
              { value: 'Cash', icon: <Banknote size={14} />, color: SUCCESS },
              { value: 'Bank', icon: <Landmark size={14} />, color: '#5c1f22' },
              { value: 'Split', icon: <Wallet size={14} />, color: '#7c3aed' },
            ].map((opt) => (
              <Box key={opt.value} role="button" tabIndex={0} onClick={() => setMode(opt.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode(opt.value); } }}
                sx={tileSx(mode === opt.value, opt.color, false)}>
                {opt.icon}{opt.value}
              </Box>
            ))}
          </Box>
          {mode === 'Split' && (
            <Box sx={{ mt: 1 }}>
              <SplitPaymentInput
                cash={splitCash} onCashChange={setSplitCash}
                bank={splitBank} onBankChange={setSplitBank}
                total={amountNum}
              />
            </Box>
          )}
        </Box>

        {/* Date + Less side by side (Less only while the bill stays open —
            when Paid, anything not collected is written off automatically). */}
        <Box sx={{ display: 'grid', gridTemplateColumns: billPaid ? '1fr' : '1fr 1fr', gap: 1.5 }}>
          <TextField
            fullWidth size="small" type="date" label="Payment Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayStr() } }}
          />
          {!billPaid && (
            <TextField
              fullWidth size="small" type="number" label="Less / Write-off" placeholder="0"
              value={less}
              onChange={(e) => setLess(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, step: '0.01' }, input: { startAdornment: <Typography sx={{ mr: 0.5, fontWeight: 700, color: 'text.secondary' }}>₹</Typography> } }}
            />
          )}
        </Box>

        <TextField
          fullWidth size="small" label="Notes (optional)" placeholder="e.g. Paid via GPay, ref #123"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Box>

      {/* Footer: primary action full width, secondary actions on one row below */}
      <Box sx={{ px: 2.5, pt: 1.5, pb: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.015)' }}>
        <Button
          fullWidth variant="contained"
          onClick={handleConfirm}
          disabled={saving || overpaid}
          sx={{ height: 40, fontWeight: 700, textTransform: 'none', borderRadius: 2, bgcolor: statusColor, boxShadow: 'none', '&:hover': { bgcolor: statusColor, boxShadow: 'none' } }}
        >
          {saving ? 'Saving…' : billPaid
            ? `${isSale ? 'Confirm Received' : 'Confirm Paid'} · ₹${fmt(amountNum)}`
            : `Save Part Payment · ₹${fmt(amountNum)}`}
        </Button>
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Button size="small" onClick={close} disabled={saving} sx={{ fontWeight: 600, textTransform: 'none', color: 'text.secondary' }}>
            Cancel
          </Button>
          <Tooltip title="Marks the bill as paid without recording any payment or changing the balance — add the payment later via Payment Entry.">
            <span>
              <Button size="small" onClick={handleMarkPaidOnly} disabled={saving} startIcon={<CheckCircle2 size={14} />}
                sx={{ fontWeight: 600, textTransform: 'none', color: 'text.secondary', '&:hover': { color: SUCCESS, bgcolor: alpha(SUCCESS, 0.06) } }}>
                Mark paid without payment
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Dialog>
  );
};

export default ReceivePaymentDialog;
