import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip,
  alpha, useTheme, Divider, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Snackbar, Alert,
} from '@mui/material';
import { Check, Crown, LogOut, Zap, Gift, ShieldCheck, ArrowLeft, Cloud, Lock, Store, CheckCircle2 } from 'lucide-react';
import { useSubscription } from './SubscriptionContext';
import { useAuth } from './AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useBilling } from './BillingContext';
import { STATE_NAMES, computeGST, SAC_CODE } from './gstUtils';
import TallyKraftLogo from './TallyKraftLogo';

const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY || 'rzp_test_SgTH0ctSdvsPBb';

// ── Plan definitions ──────────────────────────────────────────────────────────
// TallyKraft has a single plan tier. Each subscription covers ONE business — to
// run more businesses, subscribe each one separately. All features + cloud
// backup & multi-device sync are always included.
const PLANS = {
  standard: {
    id_monthly: 'monthly_pro',
    id_yearly: 'yearly_pro',
    name: 'TallyKraft',
    tagline: 'All features + cloud backup • for 1 business',
    price_monthly: 299,
    price_yearly: 2999,
    amount_monthly: 29900,
    amount_yearly: 299900,
    yearlyNote: 'Save ₹589 vs monthly',
    isPro: true,
    icon: Cloud,
    highlight: true,
    features: [
      'Covers 1 business',
      'All features unlocked',
      'Invoices, POS, purchases & expenses',
      'GST reports & party ledgers',
      'Online cloud backup & restore',
      'Access & sync from any device',
      'Staff management',
      'WhatsApp bill sharing',
      'Barcode scanning',
      'Custom section builder',
      'Export to Excel & Tally',
      'Priority for new features',
    ],
  },
};

// Per-business pricing shown beneath the plan card.
const MULTI_BUSINESS_NOTE = 'Each subscription covers one business. Need more? Subscribe each additional business separately — e.g. 3 businesses = ₹299 × 3.';

const TRIAL_PERKS = [
  { icon: ShieldCheck, text: 'No credit card required' },
  { icon: Zap, text: 'Full access to all features' },
  { icon: Gift, text: '3 days completely free' },
];

// No auto-renewal note shown under plan cards
const NO_AUTORENEWAL_NOTE = 'No auto-renewal. Your plan stays active until the period ends — then simply pay again whenever you’re ready, or stop anytime.';

const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// ── Billing toggle ────────────────────────────────────────────────────────────
const BillingToggle = ({ billing, onChange, primary, baseRadius }) => (
  <Box sx={{ display: 'inline-flex', border: '1.5px solid', borderColor: 'divider', borderRadius: `${baseRadius + 6}px`, p: 0.4, gap: 0.4, mb: 3 }}>
    {['monthly', 'yearly'].map((b) => (
      <Button
        key={b}
        size="small"
        onClick={() => onChange(b)}
        sx={{
          borderRadius: `${baseRadius + 4}px`,
          textTransform: 'none',
          fontWeight: 700,
          fontSize: '0.8rem',
          px: 2,
          py: 0.5,
          minWidth: 96,
          bgcolor: billing === b ? primary : 'transparent',
          color: billing === b ? 'white' : 'text.secondary',
          '&:hover': { bgcolor: billing === b ? primary : alpha(primary, 0.06) },
        }}
      >
        {b === 'monthly' ? 'Monthly' : 'Yearly'}
        {b === 'yearly' && (
          <Chip label="Save 16%" size="small" sx={{ ml: 0.75, height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: billing === 'yearly' ? alpha('#fff', 0.2) : alpha(primary, 0.1), color: billing === 'yearly' ? 'white' : primary }} />
        )}
      </Button>
    ))}
  </Box>
);

