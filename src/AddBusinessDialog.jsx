import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogActions, Box, Grid, Typography, TextField,
  FormControl, InputLabel, Select, MenuItem, Button, IconButton, InputAdornment,
  Divider, useTheme, alpha,
} from '@mui/material';
import { Building2, X, Plus } from 'lucide-react';

const emptyForm = () => ({
  name: '', gstNumber: '', phone: '', address: '',
  fyStartMonth: 3, openingCash: '', openingBank: '',
});

// Self-contained "create a new business" popup. On submit it validates and hands
// the assembled business payload to onCreate (the parent then runs the payment
// flow). Keeps its own form state so it never disturbs the inline edit form.
const AddBusinessDialog = ({ open, onClose, onCreate }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');

  // Reset the form each time the dialog opens (fires on the enter transition).
  const resetForm = () => { setForm(emptyForm()); setError(''); };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) { setError('Business name is required.'); return; }
    onCreate({
      name: form.name.trim(),
      gstNumber: form.gstNumber || '',
      address: form.address || '',
      phone: form.phone || '',
      email: '',
      state: 'Unknown',
      fyStartMonth: Number(form.fyStartMonth ?? 3),
      openingCash: Number(form.openingCash) || 0,
      openingBank: Number(form.openingBank) || 0,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      TransitionProps={{ onEnter: resetForm }}
      PaperProps={{ sx: { borderRadius: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2.5, background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.75)} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 16px ${alpha(primary, 0.4)}` }}>
            <Building2 size={20} color="#fff" />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.1 }}>Add a New Business</Typography>
            <Typography variant="caption" color="text.secondary">Each business is billed separately</Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}><X size={18} /></IconButton>
      </Box>
      <Divider />

      <DialogContent sx={{ pt: 2.5 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField size="small" fullWidth label="Business Name *" required autoFocus
              placeholder="e.g. Acme Traders"
              name="businessDisplayName" autoComplete="off"
              value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField size="small" fullWidth label="GSTIN" placeholder="Optional"
              value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField size="small" fullWidth label="Phone"
              value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Grid>
          <Grid item xs={12}>
            <TextField size="small" fullWidth label="Address" multiline rows={2}
              value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Financial Year Start</InputLabel>
              <Select value={form.fyStartMonth} label="Financial Year Start"
                onChange={(e) => set('fyStartMonth', e.target.value)}
                MenuProps={{ PaperProps: { sx: { minWidth: 260 } } }}>
                <MenuItem value={3}>April (India standard)</MenuItem>
                <MenuItem value={0}>January (Calendar year)</MenuItem>
                <MenuItem value={6}>July</MenuItem>
                <MenuItem value={9}>October</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField size="small" fullWidth type="number" label="Opening Cash"
              value={form.openingCash} onChange={(e) => set('openingCash', e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              helperText="Cash on hand when you start tracking" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField size="small" fullWidth type="number" label="Opening Bank Balance"
              value={form.openingBank} onChange={(e) => set('openingBank', e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              helperText="Bank balance when you start tracking" />
          </Grid>

          {error && (
            <Grid item xs={12}>
              <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>{error}</Typography>
            </Grid>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 600 }}>Cancel</Button>
        <Button variant="contained" onClick={submit} startIcon={<Plus size={16} />}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5,
            background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.8)} 100%)` }}>
          Continue to Payment
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddBusinessDialog;
