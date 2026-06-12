import React, {
  createContext, useContext, useCallback, useState, useRef, useMemo, memo,
} from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, alpha,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { AlertTriangle, Info, CheckCircle, Trash2, X } from 'lucide-react';

const DialogCtx = createContext(null);

const VARIANTS = {
  danger:  { icon: Trash2,       color: '#dc2626', bg: alpha('#dc2626', 0.08), confirmLabel: 'Delete'  },
  warning: { icon: AlertTriangle, color: '#d97706', bg: alpha('#d97706', 0.08), confirmLabel: 'Proceed' },
  info:    { icon: Info,          color: '#0369a1', bg: alpha('#0369a1', 0.08), confirmLabel: 'OK'      },
  success: { icon: CheckCircle,   color: '#16a34a', bg: alpha('#16a34a', 0.08), confirmLabel: 'OK'      },
  primary: { icon: Info,          color: null,      bg: null,                   confirmLabel: 'Confirm' },
};

// memo: only re-renders when open/opts/handlers change — never on app-tree re-renders
const AppDialog = memo(function AppDialog({ open, opts, onConfirm, onCancel }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  const isAlert = opts?.type === 'alert';
  const variant = opts?.variant || (isAlert ? 'info' : 'danger');
  const vt = VARIANTS[variant] || VARIANTS.info;
  const iconColor    = vt.color || primary;
  const iconBg       = vt.bg    || alpha(primary, 0.08);
  const Icon         = vt.icon;
  const title        = opts?.title        || (isAlert ? 'Notice' : 'Confirm Action');
  const message      = opts?.message      || '';
  const confirmLabel = opts?.confirmLabel || (isAlert ? 'OK' : (vt.confirmLabel || 'Confirm'));
  const cancelLabel  = opts?.cancelLabel  || 'Cancel';
  const confirmBg    = vt.color || primary;
  const confirmHover = vt.color ? alpha(vt.color, 0.85) : theme.palette.primary.dark;

  return (
    <Dialog
      open={open}
      onClose={isAlert ? onConfirm : onCancel}
      maxWidth="xs"
      fullWidth
      transitionDuration={160}
      slotProps={{
        paper: {
          elevation: 8,
          sx: { borderRadius: '16px', overflow: 'hidden' },
        },
        // No backdropFilter — it triggers GPU compositing and causes jank
        backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.45)' } },
      }}
    >
      <Box sx={{ height: 4, background: confirmBg, flexShrink: 0 }} />

      <DialogTitle sx={{ pb: 0, pt: 2.5, px: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: iconBg,
          }}>
            <Icon size={20} color={iconColor} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.3, color: 'text.primary' }}>
            {title}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5, px: 3, pb: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, pl: '56px' }}>
          {message}
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2.5, gap: 1 }}>
        {!isAlert && (
          <Button
            variant="outlined"
            onClick={onCancel}
            startIcon={<X size={14} />}
            sx={{
              borderRadius: '8px', textTransform: 'none', fontWeight: 700, px: 2,
              borderColor: 'divider', color: 'text.secondary',
              '&:hover': { bgcolor: alpha('#000', 0.04), borderColor: 'text.disabled' },
            }}
          >
            {cancelLabel}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={onConfirm}
          autoFocus
          sx={{
            borderRadius: '8px', textTransform: 'none', fontWeight: 700, px: 2.5,
            background: confirmBg,
            boxShadow: `0 4px 12px ${alpha(confirmBg, 0.28)}`,
            '&:hover': { background: confirmHover, boxShadow: `0 6px 16px ${alpha(confirmBg, 0.36)}` },
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export function DialogProvider({ children }) {
  const [dialogState, setDialogState] = useState({ open: false, opts: null });
  // Store resolve outside React state — no re-render overhead, no strict-mode double-call risk
  const resolveRef = useRef(null);

  const openDialog = useCallback((opts) =>
    new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialogState({ open: true, opts });
    }), []);

  const handleConfirm = useCallback(() => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialogState({ open: false, opts: null });
    resolve?.(true);        // called AFTER setState, never inside updater
  }, []);

  const handleCancel = useCallback(() => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialogState({ open: false, opts: null });
    resolve?.(false);
  }, []);

  const confirm = useCallback((msgOrOpts) => {
    const opts = typeof msgOrOpts === 'string'
      ? { message: msgOrOpts, type: 'confirm' }
      : { type: 'confirm', ...msgOrOpts };
    return openDialog(opts);
  }, [openDialog]);

  const showAlert = useCallback((msgOrOpts) => {
    const opts = typeof msgOrOpts === 'string'
      ? { message: msgOrOpts, type: 'alert', variant: 'info' }
      : { type: 'alert', variant: 'info', ...msgOrOpts };
    return openDialog(opts);
  }, [openDialog]);

  // Stable reference — confirm/showAlert are useCallback with no changing deps,
  // so ctxValue never changes and zero consumers re-render on dialog open/close
  const ctxValue = useMemo(() => ({ confirm, showAlert }), [confirm, showAlert]);

  return (
    <DialogCtx.Provider value={ctxValue}>
      {children}
      <AppDialog
        open={dialogState.open}
        opts={dialogState.opts}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </DialogCtx.Provider>
  );
}

export const useDialog = () => {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
};