// ── Tier card ────────────────────────────────────────────────────────────────
const TierCard = ({ plan, billing, onSubscribe, paying, primary, primaryDark, baseRadius, isSubscribed }) => {
  const price = billing === 'monthly' ? plan.price_monthly : plan.price_yearly;
  const period = billing === 'monthly' ? '/month' : '/year';
  const planId = billing === 'monthly' ? plan.id_monthly : plan.id_yearly;
  // Effective monthly equivalent when paying yearly — drives the "₹X effective" hint.
  const yearlyMonthly = Math.round(plan.price_yearly / 12);

  // Single plan tier — the card is either the user's current live plan or the
  // one they're about to subscribe to.
  const isCurrentTier = isSubscribed;
  const ctaLabel = isCurrentTier ? 'Current plan' : `Get ${plan.name}`;

  return (
    <Box sx={{ flex: '1 1 290px', maxWidth: 360, position: 'relative' }}>
      {/* Soft glow behind the recommended card for a premium lift */}
      {plan.highlight && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute', inset: -2, borderRadius: `${baseRadius + 16}px`,
            background: `linear-gradient(135deg, ${alpha(primary, 0.5)} 0%, ${alpha(primaryDark, 0.5)} 100%)`,
            filter: 'blur(14px)', opacity: 0.5, zIndex: 0,
          }}
        />
      )}
      <Card
        elevation={0}
        sx={{
          position: 'relative', zIndex: 1, height: '100%',
          border: '1.5px solid',
          borderColor: plan.highlight ? alpha(primary, 0.55) : 'divider',
          borderRadius: `${baseRadius + 14}px`,
          overflow: 'visible',
          background: plan.highlight
            ? `linear-gradient(180deg, ${alpha(primary, 0.05)} 0%, #ffffff 38%)`
            : '#ffffff',
          boxShadow: plan.highlight
            ? `0 20px 50px ${alpha(primary, 0.22)}`
            : '0 4px 18px rgba(63,20,23,0.05)',
          transition: 'transform 0.22s ease, box-shadow 0.22s ease',
          '&:hover': {
            transform: 'translateY(-6px)',
            boxShadow: plan.highlight
              ? `0 28px 60px ${alpha(primary, 0.28)}`
              : `0 16px 38px rgba(63,20,23,0.12)`,
          },
        }}
      >
        {isCurrentTier ? (
          <Chip
            icon={<Check size={12} />}
            label="Current plan"
            size="small"
            sx={{
              position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
              background: '#5c1f22',
              color: 'white', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.02em',
              px: 0.5, boxShadow: `0 6px 16px ${alpha('#6b5550', 0.4)}`,
              '& .MuiChip-icon': { color: 'white' },
            }}
          />
        ) : plan.highlight && (
          <Chip
            icon={<Crown size={12} />}
            label="Most popular"
            size="small"
            sx={{
              position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
              background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
              color: 'white', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.02em',
              px: 0.5, boxShadow: `0 6px 16px ${alpha(primary, 0.4)}`,
              '& .MuiChip-icon': { color: 'white' },
            }}
          />
        )}
        <CardContent sx={{ p: 3.25 }}>
          {/* Plan name + icon badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.75 }}>
            <Box
              sx={{
                width: 38, height: 38, borderRadius: `${baseRadius + 4}px`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: plan.highlight
                  ? `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`
                  : alpha('#3f1417', 0.05),
                boxShadow: plan.highlight ? `0 6px 16px ${alpha(primary, 0.35)}` : 'none',
              }}
            >
              <plan.icon size={18} color={plan.highlight ? '#fff' : '#7a2e30'} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: plan.highlight ? primary : 'text.primary' }}>
                  {plan.name}
                </Typography>
                {plan.privacyBadge && (
                  <Chip label={plan.privacyBadge} size="small" icon={<Lock size={9} />} sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: alpha('#6b5550', 0.1), color: '#5c1f22', border: `1px solid ${alpha('#6b5550', 0.25)}`, '& .MuiChip-icon': { color: '#5c1f22' } }} />
                )}
              </Box>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.25, fontSize: '0.78rem', lineHeight: 1.5 }}>
            {plan.tagline}
          </Typography>

          {/* Price */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
            <Typography sx={{ fontWeight: 900, fontSize: '2.6rem', lineHeight: 1, letterSpacing: '-0.02em', color: plan.highlight ? primary : 'text.primary' }}>
              ₹{price.toLocaleString('en-IN')}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: '0.9rem', fontWeight: 600 }}>{period}</Typography>
          </Box>
          {/* Yearly: show effective monthly + savings; monthly: reserve the space */}
          <Box sx={{ minHeight: 22, mt: 0.6, mb: 2.25, display: 'flex', alignItems: 'center', gap: 1 }}>
            {billing === 'yearly' ? (
              <>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem' }}>
                  ≈ ₹{yearlyMonthly.toLocaleString('en-IN')}/mo
                </Typography>
                <Chip label={plan.yearlyNote} size="small" sx={{ height: 19, fontSize: '0.64rem', fontWeight: 700, bgcolor: alpha('#6b5550', 0.12), color: '#5c1f22' }} />
              </>
            ) : (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.74rem' }}>
                Billed monthly • cancel anytime
              </Typography>
            )}
          </Box>

          {/* CTA button */}
          <Button
            fullWidth
            variant={plan.highlight && !isCurrentTier ? 'contained' : 'outlined'}
            onClick={() => onSubscribe({ id: planId, listPrice: price, label: plan.name, isPro: plan.isPro })}
            disabled={paying !== null || isCurrentTier}
            startIcon={isCurrentTier ? <Check size={15} /> : undefined}
            sx={
              isCurrentTier
                ? {
                    borderRadius: `${baseRadius + 3}px`,
                    fontWeight: 800, textTransform: 'none', py: 1.35, fontSize: '0.95rem',
                    borderWidth: 1.5, borderColor: alpha('#6b5550', 0.5), color: '#5c1f22',
                    bgcolor: alpha('#6b5550', 0.06),
                    '&.Mui-disabled': { borderColor: alpha('#6b5550', 0.4), color: '#5c1f22', opacity: 1 },
                  }
                : plan.highlight
                ? {
                    borderRadius: `${baseRadius + 3}px`,
                    background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
                    boxShadow: `0 8px 20px ${alpha(primary, 0.4)}`,
                    fontWeight: 800, textTransform: 'none', py: 1.35, fontSize: '0.95rem',
                    '&:hover': { opacity: 0.95, boxShadow: `0 10px 26px ${alpha(primary, 0.5)}`, background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)` },
                    '&.Mui-disabled': { opacity: 0.6 },
                  }
                : {
                    borderRadius: `${baseRadius + 3}px`,
                    fontWeight: 800, textTransform: 'none', py: 1.35, fontSize: '0.95rem',
                    borderWidth: 1.5, borderColor: alpha(primary, 0.4), color: primary,
                    '&:hover': { borderWidth: 1.5, borderColor: primary, bgcolor: alpha(primary, 0.05) },
                    '&.Mui-disabled': { opacity: 0.5 },
                  }
            }
          >
            {paying === planId
              ? <><CircularProgress size={14} color="inherit" sx={{ mr: 1 }} />Opening payment…</>
              : ctaLabel}
          </Button>

          <Divider sx={{ my: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em' }}>
              WHAT'S INCLUDED
            </Typography>
          </Divider>

          {/* Feature list */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {plan.features.map((f, i) => (
              <Box key={f} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.1 }}>
                {i === 0 && plan.isPro
                  ? <Typography sx={{ fontSize: '0.82rem', color: 'text.primary', fontWeight: 700, lineHeight: 1.45 }}>{f}</Typography>
                  : (
                    <>
                      <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: plan.highlight ? alpha(primary, 0.14) : alpha('#6b5550', 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.15 }}>
                        <Check size={11} color={plan.highlight ? primary : '#5c1f22'} strokeWidth={3} />
                      </Box>
                      <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'text.primary' }}>{f}</Typography>
                    </>
                  )}
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const SubscriptionPage = ({ businessId: propBusinessId }) => {
  const { activateSubscription, startTrial, getBusinessState, daysLeftForBusiness } = useSubscription();
  const { currentUser, logout } = useAuth();
  const { businesses } = useBusiness();
  const { pushBusinessToCloud } = useData();
  const { billing: billingCfg } = useBilling();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark || primary;
  const baseRadius = Number(theme.shape?.borderRadius) || 8;

  const bId = String(propBusinessId || searchParams.get('bId') || 1);
  const business = businesses?.find(b => String(b.id) === bId);
  const businessName = business?.name;

  const subscriptionState = getBusinessState(bId);
  const daysLeft = daysLeftForBusiness(bId);

  const isNone = subscriptionState === 'none';
  const isActiveTrial = subscriptionState === 'trial';
  const isTrialExpired = subscriptionState === 'trial_expired';
  const isPaidExpired = subscriptionState === 'expired';
  // Has a live paid plan right now (not trial, not expired) — this is the
  // "manage / change plan" case where we must not offer the plan they're on.
  const isSubscribed = subscriptionState === 'subscribed';
  // Single plan tier — no Basic/Pro distinction to compute.

  const [billing, setBilling] = useState('monthly');
  const [paying, setPaying] = useState(null);
  const [starting, setStarting] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState(false);

  // GST billing-details capture before checkout.
  const [gstDialog, setGstDialog] = useState(null); // { planId, listPrice, label, isPro } | null
  const [custState, setCustState] = useState(business?.state && STATE_NAMES.includes(business.state) ? business.state : '');
  const [custGstin, setCustGstin] = useState('');

  const handleStartTrial = async () => {
    setStarting(true);
    try { await startTrial(bId); } catch (e) { console.error(e); }
    setStarting(false);
  };

  // listPrice = the headline plan price in rupees (e.g. 99 / 299 / 999 / 2999).
  const taxEnabled = !!billingCfg?.taxEnabled;

  // Open the GST/checkout flow for a chosen plan (Step 2 entry point).
  const beginCheckout = ({ id, listPrice, label, isPro }) => {
    setPayError('');
    if (taxEnabled) {
      setCustState((prev) => prev || (business?.state && STATE_NAMES.includes(business.state) ? business.state : ''));
      setGstDialog({ planId: id, listPrice, label, isPro });
    } else {
      handleSubscribe({ planId: id, listPrice, label, isPro, gst: null });
    }
  };

  // Clicking the plan → straight to checkout. Single tier: always Pro / cloud.
  const onSubscribe = ({ id, listPrice, label }) => {
    setPayError('');
    beginCheckout({ id, listPrice, label, isPro: true });
  };

  // Step 2: actually open Razorpay with the GST-inclusive total and persist the
  // GST breakup on the subscription so a compliant receipt can be generated.
  const handleSubscribe = async ({ planId, listPrice, label, isPro, gst }) => {
    setPayError('');
    const loaded = await loadRazorpay();
    if (!loaded) { setPayError('Could not load payment gateway. Please check your connection.'); return; }
    if (!RAZORPAY_KEY) { setPayError('Payment gateway not configured. Contact support.'); return; }

    const amountPaise = gst ? gst.amountPaise : Math.round(listPrice * 100);
    setPaying(planId);
    setGstDialog(null);
    const options = {
      key: RAZORPAY_KEY,
      amount: amountPaise,
      currency: 'INR',
      name: billingCfg?.legalName || 'TallyKraft',
      description: `${label} Plan${businessName ? ` — ${businessName}` : ''}`,
      prefill: { email: currentUser?.email || '', name: currentUser?.displayName || '' },
      theme: { color: primary },
      modal: { ondismiss: () => setPaying(null) },
      handler: async (response) => {
        try {
          const billingMeta = gst ? {
            listPrice,
            customerState: custState,
            customerGstin: (custGstin || '').trim().toUpperCase() || null,
            sellerState: billingCfg.sellerState,
            sellerGstin: billingCfg.gstin || null,
            sellerLegalName: billingCfg.legalName || null,
            sac: SAC_CODE,
            rate: gst.rate,
            taxable: gst.taxable,
            cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst,
            taxAmount: gst.taxAmount,
            total: gst.total,
            inclusive: !!billingCfg.taxInclusive,
            invoicePrefix: billingCfg.invoicePrefix || 'SUB',
          } : null;
          await activateSubscription(bId, planId, response.razorpay_payment_id, billingMeta);
          // Every plan is now cloud: seed the full local copy to the cloud
          // immediately so every existing entry is backed up (auto-sync handles
          // edits after). Runs in the background; we don't block the success UI.
          pushBusinessToCloud(bId).catch(() => {});
          setPaying(null);
          setPaySuccess(true);
          // Give the success message a moment, then take the user to their dashboard.
          setTimeout(() => navigate('/'), 1400);
        } catch (err) {
          setPayError('Payment received but we could not activate your plan. Please contact support with reference: ' + response.razorpay_payment_id);
          setPaying(null);
        }
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', () => { setPayError('Payment failed. Please try again.'); setPaying(null); });
    rzp.open();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: { xs: 4, md: 6 },
        px: 2,
        background: `
          radial-gradient(ellipse 80% 50% at 50% -10%, ${alpha(primary, 0.12)} 0%, transparent 60%),
          radial-gradient(circle at 100% 100%, ${alpha(primaryDark, 0.06)} 0%, transparent 45%)
        `,
      }}
    >
      {/* Back to dashboard — shown whenever the user still has app access
          (active trial or a live subscription). Hidden for none/expired states
          where the app is locked and they must pick a plan to continue. */}
      {(isActiveTrial || isSubscribed) && (
        <Box sx={{ width: '100%', maxWidth: 760, mb: 1 }}>
          <Button
            startIcon={<ArrowLeft size={15} />}
            onClick={() => navigate('/')}
            sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 600, fontSize: '0.82rem' }}
          >
            Back to dashboard
          </Button>
        </Box>
      )}

      {/* Logo */}
      <Box sx={{ mb: 3 }}>
        <TallyKraftLogo size={40} variant="wordmark" />
      </Box>

      {/* Business context label */}
      {businessName && (
        <Chip label={businessName} size="small" sx={{ mb: 2, fontWeight: 700, fontSize: '0.78rem' }} variant="outlined" />
      )}

      {/* ── New business — go straight to plans ── */}
      {isNone && (
        <>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.75, textAlign: 'center' }}>
            Choose your plan
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3.5, textAlign: 'center', maxWidth: 440, fontSize: '0.92rem' }}>
            Pick a plan{businessName ? ` for ${businessName}` : ''} — or start with a free trial below.
          </Typography>
        </>
      )}

      {/* ── Active trial — upgrade prompt ── */}
      {isActiveTrial && (
        <>
          <Chip
            icon={<Zap size={13} />}
            label={daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in free trial` : 'Free trial active'}
            sx={{ mb: 1.5, fontWeight: 700, fontSize: '0.78rem', bgcolor: alpha('#f59e0b', 0.12), color: '#b45309', border: `1px solid ${alpha('#f59e0b', 0.3)}`, '& .MuiChip-icon': { color: '#b45309' } }}
          />
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.75, textAlign: 'center' }}>
            Choose a plan to continue
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4, textAlign: 'center', maxWidth: 420, fontSize: '0.92rem' }}>
            Subscribe now to keep full access{businessName ? ` for ${businessName}` : ''} after your trial ends.
          </Typography>
        </>
      )}

      {/* ── Expired — renew prompt ── */}
      {(isTrialExpired || isPaidExpired) && (
        <>
          <Chip
            label={isTrialExpired ? 'Free trial ended' : 'Subscription expired'}
            sx={{ mb: 1.5, fontWeight: 700, fontSize: '0.78rem', bgcolor: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.main, border: `1px solid ${alpha(theme.palette.error.main, 0.25)}` }}
          />
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.75, textAlign: 'center' }}>
            Subscribe to continue editing
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 0.75, textAlign: 'center', maxWidth: 440, fontSize: '0.92rem' }}>
            {isTrialExpired
              ? 'Your 3-day free trial has ended. Subscribe to resume creating and editing.'
              : 'Your subscription has expired. Renew to continue using this business.'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 4, display: 'block', textAlign: 'center' }}>
            You can still view all your data without a subscription.
          </Typography>
        </>
      )}

      {/* ── Subscribed — manage plan ── */}
      {isSubscribed && (
        <>
          <Chip
            icon={<CheckCircle2 size={13} />}
            label={`Plan active${daysLeft !== null ? ` — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : ''}`}
            sx={{ mb: 1.5, fontWeight: 700, fontSize: '0.78rem', bgcolor: alpha('#6b5550', 0.12), color: '#5c1f22', border: `1px solid ${alpha('#6b5550', 0.3)}`, '& .MuiChip-icon': { color: '#5c1f22' } }}
          />
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.75, textAlign: 'center' }}>
            Manage your plan
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4, textAlign: 'center', maxWidth: 460, fontSize: '0.92rem' }}>
            Your subscription is active with cloud backup and multi-device sync. Renew below whenever you’re ready.
          </Typography>
        </>
      )}

      {/* ── Billing toggle + Plan cards ── */}
      <BillingToggle billing={billing} onChange={setBilling} primary={primary} baseRadius={baseRadius} />

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', maxWidth: 760, width: '100%', mb: 2 }}>
        {Object.values(PLANS).map((plan) => (
          <TierCard
            key={plan.name}
            plan={plan}
            billing={billing}
            onSubscribe={onSubscribe}
            paying={paying}
            primary={primary}
            primaryDark={primaryDark}
            baseRadius={baseRadius}
            isSubscribed={isSubscribed}
          />
        ))}
      </Box>

      {payError && (
        <Typography color="error" variant="body2" sx={{ mb: 2, maxWidth: 520, textAlign: 'center', px: 2 }}>
          {payError}
        </Typography>
      )}

      {/* ── Compact "not sure? try free" strip (new business only) ── */}
      {isNone && (
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
            gap: { xs: 1.25, sm: 2 }, mt: 1, mb: 3, px: 2, py: 1.25, maxWidth: 580, width: '100%',
            borderRadius: `${baseRadius + 6}px`, border: '1px dashed', borderColor: alpha(primary, 0.3),
            bgcolor: alpha(primary, 0.03),
          }}
        >
          {/* Perks — small inline text */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: { xs: 1, sm: 1.75 } }}>
            {TRIAL_PERKS.map(({ icon: Icon, text }) => (
              <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Icon size={13} color={primary} />
                <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: 'text.secondary' }}>{text}</Typography>
              </Box>
            ))}
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={handleStartTrial}
            disabled={starting}
            startIcon={starting ? <CircularProgress size={13} color="inherit" /> : <Gift size={14} />}
            sx={{
              borderRadius: `${baseRadius + 3}px`, textTransform: 'none', fontWeight: 700,
              fontSize: '0.78rem', px: 1.75, borderColor: alpha(primary, 0.45), color: primary,
              whiteSpace: 'nowrap',
              '&:hover': { borderColor: primary, bgcolor: alpha(primary, 0.05) },
            }}
          >
            {starting ? 'Starting…' : 'Start free trial'}
          </Button>
        </Box>
      )}

      {/* Per-business pricing notice */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5, maxWidth: 580, p: 1.5, borderRadius: `${baseRadius + 4}px`, bgcolor: alpha(primary, 0.06), border: '1px solid', borderColor: alpha(primary, 0.18) }}>
        <Store size={15} color={primary} style={{ flexShrink: 0, marginTop: 2 }} />
        <Typography variant="caption" sx={{ fontSize: '0.78rem', lineHeight: 1.5, fontWeight: 600, color: 'text.primary' }}>
          {MULTI_BUSINESS_NOTE}
        </Typography>
      </Box>

      {/* No auto-renewal notice */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, maxWidth: 580 }}>
        <ShieldCheck size={14} color="#5c1f22" style={{ flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
          {NO_AUTORENEWAL_NOTE}
        </Typography>
      </Box>

      {/* Plan note */}
      <Box sx={{ maxWidth: 580, width: '100%', mb: 4, p: 2, borderRadius: `${baseRadius + 6}px`, border: '1px solid', borderColor: 'divider', bgcolor: alpha(primary, 0.025) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
          <Cloud size={13} color={primary} />
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.78rem', color: primary }}>Cloud sync + multi-device, all features included</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', fontSize: '0.72rem' }}>
          Every business you subscribe is backed up online and synced across your devices. Your local data is pushed to the cloud automatically when you subscribe.
        </Typography>
      </Box>

      <Divider sx={{ width: '100%', maxWidth: 560, mb: 2 }} />
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, textAlign: 'center' }}>
        Signed in as {currentUser?.email}
      </Typography>
      <Button
        startIcon={<LogOut size={14} />}
        onClick={logout}
        sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 600, fontSize: '0.82rem' }}
      >
        Sign out
      </Button>
      <Typography variant="caption" sx={{ mt: 1, color: 'text.disabled', fontSize: '0.72rem' }}>
        By subscribing you agree to our{' '}
        <Box component="a" href="/privacy" target="_blank" rel="noopener" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          Privacy Policy &amp; No-Refund terms
        </Box>.
      </Typography>

      {/* ── GST billing-details dialog ── */}
      <Dialog open={!!gstDialog} onClose={() => setGstDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Billing details</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            We need your state to apply the correct GST. {billingCfg?.taxInclusive ? 'Prices include GST.' : 'GST is added on top.'}
          </Typography>
          <TextField
            select fullWidth size="small" label="Your state / UT" value={custState}
            onChange={(e) => setCustState(e.target.value)} sx={{ mb: 2 }} required
          >
            {STATE_NAMES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField
            fullWidth size="small" label="GSTIN (optional — for input credit)" value={custGstin}
            onChange={(e) => setCustGstin(e.target.value.toUpperCase())} inputProps={{ maxLength: 15 }} sx={{ mb: 2 }}
          />
          {gstDialog && custState && (() => {
            const g = computeGST({ listPrice: gstDialog.listPrice, ratePct: billingCfg.taxRate, inclusive: billingCfg.taxInclusive, customerState: custState, sellerState: billingCfg.sellerState });
            return (
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.18) }}>
                <BillRow k="Taxable value" v={g.taxable} />
                {g.intraState ? (
                  <>
                    <BillRow k={`CGST (${(g.rate / 2)}%)`} v={g.cgst} />
                    <BillRow k={`SGST (${(g.rate / 2)}%)`} v={g.sgst} />
                  </>
                ) : (
                  <BillRow k={`IGST (${g.rate}%)`} v={g.igst} />
                )}
                <Divider sx={{ my: 0.75 }} />
                <BillRow k="Total payable" v={g.total} bold />
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setGstDialog(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!custState}
            onClick={() => {
              const g = computeGST({ listPrice: gstDialog.listPrice, ratePct: billingCfg.taxRate, inclusive: billingCfg.taxInclusive, customerState: custState, sellerState: billingCfg.sellerState });
              handleSubscribe({ planId: gstDialog.planId, listPrice: gstDialog.listPrice, label: gstDialog.label, isPro: gstDialog.isPro, gst: g });
            }}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Proceed to pay
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Payment success notification ── */}
      <Snackbar
        open={paySuccess}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" icon={<CheckCircle2 size={18} />} sx={{ fontWeight: 700, borderRadius: 2 }}>
          Payment successful! Taking you to your dashboard…
        </Alert>
      </Snackbar>
    </Box>
  );
};

const BillRow = ({ k, v, bold }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: bold ? 800 : 500 }}>{k}</Typography>
    <Typography variant="caption" sx={{ fontWeight: bold ? 800 : 600 }}>₹{(Number(v) || 0).toFixed(2)}</Typography>
  </Box>
);

export default SubscriptionPage;
