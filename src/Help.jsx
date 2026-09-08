/* eslint-disable no-unused-vars */
import { useState, useRef } from 'react';
import {
  Box, Typography, Chip, alpha, useTheme, InputAdornment, TextField,
  Tooltip,
} from '@mui/material';
import {
  LayoutDashboard, Users, Package, ShoppingCart,
  ReceiptText, ShoppingBag, DollarSign, Wallet, BarChart2,
  Settings, FileText, Search, ArrowRightLeft, Printer,
  Download, Shield, HelpCircle, Lightbulb, BookOpen,
  CheckCircle2, Sparkles, X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT DATA
// ─────────────────────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'dashboard', icon: LayoutDashboard, color: '#334155', badge: 'Start here',
    title: 'Dashboard',
    summary: 'Your business at a glance — sales, purchases, cash, bank, and recent activity.',
    steps: [
      'Open the app — Dashboard is the first screen you see.',
      'The coloured cards show Total Sales, Purchases, Cash in Hand, Bank Balance, Receivables, and Payables.',
      'The area chart shows Sales vs Purchases for the current financial year.',
      'The activity feed lists your most recent invoices and payments.',
      'All numbers update the moment you record any transaction.',
    ],
    tips: [
      'Tap any metric card to jump straight to that section.',
      'Change the financial year range in Settings → Financial Year.',
    ],
  },
  {
    id: 'parties', icon: Users, color: '#0891b2',
    title: 'Parties',
    summary: 'Store contacts and track outstanding balances for customers & vendors.',
    steps: [
      'Go to Parties from the sidebar.',
      'Customers tab = buyers. Vendors tab = your suppliers.',
      'Tap "Add Customer" — enter name, phone, GST, address, and opening balance.',
      'Edit or delete any record with the pencil or trash icon.',
      'Bulk Add or Import from CSV to add many parties at once.',
      'Export the full party list as Excel.',
    ],
    tips: [
      'Balances update automatically as you record invoices and payments.',
      'Search by name or phone using the search bar at the top.',
    ],
  },
  {
    id: 'items', icon: Package, color: '#7c3aed',
    title: 'Items / Products',
    summary: 'Your product catalogue — prices, stock levels, GST rates, HSN codes.',
    steps: [
      'Go to Items from the sidebar.',
      'Tap "Add Item" — fill in name, unit, sale price, purchase price, opening stock, GST %, and HSN code.',
      'Stock decreases automatically on a sale; increases on a purchase.',
      'Add custom units like "Ream" or "Dozen" in Settings → Items.',
      'Bulk Add to import your full catalogue from Excel in one click.',
    ],
    tips: [
      'Item codes enable barcode scanning — turn on Barcodes in Settings → Features.',
      'Leaving sale price blank will print ₹0 on invoices.',
    ],
  },
  {
    id: 'sales', icon: ReceiptText, color: '#334155',
    title: 'Sales Invoices',
    summary: 'Create, print, and manage all your sales bills.',
    steps: [
      'Go to Sales → tap "New Invoice".',
      'Select a customer (leave blank for a walk-in cash sale).',
      'Add items: choose a product, enter quantity. Price and GST fill automatically.',
      'Apply a discount as % or flat amount in the Discount field.',
      'Choose payment mode: Cash, Bank, UPI, or Split.',
      '"Save & Print" saves the bill and opens the print dialog.',
      'Bulk Print: print all invoices for a date range in one go.',
    ],
    tips: [
      'Press Ctrl+S (Cmd+S on Mac) to save quickly.',
      '"Partial" status means an outstanding balance — record a payment to settle it.',
    ],
  },
  {
    id: 'purchases', icon: ShoppingBag, color: '#dc2626',
    title: 'Purchase Bills',
    summary: 'Record supplier invoices and track what you owe.',
    steps: [
      'Go to Purchases → tap "New Bill".',
      'Select a vendor (your supplier).',
      'Enter the bill date and supplier\'s bill number.',
      'Add items from your catalogue, or type a new item name.',
      'Choose payment mode — Cash, Bank, UPI, or leave as credit.',
      'Stock increases automatically for every purchased item.',
    ],
    tips: [
      'Purchase price updates each time you save a purchase bill.',
      'Staff without "View Purchase Price" permission cannot see purchase costs.',
    ],
  },
  {
    id: 'pos', icon: ShoppingCart, color: '#f59e0b', badge: 'Popular',
    title: 'POS — Point of Sale',
    summary: 'Fast, touch-friendly counter billing for shops and retail.',
    steps: [
      'Go to POS from the sidebar.',
      'Tap any product tile to add it to the cart.',
      'Tap +/− or type in the qty box to change quantity.',
      'Choose payment: Cash, Card, UPI, or Split.',
      'For cash: enter amount received — change to return is shown instantly.',
      'Tap "Complete Sale" to record. A print prompt appears after each sale.',
      'Category chips above the grid filter products by category.',
    ],
    tips: [
      'POS creates a standard invoice visible in the Sales section.',
      'Enable Barcodes in Settings → Features to scan products with the camera.',
    ],
  },
  {
    id: 'payments', icon: DollarSign, color: '#0891b2',
    title: 'Payments',
    summary: 'Record money received or paid without creating a new invoice.',
    steps: [
      'Go to Payments from the sidebar.',
      '"Payment In" — records cash/bank received from a customer.',
      '"Payment Out" — records money paid to a supplier.',
      'Select the party, enter amount, choose payment mode, pick a date.',
      'The party\'s outstanding balance updates immediately.',
    ],
    tips: [
      'For partial payments, enter only the amount received. The invoice shows the remaining balance.',
    ],
  },
  {
    id: 'expenses', icon: FileText, color: '#dc2626',
    title: 'Expenses',
    summary: 'Track all business costs — rent, utilities, salaries, and more.',
    steps: [
      'Go to Expenses from the sidebar.',
      'Tap "Add Expense" — choose a category, enter amount, date, and description.',
      'Choose Cash or Bank/UPI as payment mode.',
      'View or print an expense voucher using the eye icon.',
      'Share a voucher on WhatsApp using the share icon.',
      'Export all expenses to Excel with the Export button.',
    ],
    tips: [
      'Consistent categories like "Rent", "Salary", "Transport" make reports much more useful.',
    ],
  },
  {
    id: 'cash', icon: Wallet, color: '#0891b2',
    title: 'Cash & Bank Book',
    summary: 'Running cash and bank balance, with manual adjustment entries.',
    steps: [
      'Go to Cash from the sidebar.',
      'Cash Book tab: running cash in hand from all cash transactions.',
      '"Cash In" / "Cash Out" for adjustments not tied to a bill.',
      'Bank Book tab: running bank balance from all digital transactions.',
      '"Credit" / "Debit" to record bank deposits, withdrawals, or charges.',
    ],
    tips: [
      'Set opening cash and bank balances in Settings → Business Profile.',
      'Bank Book auto entries come from UPI, Bank, Card, Cheque, NEFT, RTGS.',
    ],
  },
  {
    id: 'reports', icon: BarChart2, color: '#7c3aed',
    title: 'Reports',
    summary: 'P&L, sales, purchases, expenses, party ledger — all in one place.',
    steps: [
      'Go to Reports from the sidebar.',
      'Choose a report type: Sales, Purchases, Expenses, P&L, Party Ledger, etc.',
      'Set From and To dates, filter by party or item.',
      'Tap Print to print on paper, or Share to send as image via WhatsApp.',
    ],
    tips: [
      'P&L = total income minus total expenses for any date range.',
      'Party Ledger shows full history with one customer/vendor with running balance.',
    ],
  },
  {
    id: 'settings', icon: Settings, color: '#64748b',
    title: 'Settings',
    summary: 'Business profile, invoice style, features, language, theme — all configurable.',
    steps: [
      'Go to Settings from the sidebar.',
      'Business Profile: shop name, address, GSTIN, phone, logo, signature.',
      'Features: switch modules on/off — POS, Estimates, Barcodes, Stock Alert.',
      'Invoice: paper size, tax mode, prefix, bill sections.',
      'Language: English, Hindi, Tamil, Telugu, and more.',
    ],
    tips: [
      'Upload your logo in Business Profile — it prints on every invoice.',
      'Enter your GSTIN so it appears on all bills automatically.',
    ],
  },
  {
    id: 'backup', icon: Download, color: '#334155',
    title: 'Backup & Restore',
    summary: 'Keep your data safe — download a backup and restore it any time.',
    steps: [
      'Go to Backup / Restore from the sidebar.',
      'Tap "Download Backup" to save all your data as a file.',
      'Tap "Restore from Backup" and select the file to restore.',
      'Good habit: download a backup once a week.',
    ],
    tips: [
      'Save backup files to Google Drive to protect against device loss or reset.',
    ],
  },
  {
    id: 'print', icon: Printer, color: '#0891b2',
    title: 'Printing & Sharing',
    summary: 'Print invoices, vouchers, and reports — or share them on WhatsApp.',
    steps: [
      'Single invoice: open it from Sales or Purchases, tap the printer icon.',
      'From POS: tap "Complete Sale" → "Print Bill".',
      'Bulk print: in Sales, tap "Bulk Print", choose a date range, tap Print.',
      'Choose paper size (A4, A5, Letter) — auto-scales to fit.',
      'Share on WhatsApp: tap the share icon on any invoice row.',
    ],
    tips: [
      'Set a default paper size in Settings → Invoice to skip the picker every time.',
      'Toggle logo, signature, QR code in Settings → Invoice → Bill Print Options.',
    ],
  },
  {
    id: 'multidevice', icon: ArrowRightLeft, color: '#7c3aed',
    title: 'Multiple Businesses',
    summary: 'Run several businesses, or access one from multiple devices.',
    steps: [
      'Add a second business: Settings → My Businesses → Add Business.',
      'Switch businesses using the switcher at the top of the sidebar.',
      'Each business has its own data, invoices, parties, and subscription.',
      'Invite staff: Settings → Staff Management.',
    ],
    tips: [
      'Staff can be restricted from purchase prices, reports, or settings.',
      'Each business needs its own subscription.',
    ],
  },
];

