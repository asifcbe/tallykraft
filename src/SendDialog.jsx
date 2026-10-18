import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, TextField, Tabs, Tab,
  IconButton, Divider, Chip, Alert,
} from '@mui/material';
import { X, MessageCircle, Mail, Share2, Copy, Check, FileDown, Image } from 'lucide-react';

// Clean phone: strip spaces, dashes, brackets; add 91 country code if local Indian number
const cleanPhone = (raw = '') => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const buildMessage = ({ tx, businessName, isSale, customMsg }) => {
  if (customMsg !== undefined) return customMsg;
  if (!tx) return '';
  const label = isSale ? 'Invoice' : 'Bill';
  const lines = [
    `*${label} from ${businessName}*`,
    '',
    `📄 ${label} No: ${tx.invoiceNumber || '—'}`,
    `📅 Date: ${tx.date || '—'}`,
    tx.partyName ? `👤 ${isSale ? 'Customer' : 'Vendor'}: ${tx.partyName}` : '',
    tx.billedBy ? `🧾 Billed By: ${tx.billedBy}` : '',
    '',
  ];
  // "Not billed" lines (e.g. a free cover/bag — see Sales.jsx/POS.jsx) never
  // appear on the customer-facing bill, so keep them out of the shared text too.
  const billedItems = (tx.items || []).filter(i => !i.notBilled);
  if (billedItems.length) {
    lines.push('*Items:*');
    billedItems.forEach(i => {
      // A qty derived from a typed Amount (Sales.jsx's Amount→Qty auto-calc)
      // can carry more precision than 2dp — kept that way so qty×rate
      // reproduces the exact typed amount, but only the displayed figure
      // needs rounding to a clean 2dp quantity here.
      const rawQty = Number(i.qty) || 1;
      const qty = Math.round(rawQty * 100) / 100;
      const rate = Number(i.price) || 0;
      const unit = i.unit ? ` ${i.unit}` : '';
      const disc = Number(i.discountPercent) || 0;
      const gst = Number(i.taxRate) || 0;
      const extras = [
        disc > 0 ? `${disc}% off` : null,
        gst > 0 ? `GST ${gst}%${i.taxInclusive ? ' incl.' : ''}` : null,
      ].filter(Boolean).join(', ');
      lines.push(`  • ${i.name} × ${qty}${unit} @ ₹${rate.toFixed(2)}${extras ? ` (${extras})` : ''} = ₹${(Number(i.total) || rawQty * rate).toFixed(2)}`);
    });
    lines.push('');
  }
  lines.push(`Subtotal: ₹${(Number(tx.subtotal) || 0).toFixed(2)}`);
  if (Number(tx.discountAmount) > 0) lines.push(`Discount: -₹${Number(tx.discountAmount).toFixed(2)}`);
  if (Number(tx.taxAmount) > 0) lines.push(`Tax (GST): ₹${Number(tx.taxAmount).toFixed(2)}`);
  if (Number(tx.packingCharge) > 0) lines.push(`Packing Charges: ₹${Number(tx.packingCharge).toFixed(2)}`);
  if (Number(tx.shippingCharge) > 0) lines.push(`Shipping Charges: ₹${Number(tx.shippingCharge).toFixed(2)}`);
  if (Number(tx.roundOffAmount) !== 0) lines.push(`Round Off: ${Number(tx.roundOffAmount) > 0 ? '+' : ''}₹${Number(tx.roundOffAmount).toFixed(2)}`);
  lines.push(`*Total: ₹${(Number(tx.totalAmount) || Number(tx.total) || 0).toFixed(2)}*`);
  if (Number(tx.loyaltyRedeemValue) > 0) lines.push(`Loyalty Redeemed: -₹${Number(tx.loyaltyRedeemValue).toFixed(2)}`);
  if (Number(tx.advance) > 0) {
    const outstanding = (Number(tx.totalAmount) || 0) - Number(tx.advance);
    lines.push(`${isSale ? 'Advance Received' : 'Advance Paid'}: ₹${Number(tx.advance).toFixed(2)}`);
    lines.push(`*${isSale ? 'Balance Due' : 'Balance Payable'}: ₹${outstanding.toFixed(2)}*`);
  }
  const paymentLine = tx.saleType === 'paid'
    ? (tx.paymentMode === 'Split' && tx.paymentSplit
        ? `Payment Mode: Split (Cash ₹${Number(tx.paymentSplit.cash || 0).toFixed(2)} + Bank ₹${Number(tx.paymentSplit.bank || 0).toFixed(2)})`
        : `Payment Mode: ${tx.paymentMode || '—'}`)
    : 'Payment Status: Credit (Unpaid)';
  lines.push(paymentLine);
  if (tx.dueDate) lines.push(`⏰ Due Date: ${tx.dueDate}`);
  if (tx.description?.trim()) lines.push(`\n📝 Notes: ${tx.description.trim()}`);
  lines.push('\n_Sent via BillDheko_');
  return lines.filter(l => l !== null).join('\n');
};

