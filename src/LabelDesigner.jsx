import React, { useEffect, useMemo, useState } from 'react';
import { Barcode, QrCode, Minus, Square, Hash, IndianRupee, Pencil } from 'lucide-react';
import { FreeformDesigner } from './FreeformDesigner';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { registerQrDraw } from './qrReady';
import {
  PX_PER_MM, ELEMENT_TYPES, typeLabel, isCodeType, isShapeType, newElement,
  elementValue, qrValueFor, fitFontPx,
} from './labelDesignerUtils';

/* ───────────────────────── Code images ───────────────────────── */

// Encoded once per value and reused for every copy on a print sheet. Rendered
// at a high pixel resolution so it stays crisp on 203/300dpi label printers,
// then stretched to whatever box the user drew (bars scale uniformly, so a
// stretched barcode still scans).
const barcodeSrcCache = new Map();
const barcodeSrc = (value) => {
  if (!value) return null;
  if (barcodeSrcCache.has(value)) return barcodeSrcCache.get(value);
  let src = null;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, { format: 'CODE128', width: 6, height: 300, displayValue: false, margin: 0, background: '#ffffff', lineColor: '#000000' });
    src = canvas.toDataURL('image/png');
  } catch { src = null; }
  barcodeSrcCache.set(value, src);
  return src;
};

const qrSrcCache = new Map();
const QrImg = ({ value }) => {
  // Read straight from the cache on render; the effect only generates a
  // missing image and bumps `tick` (from its async callback) to re-render.
  const [, setTick] = useState(0);
  const src = value ? qrSrcCache.get(value) : null;
  useEffect(() => {
    if (!value || qrSrcCache.has(value)) return undefined;
    let cancelled = false;
    const done = registerQrDraw(`label-qr:${value}`);
    QRCode.toDataURL(value, { width: 600, margin: 0, color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => { qrSrcCache.set(value, url); if (!cancelled) setTick((t) => t + 1); })
      .catch(() => {})
      .finally(done);
    return () => { cancelled = true; };
  }, [value]);
  if (!src) return null;
  return <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />;
};

/* ───────────────────────── One element ───────────────────────── */

const ElementBody = ({ el, item, wPx, hPx, textColor, placeholder }) => {
  const color = el.color || textColor || '#000000';
  if (el.type === 'barcode') {
    const src = barcodeSrc(item?.barcode);
    if (!src) return placeholder ? <Placeholder label="Barcode (item has none)" /> : null;
    return <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />;
  }
  if (el.type === 'qr') return <QrImg value={qrValueFor(item)} />;
  if (el.type === 'line') {
    const t = `${Math.max(0.1, Number(el.thickness) || 0.3)}mm`;
    const vertical = hPx > wPx;
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={vertical ? { width: t, height: '100%', background: color } : { height: t, width: '100%', background: color }} />
      </div>
    );
  }
  if (el.type === 'box') {
    return <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: `${Math.max(0.1, Number(el.thickness) || 0.3)}mm solid ${color}` }} />;
  }
  const value = elementValue(el, item);
  if (!value) return placeholder ? <Placeholder label={`${typeLabel(el.type)} (empty)`} /> : null;
  const text = `${el.type === 'customText' ? '' : (el.prefix || '')}${value}`;
  const fontPx = el.autoFit !== false
    ? fitFontPx(text, wPx, hPx, el.bold, el.italic)
    : (Number(el.fontSize) || 8) * (96 / 72);
  const justify = el.align === 'left' ? 'flex-start' : el.align === 'right' ? 'flex-end' : 'center';
  const alignItems = el.vAlign === 'top' ? 'flex-start' : el.vAlign === 'bottom' ? 'flex-end' : 'center';
  // Designer only: flag a manual font size too big for its box (it would be cut off when printed).
  // Manual sizes wrap, so estimate the lines needed at this size and compare with the box height.
  const oneLinePx = fitFontPx(text, wPx, 1e6, el.bold, el.italic); // largest size that fits on one line
  const linesNeeded = Math.max(1, Math.ceil(fontPx / Math.max(oneLinePx, 0.1)));
  const tooBig = placeholder && el.autoFit === false && linesNeeded * fontPx * 1.1 > hPx * 1.03;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems, justifyContent: justify, overflow: 'hidden', position: 'relative', outline: tooBig ? '1.5px dashed #dc2626' : 'none', outlineOffset: '-1px' }}>
      {tooBig && <div style={{ position: 'absolute', right: 1, bottom: 1, background: '#dc2626', color: '#fff', fontSize: 8, fontWeight: 700, padding: '0 3px', borderRadius: 2, fontFamily: 'Arial', zIndex: 1 }}>Too big</div>}
      <span style={{
        fontFamily: 'Arial, sans-serif', fontSize: fontPx, lineHeight: 1.1, color,
        fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? 'italic' : 'normal',
        textDecoration: el.strike ? 'line-through' : 'none', textAlign: el.align || 'center',
        whiteSpace: el.autoFit !== false ? 'nowrap' : 'normal', wordBreak: 'break-word', maxWidth: '100%',
      }}>
        {text}
      </span>
    </div>
  );
};

