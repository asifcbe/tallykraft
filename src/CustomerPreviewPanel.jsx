import React, { useMemo, useState, useEffect } from 'react';
import {
  Box, Typography, Chip, Divider, IconButton, Button, TextField,
  InputAdornment, alpha, Tooltip, Stack,
} from '@mui/material';
import {
  X, Phone, MapPin, Tag, CreditCard, ShoppingBag, Calendar, Coins,
  Banknote, UserRound, ShoppingCart, Building2, Hash, UserCheck,
  MessageCircle, TrendingUp, AlertCircle, CheckCircle2, Package,
} from 'lucide-react';
import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { BRAND } from './theme';

const fmt = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtFull = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';

const teal = BRAND.teal;
const tealDark = BRAND.tealDark;

const SectionLabel = ({ children }) => (
  <Typography sx={{
    fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.09em', color: alpha(teal, 0.7), mb: 0.75,
  }}>
    {children}
  </Typography>
);

const StatBox = ({ label, value, sub, accent, icon: Icon }) => (
  <Box sx={{
    flex: 1, minWidth: 0,
    px: 1, py: 0.9,
    borderRadius: '10px',
    bgcolor: accent ? alpha(accent, 0.08) : alpha('#000', 0.03),
    border: `1px solid ${accent ? alpha(accent, 0.18) : alpha('#000', 0.07)}`,
    textAlign: 'center',
  }}>
    {Icon && <Icon size={13} color={accent || '#888'} style={{ marginBottom: 2 }} />}
    <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: accent || 'text.primary', lineHeight: 1.1 }}>
      {value}
    </Typography>
    <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'text.disabled', mt: 0.2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </Typography>
    {sub && (
      <Typography sx={{ fontSize: '0.62rem', color: accent || 'text.secondary', fontWeight: 600, mt: 0.1 }}>
        {sub}
      </Typography>
    )}
  </Box>
);

const StatusDot = ({ status }) => {
  const map = {
    paid: { color: '#22c55e', label: 'Paid' },
    unpaid: { color: '#f59e0b', label: 'Due' },
    credit: { color: '#f59e0b', label: 'Due' },
    partial: { color: '#3b82f6', label: 'Partial' },
  };
  const s = map[status] || map.paid;
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.4,
      px: 0.6, py: 0.15, borderRadius: '4px',
      bgcolor: alpha(s.color, 0.12),
    }}>
      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.label}</Typography>
    </Box>
  );
};

/**
 * CustomerPreviewPanel
 * Props:
 *   party          — party object
 *   onClose()      — close the panel
 *   onRedeem(pts, val) — called when user redeems loyalty points
 *   redeemedPoints — points already redeemed in current tx
 *   label          — 'Customer' | 'Vendor'
 *   actions        — optional JSX (edit/delete buttons)
 *   itemsBought    — optional, pre-computed [{ itemId, name, qty, orders, amount }],
 *                    sorted by qty desc. Passed in already-aggregated (see
 *                    Parties.jsx's getItemsBoughtByParty) rather than computed
 *                    here, so this component stays a cheap per-party filter
 *                    (as it already was) and doesn't do its own full-table
 *                    item-level scan on every mount from Sales.jsx/POS.jsx,
 *                    which don't pass this prop and don't render the section.
 */
