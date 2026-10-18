import React, { useMemo, useState } from 'react';
import { Box, Typography, TextField, Switch, Button, MenuItem, ListSubheader, alpha } from '@mui/material';
import {
  Image as ImageIcon, Building2, MapPin, Phone, Mail, BadgeCheck, Heading1, Hash, CalendarDays, Clock,
  CalendarClock, Map as MapIcon, Receipt, CreditCard, UserCheck, User, IndianRupee, Wallet, Languages, Landmark,
  QrCode, ScrollText, PenLine, StickyNote, Gift, Pencil, Minus, Square, PanelTop, PanelBottom, Eye, RotateCcw,
} from 'lucide-react';
import { FreeformDesigner } from './FreeformDesigner';
import InvoiceTemplate, { BillBand, SAMPLE_INVOICE, SAMPLE_BUSINESS, PAPER_SIZES } from './InvoiceTemplate';
import { BILL_ELEMENT_TYPES, newBillElement, templateBillDesign, resolveBillDesign, billBandWidthMm, buildBillCtx, isReceiptSize } from './billDesignUtils';

const ICONS = {
  logo: ImageIcon, businessName: Building2, businessAddress: MapPin, businessPhone: Phone, businessEmail: Mail,
  businessGstin: BadgeCheck, docTitle: Heading1, invoiceNumber: Hash, invoiceDate: CalendarDays, invoiceTime: Clock,
  dueDate: CalendarClock, placeOfSupply: MapIcon, supplyType: Receipt, paymentMode: CreditCard, billedBy: UserCheck,
  partyBlock: User, partyName: User, partyAddress: MapPin, partyPhone: Phone, partyGstin: BadgeCheck,
  totals: IndianRupee, grandTotal: IndianRupee, balanceDue: Wallet, amountInWords: Languages, bankDetails: Landmark,
  upiQr: QrCode, terms: ScrollText, signature: PenLine, notes: StickyNote, loyalty: Gift, customText: Pencil,
  line: Minus, box: Square,
};

const AREAS = [
  { key: 'header', label: 'Header', icon: PanelTop, desc: 'Top of the bill, above the items table' },
  { key: 'footer', label: 'Footer', icon: PanelBottom, desc: 'Below the items table (and HSN summary)' },
];

const TABLE_STYLES = [
  { value: 'grid', label: 'Grid (all borders)' },
  { value: 'lines', label: 'Row lines only' },
  { value: 'plain', label: 'Plain (no borders)' },
  { value: 'receipt', label: 'Receipt list (narrow paper)' },
];

