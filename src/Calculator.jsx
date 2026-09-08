import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, Stack,
  ToggleButton, ToggleButtonGroup, useTheme, alpha, InputAdornment, Divider, Tooltip,
} from '@mui/material';
import { Calculator as CalcIcon, Percent, Receipt, Tag, Delete } from 'lucide-react';

const money = (n) =>
  `₹${(Number.isFinite(n) ? n : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// ── Result row for the breakdown panels ─────────────────────────────────────
const Row = ({ label, value, bold, color }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', py: 0.6 }}>
    <Typography sx={{ fontSize: bold ? '0.9rem' : '0.82rem', color: bold ? 'text.primary' : 'text.secondary', fontWeight: bold ? 800 : 500 }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: bold ? '1.05rem' : '0.9rem', fontWeight: bold ? 900 : 700, color: color || 'text.primary' }}>
      {value}
    </Typography>
  </Box>
);

// ══ 1. Standard keypad calculator ════════════════════════════════════════════
const StandardCalc = ({ primary }) => {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');

  const evaluate = useCallback((raw) => {
    if (!raw) return '';
    // Only digits, operators, parentheses, % and dot are allowed — then eval safely.
    const clean = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    if (!/^[0-9+\-*/().%\s]*$/.test(clean)) return '';
    try {
      // Treat trailing "n%" as percentage of the preceding value handled inline by JS? No —
      // convert "a%" → "(a/100)" so e.g. 200*5% = 10.
      const pct = clean.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
      // Safe: `clean` is validated above to contain only digits/operators.
      const val = Function(`"use strict"; return (${pct})`)();
      return Number.isFinite(val) ? String(Math.round(val * 1e6) / 1e6) : '';
    } catch { return ''; }
  }, []);

  // All branches use functional updaters so the keyboard listener (registered
  // once) never reads a stale `expr`/`result` from its original closure.
  const press = useCallback((k) => {
    if (k === 'C') { setExpr(''); setResult(''); return; }
    if (k === '⌫') { setExpr((e) => e.slice(0, -1)); setResult(''); return; }
    if (k === '=') { setExpr((e) => { setResult(evaluate(e)); return e; }); return; }
    // Typing after a result starts a fresh expression from that result.
    setResult((r) => { if (r !== '') { setExpr(r + k); return ''; } setExpr((e) => e + k); return r; });
  }, [evaluate]);

  // keyboard support — capture phase so Enter triggers "=" before it can
  // activate whatever keypad button currently has focus (e.g. inside the popup).
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key;
      if (k === 'Enter' || k === '=') {
        e.preventDefault();
        e.stopPropagation();
        press('=');
      } else if (/[0-9]/.test(k) || ['+', '-', '*', '/', '.', '(', ')', '%'].includes(k)) {
        press(k);
      } else if (k === 'Backspace') {
        press('⌫');
      } else if (k === 'Escape') {
        press('C');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [press]);

  const keys = [
    ['C', '(', ')', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['0', '.', '%', '='],
  ];
  const opSet = new Set(['÷', '×', '−', '+']);

  return (
    <Box>
      {/* Display */}
      <Box sx={{ bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.18), borderRadius: 2.5, px: 2, py: 1.75, mb: 2, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', wordBreak: 'break-all', minHeight: 22, fontVariantNumeric: 'tabular-nums' }}>
          {expr || '0'}
        </Typography>
        <Typography sx={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-0.02em', wordBreak: 'break-all', color: result !== '' ? primary : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
          {result !== '' ? `= ${result}` : ' '}
        </Typography>
      </Box>
      {/* Keypad */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
        {keys.flat().map((k) => {
          const isOp = opSet.has(k);
          const isEq = k === '=';
          const isClear = k === 'C';
          return (
            <Button
              key={k}
              onClick={() => press(k)}
              disableElevation
              variant={isEq ? 'contained' : 'outlined'}
              sx={{
                py: 1.6, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2, minWidth: 0,
                ...(isEq && { background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.8)} 100%)` }),
                ...(isClear && { color: '#dc2626', borderColor: alpha('#dc2626', 0.4) }),
                ...(isOp && { color: primary, borderColor: alpha(primary, 0.4), bgcolor: alpha(primary, 0.04) }),
                ...(!isOp && !isEq && !isClear && { color: 'text.primary', borderColor: 'divider' }),
              }}
            >
              {k}
            </Button>
          );
        })}
      </Box>
      <Button fullWidth onClick={() => press('⌫')} startIcon={<Delete size={16} />}
        sx={{ mt: 1, color: 'text.secondary', textTransform: 'none', fontWeight: 600 }}>
        Backspace
      </Button>
    </Box>
  );
};

