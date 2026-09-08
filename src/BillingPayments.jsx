import React, { useMemo, useRef, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Chip, Divider, Stack, Tooltip, IconButton, alpha, useTheme,
} from '@mui/material';
import { Receipt, Printer, FileText, Cloud, Lock, ArrowRight } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from './SubscriptionContext';
import { useBusiness } from './BusinessContext';
import { useBilling } from './BillingContext';
import { SAC_CODE } from './gstUtils';

const PLAN_LABEL = {
  monthly: 'Basic (Monthly)', yearly: 'Basic (Yearly)',
  monthly_pro: 'Pro (Monthly)', yearly_pro: 'Pro (Yearly)',
  trial: 'Trial', admin_granted: 'Admin Granted',
};

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return iso; } };

// Printable GST tax-invoice / receipt for one subscription payment.
const Receipt_Template = React.forwardRef(({ payment, billing, business }, ref) => {
  if (!payment) return <div ref={ref} />;
  const intra = (payment.cgst || 0) + (payment.sgst || 0) > 0;
  return (
    <div ref={ref} style={{ width: '210mm', minHeight: '148mm', padding: '18mm 16mm', fontFamily: 'Arial, sans-serif', color: '#111', boxSizing: 'border-box', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{billing?.legalName || 'TallyKraft'}</div>
          {billing?.address && <div style={{ fontSize: 12, color: '#444', maxWidth: 320, marginTop: 4 }}>{billing.address}</div>}
          {billing?.gstin && <div style={{ fontSize: 12, marginTop: 4 }}><b>GSTIN:</b> {billing.gstin}</div>}
          {billing?.sellerState && <div style={{ fontSize: 12 }}><b>State:</b> {billing.sellerState}</div>}
          {billing?.email && <div style={{ fontSize: 12 }}>{billing.email}{billing.phone ? ` · ${billing.phone}` : ''}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>TAX INVOICE</div>
          <div style={{ fontSize: 12, marginTop: 6 }}><b>No:</b> {payment.invoiceNo}</div>
          <div style={{ fontSize: 12 }}><b>Date:</b> {fmtDate(payment.date)}</div>
          {payment.paymentId && <div style={{ fontSize: 11, color: '#666' }}>Pay ref: {payment.paymentId}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#666', fontWeight: 700, textTransform: 'uppercase' }}>Billed To</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{business?.name || 'Customer'}</div>
          {payment.customerState && <div style={{ fontSize: 12 }}>State: {payment.customerState}</div>}
          {payment.customerGstin && <div style={{ fontSize: 12 }}>GSTIN: {payment.customerGstin}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#666', fontWeight: 700, textTransform: 'uppercase' }}>Supply</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>{intra ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}</div>
          <div style={{ fontSize: 12 }}>SAC: {payment.sac || SAC_CODE}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ textAlign: 'left', padding: 8, border: '1px solid #ddd' }}>Description</th>
            <th style={{ textAlign: 'right', padding: 8, border: '1px solid #ddd' }}>Taxable (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 8, border: '1px solid #ddd' }}>
              {PLAN_LABEL[payment.plan] || payment.plan} subscription{business?.name ? ` — ${business.name}` : ''}
            </td>
            <td style={{ padding: 8, border: '1px solid #ddd', textAlign: 'right' }}>{Number(payment.taxable || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <table style={{ fontSize: 12, minWidth: 260 }}>
          <tbody>
            <tr><td style={{ padding: '3px 0', color: '#444' }}>Taxable value</td><td style={{ textAlign: 'right' }}>{money(payment.taxable)}</td></tr>
            {intra ? (
              <>
                <tr><td style={{ padding: '3px 0', color: '#444' }}>CGST ({(payment.rate || 0) / 2}%)</td><td style={{ textAlign: 'right' }}>{money(payment.cgst)}</td></tr>
                <tr><td style={{ padding: '3px 0', color: '#444' }}>SGST ({(payment.rate || 0) / 2}%)</td><td style={{ textAlign: 'right' }}>{money(payment.sgst)}</td></tr>
              </>
            ) : (
              <tr><td style={{ padding: '3px 0', color: '#444' }}>IGST ({payment.rate || 0}%)</td><td style={{ textAlign: 'right' }}>{money(payment.igst)}</td></tr>
            )}
            <tr style={{ borderTop: '1px solid #111', fontWeight: 800 }}>
              <td style={{ padding: '6px 0' }}>Total</td><td style={{ textAlign: 'right' }}>{money(payment.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 28, fontSize: 11, color: '#777', borderTop: '1px solid #eee', paddingTop: 10 }}>
        This is a computer-generated tax invoice. {payment.inclusive ? 'Prices are inclusive of GST.' : 'GST charged in addition to the plan price.'}
      </div>
    </div>
  );
});
Receipt_Template.displayName = 'Receipt_Template';

const BillingPayments = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { businessSubs, getBusinessState, isBusinessProPlan } = useSubscription();
  const { currentBusiness } = useBusiness();
  const { billing } = useBilling();
  const navigate = useNavigate();

  const bId = String(currentBusiness?.id ?? 1);
  const payments = useMemo(() => {
    const list = businessSubs?.[bId]?.payments || [];
    return [...list].reverse(); // newest first
  }, [businessSubs, bId]);

  // Current plan summary (drives the "Change plan" card).
  const isSubscribed = getBusinessState(bId) === 'subscribed';
  const currentIsPro = isBusinessProPlan(bId);
  const currentPlanLabel = PLAN_LABEL[businessSubs?.[bId]?.plan] || (currentIsPro ? 'Pro' : 'Basic');

  const [printPayment, setPrintPayment] = useState(null);
  const printRef = useRef();
  const handlePrint = useReactToPrint({ contentRef: printRef });

  const printReceipt = (p) => {
    setPrintPayment(p);
    setTimeout(() => handlePrint(), 80);
  };

  return (
    <Box>
      {/* Current plan + change-plan entry point */}
      {isSubscribed && (
        <Card variant="outlined" sx={{ borderRadius: 2, mb: 2.5, borderColor: alpha(primary, 0.3), bgcolor: alpha(primary, 0.03) }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ p: 1.1, borderRadius: 1.5, bgcolor: alpha(currentIsPro ? primary : '#64748b', 0.1), color: currentIsPro ? primary : '#334155', display: 'flex', flexShrink: 0 }}>
              {currentIsPro ? <Cloud size={20} /> : <Lock size={20} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
                Current plan
              </Typography>
              <Typography sx={{ fontWeight: 800 }}>{currentPlanLabel}</Typography>
              <Typography variant="caption" color="text.secondary">
                {currentIsPro ? 'Cloud backup & multi-device sync' : 'Data stored on this device only'}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              endIcon={<ArrowRight size={15} />}
              onClick={() => navigate(`/subscribe?bId=${bId}`)}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, flexShrink: 0 }}
            >
              {currentIsPro ? 'Manage plan' : 'Upgrade to Pro'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Your subscription payments for <strong>{currentBusiness?.name || 'this business'}</strong>. Download a GST tax invoice for each.
      </Typography>

      {/* Off-screen printable receipt */}
      <Box sx={{ position: 'absolute', left: -9999, top: 0 }}>
        <Receipt_Template ref={printRef} payment={printPayment} billing={billing} business={currentBusiness} />
      </Box>

      {payments.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 5, color: 'text.secondary' }}>
          <Receipt size={32} style={{ opacity: 0.4 }} />
          <Typography variant="body2">No payments yet for this business.</Typography>
        </Box>
      ) : (
        <Stack spacing={1.25}>
          {payments.map((p, i) => {
            const intra = (p.cgst || 0) + (p.sgst || 0) > 0;
            return (
              <Card key={p.invoiceNo || i} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(primary, 0.08), color: primary, display: 'flex', flexShrink: 0 }}>
                      <FileText size={18} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>{p.invoiceNo}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtDate(p.date)} · {PLAN_LABEL[p.plan] || p.plan}
                      </Typography>
                      <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip size="small" label={intra ? 'CGST + SGST' : 'IGST'} sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }} />
                        {p.customerState && <Chip size="small" variant="outlined" label={p.customerState} sx={{ height: 18, fontSize: '0.62rem' }} />}
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: primary }}>{money(p.total)}</Typography>
                      <Tooltip title="Download / print GST receipt">
                        <IconButton size="small" onClick={() => printReceipt(p)} sx={{ mt: 0.25, color: primary, bgcolor: alpha(primary, 0.08), '&:hover': { bgcolor: alpha(primary, 0.16) } }}>
                          <Printer size={16} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <SmallKV k="Taxable" v={money(p.taxable)} />
                    {intra ? (
                      <>
                        <SmallKV k={`CGST ${(p.rate || 0) / 2}%`} v={money(p.cgst)} />
                        <SmallKV k={`SGST ${(p.rate || 0) / 2}%`} v={money(p.sgst)} />
                      </>
                    ) : (
                      <SmallKV k={`IGST ${p.rate || 0}%`} v={money(p.igst)} />
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};

const SmallKV = ({ k, v }) => (
  <Box>
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</Typography>
    <Typography variant="caption" sx={{ fontWeight: 700 }}>{v}</Typography>
  </Box>
);

export default BillingPayments;
