import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Divider, alpha, useTheme,
} from '@mui/material';
import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { STATE_NAMES, computeGST, SAC_CODE } from './gstUtils';
import {
  BRAND_NAME, PLAN_ID, PLAN_PRICE, PLAN_DAYS, RAZORPAY_KEY, loadRazorpay,
} from './planTiers';

// One checkout for the single plan (₹299 per business for 30 days), shared by
// SubscriptionPage (subscribe / renew a business) and Settings (pay for a new
// business before it's created). Asks for the payer's state first when GST is
// on (Admin → Billing & Tax) so the right CGST+SGST / IGST split is charged and
// stored on the receipt, then opens Razorpay.
//
// openCheckout({ businessName, defaultState, onPaid }) — onPaid(paymentId,
// billingMeta) runs after Razorpay reports success; throw from it to show an
// "activation failed" message with the payment reference.
export const usePlanCheckout = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { currentUser } = useAuth();
  const { billing: billingCfg } = useBilling() || {};
  const taxEnabled = !!billingCfg?.taxEnabled;

  const [pending, setPending] = useState(null); // { businessName, onPaid } awaiting GST details
  const [custState, setCustState] = useState('');
  const [custGstin, setCustGstin] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const gstFor = (state) => computeGST({
    listPrice: PLAN_PRICE, ratePct: billingCfg?.taxRate, inclusive: billingCfg?.taxInclusive,
    customerState: state, sellerState: billingCfg?.sellerState,
  });

  const pay = useCallback(async ({ businessName, onPaid, gst, state, gstin }) => {
    setError('');
    const loaded = await loadRazorpay();
    if (!loaded) { setError('Could not load the payment gateway. Please check your connection.'); return; }
    if (!RAZORPAY_KEY) { setError('Payment gateway not configured. Contact support.'); return; }
    setPaying(true);
    const amountPaise = gst ? Math.round(gst.total * 100) : PLAN_PRICE * 100;
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY,
      amount: amountPaise,
      currency: 'INR',
      name: billingCfg?.legalName || BRAND_NAME,
      description: `${BRAND_NAME} — ${PLAN_DAYS} days${businessName ? ` · ${businessName}` : ''}`,
      prefill: { email: currentUser?.email || '', name: currentUser?.displayName || '' },
      notes: { businessName: businessName || '', plan: PLAN_ID, days: String(PLAN_DAYS) },
      theme: { color: primary },
      modal: { ondismiss: () => setPaying(false) },
      handler: async (response) => {
        const billingMeta = {
          businessName: businessName || null,
          listPrice: PLAN_PRICE,
          days: PLAN_DAYS,
          total: gst ? gst.total : PLAN_PRICE,
          ...(gst ? {
            customerState: state,
            customerGstin: (gstin || '').trim().toUpperCase() || null,
            sellerState: billingCfg.sellerState,
            sellerGstin: billingCfg.gstin || null,
            sellerLegalName: billingCfg.legalName || null,
            sac: SAC_CODE,
            rate: gst.rate,
            taxable: gst.taxable,
            cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst,
            taxAmount: gst.taxAmount,
            inclusive: !!billingCfg.taxInclusive,
            invoicePrefix: billingCfg.invoicePrefix || 'SUB',
          } : {}),
        };
        try {
          await onPaid(response.razorpay_payment_id, billingMeta);
        } catch (e) {
          console.error('[PlanCheckout] activation failed:', e);
          setError('Payment received but activation failed. Please contact support with reference: ' + response.razorpay_payment_id);
        }
        setPaying(false);
      },
    });
    rzp.on('payment.failed', () => { setError('Payment failed. Please try again.'); setPaying(false); });
    rzp.open();
  }, [billingCfg, currentUser?.email, currentUser?.displayName, primary]);

  const openCheckout = useCallback(({ businessName, defaultState, onPaid }) => {
    setError('');
    if (taxEnabled) {
      setCustState((prev) => prev || (defaultState && STATE_NAMES.includes(defaultState) ? defaultState : ''));
      setPending({ businessName, onPaid });
    } else {
      pay({ businessName, onPaid, gst: null });
    }
  }, [taxEnabled, pay]);

  const g = pending && custState ? gstFor(custState) : null;
  const checkoutDialog = (
    <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Billing details</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          We need your state to apply the correct GST. {billingCfg?.taxInclusive ? 'The price includes GST.' : 'GST is added on top.'}
        </Typography>
        <TextField select fullWidth size="small" label="Your state / UT" value={custState}
          onChange={(e) => setCustState(e.target.value)} sx={{ mb: 2 }} required>
          {STATE_NAMES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField fullWidth size="small" label="GSTIN (optional — for input credit)" value={custGstin}
          onChange={(e) => setCustGstin(e.target.value.toUpperCase())}
          slotProps={{ htmlInput: { maxLength: 15 } }} sx={{ mb: 2 }} />
        {g && (
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.18) }}>
            {billRow(`Plan (${PLAN_DAYS} days)`, PLAN_PRICE)}
            {billRow('Taxable value', g.taxable)}
            {g.intraState ? (
              <>
                {billRow(`CGST (${g.rate / 2}%)`, g.cgst)}
                {billRow(`SGST (${g.rate / 2}%)`, g.sgst)}
              </>
            ) : billRow(`IGST (${g.rate}%)`, g.igst)}
            <Divider sx={{ my: 0.75 }} />
            {billRow('Total payable', g.total, true)}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setPending(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button variant="contained" disabled={!custState} sx={{ textTransform: 'none', fontWeight: 700 }}
          onClick={() => {
            const p = pending;
            setPending(null);
            pay({ ...p, gst: gstFor(custState), state: custState, gstin: custGstin });
          }}>
          Proceed to pay
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { openCheckout, checkoutDialog, paying, error, setError };
};

const billRow = (k, v, bold) => (
  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: bold ? 800 : 500 }}>{k}</Typography>
    <Typography variant="caption" sx={{ fontWeight: bold ? 800 : 600 }}>₹{(Number(v) || 0).toFixed(2)}</Typography>
  </Box>
);
