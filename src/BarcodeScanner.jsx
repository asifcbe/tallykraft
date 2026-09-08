import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Alert, CircularProgress, Chip,
  TextField, InputAdornment, IconButton,
} from '@mui/material';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';
import { ScanLine, CheckCircle2, X, QrCode, CornerDownLeft } from 'lucide-react';

const SCANNER_GAP_MS  = 50;   // max ms between hardware-scanner keystrokes
const MIN_BARCODE_LEN = 4;    // minimum chars to treat as a barcode
const DEBOUNCE_MS     = 2000; // ignore the same barcode within this window
const SCAN_COOLDOWN_MS = 1000; // flat gap between any two accepted scans

const REGION_ID = 'mui-barcode-scanner-region';

// Short confirmation beep on a shared, already-unlocked AudioContext.
// A new AudioContext created outside a user gesture starts "suspended" and
// stays silent, so we create/resume it on the opening gesture and reuse it.
function playBeep(ctx) {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880; // A5 — a clear, short "ding"
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch { /* audio not available — silent */ }
}

// The 1D/2D symbologies this app uses. Limiting formats makes decoding faster
// and more reliable.
const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
];

const BarcodeScanner = ({ open, onScan, onClose, continuous = true }) => {
  const scannerRef  = useRef(null);
  const activeRef   = useRef(false);
  const audioCtxRef = useRef(null);
  const lastScanRef = useRef({ barcode: null, time: 0 });
  const lastAcceptedAtRef = useRef(0);

  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(true);
  const [hwDetected, setHwDetected] = useState(false);
  const [scanCount, setScanCount]   = useState(0);
  const [lastItem, setLastItem]     = useState('');   // feedback text
  const [showFeedback, setShowFeedback] = useState(false);
  const [manualInput, setManualInput]   = useState('');
  const feedbackTimer = useRef(null);

  const showScanFeedback = (barcode) => {
    setLastItem(barcode);
    setShowFeedback(true);
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setShowFeedback(false), 1800);
  };

  const handleScan = (barcode) => {
    const now = Date.now();
    // Flat cooldown between any two accepted scans. The camera fires the decode
    // callback many times per second while a code is in frame, so this paces
    // scans and leaves a short "wait, then ready for next" gap.
    if (now - lastAcceptedAtRef.current < SCAN_COOLDOWN_MS) return;
    if (
      barcode === lastScanRef.current.barcode &&
      now - lastScanRef.current.time < DEBOUNCE_MS
    ) return; // same item scanned twice quickly — ignore
    lastAcceptedAtRef.current = now;
    lastScanRef.current = { barcode, time: now };

    playBeep(audioCtxRef.current); // confirmation beep on every accepted scan
    onScan(barcode);
    setScanCount(n => n + 1);
    showScanFeedback(barcode);

    // Items section passes continuous={false}: one barcode per item, so close
    // after the first read. POS/Sales stay open and keep scanning.
    if (!continuous) onClose();
  };

  // ── Hardware / USB / BT scanner support ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let buffer = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const barcode = buffer.trim();
        buffer = '';
        lastKeyTime = 0;
        if (barcode.length >= MIN_BARCODE_LEN) {
          e.preventDefault();
          e.stopPropagation();
          handleScan(barcode);
        }
        return;
      }
      if (e.key.length !== 1) return;
      const now = Date.now();
      if (lastKeyTime && now - lastKeyTime > SCANNER_GAP_MS) buffer = '';
      buffer += e.key;
      lastKeyTime = now;
      if (buffer.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        if (!hwDetected) setHwDetected(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      setHwDetected(false);
    };
  }, [open]); // eslint-disable-line

  // ── Camera scanner (html5-qrcode engine) ───────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setError('');
    setLoading(true);
    setScanCount(0);
    setLastItem('');
    setShowFeedback(false);
    lastScanRef.current = { barcode: null, time: 0 };
    lastAcceptedAtRef.current = 0;
    activeRef.current = true;

    // Create + unlock the audio context now. The scanner is opened by a button
    // tap, so this runs close enough to the gesture for browsers to allow it.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    } catch { /* audio unavailable */ }

    const onDecode = (decodedText) => {
      if (!activeRef.current) return;
      handleScan(decodedText); // camera stays running — supports multiple scans
    };

    // The region div lives inside MUI's Dialog, which mounts its content after
    // this effect first runs. Wait (via rAF) for the node to exist before
    // constructing Html5Qrcode, otherwise it throws "HTML Element ... not found".
    const waitForRegion = () => new Promise((resolve) => {
      const tick = () => {
        if (!activeRef.current) return resolve(null);
        if (document.getElementById(REGION_ID)) return resolve(true);
        requestAnimationFrame(tick);
      };
      tick();
    });

    // Track the start promise so cleanup always waits for start to settle
    // before stopping — stopping mid-start leaks the camera.
    const startPromise = waitForRegion().then((ready) => {
      if (!ready || !activeRef.current) return false;

      const scanner = new Html5Qrcode(REGION_ID, { formatsToSupport: SCAN_FORMATS, verbose: false });
      scannerRef.current = scanner;

      return scanner
        .start(
          { facingMode: 'environment' }, // prefer the rear camera on phones
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.7778 },
          onDecode,
          () => { /* per-frame "not found" — ignore */ }
        )
        .then(() => { if (activeRef.current) setLoading(false); return true; })
        .catch((err) => {
          if (!activeRef.current) return false;
          setLoading(false);
          const msg = err?.message || '';
          setError(
            /permission|NotAllowed/i.test(msg)
              ? 'Camera permission denied. Please allow camera access and try again.'
            : /NotFound|no camera/i.test(msg)
              ? 'No camera found. Use a USB/BT barcode scanner instead.'
              : 'Unable to start the camera. It may be in use by another app.'
          );
          return false; // start failed → nothing to stop
        });
    });

    return () => {
      activeRef.current = false;
      clearTimeout(feedbackTimer.current);
      // Wait for start() to settle, then fully release the camera + DOM. Guard
      // with the scanner's own state so we never call stop() when it isn't
      // running (which throws and would leave the track alive).
      startPromise.then((started) => {
        const scanner = scannerRef.current;
        if (!started || !scanner) return;
        const stopIfRunning = () => {
          try {
            if (scanner.getState && scanner.getState() === Html5QrcodeScannerState.SCANNING) {
              return scanner.stop();
            }
          } catch { /* ignore */ }
          return Promise.resolve();
        };
        Promise.resolve(stopIfRunning())
          .catch(() => {})
          .finally(() => {
            try { scanner.clear(); } catch { /* ignore */ }
            scannerRef.current = null;
          });
      });

      // Release the audio context.
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [open]); // eslint-disable-line

  const handleClose = () => {
    activeRef.current = false;
    onClose();
  };

  const handleManualSubmit = () => {
    const val = manualInput.trim();
    if (val.length < 1) return;
    handleScan(val);
    setManualInput('');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScanLine size={20} />
          Scan Barcode / QR Code
        </Box>
        {scanCount > 0 && (
          <Chip
            label={`${scanCount} item${scanCount > 1 ? 's' : ''} scanned`}
            color="success"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        )}
      </DialogTitle>

      <DialogContent sx={{ p: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {/* The camera box stays mounted (only hidden on error) so the region
            node always exists for the html5-qrcode engine to attach to. */}
        <Box sx={{
            display: error ? 'none' : 'flex',
            position: 'relative', width: '100%', bgcolor: '#000',
            borderRadius: 2, overflow: 'hidden', minHeight: 260,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {loading && (
              <Box sx={{
                position: 'absolute', inset: 0, zIndex: 2,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 1.5,
              }}>
                <CircularProgress sx={{ color: 'white' }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  Starting camera…
                </Typography>
              </Box>
            )}

            <Box id={REGION_ID} sx={{ width: '100%', '& video': { width: '100%', display: 'block' } }} />

            {/* Corner-bracket viewfinder — works for both barcodes and QR */}
            {['tl','tr','bl','br'].map(corner => {
              const isTop = corner.startsWith('t');
              const isLeft = corner.endsWith('l');
              return (
                <Box key={corner} sx={{
                  position: 'absolute',
                  top: isTop ? '22%' : undefined,
                  bottom: !isTop ? '22%' : undefined,
                  left: isLeft ? '20%' : undefined,
                  right: !isLeft ? '20%' : undefined,
                  width: 24, height: 24, zIndex: 3,
                  borderTop: isTop ? '3px solid #ef4444' : 'none',
                  borderBottom: !isTop ? '3px solid #ef4444' : 'none',
                  borderLeft: isLeft ? '3px solid #ef4444' : 'none',
                  borderRight: !isLeft ? '3px solid #ef4444' : 'none',
                  borderRadius: isTop && isLeft ? '4px 0 0 0' : isTop ? '0 4px 0 0' : isLeft ? '0 0 0 4px' : '0 0 4px 0',
                }} />
              );
            })}

            {/* Success overlay after each scan */}
            {showFeedback && (
              <Box sx={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
                bgcolor: 'rgba(22,163,74,0.92)', display: 'flex', alignItems: 'center',
                gap: 1.5, px: 2, py: 1.2,
              }}>
                <CheckCircle2 size={18} color="white" />
                <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.88rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Added: {lastItem}
                </Typography>
              </Box>
            )}
          </Box>

        <Typography variant="caption" color="text.secondary"
          sx={{ display: 'block', mt: 1.5, textAlign: 'center' }}>
          Point camera at a barcode or QR code — camera stays open for multiple scans
        </Typography>

        {/* Manual entry fallback */}
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Type barcode / QR value manually and press Enter"
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualSubmit(); } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <QrCode size={14} style={{ color: 'rgba(0,0,0,0.38)' }} />
                  </InputAdornment>
                ),
                endAdornment: manualInput.trim() ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleManualSubmit} edge="end">
                      <CornerDownLeft size={14} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, fontSize: '0.82rem' } }}
          />
        </Box>

        <Box sx={{
          mt: 1.5, p: 1.5, borderRadius: 1.5,
          bgcolor: hwDetected ? 'success.50' : 'action.hover',
          display: 'flex', alignItems: 'center', gap: 1,
        }}>
          <Chip
            label="USB / BT Scanner"
            size="small"
            color={hwDetected ? 'success' : 'default'}
            variant={hwDetected ? 'filled' : 'outlined'}
            sx={{ fontSize: '0.7rem' }}
          />
          <Typography variant="caption" color="text.secondary">
            {hwDetected ? 'Scanner input detected — scanning…' : 'Hardware scanner also supported — scan anytime'}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {scanCount === 0 ? 'Scan barcode or QR, then press Done' : `${scanCount} item${scanCount > 1 ? 's' : ''} scanned — scan more or press Done`}
        </Typography>
        <Button
          variant="contained"
          onClick={handleClose}
          startIcon={<X size={16} />}
          sx={{ fontWeight: 700 }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
