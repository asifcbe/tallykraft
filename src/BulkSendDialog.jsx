import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Tabs, Tab, IconButton,
  Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Paper, Chip, LinearProgress,
  Alert, Tooltip,
} from '@mui/material';
import { X, MessageCircle, Mail, CheckCircle, AlertCircle, ChevronRight, SkipForward } from 'lucide-react';

const cleanPhone = (raw = '') => {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const buildMessage = (tx, businessName, isSale) => {
  const label = isSale ? 'Invoice' : 'Bill';
  const lines = [
    `*${label} from ${businessName}*`,
    '',
    `📄 ${label} No: ${tx.invoiceNumber || '—'}`,
    `📅 Date: ${tx.date || '—'}`,
    tx.partyName ? `👤 ${isSale ? 'Customer' : 'Vendor'}: ${tx.partyName}` : '',
    '',
  ];
  if (tx.items?.length) {
    lines.push('*Items:*');
    tx.items.forEach(i => {
      const qty = Number(i.qty) || 1;
      const rate = Number(i.price) || 0;
      lines.push(`  • ${i.name} × ${qty} @ ₹${rate.toFixed(2)} = ₹${(qty * rate).toFixed(2)}`);
    });
    lines.push('');
  }
  if (Number(tx.discountAmount) > 0) lines.push(`Discount: -₹${Number(tx.discountAmount).toFixed(2)}`);
  if (Number(tx.taxAmount) > 0) lines.push(`Tax (GST): ₹${Number(tx.taxAmount).toFixed(2)}`);
  lines.push(`*Total: ₹${(Number(tx.totalAmount) || Number(tx.total) || 0).toFixed(2)}*`);
  if (tx.dueDate) lines.push(`\n⏰ Due: ${tx.dueDate}`);
  lines.push('\n_Sent via TallyKraft_');
  return lines.filter(l => l !== null).join('\n');
};

const BulkSendDialog = ({ open, onClose, transactions, parties, businessName, isSale }) => {
  const [tab, setTab] = useState(0);        // 0 = WhatsApp, 1 = Email
  const [step, setStep] = useState(0);      // 0 = queue overview, 1 = sending
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sentIds, setSentIds] = useState(new Set());
  const [skippedIds, setSkippedIds] = useState(new Set());

  const queue = useMemo(() => {
    return transactions.map(tx => {
      const party = parties.find(p => p.id === tx.partyId) || {};
      const phone = cleanPhone(party.phone || '');
      const email = (party.email || '').trim();
      const msg = buildMessage(tx, businessName, isSale);
      const whatsappUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      const emailUrl = `mailto:${email}?subject=${encodeURIComponent(`${isSale ? 'Invoice' : 'Bill'} ${tx.invoiceNumber || ''} from ${businessName}`)}&body=${encodeURIComponent(msg.replace(/\*/g, '').replace(/_/g, ''))}`;
      return { tx, party, phone, email, msg, whatsappUrl, emailUrl };
    });
  }, [transactions, parties, businessName, isSale]);

  const hasContact = (item) => tab === 0 ? !!item.phone : !!item.email;
  const noContact = queue.filter(item => !hasContact(item));
  const withContact = queue.filter(item => hasContact(item));

  const reset = () => {
    setStep(0);
    setCurrentIdx(0);
    setSentIds(new Set());
    setSkippedIds(new Set());
  };

  const handleClose = () => { reset(); onClose(); };

  const startSending = () => {
    setSentIds(new Set());
    setSkippedIds(new Set());
    setCurrentIdx(0);
    setStep(1);
  };

  const sendCurrent = () => {
    const item = withContact[currentIdx];
    if (!item) return;
    window.open(tab === 0 ? item.whatsappUrl : item.emailUrl, '_blank');
    setSentIds(prev => new Set([...prev, item.tx.id]));
    if (currentIdx + 1 < withContact.length) {
      setCurrentIdx(i => i + 1);
    } else {
      setStep(2); // done
    }
  };

  const skipCurrent = () => {
    const item = withContact[currentIdx];
    if (!item) return;
    setSkippedIds(prev => new Set([...prev, item.tx.id]));
    if (currentIdx + 1 < withContact.length) {
      setCurrentIdx(i => i + 1);
    } else {
      setStep(2);
    }
  };

  const current = withContact[currentIdx];
  const sent = sentIds.size;
  const skipped = skippedIds.size;
  const progress = withContact.length ? Math.round(((sent + skipped) / withContact.length) * 100) : 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MessageCircle size={20} />
          Bulk Send — {transactions.length} {isSale ? 'Invoice' : 'Bill'}{transactions.length !== 1 ? 's' : ''}
        </Box>
        <IconButton size="small" onClick={handleClose}><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Step 0: Queue overview */}
        {step === 0 && (
          <Box sx={{ p: 2.5 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
              <Tab label="WhatsApp" icon={<MessageCircle size={14} />} iconPosition="start"
                sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36, fontSize: '0.82rem' }} />
              <Tab label="Email" icon={<Mail size={14} />} iconPosition="start"
                sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36, fontSize: '0.82rem' }} />
            </Tabs>

            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${withContact.length} ready`} color="success" size="small" />
              {noContact.length > 0 && (
                <Chip label={`${noContact.length} missing ${tab === 0 ? 'phone' : 'email'}`} color="warning" size="small" />
              )}
            </Box>

            {noContact.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2, py: 0.5 }}>
                <Typography variant="caption">
                  {noContact.length} {tab === 0 ? 'customer(s) have no phone number' : 'customer(s) have no email'} — they will be skipped.
                  Add contact info to their party profile to include them next time.
                </Typography>
              </Alert>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'action.hover' }}>Invoice</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'action.hover' }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'action.hover' }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'action.hover' }}>
                      {tab === 0 ? 'Phone' : 'Email'}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {queue.map(item => {
                    const ready = hasContact(item);
                    return (
                      <TableRow key={item.tx.id} sx={{ opacity: ready ? 1 : 0.5 }}>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{item.tx.invoiceNumber || item.tx.id?.slice?.(0, 8)}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>{item.tx.partyName}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>₹{(item.tx.totalAmount || item.tx.total || 0).toLocaleString('en-IN')}</TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          {ready
                            ? <Chip label={tab === 0 ? item.phone : item.email} size="small" color="success" variant="outlined" sx={{ fontSize: '0.65rem', maxWidth: 140 }} />
                            : <Chip label="Missing" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.65rem' }} />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {withContact.length === 0 && (
              <Alert severity="error" sx={{ mt: 2 }}>
                No {tab === 0 ? 'phone numbers' : 'email addresses'} found. Add contact info to party profiles first.
              </Alert>
            )}
          </Box>
        )}

        {/* Step 1: Sending one by one */}
        {step === 1 && current && (
          <Box sx={{ p: 2.5 }}>
            <LinearProgress variant="determinate" value={progress} sx={{ mb: 2, height: 6, borderRadius: 3 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {sent + skipped} of {withContact.length} done · {sent} sent · {skipped} skipped
            </Typography>

            <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2.5, mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Chip label={current.tx.invoiceNumber || '—'} size="small" />
                <Chip label={`₹${(current.tx.totalAmount || 0).toLocaleString('en-IN')}`} size="small" color="success" />
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{current.tx.partyName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {tab === 0 ? `📱 ${current.phone}` : `📧 ${current.email}`}
              </Typography>
            </Box>

            <Alert severity="info" icon={false} sx={{ py: 0.5, mb: 2 }}>
              <Typography variant="caption">
                Clicking <strong>Send</strong> opens {tab === 0 ? 'WhatsApp' : 'your email app'} with the message pre-filled.
                Come back here and click <strong>Send</strong> again for the next customer.
              </Typography>
            </Alert>

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant="contained"
                onClick={sendCurrent}
                startIcon={tab === 0 ? <MessageCircle size={16} /> : <Mail size={16} />}
                fullWidth
                sx={{
                  textTransform: 'none', fontWeight: 700, py: 1.2,
                  bgcolor: tab === 0 ? '#25D366' : undefined,
                  '&:hover': { bgcolor: tab === 0 ? '#1da851' : undefined },
                }}
              >
                {tab === 0 ? 'Open WhatsApp & Next →' : 'Open Email & Next →'}
              </Button>
              <Tooltip title="Skip this customer">
                <Button
                  variant="outlined"
                  onClick={skipCurrent}
                  startIcon={<SkipForward size={16} />}
                  sx={{ textTransform: 'none', minWidth: 90 }}
                >
                  Skip
                </Button>
              </Tooltip>
            </Box>
          </Box>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <CheckCircle size={48} color="#16a34a" style={{ marginBottom: 12 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>All Done!</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip label={`${sent} Sent`} color="success" />
              {skipped > 0 && <Chip label={`${skipped} Skipped`} color="warning" />}
              {noContact.length > 0 && <Chip label={`${noContact.length} No Contact`} color="default" />}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2, gap: 1 }}>
        {step === 0 && (
          <>
            <Button onClick={handleClose} sx={{ textTransform: 'none' }}>Cancel</Button>
            <Button
              variant="contained"
              disabled={withContact.length === 0}
              onClick={startSending}
              startIcon={<ChevronRight size={16} />}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Start Sending ({withContact.length})
            </Button>
          </>
        )}
        {step === 1 && (
          <Button onClick={() => setStep(2)} sx={{ textTransform: 'none', color: 'text.secondary' }}>
            Stop & Finish
          </Button>
        )}
        {step === 2 && (
          <Button variant="contained" onClick={handleClose} sx={{ textTransform: 'none', fontWeight: 700 }}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkSendDialog;
