import React, { useRef, useState, useMemo } from 'react';
import {
  Box, Dialog, Typography, IconButton, TextField, MenuItem, Menu,
  Stack, Button, useTheme, useMediaQuery, alpha, Tooltip,
  ListItemIcon, ListItemText,
} from '@mui/material';
import { X, Eye, Printer, Share2, FileDown, ImageDown } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import InvoiceTemplate from './InvoiceTemplate';

const PAPER_PX_WIDTHS = {
  'A4': 794, 'A5': 559, 'Letter': 816, 'Legal': 816,
  'Thermal 80mm': 302, 'Thermal 58mm': 220,
};

const getTokens = (theme) => {
  const p = theme.palette.primary;
  return { primary: p.main, primaryLight: p.light || p.main, primaryDark: p.dark || p.main };
};

const GradientBtn = ({ children, tokens, onClick, disabled, startIcon, size = 'small', sx = {} }) => (
  <Button
    variant="contained" size={size} disabled={disabled} onClick={onClick} startIcon={startIcon}
    sx={{
      background: disabled ? undefined : `linear-gradient(135deg, ${tokens.primaryDark} 0%, ${tokens.primaryLight} 100%)`,
      fontWeight: 800, textTransform: 'none', borderRadius: 1.5, flexShrink: 0,
      '&:hover': { background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.primaryDark} 100%)` },
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

  const printRef = useRef();
  const pdfRef = useRef();

  const [paperSize, setPaperSize] = useState(config.defaultPaperSize || 'A4');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMenuAnchor, setShareMenuAnchor] = useState(null);

  const previewZoom = useMemo(() => {
    const maxW = isMobile ? (window.innerWidth - 24) : Math.min(window.innerWidth * 0.55, 700);
    return Math.min(1, maxW / (PAPER_PX_WIDTHS[paperSize] || 794));
  }, [paperSize, isMobile]);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const partyBalance = transaction
    ? (parties.find(p => p.id === transaction.partyId)?.balance ?? 0)
    : undefined;

  const captureCanvas = async () => {
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  };

  const downloadInvoicePDF = async () => {
    if (!pdfRef.current || !transaction) return;
    setPdfLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const isNarrow = paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm';
      const pdfW = paperSize === 'Thermal 58mm' ? 58 : paperSize === 'Thermal 80mm' ? 80 : paperSize === 'A5' ? 148 : 210;
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const pdf = new jsPDF({ unit: 'mm', format: isNarrow ? [pdfW, pdfH] : (paperSize === 'A5' ? 'a5' : paperSize === 'Legal' ? 'legal' : paperSize === 'Letter' ? 'letter' : 'a4') });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      pdf.save(`${transaction.invoiceNumber || 'invoice'}.pdf`);
    } catch (err) { console.error('PDF failed', err); }
    finally { setPdfLoading(false); }
  };

  const shareAsPDF = async () => {
    if (!pdfRef.current || !transaction) return;
    setShareLoading(true);
    try {
      const [canvas, { jsPDF }] = await Promise.all([captureCanvas(), import('jspdf').then(m => ({ jsPDF: m.jsPDF }))]);
      const imgData = canvas.toDataURL('image/png');
      const isNarrow = paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm';
      const pdfW = paperSize === 'Thermal 58mm' ? 58 : paperSize === 'Thermal 80mm' ? 80 : paperSize === 'A5' ? 148 : 210;
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const pdf = new jsPDF({ unit: 'mm', format: isNarrow ? [pdfW, pdfH] : (paperSize === 'A5' ? 'a5' : 'a4') });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      const fileName = `${transaction.invoiceNumber || 'invoice'}.pdf`;
      const blob = pdf.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: fileName }); }
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
    } catch (err) { console.error('Share PDF failed', err); }
    finally { setShareLoading(false); }
  };

  const shareAsImage = async () => {
    if (!pdfRef.current || !transaction) return;
    setShareLoading(true);
    try {
      const canvas = await captureCanvas();
      await new Promise((res, rej) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { rej(new Error('No blob')); return; }
          const fileName = `${transaction.invoiceNumber || 'invoice'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: fileName }); }
          else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
          res();
        }, 'image/png');
      });
    } catch (err) { console.error('Share image failed', err); }
    finally { setShareLoading(false); }
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
          background: `linear-gradient(135deg, ${tokens.primaryDark} 0%, ${tokens.primaryLight} 100%)`,
          px: 3, py: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0,
        }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', mt: 0.5, flexShrink: 0 }}>
            <Eye size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.1em', lineHeight: 1 }}>
              {isSale ? 'Invoice Preview' : 'Bill Preview'}
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, mt: 0.5, fontSize: '1.05rem', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
              {transaction?.invoiceNumber || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              {transaction?.partyName && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{transaction.partyName}</Typography>
              )}
              {transaction?.date && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>{transaction.date}</Typography>
              )}
              {transaction?.totalAmount != null && (
                <Box sx={{ px: 1.25, py: 0.25, bgcolor: 'rgba(255,255,255,0.18)', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.25)' }}>
                  <Typography variant="caption" sx={{ color: 'white', fontWeight: 800, fontSize: '0.8rem' }}>
                    ₹{transaction.totalAmount.toLocaleString('en-IN')}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,255,255,0.75)', mt: -0.5, mr: -0.5, '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' } }}>
            <X size={18} />
          </IconButton>
        </Box>

        {/* Toolbar */}
        <Box sx={{
          px: { xs: 1.5, sm: 2.5 }, py: 1, display: 'flex', alignItems: 'center',
          gap: { xs: 1, sm: 1.5 }, borderBottom: '1px solid rgba(0,0,0,0.08)',
          bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0, flexWrap: 'nowrap', minWidth: 0,
        }}>
          <TextField
            select size="small" value={paperSize} onChange={(e) => setPaperSize(e.target.value)}
            sx={{ minWidth: { xs: 90, sm: 120 }, flexShrink: 0, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
          >
            {['A4', 'A5', 'Letter', 'Legal', 'Thermal 80mm', 'Thermal 58mm'].map(s => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
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
              onClick={downloadInvoicePDF} disabled={pdfLoading} size="small"
              sx={{ border: '1px solid rgba(124,58,237,0.28)', borderRadius: 1.5, color: '#7c3aed', px: 1, '&:hover': { bgcolor: 'rgba(124,58,237,0.06)' } }}
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
              printOptions={config.billPrintOptions}
              partyBalance={partyBalance}
            />
          </Box>
        </Box>
      </Dialog>

      {/* Off-screen print target (display:none — react-to-print handles visibility) */}
      <div style={{ display: 'none' }}>
        <InvoiceTemplate
          ref={printRef}
          transaction={transaction}
          business={business}
          paperSize={paperSize}
          printOptions={config.billPrintOptions}
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
          printOptions={config.billPrintOptions}
          partyBalance={partyBalance}
        />
      </div>
    </>
  );
};

export default InvoicePreviewDialog;
