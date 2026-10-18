// Shared capture → PDF / image helpers for every "Share / Download as PDF or
// Image" action (invoices, estimates, notes, orders, ledgers, …).
//
// Two problems this fixes, both of which cut long documents off after the
// first page:
//  1. html2canvas sizes its virtual window to the browser viewport, so a
//     document taller than the screen (rendered off-screen in a fixed box) was
//     clipped. captureElement() sizes the capture window to the element.
//  2. The PDF was created at one paper size (e.g. A4) with the whole document
//     drawn as a single image taller than the page — everything past page 1
//     fell off. canvasToPdf() slices the capture into real pages, cutting at a
//     blank row near each page bottom so a line of text isn't split in half.
import { getPaperWidthMm, getJsPdfFormat } from './InvoiceTemplate';

// Page height (mm) per paper size. Sizes not listed (thermal rolls, dot
// matrix) are continuous: one page as tall as the document.
const PAGE_HEIGHT_MM = {
  A3: 420, A4: 297, A5: 210, A6: 148,
  Letter: 279.4, Legal: 355.6, Executive: 266.7, Statement: 215.9, 'Half Page': 148.5,
};

export const captureElement = async (el, { scale = 1.5 } = {}) => {
  const { default: html2canvas } = await import('html2canvas');
  const w = Math.ceil(el.scrollWidth || el.offsetWidth || 0);
  const h = Math.ceil(el.scrollHeight || el.offsetHeight || 0);
  return html2canvas(el, {
    scale,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: w || undefined,
    height: h || undefined,
    windowWidth: Math.max(w, document.documentElement.clientWidth || 0),
    windowHeight: Math.max(h, window.innerHeight || 0),
    scrollX: 0,
    scrollY: 0,
  });
};

// Find a near-white row at or just above `target` (searching up to `maxBack`
// rows) so the page break falls between lines rather than through them.
const findCutRow = (ctx, width, target, maxBack) => {
  if (!ctx) return target;
  const step = Math.max(1, Math.floor(width / 300));
  try {
    for (let y = target; y > target - maxBack && y > 0; y--) {
      const row = ctx.getImageData(0, y, width, 1).data;
      let blank = true;
      for (let x = 0; x < width; x += step) {
        const i = x * 4;
        if (row[i] < 240 || row[i + 1] < 240 || row[i + 2] < 240) { blank = false; break; }
      }
      if (blank) return y;
    }
  } catch { /* tainted canvas — fall back to an exact cut */ }
  return target;
};

export const canvasToPdf = (canvas, jsPDF, paperSize = 'A4') => {
  const pageW = getPaperWidthMm(paperSize) || 210;
  const pageH = PAGE_HEIGHT_MM[paperSize];
  const pxPerMm = canvas.width / pageW;
  const fullH = canvas.height / pxPerMm;

  // Continuous paper, or the document fits on one page: single page.
  if (!pageH || fullH <= pageH + 0.5) {
    const named = getJsPdfFormat(paperSize);
    const pdf = new jsPDF({ unit: 'mm', format: pageH && named ? named : [pageW, Math.max(fullH, 10)] });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, fullH);
    return pdf;
  }

  const named = getJsPdfFormat(paperSize);
  const pdf = new jsPDF({ unit: 'mm', format: named || [pageW, pageH] });
  const slicePx = Math.floor(pageH * pxPerMm);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let y = 0;
  let first = true;
  while (y < canvas.height - 2) {
    let end = Math.min(canvas.height, y + slicePx);
    if (end < canvas.height) end = findCutRow(ctx, canvas.width, end, Math.floor(slicePx * 0.15));
    if (end <= y) end = Math.min(canvas.height, y + slicePx);
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = end - y;
    const pctx = part.getContext('2d');
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, part.width, part.height);
    pctx.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
    if (!first) pdf.addPage(named || [pageW, pageH]);
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, part.height / pxPerMm);
    first = false;
    y = end;
  }
  return pdf;
};
