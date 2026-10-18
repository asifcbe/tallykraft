import React, { useState } from 'react';
import { Box, Typography, ButtonBase, InputBase, alpha } from '@mui/material';
import { Coins, Minus, Plus } from 'lucide-react';

import { pointsEarnedOn, loyaltyBalanceAfter } from './loyaltyUtils';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// One segment of the compact choice bar (behaves like a radio button).
const Seg = ({ selected, disabled, onClick, label, title, accent }) => (
  <ButtonBase
    onClick={onClick} disabled={disabled} role="radio" aria-checked={selected} title={title}
    sx={{
      flex: 1, minWidth: 0, px: 0.5, py: 0.35, borderRadius: '6px',
      fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap',
      color: selected ? '#fff' : disabled ? 'text.disabled' : 'text.secondary',
      bgcolor: selected ? accent : 'transparent',
      '&:hover': selected || disabled ? {} : { bgcolor: alpha(accent, 0.1), color: accent },
      '&.Mui-focusVisible': { outline: `2px solid ${alpha(accent, 0.5)}` },
    }}
  >
    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Box>
  </ButtonBase>
);

/**
 * Compact reward-points strip for Sales/POS totals: one summary line
 * (balance + this bill = available), a segmented choice (Save / Use now /
 * Use all / Custom) and a one-line result. Points not used are added to the
 * customer's balance when the bill is saved.
 */
