import React from 'react';
import { Box, TextField, Typography, alpha } from '@mui/material';
import { Banknote, Landmark } from 'lucide-react';

// Shared split payment UI used by Sales, PaymentEntry, POS, and Expenses.
// Props:
//   cash / onCashChange  — cash portion string + setter
//   bank / onBankChange  — bank portion string + setter
//   total                — expected total number (for balance indicator); omit to hide it
//   accentColor          — optional override, defaults to teal
const SplitPaymentInput = ({
  cash, onCashChange,
  bank, onBankChange,
  total,
  accentColor = '#4f46e5',
}) => {
  const cashNum = Number(cash) || 0;
  const bankNum = Number(bank) || 0;
  const entered = cashNum + bankNum;
  const hasTotal = total != null && Number.isFinite(Number(total));
  const totalNum = hasTotal ? Number(total) : 0;
  const diff = entered - totalNum;
  const balanced = Math.abs(diff) < 0.01;

  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: `1.5px dashed ${alpha(accentColor, 0.35)}`, bgcolor: alpha(accentColor, 0.03) }}>
      {/* Cash row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Banknote size={15} color="#16a34a" style={{ flexShrink: 0 }} />
        <Typography variant="caption" sx={{ minWidth: 34, fontWeight: 600, color: 'text.secondary' }}>Cash</Typography>
        <TextField
          fullWidth size="small" type="number" placeholder="0.00"
          value={cash}
          onChange={e => onCashChange(e.target.value)}
          onFocus={e => e.target.select()}
          slotProps={{
            input: { startAdornment: <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary', mr: 0.25 }}>₹</Box> },
            htmlInput: { inputMode: 'decimal', style: { textAlign: 'right', fontWeight: 700 } },
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, fontSize: '0.85rem' } }}
        />
      </Box>

      {/* Bank row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Landmark size={15} color={accentColor} style={{ flexShrink: 0 }} />
        <Typography variant="caption" sx={{ minWidth: 34, fontWeight: 600, color: 'text.secondary' }}>Bank</Typography>
        <TextField
          fullWidth size="small" type="number" placeholder="0.00"
          value={bank}
          onChange={e => onBankChange(e.target.value)}
          onFocus={e => e.target.select()}
          slotProps={{
            input: { startAdornment: <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary', mr: 0.25 }}>₹</Box> },
            htmlInput: { inputMode: 'decimal', style: { textAlign: 'right', fontWeight: 700 } },
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, fontSize: '0.85rem' } }}
        />
      </Box>

      {/* Balance indicator */}
      {entered > 0 && (
        <Box sx={{ mt: 1, pt: 0.75, borderTop: `1px dashed ${alpha(accentColor, 0.2)}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">Total split</Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: (!hasTotal || balanced) ? '#16a34a' : '#dc2626' }}>
            {(!hasTotal || balanced)
              ? `✓ ₹${entered.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : diff > 0
                ? `Over by ₹${diff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `Short by ₹${(-diff).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SplitPaymentInput;