const CustomerPreviewPanel = ({ party, onClose, onRedeem, redeemedPoints = 0, label = 'Customer', actions, itemsBought = [] }) => {
  const { config } = useConfig();
  const { getItems } = useData();
  const isVendor = label === 'Vendor';

  const loyaltyEnabled = !isVendor && !!config.features?.loyalty;
  const loyalty = config.loyalty || {};
  const programName = loyalty.programName || 'Reward Points';
  const minRedeem = Number(loyalty.minRedeemPoints) || 10;
  const rupeePerPoint = Number(loyalty.rupeePerPoint) || 0;

  const sales = useMemo(() => {
    if (!party?.id) return [];
    const store = isVendor ? 'purchases' : 'sales';
    const type = isVendor ? 'Purchase' : 'Sales';
    return getItems(store)
      .filter(tx => tx.partyId === party.id && tx.type === type)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [party?.id, isVendor]); // eslint-disable-line

  const stats = useMemo(() => {
    const total = sales.reduce((s, tx) => s + (Number(tx.totalAmount) || 0), 0);
    const avg = sales.length ? total / sales.length : 0;
    return { total, avg, count: sales.length };
  }, [sales]);

  const pointsBalance = Number(party?.loyaltyPoints) || 0;
  const canRedeem = loyaltyEnabled && pointsBalance >= minRedeem && redeemedPoints === 0;

  const [redeemInput, setRedeemInput] = useState('');
  useEffect(() => {
    if (redeemedPoints === 0) setRedeemInput('');
  }, [redeemedPoints]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!party) return (
    <Box sx={{
      width: '100%', minHeight: 150,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      bgcolor: alpha(teal, 0.02), py: 2.5, px: 2.5, gap: 1.25,
    }}>
      <Box sx={{
        width: 48, height: 48, borderRadius: '50%',
        background: `radial-gradient(circle, ${alpha(teal, 0.1)} 0%, ${alpha(teal, 0.04)} 100%)`,
        border: `2px dashed ${alpha(teal, 0.22)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <UserRound size={20} color={alpha(teal, 0.4)} />
      </Box>
      <Box sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'text.secondary', mb: 0.4 }}>
          No {label.toLowerCase()} selected
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', lineHeight: 1.5 }}>
          Search and select a {label.toLowerCase()} to see their profile and history.
        </Typography>
      </Box>
      <Box sx={{
        px: 1.25, py: 0.6, borderRadius: '100px',
        bgcolor: alpha(teal, 0.07), border: `1px solid ${alpha(teal, 0.16)}`,
        display: 'flex', alignItems: 'center', gap: 0.6,
      }}>
        <ShoppingCart size={12} color={teal} />
        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, color: teal }}>
          Sale treated as Cash &amp; Carry
        </Typography>
      </Box>
    </Box>
  );

  const balance = Number(party.balance) || 0;
  const initials = (party.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const phone = party.phone ? `${party.countryCode || '+91'} ${party.phone}`.trim() : null;
  const waPhone = party.phone ? party.phone.replace(/\D/g, '') : '';

  return (
    <Box sx={{
      width: '100%',
      display: 'flex', flexDirection: 'column',
      bgcolor: 'background.paper',
      overflow: 'hidden',
    }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Box sx={{
        background: '#ffffff', borderBottom: '1px solid #ece2db',
        px: 2, pt: 2, pb: 2.5, position: 'relative',
      }}>
        {onClose && (
          <IconButton size="small" onClick={onClose} sx={{
            position: 'absolute', top: 8, right: 8,
            color: '#57433e',
            '&:hover': { color: '#5c1f22', bgcolor: 'rgba(92,31,34,0.08)' },
          }}>
            <X size={14} />
          </IconButton>
        )}

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {/* Avatar */}
          <Box sx={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(92,31,34,0.1)',
            border: '2px solid #ece2db',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            <Typography sx={{ color: '#5c1f22', fontWeight: 900, fontSize: '1rem', letterSpacing: '-0.02em' }}>
              {initials}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0, flex: 1, pt: 0.25 }}>
            <Typography sx={{ color: '#5c1f22', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2, wordBreak: 'break-word' }}>
              {party.name}
            </Typography>
            {party.partyId && (
              <Typography sx={{ color: '#57433e', fontSize: '0.65rem', fontFamily: 'monospace', mt: 0.2 }}>
                {party.partyId}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 0.6, mt: 0.75, flexWrap: 'wrap' }}>
              {balance !== 0 && (
                // Colored from the business owner's point of view (not the
                // customer/vendor's) to match every other balance display in
                // the app: positive = they owe US, money still to be
                // collected — green/favorable; negative = we owe THEM,
                // money still to be paid out — red. Was inverted (positive
                // shown red, negative shown green), the opposite of
                // PaymentEntry.jsx's Party Balance card and PartySelect's
                // own dropdown balance chip.
                <Box sx={{
                  px: 0.75, py: 0.2, borderRadius: '6px',
                  bgcolor: balance > 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.3)',
                  border: `1px solid ${balance > 0 ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
                  display: 'flex', alignItems: 'center', gap: 0.4,
                }}>
                  {balance > 0
                    ? <CheckCircle2 size={10} color="#86efac" />
                    : <AlertCircle size={10} color="#fca5a5" />}
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: balance > 0 ? '#86efac' : '#fca5a5' }}>
                    {balance > 0 ? `Owes ${fmt(balance)}` : `Credit ${fmt(Math.abs(balance))}`}
                  </Typography>
                </Box>
              )}
              {party.category && (
                <Box sx={{ px: 0.75, py: 0.2, borderRadius: '6px', bgcolor: 'rgba(92,31,34,0.08)', border: '1px solid #ece2db' }}>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#7a2e30' }}>{party.category}</Typography>
                </Box>
              )}
              {party.group && (
                <Box sx={{ px: 0.75, py: 0.2, borderRadius: '6px', bgcolor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{party.group}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* Quick contact row */}
        {phone && (
          <Box sx={{ display: 'flex', gap: 0.6, mt: 1.5 }}>
            <Tooltip title={`Call ${phone}`}>
              <Box
                component="a" href={`tel:${party.phone}`}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  px: 1, py: 0.4, borderRadius: '8px',
                  bgcolor: 'rgba(92,31,34,0.08)', border: '1px solid #ece2db',
                  textDecoration: 'none', cursor: 'pointer',
                  '&:hover': { bgcolor: '#5f4f47' },
                  transition: 'all 0.15s',
                }}
              >
                <Phone size={11} color="#5f4f47" />
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#7a2e30', fontFamily: 'monospace' }}>
                  {party.phone}
                </Typography>
              </Box>
            </Tooltip>
            {waPhone && (
              <Tooltip title="Open WhatsApp">
                <IconButton
                  size="small"
                  component="a"
                  href={`https://wa.me/${waPhone.startsWith('91') && waPhone.length === 12 ? waPhone : waPhone.length === 10 ? `91${waPhone}` : waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: '#25D366', bgcolor: 'rgba(92,31,34,0.08)',
                    border: '1px solid #ece2db',
                    borderRadius: '8px', width: 28, height: 28,
                    '&:hover': { bgcolor: 'rgba(37,211,102,0.2)' },
                  }}
                >
                  <MessageCircle size={13} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>

      {/* Actions slot */}
      {actions && (
        <Box sx={{ px: 1.5, pt: 1.25, pb: 0.25 }}>{actions}</Box>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.75, py: 1.5 }}>

        {/* ── Stats row ── */}
        <Box sx={{ display: 'flex', gap: 0.75, mb: 1.75 }}>
          <StatBox
            label="Orders"
            value={stats.count}
            icon={ShoppingBag}
            accent={teal}
          />
          <StatBox
            label={isVendor ? 'Purchased' : 'Spent'}
            value={stats.count ? fmt(stats.total) : '₹0'}
            sub={stats.count ? `avg ${fmt(stats.avg)}` : null}
            accent={teal}
            icon={Banknote}
          />
        </Box>

        {/* ── Contact details ── */}
        {(party.address || party.additionalAddress || party.gstNumber || party.description) && (
          <>
            <SectionLabel>Contact</SectionLabel>
            <Stack spacing={0.5} sx={{ mb: 1.5 }}>
              {party.address && (
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                  <MapPin size={12} color={alpha(teal, 0.6)} style={{ marginTop: 2, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.4 }}>{party.address}</Typography>
                </Box>
              )}
              {party.additionalAddress && (
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                  <MapPin size={12} color={alpha(teal, 0.6)} style={{ marginTop: 2, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.4 }}>{party.additionalAddress}</Typography>
                </Box>
              )}
              {party.gstNumber && (
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                  <CreditCard size={12} color={alpha(teal, 0.6)} style={{ flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.76rem', fontFamily: 'monospace', color: 'text.secondary' }}>{party.gstNumber}</Typography>
                </Box>
              )}
              {party.description && (
                <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.4, fontStyle: 'italic' }}>{party.description}</Typography>
              )}
            </Stack>
          </>
        )}

        {/* ── Recent transactions ── */}
        {sales.length > 0 && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
              <SectionLabel>Recent {isVendor ? 'Purchases' : 'Invoices'}</SectionLabel>
              <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontWeight: 600 }}>
                {fmtDate(sales[0]?.date)} last
              </Typography>
            </Box>
            <Box sx={{ mb: 1.5 }}>
              {sales.slice(0, 5).map(tx => (
                <Box key={tx.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  py: 0.65, px: 0.5, borderRadius: '8px',
                  '&:not(:last-child)': { borderBottom: `1px solid ${alpha('#000', 0.05)}` },
                  '&:hover': { bgcolor: alpha(teal, 0.04) },
                  transition: 'background 0.12s',
                }}>
                  <Box sx={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    bgcolor: (tx.saleType === 'credit' && tx.status !== 'paid') ? '#f59e0b' : '#22c55e',
                  }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
                      {tx.invoiceNumber}
                    </Typography>
                    <Typography sx={{ fontSize: '0.63rem', color: 'text.disabled' }}>{fmtDate(tx.date)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: teal }}>{fmt(tx.totalAmount)}</Typography>
                    <StatusDot status={tx.saleType === 'credit' && tx.status !== 'paid' ? 'credit' : 'paid'} />
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* ── No history ── */}
        {sales.length === 0 && (
          <Box sx={{
            py: 2, textAlign: 'center',
            bgcolor: alpha('#000', 0.02), borderRadius: '10px',
            border: `1px dashed ${alpha('#000', 0.08)}`, mb: 1.5,
          }}>
            <TrendingUp size={20} color={alpha(teal, 0.3)} />
            <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', mt: 0.5, fontWeight: 500 }}>
              No {isVendor ? 'purchases' : 'sales'} yet
            </Typography>
          </Box>
        )}

        {/* ── Items bought (pre-aggregated by the caller — see itemsBought prop doc) ── */}
        {itemsBought.length > 0 && (
          <>
            <Divider sx={{ my: 1.25, borderColor: alpha(teal, 0.1) }} />
            <SectionLabel>{isVendor ? 'Items Supplied' : 'Items Bought'}</SectionLabel>
            <Box sx={{ mb: 0.5 }}>
              {itemsBought.map((it) => (
                <Box key={it.itemId || it.name} sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  py: 0.55, px: 0.5, borderRadius: '8px',
                  '&:not(:last-child)': { borderBottom: `1px solid ${alpha('#000', 0.05)}` },
                }}>
                  <Package size={12} color={alpha(teal, 0.5)} style={{ flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: 'text.primary', flex: 1, minWidth: 0 }} noWrap>
                    {it.name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: teal, flexShrink: 0 }}>
                    × {it.qty}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* ── Loyalty ── */}
        {loyaltyEnabled && (
          <>
            <Divider sx={{ my: 1.25, borderColor: alpha(teal, 0.1) }} />
            <SectionLabel>{programName}</SectionLabel>

            <Box sx={{
              p: 1.25, borderRadius: '12px', mb: 1,
              background: `linear-gradient(135deg, ${alpha(teal, 0.07)} 0%, ${alpha(BRAND.emerald || teal, 0.05)} 100%)`,
              border: `1px solid ${alpha(teal, 0.15)}`,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '8px',
                    bgcolor: alpha(teal, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Coins size={14} color={teal} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 900, color: teal, lineHeight: 1 }}>
                      {pointsBalance.toLocaleString('en-IN')}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontWeight: 600 }}>pts available</Typography>
                  </Box>
                </Box>
                {rupeePerPoint > 0 && (
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textAlign: 'right' }}>
                    = {fmtFull(pointsBalance * rupeePerPoint)}
                  </Typography>
                )}
              </Box>
              {redeemedPoints > 0 && (
                <Box sx={{
                  mt: 0.75, pt: 0.75, borderTop: `1px dashed ${alpha(teal, 0.2)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'warning.dark' }}>
                    −{redeemedPoints} pts redeemed
                  </Typography>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: 'success.dark' }}>
                    ₹{(redeemedPoints * rupeePerPoint).toFixed(2)} off
                  </Typography>
                </Box>
              )}
            </Box>

            {onRedeem && canRedeem && (
              <Box sx={{ display: 'flex', gap: 0.6, mb: 0.5 }}>
                <TextField
                  size="small" type="number" fullWidth
                  placeholder={`Min ${minRedeem} pts`}
                  value={redeemInput}
                  onChange={e => setRedeemInput(e.target.value.replace(/[^0-9]/g, ''))}
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position="start"><Coins size={12} color={teal} /></InputAdornment>,
                      endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>pts</Typography></InputAdornment>,
                    }
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '9px', fontSize: '0.82rem' } }}
                />
                <Button
                  variant="contained" size="small"
                  disabled={!redeemInput || Number(redeemInput) < minRedeem || Number(redeemInput) > pointsBalance}
                  onClick={() => {
                    const pts = Math.min(Number(redeemInput), pointsBalance);
                    onRedeem(pts, pts * rupeePerPoint);
                  }}
                  sx={{
                    borderRadius: '9px', fontWeight: 700, textTransform: 'none',
                    whiteSpace: 'nowrap', bgcolor: teal, '&:hover': { bgcolor: tealDark },
                    flexShrink: 0, px: 1.5,
                  }}
                >
                  Apply
                </Button>
              </Box>
            )}
            {onRedeem && redeemedPoints > 0 && (
              <Button
                fullWidth variant="outlined" size="small" color="error"
                onClick={() => { onRedeem(0, 0); setRedeemInput(''); }}
                sx={{ borderRadius: '9px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'none' }}
              >
                Cancel redemption
              </Button>
            )}
            {!canRedeem && redeemedPoints === 0 && pointsBalance > 0 && pointsBalance < minRedeem && (
              <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', textAlign: 'center', mt: 0.25 }}>
                {minRedeem - pointsBalance} more pts needed to redeem
              </Typography>
            )}
          </>
        )}

        {/* ── Bank details ── */}
        {(party.bankName || party.accountNumber || party.ifscCode || party.accountHolderName) && (
          <>
            <Divider sx={{ my: 1.25, borderColor: alpha(teal, 0.1) }} />
            <SectionLabel>Bank Details</SectionLabel>
            <Box sx={{
              p: 1.25, borderRadius: '10px',
              bgcolor: alpha('#000', 0.025),
              border: `1px solid ${alpha('#000', 0.07)}`,
            }}>
              <Stack spacing={0.6}>
                {party.bankName && (
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                    <Building2 size={12} color={alpha(teal, 0.6)} style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.76rem', fontWeight: 600 }}>{party.bankName}</Typography>
                  </Box>
                )}
                {party.accountHolderName && (
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                    <UserCheck size={12} color={alpha(teal, 0.6)} style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>{party.accountHolderName}</Typography>
                  </Box>
                )}
                {party.accountNumber && (
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                    <Hash size={12} color={alpha(teal, 0.6)} style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.76rem', fontFamily: 'monospace', color: 'text.secondary', letterSpacing: '0.04em' }}>
                      {party.accountNumber}
                    </Typography>
                  </Box>
                )}
                {party.ifscCode && (
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                    <Hash size={12} color={alpha(teal, 0.6)} style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'text.disabled' }}>
                      IFSC: {party.ifscCode}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>
          </>
        )}

      </Box>
    </Box>
  );
};

export default CustomerPreviewPanel;
