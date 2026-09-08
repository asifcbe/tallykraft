import React, { useEffect, useRef } from 'react';
import { registerQrDraw } from './qrReady';

// Renders a QR code for an arbitrary string value (typically a upi://pay
// deep link built via upiUtils.js's buildUpiUri) — `qrcode` is dynamically
// imported on first use so it isn't bundled into every page that renders
// this, only the ones that actually show a QR. Mirrors the same
// canvas+dynamic-import pattern already used by ItemFormDialog.jsx's
// exported QRImage (barcode label QR previews).
//
// The draw is async (dynamic import + QRCode.toCanvas), which races
// react-to-print/html2canvas — both snapshot the canvas's current pixels
// synchronously and don't wait for React effects. Every draw is registered
// with qrReady.js so a print/export call site can `await waitForQrReady()`
// immediately before triggering its snapshot, closing that race.
const UpiQrImage = ({ value, size = 120 }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    if (canvasRef.current && value) {
      const markDone = registerQrDraw(value);
      import('qrcode').then(({ default: QRCode }) => {
        if (cancelled || !canvasRef.current) { markDone(); return; }
        QRCode.toCanvas(canvasRef.current, value, {
          width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' },
        }).catch(() => {}).finally(markDone);
      }).catch(markDone);
    }
    return () => { cancelled = true; };
  }, [value, size]);
  if (!value) return null;
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
};

export default UpiQrImage;