// ══ 2. GST calculator ════════════════════════════════════════════════════════
const GstCalc = ({ primary }) => {
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('18');
  const [mode, setMode] = useState('exclusive'); // exclusive = add GST, inclusive = extract GST
  const RATES = ['0', '3', '5', '12', '18', '28'];

  const r = useMemo(() => {
    const a = num(amount), pct = num(rate);
    if (!Number.isFinite(a) || !Number.isFinite(pct)) return null;
    if (mode === 'exclusive') {
      const tax = a * (pct / 100);
      return { base: a, tax, total: a + tax };
    }
    const base = a / (1 + pct / 100);
    return { base, tax: a - base, total: a };
  }, [amount, rate, mode]);

  return (
    <Box>
      <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, v) => v && setMode(v)} sx={{ mb: 2 }}>
        <ToggleButton value="exclusive" sx={{ textTransform: 'none', fontWeight: 700 }}>Add GST</ToggleButton>
        <ToggleButton value="inclusive" sx={{ textTransform: 'none', fontWeight: 700 }}>Remove GST</ToggleButton>
      </ToggleButtonGroup>
      <TextField fullWidth size="small" type="number" label={mode === 'exclusive' ? 'Amount (before GST)' : 'Amount (incl. GST)'}
        value={amount} onChange={(e) => setAmount(e.target.value)} sx={{ mb: 2 }}
        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
      <TextField fullWidth size="small" type="number" label="GST rate" value={rate}
        onChange={(e) => setRate(e.target.value)} sx={{ mb: 1.5 }}
        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        {RATES.map((x) => (
          <Button key={x} size="small" variant={rate === x ? 'contained' : 'outlined'} onClick={() => setRate(x)}
            sx={{ minWidth: 44, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>{x}%</Button>
        ))}
      </Stack>
      {r && (
        <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.18) }}>
          <Row label="Taxable value" value={money(r.base)} />
          <Row label={`CGST (${(num(rate) / 2)}%)`} value={money(r.tax / 2)} />
          <Row label={`SGST (${(num(rate) / 2)}%)`} value={money(r.tax / 2)} />
          <Divider sx={{ my: 0.5 }} />
          <Row label="Total GST" value={money(r.tax)} color="#d97706" />
          <Row label="Total amount" value={money(r.total)} bold color={primary} />
        </Box>
      )}
    </Box>
  );
};

// ══ 3. Discount calculator ═══════════════════════════════════════════════════
const DiscountCalc = ({ primary }) => {
  const [price, setPrice] = useState('');
  const [pct, setPct] = useState('');

  const r = useMemo(() => {
    const p = num(price), d = num(pct);
    if (!Number.isFinite(p) || !Number.isFinite(d)) return null;
    const off = p * (d / 100);
    return { off, final: p - off };
  }, [price, pct]);

  return (
    <Box>
      <TextField fullWidth size="small" type="number" label="Original price" value={price}
        onChange={(e) => setPrice(e.target.value)} sx={{ mb: 2 }}
        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
      <TextField fullWidth size="small" type="number" label="Discount" value={pct}
        onChange={(e) => setPct(e.target.value)} sx={{ mb: 2 }}
        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
      {r && (
        <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.18) }}>
          <Row label="You save" value={money(r.off)} color="#16a34a" />
          <Divider sx={{ my: 0.5 }} />
          <Row label="Final price" value={money(r.final)} bold color={primary} />
        </Box>
      )}
    </Box>
  );
};

// ══ 4. Percentage calculator ═════════════════════════════════════════════════
const PercentCalc = ({ primary }) => {
  const [x, setX] = useState('');
  const [y, setY] = useState('');

  const ofVal = useMemo(() => {
    const a = num(x), b = num(y);
    return Number.isFinite(a) && Number.isFinite(b) ? (a / 100) * b : null;
  }, [x, y]);
  const isWhat = useMemo(() => {
    const a = num(x), b = num(y);
    return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b) * 100 : null;
  }, [x, y]);

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField fullWidth size="small" type="number" label="Value A" value={x} onChange={(e) => setX(e.target.value)} />
        <TextField fullWidth size="small" type="number" label="Value B" value={y} onChange={(e) => setY(e.target.value)} />
      </Stack>
      <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.18) }}>
        <Row label="A% of B" value={ofVal != null ? (Math.round(ofVal * 100) / 100).toLocaleString('en-IN') : '—'} color={primary} bold />
        <Divider sx={{ my: 0.5 }} />
        <Row label="A is what % of B" value={isWhat != null ? `${(Math.round(isWhat * 100) / 100).toLocaleString('en-IN')}%` : '—'} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        e.g. A=15, B=200 → 15% of 200 = 30; 15 is 7.5% of 200.
      </Typography>
    </Box>
  );
};

// ── Calculator types ─────────────────────────────────────────────────────────
const TYPES = [
  { key: 'standard', label: 'Standard', icon: CalcIcon,  Comp: StandardCalc },
  { key: 'gst',      label: 'GST',      icon: Receipt,   Comp: GstCalc },
  { key: 'discount', label: 'Discount', icon: Tag,       Comp: DiscountCalc },
  { key: 'percent',  label: 'Percentage', icon: Percent, Comp: PercentCalc },
];

// `embedded` hides the page-style header (used inside the popup, which has its
// own title bar + close button).
const Calculator = ({ embedded = false }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const [type, setType] = useState('standard');

  const active = TYPES.find((t) => t.key === type) || TYPES[0];
  const ActiveComp = active.Comp;

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', pb: embedded ? 0 : 4 }}>
      {/* Header */}
      {!embedded && (
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 2.5, background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.75)} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 16px ${alpha(primary, 0.4)}` }}>
            <CalcIcon size={22} color="#fff" />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.1 }}>Calculator</Typography>
            <Typography variant="caption" color="text.secondary">Pick a calculator type below</Typography>
          </Box>
        </Stack>
      )}

      {/* Type selector — icon-only pills with tooltip labels */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
        {TYPES.map(({ key, label, icon: Icon }) => {
          const sel = key === type;
          return (
            <Tooltip key={key} title={label} placement="bottom">
              <Button
                onClick={() => setType(key)}
                variant={sel ? 'contained' : 'outlined'}
                size="small"
                disableElevation
                sx={{
                  borderRadius: 2, minWidth: 0, flexShrink: 0, px: 1.25, py: 0.75,
                  ...(sel
                    ? { background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.8)} 100%)` }
                    : { color: 'text.secondary', borderColor: 'divider' }),
                }}
              >
                <Icon size={16} />
              </Button>
            </Tooltip>
          );
        })}
      </Box>

      {/* Active calculator */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
          <ActiveComp primary={primary} />
        </CardContent>
      </Card>
    </Box>
  );
};

export default Calculator;
