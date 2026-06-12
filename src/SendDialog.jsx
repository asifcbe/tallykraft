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

const SendDialog = ({
  open,
  onClose,
  tx,
  party,           // party object from parties list (has phone, email)
  businessName,
  isSale = true,
  onSharePDF,      // async fn → generates & shares PDF
  onShareImage,    // async fn → generates & shares image
  shareLoading,
}) => {
  const [tab, setTab] = useState(0);
  const [phone, setPhone] = useState(party?.phone || '');
  const [email, setEmail] = useState(party?.email || '');
  const [message, setMessage] = useState(() => buildMessage({ tx, businessName, isSale }));
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (!tx) return;
    setPhone(party?.phone || '');
    setEmail(party?.email || '');
    setMessage(buildMessage({ tx, businessName, isSale }));
    setCopied(false);
  }, [tx?.id, party?.id]); // eslint-disable-line

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
            Send to Customer
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="contained"
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
                On mobile, "Share as PDF/Image" will open the native share sheet — pick WhatsApp, Gmail, Drive, or any app.
                On desktop it downloads the file.
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