const LoyaltyRedeemNow = ({ loyalty = {}, billAmount, prevPoints = 0, redeemedPoints = 0, onRedeem, accent = '#5c1f22' }) => {
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const programName = loyalty.programName || 'Reward Points';
  const rupeePerPoint = Number(loyalty.rupeePerPoint) || 0;
  const minRedeem = Number(loyalty.minRedeemPoints) || 0;
  const amount = Math.max(0, Number(billAmount) || 0);
  const earned = pointsEarnedOn(amount, loyalty);
  const prev = Math.max(0, Number(prevPoints) || 0);
  if (earned <= 0 && prev <= 0 && redeemedPoints <= 0) return null;

  // Never let points pay more than the bill itself.
  const maxPtsByBill = rupeePerPoint > 0 ? Math.floor(amount / rupeePerPoint) : 0;
  const available = prev + earned;
  const maxUsable = Math.min(available, maxPtsByBill);
  const thisBillPts = Math.min(earned, maxPtsByBill);
  const allPts = maxUsable;
  const valueOf = (pts) => Math.round(pts * rupeePerPoint * 100) / 100;
  const tooFew = (pts) => pts <= 0 || pts < minRedeem;
  const apply = (pts) => onRedeem(pts, valueOf(pts));
  const after = loyaltyBalanceAfter(prev, earned, redeemedPoints);

  const showAll = prev > 0 && allPts > thisBillPts;
  const selected = customMode ? 'custom'
    : redeemedPoints === 0 ? 'save'
    : redeemedPoints === thisBillPts && earned > 0 ? 'bill'
    : redeemedPoints === allPts ? 'all'
    : 'custom';

  const choose = (key) => {
    if (key === 'custom') {
      setCustomMode(true);
      setCustomInput(redeemedPoints > 0 ? String(redeemedPoints) : '');
      return;
    }
    setCustomMode(false);
    if (key === 'save') apply(0);
    if (key === 'bill') apply(thisBillPts);
    if (key === 'all') apply(allPts);
  };

  const customPts = Math.floor(Number(customInput) || 0);
  const customError = customInput === '' ? ''
    : customPts > maxUsable ? `Max ${maxUsable} pts`
    : minRedeem > 0 && customPts > 0 && customPts < minRedeem ? `Min ${minRedeem} pts`
    : '';
  const setCustom = (raw) => {
    const clean = String(raw).replace(/\D/g, '');
    setCustomInput(clean);
    const pts = Math.floor(Number(clean) || 0);
    if (pts === 0) apply(0);
    else if (pts <= maxUsable && !(minRedeem > 0 && pts < minRedeem)) apply(pts);
  };
  const stepCustom = (d) => setCustom(Math.max(0, Math.min(maxUsable, (customPts || 0) + d)));

  const stepBtn = { p: 0.25, borderRadius: '5px', color: 'text.secondary', '&:hover': { bgcolor: alpha(accent, 0.1) } };

  return (
    <Box sx={{ mt: 0.75, px: 1, py: 0.75, borderRadius: '10px', border: `1px solid ${alpha(accent, 0.28)}`, bgcolor: alpha(accent, 0.03) }}>
      {/* Summary line */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <Coins size={13} color={accent} style={{ flexShrink: 0 }} />
        <Typography noWrap sx={{ fontSize: '0.72rem', fontWeight: 800, color: accent }}>
          +{earned} pts
        </Typography>
        <Typography noWrap sx={{ fontSize: '0.68rem', color: 'text.secondary', flex: 1, minWidth: 0 }}
          title={`${programName}: balance ${prev} + this bill ${earned} = ${available} pts`}>
          · {prev} + {earned} = <b>{available}</b> pts{rupeePerPoint > 0 ? ` (${money(valueOf(available))})` : ''}
        </Typography>
      </Box>

      {rupeePerPoint > 0 && (
        <Box role="radiogroup" sx={{ display: 'flex', gap: 0.25, mt: 0.6, p: 0.25, borderRadius: '8px', bgcolor: alpha(accent, 0.07) }}>
          <Seg accent={accent} selected={selected === 'save'} onClick={() => choose('save')}
            label="Save" title={`Save for later — add ${earned} pts to balance`} />
          {earned > 0 && (
            <Seg accent={accent} selected={selected === 'bill'} disabled={tooFew(thisBillPts)} onClick={() => choose('bill')}
              label={`Use ${thisBillPts}`} title={tooFew(thisBillPts) ? `Minimum ${minRedeem} pts` : `Use this bill's ${thisBillPts} pts — ${money(valueOf(thisBillPts))} off`} />
          )}
          {showAll && (
            <Seg accent={accent} selected={selected === 'all'} disabled={tooFew(allPts)} onClick={() => choose('all')}
              label={`All ${allPts}`} title={tooFew(allPts) ? `Minimum ${minRedeem} pts` : `Use all ${allPts} pts — ${money(valueOf(allPts))} off`} />
          )}
          {maxUsable > 1 && (
            <Seg accent={accent} selected={selected === 'custom'} disabled={tooFew(maxUsable)} onClick={() => choose('custom')}
              label="Custom" title={`Choose up to ${maxUsable} pts`} />
          )}
        </Box>
      )}

      {/* Result line (custom stepper inline when Custom is chosen) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, minHeight: 22 }}>
        {rupeePerPoint > 0 && selected === 'custom' && (
          <Box sx={{ display: 'flex', alignItems: 'center', border: '1px solid', borderColor: customError ? 'error.main' : 'divider', borderRadius: '6px', bgcolor: 'background.paper', flexShrink: 0 }}>
            <ButtonBase onClick={() => stepCustom(-1)} disabled={customPts <= 0} aria-label="Fewer points" sx={stepBtn}><Minus size={11} /></ButtonBase>
            <InputBase autoFocus value={customInput} placeholder="0" onChange={(e) => setCustom(e.target.value)}
              inputProps={{ inputMode: 'numeric', 'aria-label': 'Points to use', style: { width: 34, padding: 0, textAlign: 'center', fontSize: '0.72rem', fontWeight: 700 } }} />
            <ButtonBase onClick={() => stepCustom(1)} disabled={customPts >= maxUsable} aria-label="More points" sx={stepBtn}><Plus size={11} /></ButtonBase>
          </Box>
        )}
        <Typography noWrap sx={{ fontSize: '0.66rem', flex: 1, minWidth: 0, color: customError ? 'error.main' : redeemedPoints > 0 ? '#15803d' : 'text.secondary' }}>
          {customError
            ? customError
            : rupeePerPoint <= 0
              ? `Saved to customer · set redeem rate in Settings`
              : redeemedPoints > 0
                ? <><b>{money(valueOf(redeemedPoints))} off</b> · balance after {after} pts</>
                : <>Saved for later · balance after {after} pts</>}
        </Typography>
      </Box>
    </Box>
  );
};

export default LoyaltyRedeemNow;
