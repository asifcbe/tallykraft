import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip,
  alpha, useTheme, Divider, CircularProgress,
  Snackbar, Alert,
} from '@mui/material';
import { Check, Crown, LogOut, Zap, Gift, ShieldCheck, ArrowLeft, Cloud, Lock, Store, CheckCircle2 } from 'lucide-react';
import { useSubscription } from './SubscriptionContext';
import { useAuth } from './AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { usePlanCheckout } from './PlanCheckout';
import { BRAND_NAME, TRIAL_DAYS, PLAN_DAYS, PLAN_ID, PLAN_PRICE } from './planTiers';
import BillDhekoLogo from './BillDhekoLogo';

// ── Plan definitions ──────────────────────────────────────────────────────────
// One plan: ₹299 per business for 30 days. Each subscription covers ONE business
// — to run more businesses, subscribe each one separately. All features + cloud
// backup & multi-device sync are always included.
const PLANS = {
  standard: {
    id: PLAN_ID,
    name: BRAND_NAME,
    tagline: 'All features + cloud backup • for 1 business',
    price: PLAN_PRICE,
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
const MULTI_BUSINESS_NOTE = `Each subscription covers one business. Need more? Subscribe each additional business separately — e.g. 3 businesses = ₹${PLAN_PRICE} × 3 every ${PLAN_DAYS} days.`;

const TRIAL_PERKS = [
  { icon: ShieldCheck, text: 'No credit card required' },
  { icon: Zap, text: 'Full access to all features' },
  { icon: Gift, text: `${TRIAL_DAYS} days completely free` },
];

// No auto-renewal note shown under plan cards
const NO_AUTORENEWAL_NOTE = `No auto-renewal. Each payment adds ${PLAN_DAYS} days — paying early adds them on top of the days you have left. Pay again whenever you’re ready, or stop anytime.`;

// ── Tier card ────────────────────────────────────────────────────────────────
const TierCard = ({ plan, onSubscribe, paying, primary, primaryDark, baseRadius, isSubscribed }) => {
  const price = plan.price;
  const period = `/ ${PLAN_DAYS} days`;
  // Single plan — when the business is already subscribed the card renews it
  // (adds another 30 days on top of what's left).
  const isCurrentTier = isSubscribed;
  const ctaLabel = isCurrentTier ? `Renew — add ${PLAN_DAYS} days` : `Pay ₹${price} & continue`;

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
              px: 0.5, boxShadow: `0 6px 16px ${alpha('#57433e', 0.4)}`,
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
                  <Chip label={plan.privacyBadge} size="small" icon={<Lock size={9} />} sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: alpha('#57433e', 0.1), color: '#5c1f22', border: `1px solid ${alpha('#57433e', 0.25)}`, '& .MuiChip-icon': { color: '#5c1f22' } }} />
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
          <Box sx={{ minHeight: 22, mt: 0.6, mb: 2.25, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.74rem' }}>
              Per business · {PLAN_DAYS} days of full access per payment
            </Typography>
          </Box>

          {/* CTA button */}
          <Button
            fullWidth
            variant={plan.highlight && !isCurrentTier ? 'contained' : 'outlined'}
            onClick={() => onSubscribe()}
            disabled={paying}
            startIcon={isCurrentTier ? <Check size={15} /> : undefined}
            sx={
              isCurrentTier
                ? {
                    borderRadius: `${baseRadius + 3}px`,
                    fontWeight: 800, textTransform: 'none', py: 1.35, fontSize: '0.95rem',
                    borderWidth: 1.5, borderColor: alpha('#57433e', 0.5), color: '#5c1f22',
                    bgcolor: alpha('#57433e', 0.06),
                    '&.Mui-disabled': { borderColor: alpha('#57433e', 0.4), color: '#5c1f22', opacity: 1 },
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
            {paying
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
                      <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: plan.highlight ? alpha(primary, 0.14) : alpha('#57433e', 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.15 }}>
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
  const { openCheckout, checkoutDialog, paying, error: payError } = usePlanCheckout();
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

  const [starting, setStarting] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);

  const handleStartTrial = async () => {
    setStarting(true);
    try { await startTrial(bId); } catch (e) { console.error(e); }
    setStarting(false);
  };

  // Pay ₹299 (+ GST if enabled in Admin → Billing & Tax) for 30 days of this
  // business. The shared checkout asks for the payer's state for GST first.
  const onSubscribe = () => openCheckout({
    businessName,
    defaultState: business?.state,
    onPaid: async (paymentId, billingMeta) => {
      await activateSubscription(bId, PLAN_ID, paymentId, billingMeta);
      // Every plan is cloud: seed the full local copy to the cloud now so every
      // existing entry is backed up (auto-sync handles edits after).
      pushBusinessToCloud(bId).catch(() => {});
      setPaySuccess(true);
      setTimeout(() => navigate('/'), 1400);
    },
  });

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
        <BillDhekoLogo size={40} variant="wordmark" />
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
              ? `Your ${TRIAL_DAYS}-day free trial has ended. Pay ₹${PLAN_PRICE} for ${PLAN_DAYS} days to resume creating and editing.`
              : `Your ${PLAN_DAYS}-day plan has ended. Pay ₹${PLAN_PRICE} to renew for another ${PLAN_DAYS} days.`}
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
            sx={{ mb: 1.5, fontWeight: 700, fontSize: '0.78rem', bgcolor: alpha('#57433e', 0.12), color: '#5c1f22', border: `1px solid ${alpha('#57433e', 0.3)}`, '& .MuiChip-icon': { color: '#5c1f22' } }}
          />
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.75, textAlign: 'center' }}>
            Manage your plan
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4, textAlign: 'center', maxWidth: 460, fontSize: '0.92rem' }}>
            Your subscription is active with cloud backup and multi-device sync. Renew below whenever you’re ready.
          </Typography>
        </>
      )}

      {/* ── Plan card ── */}

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', maxWidth: 760, width: '100%', mb: 2 }}>
        {Object.values(PLANS).map((plan) => (
          <TierCard
            key={plan.name}
            plan={plan}
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

      {checkoutDialog}

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

export default SubscriptionPage;