const SendDialog = ({
  open,
  onClose,
  tx,
  party,           // party object from parties list (has phone, email)
  businessName,
  isSale = true,
  onSharePDF,      // async fn → generates & shares PDF
  onShareImage,    // async fn → generates & shares image
  onSharePDFToWhatsApp,   // async fn → generates PDF and routes it toward WhatsApp
  onShareImageToWhatsApp, // async fn → generates image and routes it toward WhatsApp
  shareLoading,
  initialMessage,  // optional override for the message text (e.g. prescriptions)
  dialogTitle,     // optional override for dialog title
}) => {
  const [tab, setTab] = useState(0);
  const [phone, setPhone] = useState(party?.phone || '');
  const [email, setEmail] = useState(party?.email || '');
  const [message, setMessage] = useState(() => initialMessage ?? buildMessage({ tx, businessName, isSale }));
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPhone(party?.phone || '');
    setEmail(party?.email || '');
    setMessage(initialMessage ?? buildMessage({ tx, businessName, isSale }));
    setCopied(false);
  }, [open, tx?.id, party?.id, initialMessage]); // eslint-disable-line

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsApp = () => {
    const num = cleanPhone(phone);
    const url = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleEmail = () => {
    const label = isSale ? 'Invoice' : 'Bill';
    const subject = `${label} ${tx?.invoiceNumber || ''} from ${businessName}`;
    const body = message.replace(/\*/g, '').replace(/_/g, '');
    const mailTo = `mailto:${email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailTo, '_blank');
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: `Invoice ${tx?.invoiceNumber}`, text: message }).catch(() => {});
    } else {
      handleWhatsApp();
    }
  };

  const noPhone = !cleanPhone(phone);
  const noEmail = !email?.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Share2 size={20} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {dialogTitle || 'Send to Customer'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        {/* Invoice summary chip row */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {tx?.invoiceNumber && <Chip label={tx.invoiceNumber} size="small" variant="outlined" />}
          {tx?.partyName && <Chip label={tx.partyName} size="small" color="primary" variant="outlined" />}
          {tx && (tx.totalAmount || tx.total) ? (
            <Chip label={`₹${(tx.totalAmount || tx.total || 0).toLocaleString('en-IN')}`} size="small" color="success" />
          ) : null}
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}
          TabIndicatorProps={{ sx: { height: 2 } }}>
          <Tab label="WhatsApp" icon={<MessageCircle size={15} />} iconPosition="start"
            sx={{ minHeight: 36, textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', gap: 0.5 }} />
          <Tab label="Email" icon={<Mail size={15} />} iconPosition="start"
            sx={{ minHeight: 36, textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', gap: 0.5 }} />
          <Tab label="PDF / Image" icon={<FileDown size={15} />} iconPosition="start"
            sx={{ minHeight: 36, textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', gap: 0.5 }} />
        </Tabs>

        {/* ── WhatsApp tab ── */}
        {tab === 0 && (
          <Box>
            <TextField
              fullWidth
              label="Customer WhatsApp Number"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              size="small"
              sx={{ mb: 2 }}
              helperText={noPhone ? 'Enter number or leave blank to pick from WhatsApp contacts' : `Will open wa.me/${cleanPhone(phone)}`}
            />
            <TextField
              fullWidth
              label="Message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              multiline
              rows={8}
              size="small"
              sx={{ mb: 1.5, '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: '0.78rem' } }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<MessageCircle size={16} />}
                onClick={handleWhatsApp}
                sx={{ textTransform: 'none', fontWeight: 700, bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' }, flex: 1 }}
              >
                {noPhone ? 'Open WhatsApp (pick contact)' : 'Send via WhatsApp'}
              </Button>
              <Button
                variant="outlined"
                startIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                onClick={handleCopy}
                sx={{ textTransform: 'none', minWidth: 100 }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </Box>
          </Box>
        )}

        {/* ── Email tab ── */}
        {tab === 1 && (
          <Box>
            <TextField
              fullWidth
              label="Customer Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="customer@example.com"
              size="small"
              sx={{ mb: 2 }}
              helperText="Opens your default email app with the invoice pre-filled"
            />
            <TextField
              fullWidth
              label="Email Body"
              value={message.replace(/\*/g, '').replace(/_/g, '')}
              onChange={e => setMessage(e.target.value)}
              multiline
              rows={8}
              size="small"
              sx={{ mb: 1.5, '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: '0.78rem' } }}
            />
            {noEmail && (
              <Alert severity="info" sx={{ mb: 1.5, py: 0.5 }}>
                Add the customer's email to their party profile so it auto-fills here next time.
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<Mail size={16} />}
                onClick={handleEmail}
                sx={{ textTransform: 'none', fontWeight: 700, flex: 1 }}
              >
                {noEmail ? 'Open Email (enter address)' : 'Send Email'}
              </Button>
              <Button
                variant="outlined"
                startIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                onClick={handleCopy}
                sx={{ textTransform: 'none', minWidth: 100 }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </Box>
          </Box>
        )}

        {/* ── PDF / Image tab ── */}
        {tab === 2 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Generate the invoice as a PDF or image and share it via WhatsApp, email, or any other app.
            </Typography>

            {(onSharePDFToWhatsApp || onShareImageToWhatsApp) && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#25D366', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1, display: 'block' }}>
                  Direct to WhatsApp
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<Image size={18} />}
                    endIcon={<MessageCircle size={16} />}
                    onClick={onShareImageToWhatsApp}
                    disabled={shareLoading}
                    fullWidth
                    sx={{ textTransform: 'none', fontWeight: 700, py: 1.2, color: '#25D366', borderColor: '#25D366', '&:hover': { borderColor: '#1da851', bgcolor: 'rgba(37,211,102,0.06)' } }}
                  >
                    Image to WhatsApp
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1.25, display: 'block' }}>
                    On desktop: copies the image — paste it (Ctrl+V) into the chat that opens.
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<FileDown size={18} />}
                    endIcon={<MessageCircle size={16} />}
                    onClick={onSharePDFToWhatsApp}
                    disabled={shareLoading}
                    fullWidth
                    sx={{ textTransform: 'none', fontWeight: 700, py: 1.2, bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' } }}
                  >
                    PDF to WhatsApp
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    On desktop: downloads the PDF and opens the chat — drag the file in (WhatsApp Web can't paste PDFs).
                  </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
              </>
            )}

            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1, display: 'block' }}>
              Other apps
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="outlined"
                startIcon={<FileDown size={18} />}
                onClick={onSharePDF}
                disabled={shareLoading}
                fullWidth
                sx={{ textTransform: 'none', fontWeight: 700, py: 1.2 }}
              >
                Share as PDF
              </Button>
              <Button
                variant="outlined"
                startIcon={<Image size={18} />}
                onClick={onShareImage}
                disabled={shareLoading}
                fullWidth
                sx={{ textTransform: 'none', fontWeight: 700, py: 1.2 }}
              >
                Share as Image
              </Button>
              <Divider />
              <Button
                variant="outlined"
                startIcon={<Share2 size={18} />}
                onClick={handleNativeShare}
                fullWidth
                sx={{ textTransform: 'none', py: 1.2 }}
              >
                Share Text via Any App
              </Button>
            </Box>
            <Alert severity="info" sx={{ mt: 2, py: 0.5 }}>
              <Typography variant="caption">
                On mobile, these buttons open the native share sheet — for "Direct to WhatsApp," just tap the WhatsApp icon in the sheet that opens.
              </Typography>
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SendDialog;
