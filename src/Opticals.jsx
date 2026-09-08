import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Box, Button, Typography, TextField, Grid, IconButton, InputAdornment, InputBase,
  Stack, Paper, Divider, Container, alpha, Autocomplete, Alert, Snackbar, MenuItem,
  Chip, useTheme, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog
} from '@mui/material';
import {
  Save, Edit2, Trash2, ChevronLeft,
  Eye, Info, Plus, Calendar, User, Printer, Phone, Share2,
  ShoppingBag, Settings, Truck, CheckCircle, Clock, X, Glasses, TrendingUp
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { FitPreview } from './TxListView';
import PartySelect from './PartySelect';
import { useDialog } from './DialogContext';
import DataGrid from './DataGrid';
import { useReactToPrint } from 'react-to-print';
import OpticalTemplate from './OpticalTemplate';
import SendDialog from './SendDialog';

// --- ReadingField Component ---
const ReadingField = ({ label, value, onChange, unit, color }) => (
  <Box sx={{ flex: 1, textAlign: 'center', minWidth: '65px' }}>
    <Typography variant="caption" sx={{
      color: 'text.secondary',
      fontWeight: 700,
      fontSize: '0.65rem',
      textTransform: 'uppercase',
      letterSpacing: 1,
      mb: 1,
      display: 'block',
      opacity: 0.8
    }}>
      {label}
    </Typography>
    <Box sx={{
      position: 'relative',
      bgcolor: alpha(color, 0.05),
      borderRadius: 1.5,
      border: '1px solid',
      borderColor: alpha(color, 0.1),
      transition: 'all 0.2s',
      '&:focus-within': {
        borderColor: color,
        bgcolor: alpha(color, 0.08),
        transform: 'translateY(-1px)',
        boxShadow: `0 4px 12px ${alpha(color, 0.15)}`
      },
      p: '4px 8px'
    }}>
      <InputBase
        fullWidth
        value={value}
        onChange={onChange}
        placeholder="0.00"
        sx={{
          fontSize: '1rem',
          fontWeight: 700,
          color: color,
          '& input': { textAlign: 'center', p: 0 }
        }}
      />
      <Typography sx={{
        position: 'absolute',
        right: 4,
        bottom: 2,
        fontSize: '0.6rem',
        color: alpha(color, 0.5),
        fontWeight: 800
      }}>
        {unit}
      </Typography>
    </Box>
  </Box>
);

// --- Constants ---
const STATUS_COLORS = {
  Pending: 'warning',
  Ready: 'info',
  Delivered: 'success',
  Cancelled: 'error'
};

const DEFAULT_OPTICAL_SETTINGS = {
  frameTypes: ['Full Frame', 'Half Frame', 'Rimless', 'Semi-Rimless'],
  lensTypes: ['Single Vision', 'Progressive', 'Bifocal', 'Trifocal', 'Photochromic'],
  examCustomFields: [],
  orderCustomFields: []
};

const emptyExamForm = () => ({
  patientName: '',
  phone: '',
  gender: '',
  age: '',
  date: new Date().toISOString().split('T')[0],
  rightEye: { sphere: '', cylinder: '', axis: '', add: '', va: '', pd: '' },
  leftEye: { sphere: '', cylinder: '', axis: '', add: '', va: '', pd: '' },
  frameType: '',
  lensType: '',
  notes: '',
  customFields: {},
  examReminder: 'off'
});

const emptyOrderForm = () => ({
  patientName: '',
  phone: '',
  orderDate: new Date().toISOString().split('T')[0],
  deliveryDate: '',
  frameType: '',
  lensType: '',
  items: [{ id: Date.now(), name: '', quantity: 1, price: '' }],
  status: 'Pending',
  notes: '',
  totalAmount: 0,
  customFields: {}
});

// ── File-share helpers ──────────────────────────────────────────────────
// Same pattern as Sales.jsx's equivalents (not shared/exported from there,
// so duplicated here — matches the precedent already set by Ledger.jsx and
// Estimates.jsx doing the same for their own share flows).
//
// navigator.canShare({files}) can report true on desktop Chrome too, but
// the resulting OS share sheet there is unreliable for this use case and
// was the likely reason PDF/Image sharing "did nothing" on desktop before
// this fix — restrict the actual navigator.share() call to mobile.
const canUseFileShare = (fileOrFiles) => {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (!navigator.canShare?.({ files })) return false;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const isMobilePlatform = navigator.userAgentData?.mobile;
  return isMobilePlatform ?? isMobileUA;
};

const cleanWaPhone = (raw = '') => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

// Clipboard API only accepts a small sanitized MIME set (PNG images, not
// PDFs) — this only ever returns true for the PNG image path.
const canCopyFileToClipboard = (file) => {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  if (file.type !== 'image/png') return false;
  try { return ClipboardItem.supports ? ClipboardItem.supports(file.type) : true; }
  catch { return true; }
};

const deliverFile = async (file, { toWhatsApp = false, phone = '' } = {}) => {
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
    return { method: 'download+chat' };
  }
  return { method: 'download' };
};

// Waits for fonts + all <img> inside the off-screen template (logo, etc.)
// to finish loading before capture — a fixed setTimeout (the previous
// approach) produced blank/partial captures whenever the logo hadn't
// decoded yet, especially on a cold cache.
const waitForCaptureReady = async (el) => {
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  })));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