// Group sections for the overview grid
const GROUPS = [
  { label: 'Get started', ids: ['dashboard', 'settings'] },
  { label: 'Daily transactions', ids: ['sales', 'purchases', 'pos', 'payments', 'expenses'] },
  { label: 'Manage data', ids: ['parties', 'items', 'cash'] },
  { label: 'Reports & tools', ids: ['reports', 'print', 'backup', 'multidevice'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL PANEL  — shown when user clicks a card
// ─────────────────────────────────────────────────────────────────────────────
const DetailPanel = ({ section, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const Icon = section.icon;
  return (
    <Box sx={{
      position: 'fixed',
      inset: 0,
      zIndex: 1300,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        bgcolor: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
      },
    }}
      onClick={onClose}
    >
      <Box
        onClick={e => e.stopPropagation()}
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 680,
          maxHeight: '86vh',
          overflowY: 'auto',
          borderRadius: '24px 24px 0 0',
          bgcolor: isDark ? '#111827' : '#fff',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
          pb: 4,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {/* Drag handle */}
        <Box sx={{
          width: 40, height: 4, borderRadius: 2,
          bgcolor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
          mx: 'auto', mt: 1.5, mb: 0,
        }} />

        {/* Header */}
        <Box sx={{
          px: 3, pt: 2.5, pb: 2,
          background: `linear-gradient(135deg, ${section.color} 0%, ${alpha(section.color, 0.7)} 100%)`,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <Box sx={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
          <Box sx={{ position: 'absolute', bottom: -20, right: 60, width: 60, height: 60, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, position: 'relative' }}>
            <Box sx={{
              width: 48, height: 48, borderRadius: '14px', flexShrink: 0,
              bgcolor: 'rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={24} color="white" strokeWidth={2} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: 'white', lineHeight: 1.2 }}>
                  {section.title}
                </Typography>
                {section.badge && (
                  <Box sx={{ px: 0.9, py: 0.2, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.25)' }}>
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: 'white', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                      {section.badge}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                {section.summary}
              </Typography>
            </Box>
            <Box
              onClick={onClose}
              sx={{
                width: 32, height: 32, borderRadius: '10px', flexShrink: 0,
                bgcolor: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                transition: 'background 0.15s',
              }}
            >
              <X size={16} color="white" />
            </Box>
          </Box>
        </Box>

        {/* Body */}
        <Box sx={{ px: 3, pt: 3 }}>
          {/* Steps */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{
              width: 30, height: 30, borderRadius: '9px',
              bgcolor: alpha(section.color, 0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={15} color={section.color} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: section.color }}>
              Step-by-step guide
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 3 }}>
            {section.steps.map((step, i) => (
              <Box key={i} sx={{
                display: 'flex', gap: 1.5, alignItems: 'flex-start',
                p: '10px 14px',
                borderRadius: '12px',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : alpha(section.color, 0.1),
                bgcolor: isDark ? alpha(section.color, 0.04) : alpha(section.color, 0.025),
              }}>
                <Box sx={{
                  minWidth: 26, height: 26, borderRadius: '8px', flexShrink: 0,
                  background: `linear-gradient(135deg, ${section.color}, ${alpha(section.color, 0.65)})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 6px ${alpha(section.color, 0.3)}`,
                }}>
                  <Typography sx={{ fontSize: '0.67rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>
                    {i + 1}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.65, color: 'text.primary', pt: '1px' }}>
                  {step}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Tips */}
          {section.tips?.length > 0 && (
            <Box sx={{
              p: 2.5, borderRadius: '14px',
              background: isDark
                ? alpha(section.color, 0.1)
                : `linear-gradient(135deg, ${alpha(section.color, 0.08)}, ${alpha(section.color, 0.03)})`,
              border: `1.5px solid ${alpha(section.color, 0.2)}`,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{
                  width: 28, height: 28, borderRadius: '8px',
                  bgcolor: alpha(section.color, isDark ? 0.2 : 0.12),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lightbulb size={14} color={section.color} />
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: section.color }}>
                  Pro tips
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {section.tips.map((tip, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} color={section.color} style={{ marginTop: '2px', flexShrink: 0, opacity: 0.85 }} />
                    <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'text.secondary' }}>
                      {tip}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC CARD  — compact grid card
// ─────────────────────────────────────────────────────────────────────────────
const TopicCard = ({ section, onClick }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const Icon = section.icon;

  return (
    <Box
      onClick={onClick}
      sx={{
        borderRadius: '16px',
        border: '1.5px solid',
        borderColor: isDark ? alpha(section.color, 0.18) : alpha(section.color, 0.15),
        background: isDark
          ? `linear-gradient(160deg, ${alpha(section.color, 0.1)} 0%, ${alpha(section.color, 0.04)} 100%)`
          : `linear-gradient(160deg, ${alpha(section.color, 0.06)} 0%, ${alpha(section.color, 0.02)} 100%)`,
        cursor: 'pointer',
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: `0 12px 32px ${alpha(section.color, 0.2)}`,
          borderColor: alpha(section.color, 0.4),
          background: isDark
            ? `linear-gradient(160deg, ${alpha(section.color, 0.16)} 0%, ${alpha(section.color, 0.07)} 100%)`
            : `linear-gradient(160deg, ${alpha(section.color, 0.1)} 0%, ${alpha(section.color, 0.04)} 100%)`,
        },
      }}
    >
      {/* Icon + badge row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{
          width: 44, height: 44, borderRadius: '13px',
          background: `linear-gradient(135deg, ${section.color}, ${alpha(section.color, 0.7)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 14px ${alpha(section.color, 0.35)}`,
          flexShrink: 0,
        }}>
          <Icon size={22} color="white" strokeWidth={2} />
        </Box>
        {section.badge ? (
          <Box sx={{
            px: 0.9, py: 0.3, borderRadius: '6px',
            bgcolor: alpha(section.color, isDark ? 0.2 : 0.1),
            border: `1px solid ${alpha(section.color, 0.25)}`,
          }}>
            <Typography sx={{
              fontSize: '0.6rem', fontWeight: 800, color: section.color,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              {section.badge}
            </Typography>
          </Box>
        ) : (
          <Box sx={{
            px: 0.9, py: 0.3, borderRadius: '6px',
            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.disabled' }}>
              {section.steps.length} steps
            </Typography>
          </Box>
        )}
      </Box>

      {/* Title + summary */}
      <Box>
        <Typography sx={{
          fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3, mb: 0.5,
          color: 'text.primary',
        }}>
          {section.title}
        </Typography>
        <Typography sx={{
          fontSize: '0.8rem', lineHeight: 1.5, color: 'text.secondary',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {section.summary}
        </Typography>
      </Box>

      {/* Preview steps — first 3 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {section.steps.slice(0, 3).map((step, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{
              width: 18, height: 18, borderRadius: '5px', flexShrink: 0,
              bgcolor: alpha(section.color, isDark ? 0.2 : 0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: section.color, lineHeight: 1 }}>
                {i + 1}
              </Typography>
            </Box>
            <Typography sx={{
              fontSize: '0.75rem', lineHeight: 1.5, color: 'text.secondary',
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {step}
            </Typography>
          </Box>
        ))}
        {section.steps.length > 3 && (
          <Typography sx={{
            fontSize: '0.72rem', color: section.color, fontWeight: 600, mt: 0.25,
            pl: '26px',
          }}>
            +{section.steps.length - 3} more steps →
          </Typography>
        )}
      </Box>
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
const Help = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const filtered = search.trim()
    ? SECTIONS.filter(s => {
        const q = search.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.steps.some(st => st.toLowerCase().includes(q)) ||
          s.tips?.some(t => t.toLowerCase().includes(q))
        );
      })
    : null;

  const totalSteps = SECTIONS.reduce((a, s) => a + s.steps.length, 0);

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', pb: 6 }}>

      {/* ── Hero ── */}
      <Box sx={{
        borderRadius: '20px',
        mb: 3,
        overflow: 'hidden',
        position: 'relative',
        background: `linear-gradient(135deg, ${primary} 0%, ${alpha(primary, 0.75)} 100%)`,
        boxShadow: `0 12px 40px ${alpha(primary, 0.3)}`,
        px: { xs: 2.5, sm: 4 },
        pt: { xs: 3, sm: 3.5 },
        pb: { xs: 3, sm: 3.5 },
      }}>
        <Box sx={{ position: 'absolute', top: -50, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -30, right: 80, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2.5, position: 'relative' }}>
          <Box sx={{
            p: 1.5, borderRadius: '14px', bgcolor: 'rgba(255,255,255,0.2)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            display: 'flex', flexShrink: 0,
          }}>
            <HelpCircle size={28} color="white" strokeWidth={2} />
          </Box>
          <Box>
            <Typography sx={{
              fontWeight: 900, color: 'white', lineHeight: 1.15, mb: 0.5,
              fontSize: { xs: '1.5rem', sm: '1.85rem' },
              letterSpacing: '-0.01em',
            }}>
              Help &amp; Guide
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: 1.55, maxWidth: 500 }}>
              Everything you need to know — step-by-step, in plain language. No accounting knowledge needed.
            </Typography>
          </Box>
        </Box>

        {/* Stats */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5, position: 'relative' }}>
          {[
            { icon: BookOpen, label: `${SECTIONS.length} topics` },
            { icon: CheckCircle2, label: `${totalSteps} steps` },
            { icon: Sparkles, label: 'Plain language' },
          ].map(({ icon: I, label }, i) => (
            <Box key={i} sx={{
              display: 'flex', alignItems: 'center', gap: 0.7,
              px: 1.5, py: 0.6, borderRadius: '10px',
              bgcolor: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.24)',
            }}>
              <I size={13} color="rgba(255,255,255,0.9)" />
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search topics — e.g. invoice, backup, POS, split payment…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} color="rgba(255,255,255,0.6)" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <Box
                    onClick={() => setSearch('')}
                    sx={{
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      p: 0.5, borderRadius: 1,
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
                    }}
                  >
                    <X size={14} color="rgba(255,255,255,0.7)" />
                  </Box>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: isDark ? 'rgba(15,23,42,0.6)' : 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(16px)',
              borderRadius: '14px',
              color: 'white',
              fontSize: '0.9rem',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              '& fieldset': { borderColor: 'rgba(255,255,255,0.28)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
              '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.7)', borderWidth: '1.5px' },
            },
            '& input::placeholder': { color: 'rgba(255,255,255,0.5)', fontSize: '0.86rem' },
            '& input': { color: 'white', py: '11px' },
          }}
        />
      </Box>

      {/* ── Search results ── */}
      {filtered && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: 0.5 }}>
            <Search size={13} color={primary} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              {filtered.length === 0
                ? 'No topics found — try a different keyword.'
                : `${filtered.length} topic${filtered.length > 1 ? 's' : ''} matched "${search}"`}
            </Typography>
          </Box>
          {filtered.length > 0 && (
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
              mb: 4,
            }}>
              {filtered.map(s => (
                <TopicCard key={s.id} section={s} onClick={() => setSelected(s)} />
              ))}
            </Box>
          )}
          {filtered.length === 0 && (
            <Box sx={{
              textAlign: 'center', py: 8,
              borderRadius: '16px', border: '1.5px dashed',
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#fafbfc',
            }}>
              <Box sx={{
                width: 60, height: 60, borderRadius: '16px', bgcolor: alpha(primary, 0.08),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mx: 'auto', mb: 2,
              }}>
                <HelpCircle size={28} color={alpha(primary, 0.4)} />
              </Box>
              <Typography sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>
                No topics matched your search.
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                Try: "invoice", "payment", "stock", "backup", "POS", "report"
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* ── Grouped grid (no search) ── */}
      {!filtered && GROUPS.map(group => {
        const groupSections = group.ids.map(id => SECTIONS.find(s => s.id === id)).filter(Boolean);
        return (
          <Box key={group.label} sx={{ mb: 4 }}>
            {/* Group heading */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, mb: 2,
            }}>
              <Box sx={{
                height: '1px', flex: 1,
                background: isDark
                  ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1))'
                  : 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08))',
              }} />
              <Typography sx={{
                fontSize: '0.72rem', fontWeight: 800,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'text.disabled',
                whiteSpace: 'nowrap',
              }}>
                {group.label}
              </Typography>
              <Box sx={{
                height: '1px', flex: 1,
                background: isDark
                  ? 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)'
                  : 'linear-gradient(90deg, rgba(0,0,0,0.08), transparent)',
              }} />
            </Box>

            {/* Cards */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}>
              {groupSections.map(s => (
                <TopicCard key={s.id} section={s} onClick={() => setSelected(s)} />
              ))}
            </Box>
          </Box>
        );
      })}

      {/* ── Bottom CTA ── */}
      {!filtered && (
        <Box sx={{
          mt: 2, p: 2.5, borderRadius: '16px',
          background: isDark
            ? `linear-gradient(135deg, ${alpha(primary, 0.12)}, ${alpha(primary, 0.05)})`
            : `linear-gradient(135deg, ${alpha(primary, 0.07)}, ${alpha(primary, 0.03)})`,
          border: `1.5px solid ${alpha(primary, 0.15)}`,
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '12px', flexShrink: 0,
            bgcolor: alpha(primary, 0.1),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={20} color={primary} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.25 }}>
              Need more help?
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>
              Tap any card above to read the full step-by-step guide. Use the search bar to find specific features quickly.
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Detail bottom sheet ── */}
      {selected && (
        <DetailPanel section={selected} onClose={() => setSelected(null)} />
      )}
    </Box>
  );
};

export default Help;