const Placeholder = ({ label }) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 4px,#fff 4px,#fff 8px)', color: '#9ca3af', fontSize: 9, fontFamily: 'Arial', textAlign: 'center', overflow: 'hidden' }}>
    {label}
  </div>
);

/* ───────────────────── Printable designed label ───────────────────── */

// Renders a saved custom layout at the real label size (mm). `scale` shrinks
// it for on-screen previews while keeping the exact proportions.
export const DesignedLabel = ({ item, widthMm, heightMm, layout, lbl, scale = 1, placeholder = false }) => {
  const wPx = widthMm * PX_PER_MM;
  const hPx = heightMm * PX_PER_MM;
  const borderStyle = lbl?.borderStyle || 'solid';
  const label = (
    <div style={{
      position: 'relative', width: `${widthMm}mm`, height: `${heightMm}mm`, overflow: 'hidden', boxSizing: 'border-box',
      background: lbl?.backgroundColor || '#ffffff',
      border: borderStyle === 'none' ? 'none' : `0.5px ${borderStyle} #ccc`,
    }}>
      {(layout?.elements || []).filter((el) => !el.hidden).map((el) => (
        <div key={el.id} style={{ position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}>
          <ElementBody el={el} item={item} wPx={(el.w / 100) * wPx} hPx={(el.h / 100) * hPx} textColor={lbl?.textColor} placeholder={placeholder} />
        </div>
      ))}
    </div>
  );
  if (scale === 1) return label;
  return (
    <div style={{ width: wPx * scale, height: hPx * scale, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: wPx, height: hPx }}>{label}</div>
    </div>
  );
};

/* ───────────────────────────── Editor ───────────────────────────── */

const LABEL_ICONS = { barcode: Barcode, qr: QrCode, codeNumber: Hash, line: Minus, box: Square, mrp: IndianRupee, salePrice: IndianRupee, customText: Pencil };
const LABEL_HINTS = {
  barcode: 'The barcode stretches to fill its box. Keep it wide and not too short so scanners read it reliably.',
  qr: 'The QR code always stays square inside its box. It encodes the barcode, or the item code / name when there is none.',
};

export const LabelDesigner = ({ widthMm, heightMm, layout, onChange, item, lbl, primary = '#5c1f22', onResetTemplate }) => {
  const spec = useMemo(() => ({
    catalog: ELEMENT_TYPES.map((t) => ({
      ...t,
      icon: LABEL_ICONS[t.type],
      kind: isCodeType(t.type) ? 'code' : isShapeType(t.type) ? 'shape' : 'text',
      square: t.type === 'qr',
      hint: LABEL_HINTS[t.type],
    })),
    newElement,
    defaultColor: lbl?.textColor || '#000000',
    renderCanvas: ({ elements, scale }) => (
      <DesignedLabel item={item} widthMm={widthMm} heightMm={heightMm} layout={{ elements }} lbl={lbl} scale={scale} placeholder />
    ),
  }), [item, lbl, widthMm, heightMm]);
  return (
    <FreeformDesigner widthMm={widthMm} heightMm={heightMm} layout={layout} onChange={onChange}
      spec={spec} primary={primary} onResetTemplate={onResetTemplate} />
  );
};

export default LabelDesigner;