// --- Main Component ---
const OpticalsPage = () => {
  const theme = useTheme();
  const { currentBusiness } = useBusiness();
  const { config } = useConfig();
  const { getItems, addItem, updateItem, deleteItem } = useData();
  const { confirm } = useDialog();

  // Tab
  const [activeTab, setActiveTab] = useState('exams');

  // Exam state
  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(emptyExamForm());
  const [printingData, setPrintingData] = useState(null);
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.defaultPaperSize;
    return ['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].includes(d) ? d : 'A4';
  });
  useEffect(() => {
    if (config.defaultPaperSize) {
      const d = config.defaultPaperSize;
      if (['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].includes(d)) setPaperSize(d);
    }
  }, [config.defaultPaperSize]);
  const printRef = useRef();
  // Separate from printRef — html2canvas cannot capture a display:none
  // element (zero layout box, produces a blank/zero-size canvas), which is
  // why PDF/Image sharing silently failed while Print itself worked fine.
  // Sales.jsx hit the same issue and fixed it with its own off-screen
  // (not display:none) pdfRef; mirrored here.
  const pdfCaptureRef = useRef();
  const orderPrintRef = useRef();
  const [orderPrintData, setOrderPrintData] = useState(null);

  // Preview state
  const [previewExamOpen, setPreviewExamOpen] = useState(false);
  const [previewExamData, setPreviewExamData] = useState(null);
  const [previewOrderOpen, setPreviewOrderOpen] = useState(false);
  const [previewOrderData, setPreviewOrderData] = useState(null);

  // Order state
  const [orderView, setOrderView] = useState('list');
  const [orderEditId, setOrderEditId] = useState(null);
  const [orderForm, setOrderForm] = useState(emptyOrderForm());

  // Settings state
  const [newFrameType, setNewFrameType] = useState('');
  const [newLensType, setNewLensType] = useState('');
  const [newExamField, setNewExamField] = useState({ name: '', type: 'text', options: '' });
  const [newOrderField, setNewOrderField] = useState({ name: '', type: 'text', options: '' });

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const showSnackbar = (message, severity = 'error') => setSnackbar({ open: true, message, severity });

  // Derived data
  const readings = getItems('opticals').filter(o => o.businessId === currentBusiness?.id);
  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id && p.type === 'Customer');
  const orders = getItems('opticalOrders').filter(o => o.businessId === currentBusiness?.id);
  const allOpticalSettings = getItems('opticalSettings');

  const opticalSettings = useMemo(() => {
    const stored = allOpticalSettings.find(s => s.businessId === currentBusiness?.id);
    if (!stored) return DEFAULT_OPTICAL_SETTINGS;
    return {
      frameTypes: stored.frameTypes ?? DEFAULT_OPTICAL_SETTINGS.frameTypes,
      lensTypes: stored.lensTypes ?? DEFAULT_OPTICAL_SETTINGS.lensTypes,
      examCustomFields: stored.examCustomFields ?? [],
      orderCustomFields: stored.orderCustomFields ?? []
    };
  }, [allOpticalSettings, currentBusiness?.id]);

  // Print
  const handlePrint = useReactToPrint({ contentRef: printRef });
  const handleOrderPrint = useReactToPrint({ contentRef: orderPrintRef });

  // Share via SendDialog
  const [sendOpen, setSendOpen] = useState(false);
  const [sendRow, setSendRow] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const _shareInFlight = useRef(false);

  const buildPrescriptionMessage = (row) => {
    if (!row) return '';
    const r = row.rightEye || {};
    const l = row.leftEye || {};
    const fmt = (v) => v || '—';
    return [
      `*Optical Prescription from ${currentBusiness?.name || 'TallyKraft'}*`,
      '',
      `👤 Patient: ${row.patientName}`,
      (row.gender || row.age) ? `⚧ ${[row.gender, row.age ? `${row.age} yrs` : ''].filter(Boolean).join(' · ')}` : '',
      `📅 Date: ${row.date}`,
      row.phone ? `📞 Phone: ${row.phone}` : '',
      '',
      `*Right Eye (OD):*`,
      `  SPH: ${fmt(r.sphere)}  CYL: ${fmt(r.cylinder)}  AXIS: ${fmt(r.axis)}°  ADD: ${fmt(r.add)}  VA: ${fmt(r.va)}  PD: ${fmt(r.pd)}`,
      `*Left Eye (OS):*`,
      `  SPH: ${fmt(l.sphere)}  CYL: ${fmt(l.cylinder)}  AXIS: ${fmt(l.axis)}°  ADD: ${fmt(l.add)}  VA: ${fmt(l.va)}  PD: ${fmt(l.pd)}`,
      row.frameType ? `🕶️ Frame: ${row.frameType}` : '',
      row.lensType ? `🔍 Lens: ${row.lensType}` : '',
      row.notes ? `\n📝 Notes: ${row.notes}` : '',
      '',
      `_Sent via TallyKraft_`,
    ].filter(x => x !== '').join('\n');
  };

  const handleShare = (row) => {
    setSendRow(row);
    setSendOpen(true);
  };

  // Points the off-screen printRef template at sendRow and waits for React
  // to actually commit+paint it, then for fonts/images (logo) to finish
  // decoding, before handing the node to html2canvas — a fixed 300ms
  // setTimeout (the previous approach) could capture the template before
  // the logo image had loaded, or before printingData had even re-rendered
  // for a different row than the last one printed.
  const captureRxCanvas = async () => {
    setPrintingData(sendRow);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!pdfCaptureRef.current) throw new Error('Prescription template not ready');
    await waitForCaptureReady(pdfCaptureRef.current);
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(pdfCaptureRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  };

  const handleSharePDF = async () => {
    if (!sendRow || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const [canvas, { jsPDF }] = await Promise.all([
        captureRxCanvas(),
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
      ]);
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfWidthMm = 210;
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidthMm, pdfHeightMm] });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
      const fileName = `prescription-${sendRow.patientName || 'patient'}.pdf`;
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      await deliverFile(file, { phone: sendRow.phone });
    } catch (err) {
      console.error('Share as PDF failed', err);
      showSnackbar('Could not share the PDF. Please try again.', 'error');
    } finally {
      setShareLoading(false);
      _shareInFlight.current = false;
    }
  };

  const handleShareImage = async () => {
    if (!sendRow || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const canvas = await captureRxCanvas();
      const fileName = `prescription-${sendRow.patientName || 'patient'}.png`;
      await new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          try {
            if (!blob) { reject(new Error('No blob')); return; }
            const file = new File([blob], fileName, { type: 'image/png' });
            await deliverFile(file, { phone: sendRow.phone });
            resolve();
          } catch (err) { reject(err); }
        }, 'image/png');
      });
    } catch (err) {
      console.error('Share as Image failed', err);
      showSnackbar('Could not share the image. Please try again.', 'error');
    } finally {
      setShareLoading(false);
      _shareInFlight.current = false;
    }
  };

  // --- Exam Handlers ---
  const handleEyeDataChange = (eyeKey, field, value) => {
    setFormData(prev => ({ ...prev, [eyeKey]: { ...prev[eyeKey], [field]: value } }));
  };

  const handleSave = async () => {
    if (!currentBusiness?.id) { showSnackbar('Business not selected. Please refresh and try again.', 'error'); return; }
    if (!formData.patientName?.trim()) { showSnackbar('Please enter a patient name', 'warning'); return; }
    if (!formData.date) { showSnackbar('Please select a date', 'warning'); return; }

    try {
      const dataToSave = {
        ...formData,
        businessId: currentBusiness.id,
        patientName: formData.patientName.trim(),
        updatedAt: new Date().toISOString()
      };

      let saved;
      if (editId) {
        saved = await updateItem('opticals', editId, dataToSave);
      } else {
        saved = await addItem('opticals', { ...dataToSave, createdAt: new Date().toISOString() });
      }

      if (!saved) {
        const savedOptical = getItems('opticals').find(o =>
          o.patientName === dataToSave.patientName &&
          o.date === dataToSave.date &&
          o.businessId === dataToSave.businessId &&
          (!editId || o.id === editId)
        );
        if (!savedOptical) {
          showSnackbar('Failed to save optical record. Please try again.', 'error');
          return;
        }
      }

      showSnackbar(editId ? 'Prescription updated successfully!' : 'Examination saved successfully!', 'success');
      setView('list');
      setEditId(null);
      setFormData(emptyExamForm());
    } catch (error) {
      console.error('Error saving optical record:', error);
      showSnackbar('An error occurred while saving. Please try again.', 'error');
    }
  };

  // --- Order Handlers ---
  const calcTotal = (items) =>
    items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0);

  const handleOrderItemChange = (idx, field, value) => {
    setOrderForm(prev => {
      const items = prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item);
      return { ...prev, items, totalAmount: calcTotal(items) };
    });
  };

  const addOrderItem = () => {
    setOrderForm(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), name: '', quantity: 1, price: '' }]
    }));
  };

  const removeOrderItem = (idx) => {
    setOrderForm(prev => {
      const items = prev.items.filter((_, i) => i !== idx);
      return { ...prev, items, totalAmount: calcTotal(items) };
    });
  };

  const handleOrderSave = async () => {
    if (!currentBusiness?.id) { showSnackbar('Business not selected', 'error'); return; }
    if (!orderForm.patientName?.trim()) { showSnackbar('Please enter customer name', 'warning'); return; }
    if (!orderForm.orderDate) { showSnackbar('Please select order date', 'warning'); return; }

    try {
      const dataToSave = {
        ...orderForm,
        businessId: currentBusiness.id,
        patientName: orderForm.patientName.trim(),
        items: orderForm.items.map(i => ({ ...i, quantity: Number(i.quantity) || 0, price: Number(i.price) || 0 })),
        totalAmount: calcTotal(orderForm.items),
        updatedAt: new Date().toISOString()
      };

      let saved;
      if (orderEditId) {
        saved = await updateItem('opticalOrders', orderEditId, dataToSave);
      } else {
        saved = await addItem('opticalOrders', { ...dataToSave, createdAt: new Date().toISOString() });
      }

      if (!saved) {
        const check = getItems('opticalOrders').find(o =>
          o.patientName === dataToSave.patientName &&
          o.orderDate === dataToSave.orderDate &&
          o.businessId === dataToSave.businessId &&
          (!orderEditId || o.id === orderEditId)
        );
        if (!check) {
          showSnackbar('Failed to save order. Please try again.', 'error');
          return;
        }
      }

      showSnackbar(orderEditId ? 'Order updated successfully!' : 'Order placed successfully!', 'success');
      setOrderView('list');
      setOrderEditId(null);
      setOrderForm(emptyOrderForm());
    } catch (error) {
      console.error('Error saving order:', error);
      showSnackbar('An error occurred while saving.', 'error');
    }
  };

  // --- Settings Handlers ---
  const saveOpticalSettings = async (newSettings) => {
    const existing = allOpticalSettings.find(s => s.businessId === currentBusiness?.id);
    const toSave = { ...newSettings, businessId: currentBusiness.id };
    if (existing) {
      return updateItem('opticalSettings', existing.id, toSave);
    }
    return addItem('opticalSettings', toSave);
  };

  const handleAddFrameType = async () => {
    const trimmed = newFrameType.trim();
    if (!trimmed || opticalSettings.frameTypes.includes(trimmed)) return;
    await saveOpticalSettings({ ...opticalSettings, frameTypes: [...opticalSettings.frameTypes, trimmed] });
    setNewFrameType('');
  };

  const handleRemoveFrameType = async (type) => {
    await saveOpticalSettings({ ...opticalSettings, frameTypes: opticalSettings.frameTypes.filter(t => t !== type) });
  };

  const handleAddLensType = async () => {
    const trimmed = newLensType.trim();
    if (!trimmed || opticalSettings.lensTypes.includes(trimmed)) return;
    await saveOpticalSettings({ ...opticalSettings, lensTypes: [...opticalSettings.lensTypes, trimmed] });
    setNewLensType('');
  };

  const handleRemoveLensType = async (type) => {
    await saveOpticalSettings({ ...opticalSettings, lensTypes: opticalSettings.lensTypes.filter(t => t !== type) });
  };

  const handleAddExamField = async () => {
    const name = newExamField.name.trim();
    if (!name) return;
    const field = {
      id: Date.now().toString(),
      name,
      type: newExamField.type,
      options: newExamField.type === 'select'
        ? newExamField.options.split(',').map(o => o.trim()).filter(Boolean)
        : []
    };
    await saveOpticalSettings({
      ...opticalSettings,
      examCustomFields: [...opticalSettings.examCustomFields, field]
    });
    setNewExamField({ name: '', type: 'text', options: '' });
  };

  const handleRemoveExamField = async (fieldId) => {
    await saveOpticalSettings({
      ...opticalSettings,
      examCustomFields: opticalSettings.examCustomFields.filter(f => f.id !== fieldId)
    });
  };

  const handleAddOrderField = async () => {
    const name = newOrderField.name.trim();
    if (!name) return;
    const field = {
      id: Date.now().toString(),
      name,
      type: newOrderField.type,
      options: newOrderField.type === 'select'
        ? newOrderField.options.split(',').map(o => o.trim()).filter(Boolean)
        : []
    };
    await saveOpticalSettings({
      ...opticalSettings,
      orderCustomFields: [...opticalSettings.orderCustomFields, field]
    });
    setNewOrderField({ name: '', type: 'text', options: '' });
  };

  const handleRemoveOrderField = async (fieldId) => {
    await saveOpticalSettings({
      ...opticalSettings,
      orderCustomFields: opticalSettings.orderCustomFields.filter(f => f.id !== fieldId)
    });
  };

  // ===================== RENDER =====================

  const snackbarEl = (
    <Snackbar
      open={snackbar.open}
      autoHideDuration={6000}
      onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        severity={snackbar.severity}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {snackbar.message}
      </Alert>
    </Snackbar>
  );

  // --- Exam Create/Edit ---
  if (activeTab === 'exams' && (view === 'create' || view === 'edit')) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <div style={{ display: 'none' }}>
          <OpticalTemplate ref={printRef} data={formData} business={currentBusiness} paperSize={paperSize} />
        </div>

        {/* Gradient header */}
        <Box sx={{
          background: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)',
          px: { xs: 2, md: 4 }, py: 2.5,
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <IconButton
            onClick={() => { setView('list'); setEditId(null); }}
            sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }, flexShrink: 0 }}
          >
            <ChevronLeft size={20} />
          </IconButton>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', flexShrink: 0 }}>
            <Glasses size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.12em', lineHeight: 1 }}>
              OPTICALS
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, mt: 0.25, fontSize: '1.05rem', lineHeight: 1.2 }}>
              {editId ? 'Edit Prescription' : 'New Examination'}
            </Typography>
            {formData.patientName && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                {formData.patientName}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <Tooltip title="Preview">
              <IconButton
                onClick={() => { setPreviewExamData(formData); setPreviewExamOpen(true); }}
                sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
              >
                <Eye size={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Share">
              <IconButton
                onClick={() => handleShare(formData)}
                sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
              >
                <Share2 size={18} />
              </IconButton>
            </Tooltip>
            <Button variant="contained" disableElevation startIcon={<Save size={16} />} onClick={handleSave}
              sx={{ bgcolor: 'white', color: '#3f3f46', fontWeight: 700, borderRadius: 2, px: 2.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, textTransform: 'none' }}>
              Save
            </Button>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ p: { xs: 2, md: 4 }, mx: 0 }}>
          <Stack spacing={2.5}>

            {/* Patient Information */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <User size={15} color="#3f3f46" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Patient Information</Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <PartySelect
                      options={parties}
                      value={formData.patientName}
                      onChange={(v) => {
                        const matched = parties.find(p => p.name === v);
                        setFormData(prev => ({ ...prev, patientName: v, phone: matched?.phone || prev.phone }));
                      }}
                      label="Patient Name *"
                      nameOnly
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth size="small" label="Phone Number" value={formData.phone}
                      placeholder="+91 XXXXX XXXXX"
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Phone size={15} color="#3f3f46" /></InputAdornment> }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField select fullWidth size="small" label="Gender" value={formData.gender || ''}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      InputProps={{ startAdornment: <InputAdornment position="start"><User size={15} color="#3f3f46" /></InputAdornment> }}>
                      <MenuItem value="">—</MenuItem>
                      <MenuItem value="Male">Male</MenuItem>
                      <MenuItem value="Female">Female</MenuItem>
                      <MenuItem value="Other">Other</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField fullWidth size="small" type="number" label="Age" value={formData.age || ''}
                      placeholder="Years"
                      onChange={(e) => setFormData({ ...formData, age: e.target.value.replace(/\D/g, '') })}
                      inputProps={{ inputMode: 'numeric', min: 0, max: 120 }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth size="small" type="date" label="Examination Date *" value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Calendar size={15} color="#3f3f46" /></InputAdornment> }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField select fullWidth size="small" label="Follow-up Reminder" value={formData.examReminder || 'off'}
                      onChange={(e) => setFormData({ ...formData, examReminder: e.target.value })}>
                      <MenuItem value="off">No reminder</MenuItem>
                      <MenuItem value="1month">1 Month</MenuItem>
                      <MenuItem value="2months">2 Months</MenuItem>
                      <MenuItem value="6months">6 Months</MenuItem>
                      <MenuItem value="1year">1 Year</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </Box>
            </Paper>

            {/* Refraction Data */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.75, background: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Eye size={16} color="white" />
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'white', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                  Refraction Data
                </Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <Stack spacing={2}>
                  {/* Right Eye */}
                  <Box sx={{ borderRadius: 2, border: '1.5px solid', borderColor: alpha('#3f3f46', 0.3), overflow: 'hidden' }}>
                    <Box sx={{ px: 2, py: 1, bgcolor: alpha('#3f3f46', 0.07), display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: alpha('#3f3f46', 0.15) }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3f3f46', flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#3f3f46', letterSpacing: '0.08em' }}>
                        RIGHT EYE (OD)
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        {[
                          { field: 'sphere', label: 'Sphere', unit: 'D' },
                          { field: 'cylinder', label: 'Cylinder', unit: 'D' },
                          { field: 'axis', label: 'Axis', unit: '°' },
                          { field: 'add', label: 'Add', unit: 'D' },
                          { field: 'va', label: 'VA', unit: '' },
                          { field: 'pd', label: 'PD', unit: 'mm' }
                        ].map(({ field, label, unit }) => (
                          <Box key={field} sx={{ flex: '1 1 80px', minWidth: 68 }}>
                            <ReadingField label={label} unit={unit} color="#3f3f46"
                              value={formData.rightEye[field]}
                              onChange={(e) => handleEyeDataChange('rightEye', field, e.target.value)}
                            />
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                  {/* Left Eye */}
                  <Box sx={{ borderRadius: 2, border: '1.5px solid', borderColor: alpha('#dc004e', 0.3), overflow: 'hidden' }}>
                    <Box sx={{ px: 2, py: 1, bgcolor: alpha('#dc004e', 0.07), display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: alpha('#dc004e', 0.15) }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#dc004e', flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#dc004e', letterSpacing: '0.08em' }}>
                        LEFT EYE (OS)
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        {[
                          { field: 'sphere', label: 'Sphere', unit: 'D' },
                          { field: 'cylinder', label: 'Cylinder', unit: 'D' },
                          { field: 'axis', label: 'Axis', unit: '°' },
                          { field: 'add', label: 'Add', unit: 'D' },
                          { field: 'va', label: 'VA', unit: '' },
                          { field: 'pd', label: 'PD', unit: 'mm' }
                        ].map(({ field, label, unit }) => (
                          <Box key={field} sx={{ flex: '1 1 80px', minWidth: 68 }}>
                            <ReadingField label={label} unit={unit} color="#dc004e"
                              value={formData.leftEye[field]}
                              onChange={(e) => handleEyeDataChange('leftEye', field, e.target.value)}
                            />
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Stack>
              </Box>
            </Paper>

            {/* Prescription Details */}
            {(opticalSettings.frameTypes.length > 0 || opticalSettings.lensTypes.length > 0) && (
              <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Glasses size={15} color="#3f3f46" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Prescription Details</Typography>
                </Box>
                <Box sx={{ p: 2.5 }}>
                  <Grid container spacing={2.5}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField select fullWidth size="small" label="Frame Type" value={formData.frameType || ''}
                        onChange={(e) => setFormData({ ...formData, frameType: e.target.value })}>
                        <MenuItem value="">Not specified</MenuItem>
                        {opticalSettings.frameTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField select fullWidth size="small" label="Lens Type" value={formData.lensType || ''}
                        onChange={(e) => setFormData({ ...formData, lensType: e.target.value })}>
                        <MenuItem value="">Not specified</MenuItem>
                        {opticalSettings.lensTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                      </TextField>
                    </Grid>
                  </Grid>
                </Box>
              </Paper>
            )}

            {/* Custom Exam Fields */}
            {opticalSettings.examCustomFields.length > 0 && (
              <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Additional Details</Typography>
                </Box>
                <Box sx={{ p: 2.5 }}>
                  <Grid container spacing={2.5}>
                    {opticalSettings.examCustomFields.map(field => (
                      <Grid size={{ xs: 12, sm: 6 }} key={field.id}>
                        {field.type === 'select' ? (
                          <TextField select fullWidth size="small" label={field.name}
                            value={formData.customFields?.[field.id] || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.value } }))}>
                            <MenuItem value="">None</MenuItem>
                            {field.options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                          </TextField>
                        ) : (
                          <TextField fullWidth size="small" label={field.name} type={field.type}
                            value={formData.customFields?.[field.id] || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.value } }))}
                          />
                        )}
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </Paper>
            )}

            {/* Clinical Notes */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Info size={15} color="#3f3f46" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Clinical Notes</Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <TextField fullWidth size="small" multiline rows={3}
                  placeholder="Additional observations, recommendations, or notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </Box>
            </Paper>
          </Stack>
        </Box>
        {snackbarEl}
      </Box>
    );
  }

  // --- Order Create/Edit ---
  if (activeTab === 'orders' && (orderView === 'create' || orderView === 'edit')) {
    const orderTotal = calcTotal(orderForm.items);
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>

        {/* Gradient header */}
        <Box sx={{
          background: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)',
          px: { xs: 2, md: 4 }, py: 2.5,
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <IconButton
            onClick={() => { setOrderView('list'); setOrderEditId(null); }}
            sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }, flexShrink: 0 }}
          >
            <ChevronLeft size={20} />
          </IconButton>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', flexShrink: 0 }}>
            <ShoppingBag size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.12em', lineHeight: 1 }}>
              OPTICAL ORDERS
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, mt: 0.25, fontSize: '1.05rem', lineHeight: 1.2 }}>
              {orderEditId ? 'Edit Order' : 'New Order'}
            </Typography>
            {orderForm.patientName && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                {orderForm.patientName}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
            {orderTotal > 0 && (
              <Box sx={{ px: 1.5, py: 0.5, bgcolor: 'rgba(255,255,255,0.18)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.25)' }}>
                <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.875rem' }}>₹{orderTotal.toFixed(2)}</Typography>
              </Box>
            )}
            <Button variant="contained" disableElevation startIcon={<Save size={16} />} onClick={handleOrderSave}
              sx={{ bgcolor: 'white', color: '#3f3f46', fontWeight: 700, borderRadius: 2, px: 2.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, textTransform: 'none' }}>
              Save
            </Button>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ p: { xs: 2, md: 4 }, mx: 0 }}>
          <Stack spacing={2.5}>

            {/* Customer Information */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <User size={15} color="#3f3f46" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Customer Information</Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <PartySelect
                      options={parties}
                      value={orderForm.patientName}
                      onChange={(v) => {
                        const matched = parties.find(p => p.name === v);
                        setOrderForm(prev => ({ ...prev, patientName: v, phone: matched?.phone || prev.phone }));
                      }}
                      label="Customer Name *"
                      nameOnly
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth size="small" label="Phone Number" value={orderForm.phone}
                      onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Phone size={15} color="#3f3f46" /></InputAdornment> }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth size="small" type="date" label="Order Date *" value={orderForm.orderDate}
                      onChange={(e) => setOrderForm({ ...orderForm, orderDate: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Calendar size={15} color="#3f3f46" /></InputAdornment> }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth size="small" type="date" label="Expected Delivery" value={orderForm.deliveryDate}
                      onChange={(e) => setOrderForm({ ...orderForm, deliveryDate: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Truck size={15} color="#3f3f46" /></InputAdornment> }}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Paper>

            {/* Frame & Lens */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Glasses size={15} color="#3f3f46" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Frame & Lens Details</Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField select fullWidth size="small" label="Frame Type" value={orderForm.frameType}
                      onChange={(e) => setOrderForm({ ...orderForm, frameType: e.target.value })}>
                      <MenuItem value="">Select frame type</MenuItem>
                      {opticalSettings.frameTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField select fullWidth size="small" label="Lens Type" value={orderForm.lensType}
                      onChange={(e) => setOrderForm({ ...orderForm, lensType: e.target.value })}>
                      <MenuItem value="">Select lens type</MenuItem>
                      {opticalSettings.lensTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </TextField>
                  </Grid>
                </Grid>
              </Box>
            </Paper>

            {/* Order Status — visual pill picker */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle size={15} color="#3f3f46" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Order Status</Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {[
                    { status: 'Pending',   icon: Clock,         color: '#b45309', bg: alpha('#fbbf24', 0.12), border: alpha('#fbbf24', 0.45) },
                    { status: 'Ready',     icon: CheckCircle,   color: '#27272a', bg: alpha('#52525b', 0.12), border: alpha('#52525b', 0.45) },
                    { status: 'Delivered', icon: Truck,         color: '#15803d', bg: alpha('#4ade80', 0.12), border: alpha('#4ade80', 0.45) },
                    { status: 'Cancelled', icon: X,             color: '#dc2626', bg: alpha('#f87171', 0.12), border: alpha('#f87171', 0.45) },
                  ].map(({ status, icon: Icon, color, bg, border }) => {
                    const isActive = orderForm.status === status;
                    return (
                      <Box key={status} onClick={() => setOrderForm({ ...orderForm, status })} sx={{
                        display: 'flex', alignItems: 'center', gap: 1,
                        px: 2, py: 1, borderRadius: 2, cursor: 'pointer',
                        border: '1.5px solid',
                        borderColor: isActive ? color : 'divider',
                        bgcolor: isActive ? bg : 'transparent',
                        transition: 'all 0.15s',
                        '&:hover': { borderColor: color, bgcolor: bg },
                      }}>
                        <Icon size={14} style={{ color: isActive ? color : '#aaa' }} />
                        <Typography variant="body2" sx={{ fontWeight: isActive ? 700 : 500, color: isActive ? color : 'text.secondary', fontSize: '0.8125rem' }}>
                          {status}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Paper>

            {/* Custom Order Fields */}
            {opticalSettings.orderCustomFields.length > 0 && (
              <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Additional Details</Typography>
                </Box>
                <Box sx={{ p: 2.5 }}>
                  <Grid container spacing={2.5}>
                    {opticalSettings.orderCustomFields.map(field => (
                      <Grid size={{ xs: 12, sm: 6 }} key={field.id}>
                        {field.type === 'select' ? (
                          <TextField select fullWidth size="small" label={field.name}
                            value={orderForm.customFields?.[field.id] || ''}
                            onChange={(e) => setOrderForm(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.value } }))}>
                            <MenuItem value="">None</MenuItem>
                            {field.options.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                          </TextField>
                        ) : (
                          <TextField fullWidth size="small" label={field.name} type={field.type}
                            value={orderForm.customFields?.[field.id] || ''}
                            onChange={(e) => setOrderForm(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.value } }))}
                          />
                        )}
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </Paper>
            )}

            {/* Order Items */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShoppingBag size={15} color="#3f3f46" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Order Items</Typography>
                </Box>
                <Button size="small" startIcon={<Plus size={14} />} onClick={addOrderItem} variant="outlined"
                  sx={{ borderRadius: 1.5, textTransform: 'none', borderColor: '#3f3f46', color: '#3f3f46', fontSize: '0.75rem' }}>
                  Add Item
                </Button>
              </Box>
              <Box sx={{ p: 2 }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', borderBottom: '2px solid #3f3f46', pb: 1 }}>Item Description</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', borderBottom: '2px solid #3f3f46', width: 90, pb: 1 }}>Qty</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', borderBottom: '2px solid #3f3f46', width: 130, pb: 1 }}>Price (₹)</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', borderBottom: '2px solid #3f3f46', width: 120, pb: 1 }}>Subtotal</TableCell>
                        <TableCell sx={{ width: 40, borderBottom: '2px solid #3f3f46' }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orderForm.items.map((item, idx) => (
                        <TableRow key={item.id} sx={{ '&:hover': { bgcolor: alpha('#3f3f46', 0.03) } }}>
                          <TableCell sx={{ py: 1 }}>
                            <TextField variant="standard" fullWidth placeholder="e.g., Prescription Glasses"
                              value={item.name} onChange={(e) => handleOrderItemChange(idx, 'name', e.target.value)} />
                          </TableCell>
                          <TableCell align="center" sx={{ py: 1 }}>
                            <TextField variant="standard" type="number"
                              inputProps={{ min: 1, style: { textAlign: 'center' } }}
                              value={item.quantity} onChange={(e) => { const n = parseFloat(e.target.value); handleOrderItemChange(idx, 'quantity', isNaN(n) ? '' : Math.round(n * 1000) / 1000); }}
                              sx={{ width: 60 }} />
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1 }}>
                            <TextField variant="standard" type="number"
                              inputProps={{ min: 0, style: { textAlign: 'right' } }}
                              value={item.price} onChange={(e) => handleOrderItemChange(idx, 'price', e.target.value)}
                              sx={{ width: 100 }} />
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1 }}>
                            <Typography sx={{ fontWeight: 700, color: '#3f3f46', fontSize: '0.9rem' }}>
                              ₹{((Number(item.quantity) || 0) * (Number(item.price) || 0)).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1 }}>
                            <IconButton size="small" color="error" onClick={() => removeOrderItem(idx)}
                              disabled={orderForm.items.length === 1} sx={{ opacity: orderForm.items.length === 1 ? 0.3 : 1 }}>
                              <X size={14} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.06em' }}>ORDER TOTAL</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#3f3f46', lineHeight: 1.2 }}>
                      ₹{orderTotal.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Paper>

            {/* Notes */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha('#3f3f46', 0.06), borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Info size={15} color="#3f3f46" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3f3f46' }}>Notes</Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <TextField fullWidth size="small" multiline rows={3}
                  placeholder="Special instructions, advance paid, customer preferences..."
                  value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                />
              </Box>
            </Paper>
          </Stack>
        </Box>
        {snackbarEl}
      </Box>
    );
  }

  // --- Derived stats for hero ---
  const pendingOrders = orders.filter(o => o.status === 'Pending').length;
  const totalOrderValue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);

  // --- Main List View (with Tabs) ---
  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <div style={{ display: 'none' }}>
        <OpticalTemplate ref={printRef} data={printingData} business={currentBusiness} paperSize={paperSize} />
      </div>
      {/* PDF/Image capture ref — off-screen, not display:none so html2canvas can read it */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <OpticalTemplate ref={pdfCaptureRef} data={printingData} business={currentBusiness} paperSize={paperSize} />
      </div>
      <div style={{ display: 'none' }}>
        <div ref={orderPrintRef} style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
          {orderPrintData && (
            <>
              <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>{currentBusiness?.name}</h2>
              <p style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 12 }}>Optical Order</p>
              <hr />
              <p><strong>Customer:</strong> {orderPrintData.patientName}</p>
              <p><strong>Phone:</strong> {orderPrintData.phone || '—'}</p>
              <p><strong>Order Date:</strong> {orderPrintData.orderDate}</p>
              <p><strong>Delivery Date:</strong> {orderPrintData.deliveryDate || '—'}</p>
              <p><strong>Frame Type:</strong> {orderPrintData.frameType || '—'}</p>
              <p><strong>Lens Type:</strong> {orderPrintData.lensType || '—'}</p>
              <p><strong>Status:</strong> {orderPrintData.status}</p>
              <hr />
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Item</th>
                    <th style={{ textAlign: 'center', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Qty</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Price</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(orderPrintData.items || []).map((it, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 0' }}>{it.name}</td>
                      <td style={{ textAlign: 'center', padding: '3px 0' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '3px 0' }}>₹{Number(it.price).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 0' }}>₹{(Number(it.quantity) * Number(it.price)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <hr />
              <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 15 }}>Total: ₹{(orderPrintData.totalAmount || 0).toFixed(2)}</p>
              {orderPrintData.notes && <p style={{ fontSize: 12 }}><strong>Notes:</strong> {orderPrintData.notes}</p>}
            </>
          )}
        </div>
      </div>

      {/* Hero Header */}
      <Box sx={{
        borderRadius: 3,
        background: 'linear-gradient(135deg, #312e81 0%, #3730a3 50%, #4f46e5 100%)',
        p: { xs: 2.5, md: 3.5 }, mb: 3,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -30, right: 100, width: 150, height: 150, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, position: 'relative' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex' }}>
                <Glasses size={20} color="white" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>Opticals</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', pl: 0.5 }}>Eye exams, prescriptions, and lens orders</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            {activeTab === 'exams' && (
              <Button variant="contained" disableElevation startIcon={<Plus size={16} />}
                onClick={() => { setEditId(null); setFormData(emptyExamForm()); setView('create'); }}
                sx={{ bgcolor: 'white', color: '#3f3f46', fontWeight: 700, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, borderRadius: 2, textTransform: 'none' }}>
                New Exam
              </Button>
            )}
            {activeTab === 'orders' && (
              <Button variant="contained" disableElevation startIcon={<Plus size={16} />}
                onClick={() => { setOrderEditId(null); setOrderForm(emptyOrderForm()); setOrderView('create'); }}
                sx={{ bgcolor: 'white', color: '#3f3f46', fontWeight: 700, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, borderRadius: 2, textTransform: 'none' }}>
                New Order
              </Button>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, position: 'relative' }}>
          {[
            { label: 'Total Exams', value: readings.length, icon: Eye, color: '#c7d2fe' },
            { label: 'Total Orders', value: orders.length, icon: ShoppingBag, color: '#bfdbfe' },
            { label: 'Pending', value: pendingOrders, icon: Clock, color: pendingOrders > 0 ? '#fde68a' : '#c7d2fe' },
            { label: 'Order Value', value: `₹${totalOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: '#c4b5fd' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, p: 1.5, border: '1px solid rgba(255,255,255,0.1)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Icon size={14} color={color} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
              </Box>
              <Typography sx={{ color: 'white', fontWeight: 800, lineHeight: 1.1, fontSize: { xs: '0.95rem', sm: '1.1rem' } }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Custom Pill Tab Bar */}
      <Box sx={{ display: 'flex', gap: 0, mb: 3, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2.5, p: 0.5, width: 'fit-content', border: '1px solid', borderColor: 'divider' }}>
        {[
          { value: 'exams', label: 'Exams', icon: Eye },
          { value: 'orders', label: 'Orders', icon: ShoppingBag },
          { value: 'settings', label: 'Settings', icon: Settings },
        ].map(({ value, label, icon: Icon }) => (
          <Box key={value} onClick={() => setActiveTab(value)} sx={{
            display: 'flex', alignItems: 'center', gap: 0.75,
            px: 2.5, py: 0.875, borderRadius: 2, cursor: 'pointer',
            bgcolor: activeTab === value ? 'background.paper' : 'transparent',
            boxShadow: activeTab === value ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            color: activeTab === value ? '#3f3f46' : 'text.secondary',
            fontWeight: activeTab === value ? 700 : 500,
            fontSize: '0.875rem',
            transition: 'all 0.15s',
            userSelect: 'none',
          }}>
            <Icon size={15} />
            {label}
          </Box>
        ))}
      </Box>

      {/* Exams Tab */}
      {activeTab === 'exams' && (
        <DataGrid
          data={readings}
          columns={[
            { key: 'date', header: 'Date', width: 120 },
            { key: 'patientName', header: 'Patient', width: 180, render: (v) => <Typography sx={{ fontWeight: 600 }}>{v}</Typography> },
            { key: 'phone', header: 'Phone', width: 130 },
            { key: 'gender', header: 'Gender/Age', width: 110, render: (_v, row) => (row.gender || row.age) ? `${row.gender || '—'}${row.age ? ` / ${row.age}y` : ''}` : '—' },
            { key: 'rightEye', header: 'R (OD)', width: 190, render: (v) => `${v?.sphere || '0'} / ${v?.cylinder || '0'} x ${v?.axis || '0'}°` },
            { key: 'leftEye', header: 'L (OS)', width: 190, render: (v) => `${v?.sphere || '0'} / ${v?.cylinder || '0'} x ${v?.axis || '0'}°` },
            { key: 'pd', header: 'PD R/L (mm)', width: 110, render: (_v, row) => (row.rightEye?.pd || row.leftEye?.pd) ? `${row.rightEye?.pd || '—'} / ${row.leftEye?.pd || '—'}` : '—' },
          ]}
          actions={(row) => (
            <Stack direction="row" spacing={1}>
              <IconButton size="small" color="primary"
                onClick={() => { setPreviewExamData(row); setPreviewExamOpen(true); }} title="Preview">
                <Eye size={18} />
              </IconButton>
              <IconButton size="small" sx={{ color: '#25D366' }} onClick={() => handleShare(row)} title="Share on WhatsApp">
                <Share2 size={18} />
              </IconButton>
              <IconButton size="small" onClick={() => {
                setEditId(row.id);
                setFormData({ ...emptyExamForm(), ...row, customFields: row.customFields || {} });
                setView('edit');
              }}>
                <Edit2 size={18} />
              </IconButton>
              <IconButton size="small" color="error" onClick={async () => {
                const ok = await confirm({ title: 'Delete Exam', message: 'Delete this eye exam record? This action cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
                if (ok) deleteItem('opticals', row.id);
              }}>
                <Trash2 size={18} />
              </IconButton>
            </Stack>
          )}
        />
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <DataGrid
          data={orders}
          columns={[
            { key: 'orderDate', header: 'Order Date', width: 120 },
            { key: 'patientName', header: 'Customer', width: 180, render: (v) => <Typography sx={{ fontWeight: 600 }}>{v}</Typography> },
            { key: 'phone', header: 'Phone', width: 140 },
            { key: 'deliveryDate', header: 'Delivery Date', width: 130 },
            { key: 'frameType', header: 'Frame Type', width: 140 },
            { key: 'lensType', header: 'Lens Type', width: 140 },
            { key: 'totalAmount', header: 'Total', width: 120, render: (v) => `₹${(v || 0).toFixed(2)}` },
            {
              key: 'status', header: 'Status', width: 120,
              render: (v) => <Chip size="small" label={v} color={STATUS_COLORS[v] || 'default'} sx={{ fontWeight: 600 }} />
            },
          ]}
          actions={(row) => (
            <Stack direction="row" spacing={1}>
              <IconButton size="small" color="primary" title="Preview Order"
                onClick={() => { setPreviewOrderData(row); setPreviewOrderOpen(true); }}>
                <Eye size={18} />
              </IconButton>
              <IconButton size="small" onClick={() => {
                setOrderEditId(row.id);
                setOrderForm({ ...emptyOrderForm(), ...row, items: row.items?.length ? row.items : emptyOrderForm().items, customFields: row.customFields || {} });
                setOrderView('edit');
              }}>
                <Edit2 size={18} />
              </IconButton>
              <IconButton size="small" color="error" onClick={async () => {
                const ok = await confirm({ title: 'Delete Order', message: 'Delete this optical order? This action cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
                if (ok) deleteItem('opticalOrders', row.id);
              }}>
                <Trash2 size={18} />
              </IconButton>
            </Stack>
          )}
        />
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <Stack spacing={3}>
          {/* Frame Types */}
          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Frame Types</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Shown as dropdown options in exam and order forms.
            </Typography>
            <Stack direction="row" flexWrap="wrap" sx={{ mb: 2, gap: 1 }}>
              {opticalSettings.frameTypes.map(t => (
                <Chip key={t} label={t} onDelete={() => handleRemoveFrameType(t)} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField size="small" value={newFrameType} placeholder="New frame type"
                onChange={(e) => setNewFrameType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddFrameType(); }}
                sx={{ minWidth: 200 }}
              />
              <Button variant="outlined" startIcon={<Plus size={16} />} onClick={handleAddFrameType} sx={{ borderRadius: 2 }}>
                Add
              </Button>
            </Stack>
          </Paper>

          {/* Lens Types */}
          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Lens Types</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Shown as dropdown options in exam and order forms.
            </Typography>
            <Stack direction="row" flexWrap="wrap" sx={{ mb: 2, gap: 1 }}>
              {opticalSettings.lensTypes.map(t => (
                <Chip key={t} label={t} onDelete={() => handleRemoveLensType(t)} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField size="small" value={newLensType} placeholder="New lens type"
                onChange={(e) => setNewLensType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddLensType(); }}
                sx={{ minWidth: 200 }}
              />
              <Button variant="outlined" startIcon={<Plus size={16} />} onClick={handleAddLensType} sx={{ borderRadius: 2 }}>
                Add
              </Button>
            </Stack>
          </Paper>

          {/* Custom Exam Fields */}
          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Custom Exam Fields</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Additional fields that appear in the exam form under Product Recommendations.
            </Typography>

            {opticalSettings.examCustomFields.length > 0 && (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {opticalSettings.examCustomFields.map(field => (
                  <Stack key={field.id} direction="row" alignItems="center" spacing={1}
                    sx={{ p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{field.name}</Typography>
                      {field.type === 'select' && field.options.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Options: {field.options.join(', ')}
                        </Typography>
                      )}
                    </Box>
                    <Chip size="small" label={field.type} variant="outlined" />
                    <IconButton size="small" color="error" onClick={() => handleRemoveExamField(field.id)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>Add New Field</Typography>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" label="Field Name" value={newExamField.name}
                  onChange={(e) => setNewExamField(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Color, IPD"
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField select fullWidth size="small" label="Field Type" value={newExamField.type}
                  onChange={(e) => setNewExamField(prev => ({ ...prev, type: e.target.value }))}>
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="number">Number</MenuItem>
                  <MenuItem value="select">Dropdown</MenuItem>
                </TextField>
              </Grid>
              {newExamField.type === 'select' && (
                <Grid item xs={12} sm={5}>
                  <TextField fullWidth size="small" label="Options (comma separated)" value={newExamField.options}
                    onChange={(e) => setNewExamField(prev => ({ ...prev, options: e.target.value }))}
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </Grid>
              )}
              <Grid item xs={12} sm={newExamField.type === 'select' ? 12 : 5} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button variant="outlined" startIcon={<Plus size={16} />} onClick={handleAddExamField} sx={{ borderRadius: 2 }}>
                  Add Field
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {/* Custom Order Fields */}
          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Custom Order Fields</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Additional fields that appear in the order form under Additional Details.
            </Typography>

            {opticalSettings.orderCustomFields.length > 0 && (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {opticalSettings.orderCustomFields.map(field => (
                  <Stack key={field.id} direction="row" alignItems="center" spacing={1}
                    sx={{ p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{field.name}</Typography>
                      {field.type === 'select' && field.options.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Options: {field.options.join(', ')}
                        </Typography>
                      )}
                    </Box>
                    <Chip size="small" label={field.type} variant="outlined" />
                    <IconButton size="small" color="error" onClick={() => handleRemoveOrderField(field.id)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>Add New Field</Typography>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" label="Field Name" value={newOrderField.name}
                  onChange={(e) => setNewOrderField(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Advance Paid, Color"
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField select fullWidth size="small" label="Field Type" value={newOrderField.type}
                  onChange={(e) => setNewOrderField(prev => ({ ...prev, type: e.target.value }))}>
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="number">Number</MenuItem>
                  <MenuItem value="select">Dropdown</MenuItem>
                </TextField>
              </Grid>
              {newOrderField.type === 'select' && (
                <Grid item xs={12} sm={5}>
                  <TextField fullWidth size="small" label="Options (comma separated)" value={newOrderField.options}
                    onChange={(e) => setNewOrderField(prev => ({ ...prev, options: e.target.value }))}
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </Grid>
              )}
              <Grid item xs={12} sm={newOrderField.type === 'select' ? 12 : 5} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button variant="outlined" startIcon={<Plus size={16} />} onClick={handleAddOrderField} sx={{ borderRadius: 2 }}>
                  Add Field
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Stack>
      )}

      {/* Exam Preview Dialog */}
      <Dialog open={previewExamOpen} onClose={() => setPreviewExamOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' } }}>
        <Box sx={{ background: 'linear-gradient(135deg, #3f3f46 0%, #71717a 100%)', px: 3, py: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0 }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', mt: 0.5, flexShrink: 0 }}>
            <Eye size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.1em', lineHeight: 1 }}>
              Prescription Preview
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, mt: 0.5, fontSize: '1.05rem' }}>
              {previewExamData?.patientName || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              {previewExamData?.date && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{previewExamData.date}</Typography>
              )}
              {previewExamData?.phone && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{previewExamData.phone}</Typography>
              )}
              {(previewExamData?.gender || previewExamData?.age) && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                  {previewExamData?.gender || ''}{previewExamData?.gender && previewExamData?.age ? ' · ' : ''}{previewExamData?.age ? `${previewExamData.age} yrs` : ''}
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton onClick={() => setPreviewExamOpen(false)} size="small" sx={{ color: 'rgba(255,255,255,0.75)', mt: -0.5, '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' } }}>
            <X size={18} />
          </IconButton>
        </Box>
        <Box sx={{ px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.8rem' }}>Page Size</Typography>
            <TextField select size="small" value={paperSize} onChange={(e) => setPaperSize(e.target.value)} sx={{ minWidth: 84, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}>
              {['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<Printer size={15} />} variant="contained" size="small" disableElevation
            onClick={() => { setPrintingData(previewExamData); setPreviewExamOpen(false); setTimeout(() => handlePrint(), 100); }}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5, bgcolor: '#3f3f46', '&:hover': { bgcolor: '#27272a' } }}>
            Print
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#e8eaed', p: { xs: 1.5, sm: 3 } }}>
          <FitPreview>
            <OpticalTemplate data={previewExamData} business={currentBusiness} paperSize={paperSize} />
          </FitPreview>
        </Box>
      </Dialog>

      {/* Order Preview Dialog */}
      <Dialog open={previewOrderOpen} onClose={() => setPreviewOrderOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' } }}>
        <Box sx={{ background: 'linear-gradient(135deg, #3f3f46 0%, #71717a 100%)', px: 3, py: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0 }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', mt: 0.5, flexShrink: 0 }}>
            <Eye size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.1em', lineHeight: 1 }}>
              Order Preview
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, mt: 0.5, fontSize: '1.05rem' }}>
              {previewOrderData?.patientName || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              {previewOrderData?.orderDate && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{previewOrderData.orderDate}</Typography>
              )}
              {previewOrderData?.totalAmount != null && (
                <Box sx={{ px: 1.25, py: 0.25, bgcolor: 'rgba(255,255,255,0.18)', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.25)' }}>
                  <Typography variant="caption" sx={{ color: 'white', fontWeight: 800, fontSize: '0.8rem' }}>₹{(previewOrderData.totalAmount || 0).toFixed(2)}</Typography>
                </Box>
              )}
            </Box>
          </Box>
          <IconButton onClick={() => setPreviewOrderOpen(false)} size="small" sx={{ color: 'rgba(255,255,255,0.75)', mt: -0.5, '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' } }}>
            <X size={18} />
          </IconButton>
        </Box>
        <Box sx={{ px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<Printer size={15} />} variant="contained" size="small" disableElevation
            onClick={() => { setOrderPrintData(previewOrderData); setPreviewOrderOpen(false); setTimeout(() => handleOrderPrint(), 100); }}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5, bgcolor: '#3f3f46', '&:hover': { bgcolor: '#155e75' } }}>
            Print
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#e8eaed', p: 3, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <Box sx={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.18))' }}>
            <div style={{ zoom: 0.72, fontFamily: 'Arial, sans-serif', padding: 24, background: 'white' }}>
              {previewOrderData && (
                <>
                  <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>{currentBusiness?.name}</h2>
                  <p style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 12 }}>Optical Order</p>
                  <hr />
                  <p><strong>Customer:</strong> {previewOrderData.patientName}</p>
                  <p><strong>Phone:</strong> {previewOrderData.phone || '—'}</p>
                  <p><strong>Order Date:</strong> {previewOrderData.orderDate}</p>
                  <p><strong>Delivery Date:</strong> {previewOrderData.deliveryDate || '—'}</p>
                  <p><strong>Frame Type:</strong> {previewOrderData.frameType || '—'}</p>
                  <p><strong>Lens Type:</strong> {previewOrderData.lensType || '—'}</p>
                  <p><strong>Status:</strong> {previewOrderData.status}</p>
                  <hr />
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Item</th>
                        <th style={{ textAlign: 'center', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Qty</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Price</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 0' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewOrderData.items || []).map((it, i) => (
                        <tr key={i}>
                          <td style={{ padding: '3px 0' }}>{it.name}</td>
                          <td style={{ textAlign: 'center', padding: '3px 0' }}>{it.quantity}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0' }}>₹{Number(it.price).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0' }}>₹{(Number(it.quantity) * Number(it.price)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <hr />
                  <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 15 }}>Total: ₹{(previewOrderData.totalAmount || 0).toFixed(2)}</p>
                  {previewOrderData.notes && <p style={{ fontSize: 12 }}><strong>Notes:</strong> {previewOrderData.notes}</p>}
                </>
              )}
            </div>
          </Box>
        </Box>
      </Dialog>

      {snackbarEl}

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        tx={sendRow}
        party={{ phone: sendRow?.phone || '', email: '' }}
        businessName={currentBusiness?.name || 'TallyKraft'}
        isSale={true}
        dialogTitle="Send Prescription"
        initialMessage={buildPrescriptionMessage(sendRow)}
        onSharePDF={handleSharePDF}
        onShareImage={handleShareImage}
        shareLoading={shareLoading}
      />
    </Box>
  );
};

export default OpticalsPage;
