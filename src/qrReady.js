// Coordinates the async QR canvas draw (UpiQrImage.jsx, `qrcode` dynamically
// imported + QRCode.toCanvas) against print/PDF capture, which otherwise
// races it: react-to-print/html2canvas snapshot whatever pixels are on the
// canvas AT THE MOMENT they run, and neither waits for React effects to
// finish — if the QR hasn't been drawn yet (e.g. a cold `import('qrcode')`
// on the very first QR anywhere in the session), it prints/exports blank.
//
// Two independent mitigations, used together:
//  1. warmQrModule() — called once at app boot (App.jsx) — kicks off
//     `import('qrcode')` immediately so it's already resolved by the time
//     any real QR needs to draw, instead of paying that cost cold at print
//     time. Doesn't fully close the race (the canvas draw itself is still
//     async), but removes its single biggest, least predictable component
//     (network fetch + module parse) in virtually every real session.
//  2. waitForQrReady() — call sites that print/export can await this right
//     before triggering the snapshot, to close the race completely and
//     deterministically rather than relying on (1) alone. UpiQrImage calls
//     markQrDrawn()/markQrFailed() once its own canvas draw settles.

let qrModulePromise = null;
export const warmQrModule = () => {
  if (!qrModulePromise) qrModulePromise = import('qrcode');
  return qrModulePromise;
};

// Tracks in-flight/just-settled QR draws by a caller-supplied key (the same
// `value` string UpiQrImage renders) — supports multiple simultaneous QRs
// (e.g. a bulk print stack) without one clobbering another's ready state.
const pending = new Map(); // key -> Promise<void>

export const registerQrDraw = (key) => {
  let resolve;
  const p = new Promise((res) => { resolve = res; });
  pending.set(key, p);
  return () => { resolve(); pending.delete(key); };
};

// Resolves once every currently-tracked QR draw has settled (drawn or
// failed) — safe to call even when no QR is on the page (resolves
// immediately) or when the QR already finished drawing before this was
// called (nothing left in `pending`).
export const waitForQrReady = async () => {
  const inFlight = Array.from(pending.values());
  if (inFlight.length === 0) return;
  await Promise.all(inFlight);
};
