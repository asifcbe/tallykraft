import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Divider, Checkbox, FormControlLabel, Link, alpha, useTheme,
} from '@mui/material';
import { useAuth } from './AuthContext';
import { useBilling } from './BillingContext';
import { STATE_NAMES, computeGST, SAC_CODE } from './gstUtils';
import { BRAND_NAME, PLANS, planById, RAZORPAY_KEY, loadRazorpay } from './planTiers';

// The one checkout for both plans (₹299 / 30 days, ₹2,999 / year), shared by
// SubscriptionPage (subscribe / renew a business) and Settings (pay for a new
// business before it's created).
//
// Always shows a confirmation step first: the chosen plan, the GST breakup
// when GST is on (Admin → Billing & Tax — needs the payer's state), and a
// required "I agree — non-cancellable, non-refundable" checkbox. Only then is
// Razorpay opened, for the exact amount shown.
//
// openCheckout({ planId, businessName, defaultState, onPaid }) — onPaid(planId,
// paymentId, billingMeta) runs after Razorpay reports success; throw from it to
// show an "activation failed" message with the payment reference.
export const usePlanCheckout = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { currentUser } = useAuth();
  const { billing: billingCfg } = useBilling() || {};
  const taxEnabled = !!billingCfg?.taxEnabled;

  const [pending, setPending] = useState(null); // { planId, businessName, onPaid }
  const [custState, setCustState] = useState('');
  const [custGstin, setCustGstin] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const gstFor = (price, state) => computeGST({
    listPrice: price, ratePct: billingCfg?.taxRate, inclusive: billingCfg?.taxInclusive,
    customerState: state, sellerState: billingCfg?.sellerState,
  });

  const pay = useCallback(async ({ planId, businessName, onPaid, gst, state, gstin }) => {
    setError('');
    const plan = planById(planId);
    const loaded = await loadRazorpay();
    if (!loaded) { setError('Could not load the payment gateway. Please check your connection.'); return; }
    if (!RAZORPAY_KEY) { setError('Payment gateway not configured. Contact support.'); return; }
    setPaying(true);
    const total = gst ? gst.total : plan.price;
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY,
      amount: Math.round(total * 100),
      currency: 'INR',
      name: billingCfg?.legalName || BRAND_NAME,
      description: `${BRAND_NAME} ${plan.name} plan — ${plan.period}${businessName ? ` · ${businessName}` : ''}`,
      prefill: { email: currentUser?.email || '', name: currentUser?.displayName || '' },
      notes: { businessName: businessName || '', plan: plan.id, days: String(plan.days), nonRefundable: 'yes' },
      theme: { color: primary },
      modal: { ondismiss: () => setPaying(false) },
      handler: async (response) => {
        const billingMeta = {
          businessName: businessName || null,
          listPrice: plan.price,
          days: plan.days,
          total,
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString(),
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
          await onPaid(plan.id, response.razorpay_payment_id, billingMeta);
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

  const openCheckout = useCallback(({ planId, businessName, defaultState, onPaid }) => {
    setError('');
    setAgreed(false);
    setCustState((prev) => prev || (defaultState && STATE_NAMES.includes(defaultState) ? defaultState : ''));
    setPending({ planId: planById(planId).id, businessName, onPaid });
  }, []);

  const plan = pending ? planById(pending.planId) : PLANS[0];
  const g = pending && taxEnabled && custState ? gstFor(plan.price, custState) : null;
  const canPay = !!pending && agreed && (!taxEnabled || !!custState);

  const checkoutDialog = (
    <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Confirm your plan</DialogTitle>
      <DialogContent>
        {pending?.businessName && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>For <strong>{pending.businessName}</strong></Typography>
        )}

        {/* Plan picker */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          {PLANS.map(p => {
            const on = p.id === plan.id;
            return (
              <Box key={p.id} component="button" type="button" onClick={() => setPending(cur => ({ ...cur, planId: p.id }))}
                sx={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', p: 1.25, borderRadius: 2, textAlign: 'left',
                  border: '1.5px solid', borderColor: on ? primary : 'divider', bgcolor: on ? alpha(primary, 0.05) : 'transparent',
                  '&:focus-visible': { outline: `2px solid ${alpha(primary, 0.5)}`, outlineOffset: 2 } }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: on ? primary : 'text.secondary' }}>
                  {p.name}{p.badge ? ` · ${p.badge}` : ''}
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>₹{p.price.toLocaleString('en-IN')}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{p.period} · per business</Typography>
              </Box>
            );
          })}
        </Box>

        {taxEnabled && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Your state is needed to apply the correct GST. {billingCfg?.taxInclusive ? 'The price includes GST.' : 'GST is added on top.'}
            </Typography>
            <TextField select fullWidth size="small" label="Your state / UT" value={custState}
              onChange={(e) => setCustState(e.target.value)} sx={{ mb: 1.5 }} required>
              {STATE_NAMES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField fullWidth size="small" label="GSTIN (optional — for input credit)" value={custGstin}
              onChange={(e) => setCustGstin(e.target.value.toUpperCase())}
              slotProps={{ htmlInput: { maxLength: 15 } }} sx={{ mb: 1.5 }} />
          </>
        )}

        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.18) }}>
          {billRow(`${plan.name} plan (${plan.period})`, plan.price)}
          {g && (
            <>
              {billRow('Taxable value', g.taxable)}
              {g.intraState ? (
                <>
                  {billRow(`CGST (${g.rate / 2}%)`, g.cgst)}
                  {billRow(`SGST (${g.rate / 2}%)`, g.sgst)}
                </>
              ) : billRow(`IGST (${g.rate}%)`, g.igst)}
            </>
          )}
          <Divider sx={{ my: 0.75 }} />
          {billRow('Total payable', g ? g.total : plan.price, true)}
        </Box>

        <FormControlLabel sx={{ mt: 1.5, alignItems: 'flex-start', mr: 0 }}
          control={<Checkbox size="small" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} sx={{ pt: 0.25 }} />}
          label={(
            <Typography sx={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
              I agree to the <Link href="/terms" target="_blank" rel="noopener">Terms &amp; Conditions</Link> and the{' '}
              <Link href="/refund-policy" target="_blank" rel="noopener">Cancellation &amp; Refund Policy</Link>, and understand that
              this plan <strong>cannot be cancelled or refunded</strong> once paid.
            </Typography>
          )} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setPending(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canPay}
          onClick={() => {
            const p = pending;
            setPending(null);
            pay({ ...p, gst: taxEnabled ? gstFor(planById(p.planId).price, custState) : null, state: custState, gstin: custGstin });
          }}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Pay ₹{(g ? g.total : plan.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