// Free-form bill designer. One design per paper size (A4, A5, thermal 80mm,
// thermal 58mm, dot matrix, ...): the header and footer are designed like
// labels and the items table flows between them on the printed bill.
//   designs            { [paperSize]: design } being edited
//   fallbackDesign     older single design, used for page sizes with none yet
//   useDesignerTheme   page sizes print with the designer (the "Custom Designer" layout)
const BillDesigner = ({
  designs = {}, onDesignsChange, fallbackDesign, initialPaperSize = 'A4',
  useDesignerTheme, onUseDesignerThemeChange, opts = {}, business, primary = '#5c1f22',
}) => {
  const [paperSize, setPaperSize] = useState(initialPaperSize);
  const receipt = isReceiptSize(paperSize);
  const saved = designs[paperSize] || (receipt ? null : fallbackDesign) || null;
  const design = useMemo(() => resolveBillDesign(saved, paperSize), [saved, paperSize]);
  const [area, setArea] = useState('header');
  const [showPreview, setShowPreview] = useState(false);

  const biz = { ...SAMPLE_BUSINESS, ...(business || {}) };
  const previewOpts = { ...opts, invoiceTheme: 'designer', billDesigns: { ...designs, [paperSize]: { ...design, enabled: true } } };
  const ctx = buildBillCtx({
    transaction: SAMPLE_INVOICE, business: biz, opts: previewOpts, isSale: true,
    headerTitle: 'TAX INVOICE', showBalanceSection: false, currentBillTotal: SAMPLE_INVOICE.totalAmount,
  });
  const widthMm = billBandWidthMm(paperSize, design.marginMm);
  const band = design[area];

  // Editing a receipt-size design switches it on (that's why you'd edit it);
  // it can still be turned back off with the switch.
  const setDesign = (patch) => onDesignsChange({
    ...designs,
    [paperSize]: { ...design, ...(receipt && saved == null ? { enabled: true } : {}), ...patch },
  });
  const setBand = (patch) => setDesign({ [area]: { ...band, ...patch } });
  const table = design.table || {};
  const setTable = (patch) => setDesign({ table: { ...table, ...patch } });
  const enabled = receipt ? !!design.enabled : !!useDesignerTheme;
  const setEnabled = (v) => (receipt ? setDesign({ enabled: v }) : onUseDesignerThemeChange?.(v));

  const spec = {
    catalog: BILL_ELEMENT_TYPES.map((t) => ({ ...t, icon: ICONS[t.type] })),
    newElement: newBillElement,
    defaultColor: '#000000',
    renderCanvas: ({ elements, scale }) => (
      <BillBand elements={elements} widthMm={widthMm} heightMm={band.heightMm} ctx={ctx} scale={scale} placeholder />
    ),
  };

  const label = { fontSize: '0.64rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 };
  const num = (value, onVal, min, max, step = 1) => (
    <TextField size="small" type="number" value={value}
      onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) onVal(Math.min(max, Math.max(min, v))); }}
      slotProps={{ htmlInput: { min, max, step }, input: { endAdornment: <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', ml: 0.5 }}>mm</Typography> } }}
      sx={{ width: 96, '& .MuiInputBase-input': { fontSize: '0.82rem', py: 0.75 } }} />
  );

  const groups = PAPER_SIZES.reduce((acc, p) => { (acc[p.group] ||= []).push(p); return acc; }, {});

  return (
    <Box>
      {/* Paper size + on/off for it */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: alpha(primary, 0.03) }}>
        <Box>
          <Typography sx={label}>Paper size</Typography>
          <TextField select size="small" value={paperSize} onChange={(e) => { setPaperSize(e.target.value); setShowPreview(false); }} sx={{ minWidth: 220, '& .MuiInputBase-input': { fontSize: '0.84rem' } }}>
            {Object.entries(groups).flatMap(([g, list]) => [
              <ListSubheader key={`g-${g}`} sx={{ fontSize: '0.66rem', fontWeight: 700, lineHeight: '26px' }}>{g}</ListSubheader>,
              ...list.map((p) => (
                <MenuItem key={p.value} value={p.value} sx={{ fontSize: '0.84rem' }}>
                  {p.label}{designs[p.value] ? '  ✎' : ''}
                </MenuItem>
              )),
            ])}
          </TextField>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.84rem' }}>Use this design when printing on {paperSize}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              {receipt
                ? 'Off = the standard receipt layout. Each thermal / dot-matrix size has its own design.'
                : 'Sets the invoice layout to "Custom Designer" for page sizes. Each page size keeps its own design.'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Area + page settings */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end', mb: 2 }}>
        <Box>
          <Typography sx={label}>Design area</Typography>
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {AREAS.map((a) => {
              const on = a.key === area;
              return (
                <Box key={a.key} role="button" tabIndex={0} onClick={() => setArea(a.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setArea(a.key); } }}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.9, borderRadius: 1.5, cursor: 'pointer', border: '1.5px solid',
                    borderColor: on ? primary : 'divider', bgcolor: on ? alpha(primary, 0.08) : 'transparent', color: on ? primary : 'text.secondary' }}>
                  <a.icon size={16} />
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.2 }}>{a.label}</Typography>
                    <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary', lineHeight: 1.2 }}>{a.desc}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
        <Box>
          <Typography sx={label}>{area === 'header' ? 'Header' : 'Footer'} height</Typography>
          {num(band.heightMm, (v) => setBand({ heightMm: v }), 10, 250)}
        </Box>
        <Box>
          <Typography sx={label}>Side margin</Typography>
          {num(design.marginMm ?? 8, (v) => setDesign({ marginMm: v }), 0, 30, 0.5)}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant={showPreview ? 'contained' : 'outlined'} startIcon={<Eye size={15} />} onClick={() => setShowPreview((v) => !v)}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', boxShadow: 'none', ...(showPreview ? { bgcolor: primary, '&:hover': { bgcolor: primary } } : {}) }}>
          {showPreview ? 'Back to editing' : 'Preview full bill'}
        </Button>
        <Button size="small" startIcon={<RotateCcw size={14} />} onClick={() => onDesignsChange({ ...designs, [paperSize]: { ...templateBillDesign(paperSize), enabled: design.enabled ?? receipt } })}
          sx={{ textTransform: 'none', color: 'text.secondary' }}>
          Reset {paperSize} design
        </Button>
      </Box>

      {/* Items table styling */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end', mb: 2, p: 1.25, borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
        <Typography sx={{ ...label, mb: 0, alignSelf: 'center', mr: 1 }}>Items table</Typography>
        <TextField select size="small" label="Style" value={table.style || 'grid'} onChange={(e) => setTable({ style: e.target.value })} sx={{ minWidth: 200, '& .MuiInputBase-input': { fontSize: '0.82rem' } }}>
          {TABLE_STYLES.map((t) => <MenuItem key={t.value} value={t.value} sx={{ fontSize: '0.82rem' }}>{t.label}</MenuItem>)}
        </TextField>
        <TextField size="small" type="number" label="Font size" value={table.fontSize ?? 9.5}
          onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) setTable({ fontSize: Math.min(20, Math.max(5, v)) }); }}
          slotProps={{ htmlInput: { min: 5, max: 20, step: 0.5 }, input: { endAdornment: <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', ml: 0.5 }}>pt</Typography> } }}
          sx={{ width: 110, '& .MuiInputBase-input': { fontSize: '0.82rem' } }} />
        {table.style !== 'receipt' && table.style !== 'plain' && (
          <>
            <Box>
              <Typography sx={label}>Header fill</Typography>
              <input type="color" value={table.headerBg || design.tableHeaderColor || opts.themeColor || '#5c1f22'} onChange={(e) => setTable({ headerBg: e.target.value })}
                style={{ width: 52, height: 34, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
            </Box>
            <Box>
              <Typography sx={label}>Header text</Typography>
              <input type="color" value={table.headerColor || '#ffffff'} onChange={(e) => setTable({ headerColor: e.target.value })}
                style={{ width: 52, height: 34, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
            </Box>
          </>
        )}
        {table.style !== 'receipt' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Switch size="small" checked={table.stripes !== false} onChange={(e) => setTable({ stripes: e.target.checked })} />
            <Typography sx={{ fontSize: '0.78rem' }}>Striped rows</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Switch size="small" checked={design.showHsnSummary !== false} onChange={(e) => setDesign({ showHsnSummary: e.target.checked })} />
          <Typography sx={{ fontSize: '0.78rem' }}>HSN / tax summary under items</Typography>
        </Box>
      </Box>

      {showPreview ? (
        <Box sx={{ bgcolor: '#eef0f2', borderRadius: 2, p: 2, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
          <Box sx={{ transform: receipt ? 'none' : 'scale(0.75)', transformOrigin: 'top center', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', bgcolor: '#fff' }}>
            <InvoiceTemplate transaction={SAMPLE_INVOICE} business={biz} paperSize={paperSize} printOptions={previewOpts} />
          </Box>
        </Box>
      ) : (
        <FreeformDesigner
          key={`${paperSize}-${area}`}
          widthMm={widthMm}
          heightMm={band.heightMm}
          layout={band}
          onChange={(next) => setBand({ elements: next.elements })}
          spec={spec}
          primary={primary}
          maxCanvasHeight={receipt ? 520 : 420}
          resetLabel={`Reset ${area} to template`}
          onResetTemplate={() => setBand({ elements: templateBillDesign(paperSize)[area].elements })}
        />
      )}
      <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', mt: 1 }}>
        The items table always sits between the header and footer and grows with the number of items, so long bills still continue onto the next page.
      </Typography>
    </Box>
  );
};

export default BillDesigner;
