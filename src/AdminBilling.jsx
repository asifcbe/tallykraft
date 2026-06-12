import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, MenuItem, Grid,
  FormControlLabel, Switch, Alert, Divider, ToggleButtonGroup, ToggleButton, Chip,
} from '@mui/material';
import { Save, Receipt, Percent } from 'lucide-react';
import { useBilling, defaultBilling } from './BillingContext';
import { STATE_NAMES, computeGST } from './gstUtils';

// Admin-only: edit the platform's seller GST details, tax rate and inclusive/
// exclusive mode. Writes to globalConfig/billing via BillingContext.
const AdminBilling = () => {
  const { billing, billingLoading, saveBilling } = useBilling();
  const [form, setForm] = useState(defaultBilling);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { if (!billingLoading) setForm({ ...defaultBilling, ...billing }); }, [billing, billingLoading]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveBilling({
        legalName: form.legalName.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        sellerState: form.sellerState,
        address: form.address.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        taxEnabled: !!form.taxEnabled,
        taxRate: Number(form.taxRate) || 0,
        taxInclusive: !!form.taxInclusive,
        invoicePrefix: form.invoicePrefix.trim() || 'SUB',
      });
      setMsg({ type: 'success', text: 'Billing & tax settings saved.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Save failed: ' + (e?.message || e) });
    }
    setSaving(false);
  };

  // Live preview of how ₹299 would be charged under current settings.
  const previewIntra = computeGST({ listPrice: 299, ratePct: form.taxRate, inclusive: form.taxInclusive, customerState: form.sellerState, sellerState: form.sellerState });
  const previewInter = computeGST({ listPrice: 299, ratePct: form.taxRate, inclusive: form.taxInclusive, customerState: '__other__', sellerState: form.sellerState });

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Receipt size={20} /> Billing &amp; Tax
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Your registered GST details and the tax applied to every subscription. The customer&apos;s state decides CGST+SGST (same state) vs IGST (other state / UT).
      </Typography>

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Seller (your) details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Legal business name" value={form.legalName} onChange={(e) => set('legalName', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="GSTIN" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="33ABCDE1234F1Z5" inputProps={{ maxLength: 15 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth size="small" label="State of registration" value={form.sellerState} onChange={(e) => set('sellerState', e.target.value)}>
                {STATE_NAMES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Invoice / receipt prefix" value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} placeholder="SUB" />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth size="small" label="Registered address" value={form.address} onChange={(e) => set('address', e.target.value)} multiline rows={2} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Billing email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Billing phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Tax settings</Typography>
          <FormControlLabel
            control={<Switch checked={form.taxEnabled} onChange={(e) => set('taxEnabled', e.target.checked)} />}
            label="Collect GST on subscriptions"
          />
          <Box sx={{ display: form.taxEnabled ? 'block' : 'none', mt: 1.5 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth size="small" type="number" label="GST rate" value={form.taxRate}
                  onChange={(e) => set('taxRate', e.target.value)}
                  slotProps={{ input: { endAdornment: <Percent size={14} /> }, htmlInput: { min: 0, max: 28, step: 0.5 } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 8 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Price mode</Typography>
                <ToggleButtonGroup
                  exclusive size="small"
                  value={form.taxInclusive ? 'inclusive' : 'exclusive'}
                  onChange={(_e, v) => { if (v) set('taxInclusive', v === 'inclusive'); }}
                >
                  <ToggleButton value="exclusive" sx={{ textTransform: 'none', fontWeight: 600 }}>Exclusive (GST added on top)</ToggleButton>
                  <ToggleButton value="inclusive" sx={{ textTransform: 'none', fontWeight: 600 }}>Inclusive (price has GST)</ToggleButton>
                </ToggleButtonGroup>
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              Preview — how a ₹299 plan is charged ({form.taxInclusive ? 'inclusive' : 'exclusive'} of {form.taxRate}% GST)
            </Typography>
            <Grid container spacing={2} sx={{ mt: 0.25 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Chip size="small" label="Same state (CGST + SGST)" sx={{ mb: 1, fontWeight: 700 }} />
                    <Row k="Taxable value" v={previewIntra.taxable} />
                    <Row k={`CGST (${form.taxRate / 2}%)`} v={previewIntra.cgst} />
                    <Row k={`SGST (${form.taxRate / 2}%)`} v={previewIntra.sgst} />
                    <Row k="Total charged" v={previewIntra.total} bold />
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Chip size="small" label="Other state / UT (IGST)" color="primary" sx={{ mb: 1, fontWeight: 700 }} />
                    <Row k="Taxable value" v={previewInter.taxable} />
                    <Row k={`IGST (${form.taxRate}%)`} v={previewInter.igst} />
                    <Row k="Total charged" v={previewInter.total} bold />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <Button variant="contained" startIcon={<Save size={16} />} onClick={save} disabled={saving} sx={{ fontWeight: 700, textTransform: 'none' }}>
        {saving ? 'Saving…' : 'Save Billing Settings'}
      </Button>
    </Box>
  );
};

const Row = ({ k, v, bold }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: bold ? 800 : 500 }}>{k}</Typography>
    <Typography variant="caption" sx={{ fontWeight: bold ? 800 : 600 }}>₹{(Number(v) || 0).toFixed(2)}</Typography>
  </Box>
);

export default AdminBilling;
