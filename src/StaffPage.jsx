import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Avatar,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel, alpha,
  Tabs, Tab, Tooltip, Stack, Divider, Badge, Paper, useTheme,
  InputAdornment, ToggleButton, ToggleButtonGroup, Switch, FormControlLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import {
  Plus, Edit2, Trash2, Users, Clock, DollarSign, ChevronLeft,
  ChevronRight, Check, X, Phone, Mail, Calendar, Briefcase,
  TrendingUp, UserCheck, UserX, AlertCircle, Search, MoreVertical,
  RotateCcw, Printer,
} from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useAuth } from './AuthContext';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { firestore } from './db';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useBusinessAuthDoc, resolveBizDocId } from './businessCode';
import { resolveMaxStaff, DEFAULT_MAX_STAFF } from './businessLimits';
import { STAFF_FEATURE_GROUPS, STAFF_FEATURE_KEYS, STAFF_FEATURE_LABELS, defaultStaffFeatures, isModuleOffForBusiness } from './staffPermissions';
import { useConfig } from './ConfigContext';

const DAYS_IN_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ATTENDANCE_STATUS = {
  present:  { label: 'P',  color: '#22c55e', bg: '#dcfce7', title: 'Present' },
  absent:   { label: 'A',  color: '#ef4444', bg: '#fee2e2', title: 'Absent' },
  halfDay:  { label: 'H',  color: '#f59e0b', bg: '#fef3c7', title: 'Half Day' },
  leave:    { label: 'L',  color: '#8b5cf6', bg: '#ede9fe', title: 'Leave' },
};
const STATUS_CYCLE = ['present', 'absent', 'halfDay', 'leave', null];

const SALARY_TYPES = ['monthly', 'daily', 'hourly'];
const ROLES = ['Manager', 'Cashier', 'Sales Staff', 'Delivery', 'Accountant', 'Helper', 'Security', 'Other'];

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);

const roleColor = (role) => {
  const map = { Manager: '#111111', Cashier: '#5c1f22', 'Sales Staff': '#22c55e', Delivery: '#f59e0b', Accountant: '#8b5cf6', Helper: '#57433e', Security: '#ef4444', Other: '#57433e' };
  return map[role] || '#111111';
};

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

// ── Salary rules ─────────────────────────────────────────────────────────────
// Per staff member (all optional — blank keeps the default):
//   halfDayRate     ₹ paid for a half day          (default: half the full-day rate)
//   leaveDeduction  ₹ deducted per leave day       (default: 0)
//   absentDeduction ₹ deducted per absent day      (default: 0 — absent days are
//                                                   already unpaid; this is extra)
// Full-day rate = the salary itself for a daily wage, or salary ÷ days in the
// month for a monthly salary. Leave days are paid as a full day for monthly
// staff (paid leave) and unpaid for daily-wage staff, before any deduction.
const optNum = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const salaryBreakdown = (member, att, dim) => {
  const type = member?.salaryType || 'monthly';
  const base = Number(member?.salary) || 0;
  if (type === 'hourly') return { total: base, lines: [{ label: 'Wage', amount: base }], fullRate: base, halfRate: null };
  const a = { present: 0, halfDay: 0, leave: 0, absent: 0, ...(att || {}) };
  const fullRate = type === 'daily' ? base : (dim ? base / dim : 0);
  const halfRate = optNum(member?.halfDayRate) ?? fullRate / 2;
  const leavePay = type === 'monthly' ? fullRate : 0;
  const leaveDed = optNum(member?.leaveDeduction) ?? 0;
  const absentDed = optNum(member?.absentDeduction) ?? 0;
  // A month with no worked/paid-leave entries earns nothing (no auto "due").
  if (a.present + a.halfDay + a.leave <= 0) return { total: 0, lines: [], fullRate, halfRate };
  const r = (n) => Math.round(n * 100) / 100;
  const lines = [];
  if (a.present) lines.push({ label: `Full days — ${a.present} × ₹${fmt(r(fullRate))}`, amount: a.present * fullRate });
  if (a.halfDay) lines.push({ label: `Half days — ${a.halfDay} × ₹${fmt(r(halfRate))}`, amount: a.halfDay * halfRate });
  if (a.leave && leavePay) lines.push({ label: `Paid leave — ${a.leave} × ₹${fmt(r(leavePay))}`, amount: a.leave * leavePay });
  if (a.leave && leaveDed) lines.push({ label: `Leave deduction — ${a.leave} × ₹${fmt(leaveDed)}`, amount: -a.leave * leaveDed });
  if (a.absent && absentDed) lines.push({ label: `Absent deduction — ${a.absent} × ₹${fmt(absentDed)}`, amount: -a.absent * absentDed });
  const total = Math.max(0, Math.round(lines.reduce((s2, l) => s2 + l.amount, 0)));
  return { total, lines, fullRate, halfRate };
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Printable payslip ───────────────────────────────────────────────────────
// Plain inline-styled markup so it prints cleanly via react-to-print with no
// MUI/theme dependency.
const PayslipTemplate = React.forwardRef(({ data }, ref) => {
  if (!data) return <div ref={ref} />;
  const { business, member, year, month, att, dim, earned, paidTotal, balance, payments, dues } = data;
  const label = { fontSize: 12, color: '#555' };
  const val = { fontSize: 12, fontWeight: 700, color: '#111', textAlign: 'right' };
  const th = { fontSize: 11, textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #333', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#444' };
  const td = { fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #eee' };
  const workedDays = att.present + att.halfDay * 0.5 + att.leave;
  return (
    <div ref={ref} style={{ width: '190mm', padding: '14mm', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{business?.name || 'Business'}</div>
          {business?.address && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{business.address}</div>}
          {business?.phone && <div style={{ fontSize: 11, color: '#555' }}>Ph: {business.phone}</div>}
          {business?.gstNumber && <div style={{ fontSize: 11, color: '#555' }}>GSTIN: {business.gstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.06em' }}>PAYSLIP</div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{MONTH_NAMES[month]} {year}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{ ...label, padding: '3px 0', width: '25%' }}>Employee</td>
            <td style={{ ...val, textAlign: 'left', padding: '3px 0', width: '25%' }}>{member.name}</td>
            <td style={{ ...label, padding: '3px 0', width: '25%' }}>Role</td>
            <td style={{ ...val, textAlign: 'left', padding: '3px 0', width: '25%' }}>{member.role || '—'}</td>
          </tr>
          <tr>
            <td style={{ ...label, padding: '3px 0' }}>Wage type</td>
            <td style={{ ...val, textAlign: 'left', padding: '3px 0', textTransform: 'capitalize' }}>{member.salaryType || 'monthly'}</td>
            <td style={{ ...label, padding: '3px 0' }}>
              {member.salaryType === 'daily' ? 'Rate / day' : member.salaryType === 'hourly' ? 'Rate / hr' : 'Monthly salary'}
            </td>
            <td style={{ ...val, textAlign: 'left', padding: '3px 0' }}>₹{fmt(member.salary)}</td>
          </tr>
          {member.phone && (
            <tr>
              <td style={{ ...label, padding: '3px 0' }}>Phone</td>
              <td style={{ ...val, textAlign: 'left', padding: '3px 0' }}>{member.phone}</td>
              <td style={{ ...label, padding: '3px 0' }}>Joining date</td>
              <td style={{ ...val, textAlign: 'left', padding: '3px 0' }}>{member.joiningDate || '—'}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444', marginBottom: 6 }}>Attendance ({MONTH_NAMES[month]} {year})</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead><tr><th style={th}>Present</th><th style={th}>Half day</th><th style={th}>Paid leave</th><th style={th}>Absent</th><th style={th}>Paid days</th><th style={th}>Days in month</th></tr></thead>
        <tbody><tr>
          <td style={td}>{att.present}</td>
          <td style={td}>{att.halfDay}</td>
          <td style={td}>{att.leave}</td>
          <td style={td}>{att.absent}</td>
          <td style={{ ...td, fontWeight: 700 }}>{workedDays}</td>
          <td style={td}>{dim}</td>
        </tr></tbody>
      </table>

      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444', marginBottom: 6 }}>Earnings</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <tbody>
          {salaryBreakdown(member, att, dim).lines.map((l) => (
            <tr key={l.label}><td style={label}>{l.label}</td><td style={{ ...val, color: l.amount < 0 ? '#b91c1c' : val.color }}>{l.amount < 0 ? '− ' : ''}₹{fmt(Math.abs(l.amount))}</td></tr>
          ))}
          <tr><td style={{ ...label, fontWeight: 700, color: '#111', borderTop: '1px solid #333', paddingTop: 6 }}>Net earned this month</td><td style={{ ...val, borderTop: '1px solid #333', paddingTop: 6 }}>₹{fmt(earned)}</td></tr>
          <tr><td style={label}>Paid so far{Array.isArray(payments) && payments.length ? ` (${payments.length} payment${payments.length > 1 ? 's' : ''})` : ''}</td><td style={val}>− ₹{fmt(paidTotal)}</td></tr>
          <tr><td style={{ ...label, fontWeight: 800, color: balance > 0 ? '#b91c1c' : '#15803d', fontSize: 13 }}>Balance payable</td><td style={{ ...val, color: balance > 0 ? '#b91c1c' : '#15803d', fontSize: 13 }}>₹{fmt(balance)}</td></tr>
        </tbody>
      </table>

      {Array.isArray(payments) && payments.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444', margin: '14px 0 6px' }}>Payments this month</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead><tr><th style={th}>Date</th><th style={th}>Mode</th><th style={{ ...th, textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.id || i}>
                  <td style={td}>{p.date}</td>
                  <td style={td}>{p.paymentMode}{p.paymentMode === 'Split' ? ` (Cash ₹${fmt(p.cashAmt)} + Bank ₹${fmt(p.bankAmt)})` : ''}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>₹{fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {Array.isArray(dues) && dues.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#b91c1c', margin: '14px 0 6px' }}>Previous months — still payable</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead><tr><th style={th}>Month</th><th style={{ ...th, textAlign: 'right' }}>Earned</th><th style={{ ...th, textAlign: 'right' }}>Paid</th><th style={{ ...th, textAlign: 'right' }}>Due</th></tr></thead>
            <tbody>
              {dues.map((d) => (
                <tr key={`${d.year}-${d.month}`}>
                  <td style={td}>{MONTH_NAMES[d.month]} {d.year}</td>
                  <td style={{ ...td, textAlign: 'right' }}>₹{fmt(d.earned)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>₹{fmt(d.paid)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>₹{fmt(d.due)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 800 }}>Total previous dues</td>
                <td style={td} /><td style={td} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>₹{fmt(dues.reduce((s, d) => s + d.due, 0))}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}>
        <div>Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ borderTop: '1px solid #333', width: 160, marginTop: 30, paddingTop: 4 }}>Authorised signatory</div>
        </div>
      </div>
    </div>
  );
});
PayslipTemplate.displayName = 'PayslipTemplate';

const today = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
};

export default function StaffPage() {
  const theme = useMuiTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  const { currentBusiness } = useBusiness();
  const { currentBusiness: authBusiness, currentUser, staffSession } = useAuth();
  const { config } = useConfig();
  const { addItem, updateItem, deleteItem, getItems } = useData();
  const bId = currentBusiness?.id;
  // The businesses/{id} doc for the SELECTED business — same doc Settings →
  // Access Control writes and business-code staff login reads. This used to
  // be the account's first business (authBusiness) whatever was selected, so
  // staff saved here for a 2nd/3rd business never reached their login.
  const firestoreBizId = resolveBizDocId(currentBusiness, currentUser?.uid || staffSession?.ownerUid || null) || authBusiness?.id || bId;

  const syncToStaffAccounts = async (id, record, password = '') => {
    if (!firestoreBizId) return;
    try {
      const payload = {
        id,
        name: record.name,
        username: record.username || '',
        active: record.status !== 'inactive',
        features: record.features || {},
        role: record.role || '',
        phone: record.phone || '',
        email: record.email || '',
        salary: record.salary || 0,
        salaryType: record.salaryType || 'monthly',
        halfDayRate: record.halfDayRate ?? '',
        leaveDeduction: record.leaveDeduction ?? '',
        absentDeduction: record.absentDeduction ?? '',
        joiningDate: record.joiningDate || '',
        notes: record.notes || '',
        showInSalesSelector: !!record.showInSalesSelector,
        businessId: String(bId),
        ...(password ? { password } : {}),
      };
      await setDoc(
        doc(firestore, 'businesses', firestoreBizId, 'staffAccounts', id),
        payload,
        { merge: true }
      );
    } catch (e) {
      console.warn('[StaffPage] staffAccounts sync failed:', e);
    }
  };

  const deleteFromStaffAccounts = async (id) => {
    if (!firestoreBizId) return;
    try {
      await deleteDoc(doc(firestore, 'businesses', firestoreBizId, 'staffAccounts', id));
    } catch (e) {
      console.warn('[StaffPage] staffAccounts delete failed:', e);
    }
  };

  const rawMembers = getItems('staffMembers').filter(s => s.businessId === bId);
  const rawAttendance = getItems('staffAttendance').filter(s => s.businessId === bId);
  const rawSalary = getItems('staffSalary').filter(s => s.businessId === bId);

  // Super-admin per-business staff cap (Admin → Businesses → Usage Limits).
  const ownerUidForLimits = currentUser?.uid || staffSession?.ownerUid || null;
  const limitsBizDoc = useBusinessAuthDoc(currentBusiness, ownerUidForLimits);
  const maxStaff = resolveMaxStaff(limitsBizDoc);
  const staffCount = rawMembers.filter(m => m.status !== 'inactive').length;
  const atStaffCap = staffCount >= maxStaff;

  const [tab, setTab] = useState(0);
  const [dlgTab, setDlgTab] = useState(0);
  const [search, setSearch] = useState('');
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().split('T')[0]);

  // ─ Members state ─
  const [memberDialog, setMemberDialog] = useState({ open: false, editing: null });
  const [memberForm, setMemberForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [memberError, setMemberError] = useState('');

  // ─ Attendance state ─
  const t = today();
  const [attMonth, setAttMonth] = useState(t.month);
  const [attYear, setAttYear] = useState(t.year);

  // ─ Salary state ─
  const [salMonth, setSalMonth] = useState(t.month);
  const [salYear, setSalYear] = useState(t.year);
  const [salPayDialog, setSalPayDialog] = useState(null); // { member, netSalary, existing, paidSoFar, balance }
  const [salPayForm, setSalPayForm] = useState({ amount: '', paymentMode: 'Cash', cashAmt: '', bankAmt: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [salPayError, setSalPayError] = useState('');
  const [payslipData, setPayslipData] = useState(null);
  const payslipRef = useRef(null);
  const printPayslip = useReactToPrint({ contentRef: payslipRef });

  const activeMembers = rawMembers.filter(m => m.status !== 'inactive');
  const filteredMembers = rawMembers.filter(m =>
    !search || m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.role?.toLowerCase().includes(search.toLowerCase())
  );

  // ─ Stats ─
  const todayStr = `${t.year}-${String(t.month + 1).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const presentToday = rawAttendance.filter(a => a.date === todayStr && a.status === 'present').length;
  const monthlyPayroll = activeMembers.reduce((sum, m) => sum + (m.salaryType === 'monthly' ? (m.salary || 0) : 0), 0);

  // ─ Attendance helpers ─
  const daysInMonth = getDaysInMonth(attYear, attMonth);
  const attKey = (staffId, day) => `${staffId}_${attYear}-${String(attMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const attMap = useMemo(() => {
    const m = {};
    rawAttendance.forEach(a => { m[`${String(a.staffId)}_${a.date}`] = a; });
    return m;
  }, [rawAttendance]);

  const getAtt = (staffId, day) => {
    const dateStr = `${attYear}-${String(attMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return attMap[`${String(staffId)}_${dateStr}`];
  };

  const cycleAttendance = (staffId, staffName, day) => {
    const dateStr = `${attYear}-${String(attMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = attMap[`${staffId}_${dateStr}`];
    const currentIdx = existing ? STATUS_CYCLE.indexOf(existing.status) : STATUS_CYCLE.indexOf(null);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    if (existing) {
      if (nextStatus === null) {
        deleteItem('staffAttendance', existing.id);
      } else {
        updateItem('staffAttendance', existing.id, { status: nextStatus });
      }
    } else if (nextStatus) {
      addItem('staffAttendance', { businessId: bId, staffId, staffName, date: dateStr, status: nextStatus, id: Date.now() + Math.random() });
    }
  };

  const getMonthAttendanceSummary = (staffId) => {
    let present = 0, absent = 0, halfDay = 0, leave = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const a = getAtt(staffId, d);
      if (a?.status === 'present') present++;
      else if (a?.status === 'absent') absent++;
      else if (a?.status === 'halfDay') halfDay++;
      else if (a?.status === 'leave') leave++;
    }
    return { present, absent, halfDay, leave };
  };

  // ─ Salary helpers ─
  // Days that count as PAID for the month: present + half-days + marked leave
  // (paid leave is standard payroll). "absent" is a marked day but unpaid.

  // Earned for the month from attendance + this member's salary rules (see
  // salaryBreakdown): a month with no entries earns ₹0 (never auto-charged as
  // a "due"); monthly salary is pro-rated per day of the month.
  const calcNetSalary = (member, year, month) =>
    salaryBreakdown(member, getMonthAttendanceSummary_ym(member.id, year, month), getDaysInMonth(year, month)).total;

  const getMonthAttendanceSummary_ym = (staffId, year, month) => {
    const days = getDaysInMonth(year, month);
    let present = 0, absent = 0, halfDay = 0, leave = 0;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const a = attMap[`${staffId}_${dateStr}`];
      if (a?.status === 'present') present++;
      else if (a?.status === 'absent') absent++;
      else if (a?.status === 'halfDay') halfDay++;
      else if (a?.status === 'leave') leave++;
    }
    return { present, absent, halfDay, leave };
  };

  const getSalaryRecord = (staffId) =>
    rawSalary.find(s => String(s.staffId) === String(staffId) && s.month === salMonth && s.year === salYear);

  // Total already paid against a salary record. New records keep a `payments[]`
  // array of individual (possibly partial) payouts; older records that were
  // "Marked as Paid" in one shot before this change have no array — fall back
  // to netSalary when they're flagged paid.
  const salaryPaidTotal = (rec) => {
    if (!rec) return 0;
    if (Array.isArray(rec.payments) && rec.payments.length) {
      return rec.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    }
    return rec.status === 'paid' ? (Number(rec.netSalary) || 0) : 0;
  };
  // 'paid' once paid >= net, 'partial' while 0 < paid < net, else 'pending'.
  const salaryStatus = (rec, net) => {
    const paid = salaryPaidTotal(rec);
    if (net > 0 && paid >= net - 0.5) return 'paid';
    if (paid > 0) return 'partial';
    return 'pending';
  };

  // Keep each partially/fully-paid salary record's stored netSalary / balance /
  // status in sync with the CURRENT attendance for the month it belongs to.
  // Net earned is attendance-driven for every wage type now (monthly is
  // pro-rated too), so marking more days after a partial payment must re-open
  // the balance — otherwise the extra earned days never show as owed in
  // Reports or any stored-value read. The Salary tab card already recomputes
  // on the fly; this makes the persisted figures match.
  useEffect(() => {
    if (!bId) return;
    rawSalary.forEach((rec) => {
      const member = rawMembers.find((m) => String(m.id) === String(rec.staffId));
      if (!member) return;
      if (!Array.isArray(rec.payments) || rec.payments.length === 0) return;
      const freshNet = calcNetSalary(member, rec.year, rec.month);
      const paid = salaryPaidTotal(rec);
      const freshBalance = Math.max(0, freshNet - paid);
      const freshStatus = freshNet > 0 && paid >= freshNet - 0.5 ? 'paid' : (paid > 0 ? 'partial' : 'pending');
      if (
        Math.round(Number(rec.netSalary) || 0) !== Math.round(freshNet) ||
        Math.round(Number(rec.balance) || 0) !== Math.round(freshBalance) ||
        rec.status !== freshStatus
      ) {
        updateItem('staffSalary', rec.id, {
          netSalary: freshNet,
          balance: freshBalance,
          status: freshStatus,
          paidDate: freshStatus === 'paid' ? (rec.paidDate || new Date().toISOString()) : null,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attMap, rawSalary, rawMembers, bId]);

  // Unpaid balances from months BEFORE the currently-selected salary month.
  // Looks back up to 12 months. Net earned is attendance-driven for every wage
  // type (a month with no attendance entries earns ₹0), so a month only shows
  // as a "due" when it has genuinely-earned salary that isn't fully paid —
  // months with no entries never appear.
  const pastDuesFor = (member) => {
    const rows = [];
    let y = salYear, mo = salMonth;
    for (let i = 0; i < 12; i++) {
      mo -= 1;
      if (mo < 0) { mo = 11; y -= 1; }
      const rec = rawSalary.find(
        s => String(s.staffId) === String(member.id) && s.month === mo && s.year === y,
      );
      const earned = calcNetSalary(member, y, mo);
      if (earned <= 0) continue;
      const paid = salaryPaidTotal(rec);
      const due = Math.round(Math.max(0, earned - paid));
      if (due > 0) rows.push({ year: y, month: mo, rec, earned, paid, due });
    }
    return rows.reverse(); // oldest first
  };

  const openSalaryPayDialog = (member, forMonth) => {
    // forMonth (optional): { year, month } — settle a PAST due month instead of
    // the currently-selected one.
    const y = forMonth?.year ?? salYear;
    const mo = forMonth?.month ?? salMonth;
    const existing = rawSalary.find(
      s => String(s.staffId) === String(member.id) && s.month === mo && s.year === y,
    );
    const net = calcNetSalary(member, y, mo);
    const paidSoFar = salaryPaidTotal(existing);
    const balance = Math.max(0, net - paidSoFar);
    // Default the amount to whatever is still outstanding (a full settlement in
    // one click), but the user can type less to make a partial payment / advance.
    setSalPayForm({
      amount: String(balance || net),
      paymentMode: 'Cash',
      cashAmt: String(balance || net), bankAmt: '',
      date: new Date().toISOString().split('T')[0], notes: '',
    });
    setSalPayError('');
    setSalPayDialog({ member, netSalary: net, existing, paidSoFar, balance, payYear: y, payMonth: mo });
  };

  // Build + print a payslip for the currently-selected salary month.
  const openPayslip = (member) => {
    const rec = getSalaryRecord(member.id);
    const att = getMonthAttendanceSummary_ym(member.id, salYear, salMonth);
    const earned = calcNetSalary(member, salYear, salMonth);
    const paidTotal = salaryPaidTotal(rec);
    setPayslipData({
      business: currentBusiness || {},
      member,
      year: salYear,
      month: salMonth,
      att,
      dim: getDaysInMonth(salYear, salMonth),
      earned,
      paidTotal,
      balance: Math.max(0, earned - paidTotal),
      payments: Array.isArray(rec?.payments) ? rec.payments : [],
      dues: pastDuesFor(member),
    });
    setTimeout(() => printPayslip(), 60);
  };

  const confirmSalaryPayment = async () => {
    if (!salPayDialog) return;
    const { member } = salPayDialog;
    // The month this payment settles — the currently-selected salary month, or
    // a past due month when opened via "Pay dues".
    const payYear = salPayDialog.payYear ?? salYear;
    const payMonth = salPayDialog.payMonth ?? salMonth;
    const { paymentMode, cashAmt, bankAmt, date, notes } = salPayForm;

    // Re-derive net salary + amount-already-paid from CURRENT data at confirm
    // time, not the snapshot taken when the dialog opened. For a daily/hourly
    // wage the net earned changes every time more attendance is marked, so a
    // stale snapshot would let a partial payment record against the old (lower)
    // figure and leave the freshly-earned days permanently un-owed.
    const existing = rawSalary.find(
      s => String(s.staffId) === String(member.id) && s.month === payMonth && s.year === payYear,
    );
    const netSalary = calcNetSalary(member, payYear, payMonth);
    const paidSoFar = salaryPaidTotal(existing);

    const payAmount = Math.round(Number(salPayForm.amount) || 0);
    if (payAmount <= 0) {
      setSalPayError('Enter an amount greater than ₹0 to record a payment.');
      return;
    }
    const outstanding = Math.max(0, netSalary - paidSoFar);
    if (netSalary > 0 && payAmount > outstanding + 0.5) {
      setSalPayError(`That is more than the ₹${fmt(outstanding)} still due. Reduce the amount, or fix the net salary / attendance first.`);
      return;
    }

    // Split-mode portions must add up to the amount being paid now.
    let cashPart = 0, bankPart = 0;
    if (paymentMode === 'Cash') { cashPart = payAmount; }
    else if (paymentMode === 'Bank') { bankPart = payAmount; }
    else {
      cashPart = Number(cashAmt) || 0; bankPart = Number(bankAmt) || 0;
      if (Math.round(cashPart + bankPart) !== payAmount) {
        setSalPayError(`Split parts (₹${fmt(cashPart + bankPart)}) must equal the payment amount ₹${fmt(payAmount)}.`);
        return;
      }
    }

    const paidDateISO = new Date(date || undefined).toISOString();
    const monthName_ = new Date(payYear, payMonth, 1).toLocaleString('en-IN', { month: 'long' });
    const payment = {
      id: crypto.randomUUID(),
      date: date || new Date().toISOString().split('T')[0],
      amount: payAmount, paymentMode,
      cashAmt: cashPart, bankAmt: bankPart,
      notes: notes || '',
    };
    const newPaidTotal = paidSoFar + payAmount;
    const newStatus = (netSalary > 0 && newPaidTotal >= netSalary - 0.5) ? 'paid' : 'partial';

    // Upsert the salary record with the appended payment.
    if (existing) {
      const prevPayments = Array.isArray(existing.payments) ? existing.payments : [];
      await updateItem('staffSalary', existing.id, {
        netSalary,
        payments: [...prevPayments, payment],
        paidTotal: newPaidTotal,
        balance: Math.max(0, netSalary - newPaidTotal),
        status: newStatus,
        paidDate: newStatus === 'paid' ? paidDateISO : (existing.paidDate || null),
        lastPaidDate: paidDateISO,
      });
    } else {
      const saved = await addItem('staffSalary', {
        id: crypto.randomUUID(), businessId: bId, staffId: member.id, staffName: member.name,
        month: payMonth, year: payYear,
        baseSalary: member.salary || 0, salaryType: member.salaryType || 'monthly', netSalary,
        payments: [payment],
        paidTotal: newPaidTotal,
        balance: Math.max(0, netSalary - newPaidTotal),
        status: newStatus,
        paidDate: newStatus === 'paid' ? paidDateISO : null,
        lastPaidDate: paidDateISO,
      });
      if (!saved) { setSalPayError('Failed to save salary record. Please try again.'); return; }
    }

    // Each payout is recorded as its own expense so Cash/Bank books stay right.
    const expenseSaved = await addItem('expenses', {
      id: crypto.randomUUID(), businessId: bId,
      date: date || new Date().toISOString().split('T')[0],
      category: 'Staff Salary',
      description: `Salary ${newStatus === 'paid' ? '(settled)' : '(part)'} — ${member.name} (${monthName_} ${payYear})`,
      amount: payAmount,
      paymentMode,
      ...(paymentMode === 'Split' ? { paymentSplit: { cashAmt: cashPart, bankAmt: bankPart } } : {}),
      notes: notes || '',
    });
    if (!expenseSaved) {
      setSalPayError('Payment saved, but the expense record failed. Please add it manually from Expenses.');
      return;
    }

    setSalPayError('');
    setSalPayDialog(null);
  };

  // Undo the most recent salary payment (removes the last entry from payments[]
  // and re-derives the status). Does NOT delete the linked expense — remove that
  // from the Expenses page if needed.
  const undoLastSalaryPayment = async (member) => {
    const rec = getSalaryRecord(member.id);
    if (!rec || !Array.isArray(rec.payments) || rec.payments.length === 0) {
      // Legacy one-shot "paid" record — just flip back to pending.
      if (rec) await updateItem('staffSalary', rec.id, { status: 'pending', paidDate: null, paidTotal: 0, balance: rec.netSalary || 0 });
      return;
    }
    const remaining = rec.payments.slice(0, -1);
    const net = Number(rec.netSalary) || calcNetSalary(member, salYear, salMonth);
    const paidTotal = remaining.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const status = paidTotal <= 0 ? 'pending' : (paidTotal >= net - 0.5 ? 'paid' : 'partial');
    await updateItem('staffSalary', rec.id, {
      payments: remaining, paidTotal, balance: Math.max(0, net - paidTotal),
      status, paidDate: status === 'paid' ? (rec.paidDate || new Date().toISOString()) : null,
    });
  };

  // ─ Member dialog ─
  const openAddMember = () => {
    if (atStaffCap) return;
    setMemberError('');
    setDlgTab(0);
    setMemberForm({ name: '', username: '', password: '', role: 'Sales Staff', phone: '', email: '', salary: '', salaryType: 'monthly', halfDayRate: '', leaveDeduction: '', absentDeduction: '', joiningDate: '', notes: '', status: 'active', features: defaultStaffFeatures(), showInSalesSelector: false });
    setMemberDialog({ open: true, editing: null });
  };
  const openEditMember = (m) => {
    setMemberError('');
    setDlgTab(0);
    setMemberForm({ features: {}, showInSalesSelector: false, username: '', password: '', ...m });
    setMemberDialog({ open: true, editing: m });
  };
  const saveMember = async () => {
    setMemberError('');
    if (!memberForm.name?.trim()) { setMemberError('Name is required.'); return; }
    if (!bId) { setMemberError('No business selected.'); return; }
    if (!memberDialog.editing && atStaffCap) {
      setMemberError(`Staff limit reached (${maxStaff}). Contact your administrator to raise it.`);
      return;
    }
    const record = {
      name: memberForm.name.trim(),
      username: (memberForm.username || '').trim().toLowerCase().replace(/\s/g, ''),
      role: memberForm.role || 'Sales Staff',
      phone: memberForm.phone || '',
      email: memberForm.email || '',
      salary: Number(memberForm.salary) || 0,
      salaryType: memberForm.salaryType || 'monthly',
      // '' = use the default rule (see salaryBreakdown)
      halfDayRate: optNum(memberForm.halfDayRate) ?? '',
      leaveDeduction: optNum(memberForm.leaveDeduction) ?? '',
      absentDeduction: optNum(memberForm.absentDeduction) ?? '',
      joiningDate: memberForm.joiningDate || '',
      notes: memberForm.notes || '',
      status: memberForm.status || 'active',
      features: memberForm.features || {},
      showInSalesSelector: !!memberForm.showInSalesSelector,
      businessId: bId,
    };
    let savedId;
    if (memberDialog.editing) {
      const ok = updateItem('staffMembers', memberDialog.editing.id, record);
      if (!ok) { setMemberError('Failed to save. Please try again.'); return; }
      savedId = memberDialog.editing.id;
    } else {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `staff_${Date.now()}`;
      const ok = addItem('staffMembers', { ...record, id });
      if (!ok) { setMemberError('Failed to save. Make sure you are logged in and try again.'); return; }
      savedId = id;
    }
    await syncToStaffAccounts(savedId, record, memberForm.password || '');
    setMemberDialog({ open: false, editing: null });
  };

  const monthName = (m) => new Date(2000, m, 1).toLocaleString('default', { month: 'long' });

  const cardSx = {
    borderRadius: 3,
    border: `1px solid ${theme.palette.divider}`,
    bgcolor: isDark ? alpha('#fff', 0.03) : '#fff',
    boxShadow: 'none',
  };

  // ─ Header ─────────────────────────────────────────────────────────────────
  const StatCard = ({ icon: Icon, value, label, color }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(color, 0.2), display: 'flex' }}>
        <Icon size={18} color={color} />
      </Box>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1, color: '#5c1f22' }}>{value}</Typography>
        <Typography variant="caption" sx={{ color: alpha('#fff', 0.7), lineHeight: 1.2 }}>{label}</Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, mx: 0 }}>
      {/* ── Hero ── */}
      <Box sx={{
        borderRadius: 4,
        background: '#ffffff', border: '1px solid #ece2db',
        p: { xs: 2.5, sm: 3.5 },
        mb: 3,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: alpha('#fff', 0.04), pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -30, right: 80, width: 120, height: 120, borderRadius: '50%', bgcolor: alpha('#fff', 0.03), pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#5c1f22', mb: 0.5 }}>Staff Management</Typography>
            <Typography variant="body2" sx={{ color: alpha('#fff', 0.7) }}>Manage your team, track attendance and process payroll</Typography>
          </Box>
          <Tooltip title={atStaffCap ? `Staff limit reached (${maxStaff} of ${maxStaff}). Contact your administrator to raise it.` : ''}>
            <span>
              <Button
                variant="contained"
                startIcon={<Plus size={16} />}
                onClick={openAddMember}
                disabled={atStaffCap}
                sx={{ bgcolor: alpha('#fff', 0.15), color: '#5c1f22', backdropFilter: 'blur(4px)', borderRadius: 2, fontWeight: 600, border: `1px solid ${alpha('#fff', 0.2)}`, '&:hover': { bgcolor: alpha('#fff', 0.25) }, '&.Mui-disabled': { color: alpha('#fff', 0.4), bgcolor: alpha('#fff', 0.06) } }}
              >
                {atStaffCap ? `Staff ${staffCount}/${maxStaff}` : 'Add Staff'}
              </Button>
            </span>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', gap: { xs: 3, sm: 5 }, mt: 3, flexWrap: 'wrap' }}>
          <StatCard icon={Users} value={activeMembers.length} label="Total Active Staff" color="#ddd0c9" />
          <StatCard icon={UserCheck} value={presentToday} label="Present Today" color="#ddd0c9" />
          <StatCard icon={DollarSign} value={`₹${fmt(monthlyPayroll)}`} label="Monthly Payroll" color="#fde68a" />
        </Box>
      </Box>

      {/* ── Tabs ── */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2.5, '& .MuiTabs-indicator': { borderRadius: 2 }, minHeight: 40 }}
      >
        {['Members', 'Attendance', 'Salary', 'Sales Report'].map((label, i) => (
          <Tab key={label} label={label} sx={{ fontWeight: 600, fontSize: '0.8rem', minHeight: 40 }} />
        ))}
      </Tabs>

      {/* ══ MEMBERS TAB ══════════════════════════════════════════════════════ */}
      {tab === 0 && (
        <Box>
          <TextField
            size="small"
            placeholder="Search by name or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ mb: 2.5, width: { xs: '100%', sm: 320 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search size={15} color="#999" /></InputAdornment>,
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch('')}><X size={14} /></IconButton>
                </InputAdornment>
              ) : null,
              sx: { borderRadius: 2 },
            }}
          />
          {filteredMembers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <Users size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Typography variant="body2">No staff members yet. Add your first team member!</Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {filteredMembers.map(m => {
                const summary = getMonthAttendanceSummary(m.id);
                return (
                  <Grid item xs={12} sm={6} md={4} key={m.id}>
                    <Card elevation={0} sx={{ ...cardSx, position: 'relative', overflow: 'visible' }}>
                      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: '12px 12px 0 0', bgcolor: roleColor(m.role) }} />
                      <CardContent sx={{ pt: 2.5 }}>
                        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
                          <Avatar sx={{ width: 48, height: 48, bgcolor: alpha(roleColor(m.role), 0.15), color: roleColor(m.role), fontWeight: 700, fontSize: '1rem' }}>
                            {initials(m.name)}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>{m.name}</Typography>
                            <Chip label={m.role} size="small" sx={{ mt: 0.25, height: 18, fontSize: '0.65rem', bgcolor: alpha(roleColor(m.role), 0.1), color: roleColor(m.role), fontWeight: 600 }} />
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.25 }}>
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => openEditMember(m)} sx={{ color: 'text.secondary' }}><Edit2 size={14} /></IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" onClick={() => setDeleteConfirm(m)} sx={{ color: 'error.main' }}><Trash2 size={14} /></IconButton>
                            </Tooltip>
                          </Box>
                        </Box>

                        <Divider sx={{ mb: 1.25 }} />

                        <Stack spacing={0.5} sx={{ mb: 1.25 }}>
                          {m.phone && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
                              <Phone size={12} /><Typography variant="caption">{m.phone}</Typography>
                            </Box>
                          )}
                          {m.email && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
                              <Mail size={12} /><Typography variant="caption" noWrap>{m.email}</Typography>
                            </Box>
                          )}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
                            <DollarSign size={12} />
                            <Typography variant="caption">₹{fmt(m.salary)} / {m.salaryType}</Typography>
                          </Box>
                        </Stack>

                        {/* This month attendance mini summary */}
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                          {[
                            { key: 'present', val: summary.present, ...ATTENDANCE_STATUS.present },
                            { key: 'absent', val: summary.absent, ...ATTENDANCE_STATUS.absent },
                            { key: 'halfDay', val: summary.halfDay, ...ATTENDANCE_STATUS.halfDay },
                            { key: 'leave', val: summary.leave, ...ATTENDANCE_STATUS.leave },
                          ].map(s => (
                            <Chip key={s.key} label={`${s.label}: ${s.val}`} size="small"
                              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: s.bg, color: s.color }} />
                          ))}
                        </Box>

                        <Chip
                          label={m.status === 'inactive' ? 'Inactive' : 'Active'}
                          size="small"
                          sx={{ mt: 1.25, height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: m.status === 'inactive' ? alpha('#ef4444', 0.1) : alpha('#22c55e', 0.1), color: m.status === 'inactive' ? '#ef4444' : '#22c55e' }}
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* ══ ATTENDANCE TAB ═══════════════════════════════════════════════════ */}
      {tab === 1 && (
        <Box>
          {/* Month navigator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <IconButton size="small" onClick={() => {
              if (attMonth === 0) { setAttMonth(11); setAttYear(y => y - 1); }
              else setAttMonth(m => m - 1);
            }}><ChevronLeft size={18} /></IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, minWidth: 140, textAlign: 'center' }}>
              {monthName(attMonth)} {attYear}
            </Typography>
            <IconButton size="small" onClick={() => {
              if (attMonth === 11) { setAttMonth(0); setAttYear(y => y + 1); }
              else setAttMonth(m => m + 1);
            }}><ChevronRight size={18} /></IconButton>
            <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>Click a cell to cycle status</Typography>
          </Box>

          {activeMembers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <Clock size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Typography variant="body2">Add staff members first to track attendance.</Typography>
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto', borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
              {(() => {
                const NAME_COL = 150;
                const DAY_COL = 34;
                const gridCols = `${NAME_COL}px repeat(${daysInMonth}, minmax(${DAY_COL}px, 1fr))`;
                return (
              <Box sx={{ minWidth: NAME_COL + daysInMonth * DAY_COL }}>
                {/* Header row */}
                <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, bgcolor: isDark ? alpha('#fff', 0.04) : '#f6efe9', borderBottom: `1px solid ${theme.palette.divider}` }}>
                  <Box sx={{ p: 1, pl: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Staff</Typography>
                  </Box>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                    const dayOfWeek = new Date(attYear, attMonth, d).getDay();
                    const isSun = dayOfWeek === 0;
                    const isToday = attYear === t.year && attMonth === t.month && d === t.day;
                    return (
                      <Box key={d} sx={{ p: 0.5, textAlign: 'center', borderLeft: `1px solid ${theme.palette.divider}`, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', color: isSun ? '#ef4444' : 'text.secondary', fontWeight: isToday ? 800 : 500 }}>{d}</Typography>
                        <Typography sx={{ display: 'block', fontSize: '0.55rem', color: 'text.disabled' }}>{DAYS_IN_WEEK[dayOfWeek].slice(0, 1)}</Typography>
                      </Box>
                    );
                  })}
                </Box>

                {/* Staff rows */}
                {activeMembers.map((m, mi) => (
                  <Box key={m.id} sx={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: mi < activeMembers.length - 1 ? `1px solid ${theme.palette.divider}` : 'none', '&:hover': { bgcolor: isDark ? alpha('#fff', 0.02) : '#fafbfc' } }}>
                    <Box sx={{ p: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <Avatar sx={{ width: 24, height: 24, fontSize: '0.65rem', flexShrink: 0, bgcolor: alpha(roleColor(m.role), 0.15), color: roleColor(m.role) }}>{initials(m.name)}</Avatar>
                      <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>{m.name}</Typography>
                    </Box>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const att = getAtt(m.id, d);
                      const s = att ? ATTENDANCE_STATUS[att.status] : null;
                      const isToday = attYear === t.year && attMonth === t.month && d === t.day;
                      return (
                        <Tooltip key={d} title={s ? s.title : 'Not marked'} placement="top">
                          <Box
                            onClick={() => cycleAttendance(m.id, m.name, d)}
                            sx={{
                              borderLeft: `1px solid ${theme.palette.divider}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              minWidth: 0, height: 36, cursor: 'pointer',
                              bgcolor: s ? s.bg : isToday ? alpha(primary, 0.05) : 'transparent',
                              '&:hover': { bgcolor: s ? alpha(s.color, 0.2) : alpha(primary, 0.08) },
                              transition: 'background 0.15s',
                            }}
                          >
                            {s && (
                              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.label}</Typography>
                            )}
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                ))}
              </Box>
                );
              })()}
            </Box>
          )}

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            {Object.entries(ATTENDANCE_STATUS).map(([key, s]) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: s.color }}>{s.label}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">{s.title}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ══ SALARY TAB ═══════════════════════════════════════════════════════ */}
      {tab === 2 && (
        <Box>
          {/* Month navigator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <IconButton size="small" onClick={() => {
              if (salMonth === 0) { setSalMonth(11); setSalYear(y => y - 1); }
              else setSalMonth(m => m - 1);
            }}><ChevronLeft size={18} /></IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, minWidth: 140, textAlign: 'center' }}>
              {monthName(salMonth)} {salYear}
            </Typography>
            <IconButton size="small" onClick={() => {
              if (salMonth === 11) { setSalMonth(0); setSalYear(y => y + 1); }
              else setSalMonth(m => m + 1);
            }}><ChevronRight size={18} /></IconButton>
          </Box>

          {activeMembers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <DollarSign size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Typography variant="body2">Add staff members to manage salary.</Typography>
            </Box>
          ) : (
            <>
              <Grid container spacing={2}>
                {activeMembers.map(m => {
                  const salRec = getSalaryRecord(m.id);
                  const netSalary = calcNetSalary(m, salYear, salMonth);
                  const paidTotal = salaryPaidTotal(salRec);
                  const balance = Math.max(0, netSalary - paidTotal);
                  const status = salaryStatus(salRec, netSalary); // paid | partial | pending
                  const isPaid = status === 'paid';
                  const isPartial = status === 'partial';
                  const statusColor = isPaid ? '#22c55e' : isPartial ? '#0284c7' : '#f59e0b';
                  const statusText = isPaid ? 'Paid' : isPartial ? 'Partial' : 'Pending';
                  const payCount = Array.isArray(salRec?.payments) ? salRec.payments.length : 0;
                  const attSummary = getMonthAttendanceSummary_ym(m.id, salYear, salMonth);
                  const dues = pastDuesFor(m);
                  const totalDue = dues.reduce((s, d) => s + d.due, 0);
                  const oldestDue = dues[0];

                  return (
                    <Grid item xs={12} sm={6} md={4} key={m.id}>
                      <Card elevation={0} sx={{ ...cardSx, position: 'relative', overflow: 'visible' }}>
                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: '12px 12px 0 0', bgcolor: statusColor }} />
                        <CardContent sx={{ pt: 2.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                            <Avatar sx={{ width: 40, height: 40, bgcolor: alpha(roleColor(m.role), 0.15), color: roleColor(m.role), fontWeight: 700 }}>
                              {initials(m.name)}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>{m.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{m.role}</Typography>
                            </Box>
                            <Chip
                              label={statusText}
                              size="small"
                              sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: alpha(statusColor, 0.1), color: isPaid ? '#22c55e' : isPartial ? '#0284c7' : '#d97706' }}
                            />
                          </Box>

                          <Divider sx={{ mb: 1.5 }} />

                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">Base ({m.salaryType})</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>₹{fmt(m.salary)}{m.salaryType === 'daily' ? ' / day' : m.salaryType === 'hourly' ? ' / hr' : ''}</Typography>
                          </Box>

                          {m.salaryType !== 'hourly' && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="caption" color="text.secondary">
                                {m.salaryType === 'daily' ? 'Days worked' : 'Paid days'}
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {attSummary.present + attSummary.halfDay * 0.5 + (m.salaryType === 'monthly' ? attSummary.leave : 0)} / {getDaysInMonth(salYear, salMonth)}
                              </Typography>
                            </Box>
                          )}

                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                            <Typography variant="caption" color="text.secondary">Net earned</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>₹{fmt(netSalary)}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                            <Typography variant="caption" color="text.secondary">Paid{payCount > 1 ? ` (${payCount} payments)` : ''}</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#22c55e' }}>₹{fmt(paidTotal)}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: totalDue > 0 ? 0.75 : 1.5, pt: 0.75, borderTop: '1px dashed', borderColor: 'divider' }}>
                            <Typography variant="body2" sx={{ fontWeight: 800 }}>Balance (this month)</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 900, color: balance > 0 ? '#dc2626' : '#22c55e' }}>₹{fmt(balance)}</Typography>
                          </Box>

                          {totalDue > 0 && (
                            <Tooltip
                              title={dues.map(d => `${monthName(d.month)} ${d.year}: ₹${fmt(d.due)}`).join(' · ')}
                              placement="top"
                            >
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, px: 1, py: 0.6, borderRadius: 1.5, bgcolor: alpha('#dc2626', 0.07) }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#b91c1c' }}>
                                  Previous dues{dues.length > 1 ? ` (${dues.length} months)` : ` · ${monthName(oldestDue.month)} ${oldestDue.year}`}
                                </Typography>
                                <Typography variant="caption" sx={{ fontWeight: 900, color: '#b91c1c' }}>₹{fmt(totalDue)}</Typography>
                              </Box>
                            </Tooltip>
                          )}

                          {salRec?.lastPaidDate && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
                              Last paid {new Date(salRec.lastPaidDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Typography>
                          )}

                          {totalDue > 0 && (
                            <Button
                              fullWidth
                              variant="outlined"
                              size="small"
                              color="error"
                              startIcon={<DollarSign size={14} />}
                              onClick={() => openSalaryPayDialog(m, { year: oldestDue.year, month: oldestDue.month })}
                              sx={{ borderRadius: 2, fontWeight: 700, mb: 0.75 }}
                            >
                              Pay dues — {monthName(oldestDue.month)} {oldestDue.year} (₹{fmt(oldestDue.due)})
                            </Button>
                          )}

                          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
                            <Button
                              fullWidth
                              variant="contained"
                              size="small"
                              disabled={balance <= 0 && netSalary > 0}
                              startIcon={<DollarSign size={14} />}
                              onClick={() => openSalaryPayDialog(m)}
                              sx={{ borderRadius: 2, fontWeight: 600 }}
                            >
                              {balance > 0 || netSalary <= 0 ? `Pay ₹${fmt(balance || netSalary)} (this month)` : 'Settled'}
                            </Button>
                            <Tooltip title="Print payslip">
                              <IconButton size="small" onClick={() => openPayslip(m)}
                                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                                <Printer size={14} />
                              </IconButton>
                            </Tooltip>
                            {paidTotal > 0 && (
                              <Tooltip title="Undo last payment">
                                <IconButton size="small" onClick={() => undoLastSalaryPayment(m)}
                                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                                  <RotateCcw size={14} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>

              {/* Total payroll summary */}
              <Card elevation={0} sx={{ ...cardSx, mt: 2.5 }}>
                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, p: '14px 20px !important' }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Total Payroll — {monthName(salMonth)} {salYear}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: primary }}>
                      ₹{fmt(activeMembers.reduce((sum, m) => sum + calcNetSalary(m, salYear, salMonth), 0))}
                    </Typography>
                    {(() => {
                      const totalOutstanding = activeMembers.reduce((sum, m) => {
                        const cur = Math.max(0, calcNetSalary(m, salYear, salMonth) - salaryPaidTotal(getSalaryRecord(m.id)));
                        const past = pastDuesFor(m).reduce((s, d) => s + d.due, 0);
                        return sum + cur + past;
                      }, 0);
                      return totalOutstanding > 0 ? (
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#b91c1c', display: 'block', mt: 0.25 }}>
                          Outstanding (incl. previous months): ₹{fmt(totalOutstanding)}
                        </Typography>
                      ) : null;
                    })()}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    {[
                      { label: 'Paid', color: '#22c55e', count: activeMembers.filter(m => salaryStatus(getSalaryRecord(m.id), calcNetSalary(m, salYear, salMonth)) === 'paid').length },
                      { label: 'Partial', color: '#0284c7', count: activeMembers.filter(m => salaryStatus(getSalaryRecord(m.id), calcNetSalary(m, salYear, salMonth)) === 'partial').length },
                      { label: 'Pending', color: '#f59e0b', count: activeMembers.filter(m => salaryStatus(getSalaryRecord(m.id), calcNetSalary(m, salYear, salMonth)) === 'pending').length },
                    ].map(s => (
                      <Box key={s.label} sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</Typography>
                        <Typography variant="caption" sx={{ color: s.color }}>{s.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </>
          )}
        </Box>
      )}

      {/* ══ SALES REPORT TAB ════════════════════════════════════════════════ */}
      {tab === 3 && (() => {
        const allSales = getItems('sales').filter(tx => tx.businessId === bId && tx.date >= reportFrom && tx.date <= reportTo);
        const allPurchases = getItems('purchases').filter(tx => tx.businessId === bId && tx.date >= reportFrom && tx.date <= reportTo);
        const staffMap = {};
        allSales.forEach(tx => {
          if (!tx.billedBy) return;
          if (!staffMap[tx.billedBy]) staffMap[tx.billedBy] = { sales: 0, salesValue: 0, purchases: 0, purchasesValue: 0 };
          staffMap[tx.billedBy].sales += 1;
          staffMap[tx.billedBy].salesValue += Number(tx.totalAmount) || 0;
        });
        allPurchases.forEach(tx => {
          if (!tx.billedBy) return;
          if (!staffMap[tx.billedBy]) staffMap[tx.billedBy] = { sales: 0, salesValue: 0, purchases: 0, purchasesValue: 0 };
          staffMap[tx.billedBy].purchases += 1;
          staffMap[tx.billedBy].purchasesValue += Number(tx.totalAmount) || 0;
        });
        const rows = Object.entries(staffMap).map(([name, v]) => ({ name, ...v }));
        return (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField size="small" type="date" label="From" value={reportFrom} onChange={e => setReportFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="date" label="To" value={reportTo} onChange={e => setReportTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            {rows.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <TrendingUp size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                <Typography variant="body2">No sales data with staff attribution in this period.</Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Staff Name</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Invoices</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Sales Value</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Purchases</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Purchase Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.name} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                        <TableCell align="right">{r.sales}</TableCell>
                        <TableCell align="right">₹{r.salesValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                        <TableCell align="right">{r.purchases}</TableCell>
                        <TableCell align="right">₹{r.purchasesValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        );
      })()}

      {/* ══ ADD / EDIT MEMBER DIALOG ══════════════════════════════════════════ */}
      {(() => {
        const dialogTabs = ['Profile', 'Salary & Login', 'Access'];
        const sf = (key) => memberForm[key] ?? '';
        const upd = (key) => (e) => setMemberForm(f => ({ ...f, [key]: e.target.value }));
        const featOn = (key) => !!(memberForm.features || {})[key];
        const toggleFeat = (key) => setMemberForm(f => ({ ...f, features: { ...(f.features || {}), [key]: !featOn(key) } }));
        // Same permission list as Settings → Access Control (staffPermissions.js).
        const ACCESS_ITEMS = STAFF_FEATURE_KEYS.map((key) => ({ key, label: STAFF_FEATURE_LABELS[key] || key }));
        const allOn = ACCESS_ITEMS.every(({ key }) => featOn(key));
        return (
          <Dialog
            open={memberDialog.open}
            onClose={() => { setMemberDialog({ open: false, editing: null }); setMemberError(''); }}
            maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '16px', overflow: 'hidden' } }}
          >
            {/* Gradient header */}
            <Box sx={{ background: '#ffffff', border: '1px solid #ece2db', px: 3, pt: 2.5, pb: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Avatar sx={{ width: 44, height: 44, bgcolor: 'rgba(92,31,34,0.08)', fontSize: '1.1rem', fontWeight: 800, color: '#5c1f22', border: '2px solid #ece2db' }}>
                  {(memberForm.name?.[0] || (memberDialog.editing ? '?' : '+')).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#5c1f22', lineHeight: 1.2 }}>
                    {memberDialog.editing ? memberDialog.editing.name : 'New Staff Member'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#57433e', lineHeight: 1.3 }}>
                    {memberDialog.editing ? `Editing • ${memberDialog.editing.role || 'Staff'}` : 'Fill in the details below'}
                  </Typography>
                </Box>
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.5, borderRadius: '20px', bgcolor: memberForm.status !== 'inactive' ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.2)', border: `1px solid ${memberForm.status !== 'inactive' ? 'rgba(34,197,94,0.4)' : 'rgba(148,163,184,0.3)'}`, cursor: 'pointer' }}
                  onClick={() => setMemberForm(f => ({ ...f, status: f.status === 'inactive' ? 'active' : 'inactive' }))}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: memberForm.status !== 'inactive' ? '#22c55e' : '#5f4f47' }} />
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: memberForm.status !== 'inactive' ? '#16a34a' : '#5f4f47', whiteSpace: 'nowrap' }}>
                    {memberForm.status !== 'inactive' ? 'Active' : 'Inactive'}
                  </Typography>
                </Box>
              </Box>
              {/* Tab strip */}
              <Box sx={{ display: 'flex', gap: 0 }}>
                {dialogTabs.map((label, i) => (
                  <Box key={label} onClick={() => setDlgTab(i)} sx={{
                    px: 2, py: 1, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                    color: dlgTab === i ? '#5c1f22' : '#5f4f47',
                    borderBottom: dlgTab === i ? '2px solid #fff' : '2px solid transparent',
                    transition: 'all 0.15s',
                    '&:hover': { color: dlgTab === i ? '#5c1f22' : '#57433e' },
                  }}>{label}</Box>
                ))}
              </Box>
            </Box>

            <DialogContent sx={{ p: 0, '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: '#e8ddd6', borderRadius: 3 } }}>
              {memberError && (
                <Box sx={{ mx: 3, mt: 2, px: 1.5, py: 1, borderRadius: '8px', bgcolor: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AlertCircle size={14} color="#dc2626" />
                  <Typography sx={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>{memberError}</Typography>
                </Box>
              )}

              {/* ── Tab 0: Profile ── */}
              <Box sx={{ display: dlgTab === 0 ? 'block' : 'none', px: 3, py: 2.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  <TextField size="small" label="Full Name *" fullWidth value={sf('name')}
                    onChange={upd('name')} sx={{ flex: '1 1 200px' }} />
                  <TextField size="small" select label="Role" value={sf('role') || 'Sales Staff'}
                    onChange={upd('role')} sx={{ flex: '1 1 140px' }}>
                    {ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="Phone" value={sf('phone')}
                    onChange={upd('phone')} sx={{ flex: '1 1 140px' }} />
                  <TextField size="small" label="Email" value={sf('email')}
                    onChange={upd('email')} sx={{ flex: '1 1 180px' }} />
                  <TextField size="small" label="Joining Date" type="date" value={sf('joiningDate')}
                    onChange={upd('joiningDate')} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: '1 1 150px' }} />
                  <TextField size="small" label="Notes" value={sf('notes')}
                    onChange={upd('notes')} sx={{ flex: '1 1 200px' }} />
                </Box>
                <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #f6efe9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.82rem', color: '#7a2e30' }}>Show in Sales / POS staff selector</Typography>
                  <Switch size="small" checked={!!memberForm.showInSalesSelector}
                    onChange={e => setMemberForm(f => ({ ...f, showInSalesSelector: e.target.checked }))} />
                </Box>
              </Box>

              {/* ── Tab 1: Salary & Login ── */}
              <Box sx={{ display: dlgTab === 1 ? 'block' : 'none', px: 3, py: 2.5 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.07em', mb: 1.25 }}>Salary</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
                  <TextField size="small" label="Amount (₹)" type="number" value={sf('salary')}
                    onChange={upd('salary')} sx={{ flex: '1 1 140px' }} />
                  <TextField size="small" select label="Type" value={sf('salaryType') || 'monthly'}
                    onChange={upd('salaryType')} sx={{ flex: '1 1 120px' }}>
                    {SALARY_TYPES.map(t => <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</MenuItem>)}
                  </TextField>
                </Box>
                {(sf('salaryType') || 'monthly') !== 'hourly' && (() => {
                  const isDaily = sf('salaryType') === 'daily';
                  const amt = Number(sf('salary')) || 0;
                  const full = isDaily ? amt : amt / 30;
                  const halfAuto = Math.round((full / 2) * 100) / 100;
                  return (
                    <Box sx={{ mb: 2.5, p: 1.75, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: alpha('#5c1f22', 0.02) }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary', mb: 0.25 }}>Attendance pay rules</Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 1.5 }}>
                        Full day = {isDaily ? `₹${fmt(amt)}` : `salary ÷ days in month (≈ ₹${fmt(full)} for a 30-day month)`}.
                        Leave blank to use the default.
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        <TextField size="small" label="Half-day pay (₹)" type="number" value={sf('halfDayRate') ?? ''}
                          onChange={upd('halfDayRate')} placeholder={isDaily && amt ? String(halfAuto) : 'Half of a full day'}
                          helperText={isDaily && amt ? `Default ₹${fmt(halfAuto)}` : 'Default: half of a full day'}
                          slotProps={{ htmlInput: { min: 0 } }} sx={{ flex: '1 1 150px' }} />
                        <TextField size="small" label="Leave deduction (₹ / day)" type="number" value={sf('leaveDeduction') ?? ''}
                          onChange={upd('leaveDeduction')} placeholder="0"
                          helperText={isDaily ? 'Leave is unpaid; extra amount to deduct' : 'Leave is paid; amount to deduct per leave day'}
                          slotProps={{ htmlInput: { min: 0 } }} sx={{ flex: '1 1 150px' }} />
                        <TextField size="small" label="Absent deduction (₹ / day)" type="number" value={sf('absentDeduction') ?? ''}
                          onChange={upd('absentDeduction')} placeholder="0"
                          helperText="Absent days are unpaid; extra fine per day"
                          slotProps={{ htmlInput: { min: 0 } }} sx={{ flex: '1 1 150px' }} />
                      </Box>
                    </Box>
                  );
                })()}
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.07em', mb: 1.25 }}>Login Credentials</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <TextField size="small" label="Username" placeholder="e.g. rahul" value={sf('username')}
                    helperText="Used to log in — lowercase, no spaces"
                    onChange={e => setMemberForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                    sx={{ flex: '1 1 160px' }} />
                  <TextField size="small" label={memberDialog.editing ? 'Password (blank = keep)' : 'Password'} type="password"
                    value={sf('password')} onChange={upd('password')} sx={{ flex: '1 1 160px' }} />
                </Box>
              </Box>

              {/* ── Tab 2: Access ── */}
              <Box sx={{ display: dlgTab === 2 ? 'block' : 'none', px: 3, py: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Section Access</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Button size="small" onClick={() => setMemberForm(f => ({ ...f, features: ACCESS_ITEMS.reduce((a, { key }) => ({ ...a, [key]: true }), { ...(f.features || {}) }) }))}
                      sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.2, px: 0.75, minWidth: 0, color: primary, '&:hover': { bgcolor: alpha(primary, 0.06) } }}>All On</Button>
                    <Button size="small" onClick={() => setMemberForm(f => ({ ...f, features: ACCESS_ITEMS.reduce((a, { key }) => ({ ...a, [key]: false }), { ...(f.features || {}) }) }))}
                      sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.2, px: 0.75, minWidth: 0, color: '#5f4f47', '&:hover': { bgcolor: '#f6efe9' } }}>All Off</Button>
                  </Box>
                </Box>
                {STAFF_FEATURE_GROUPS.map(({ group, keys }) => (
                <Box key={group} sx={{ mb: 1.25 }}>
                <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>{group}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 0.75 }}>
                  {keys.map((key) => ({ key, label: STAFF_FEATURE_LABELS[key] || key })).map(({ key, label }) => {
                    const on = featOn(key);
                    return (
                      <Box key={key} onClick={() => toggleFeat(key)} sx={{
                        display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.875,
                        borderRadius: '8px', cursor: 'pointer', border: '1.5px solid', transition: 'all 0.12s',
                        borderColor: on ? alpha(primary, 0.35) : '#f6efe9',
                        bgcolor: on ? alpha(primary, 0.06) : '#fafafa',
                        '&:hover': { borderColor: on ? alpha(primary, 0.5) : '#e8ddd6', bgcolor: on ? alpha(primary, 0.1) : '#f6efe9' },
                      }}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, transition: 'background 0.12s',
                          bgcolor: on ? primary : '#e8ddd6' }} />
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: on ? primary : '#57433e', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {label}
                        </Typography>
                        {isModuleOffForBusiness(key, config.features) && (
                          <Tooltip title="Turned off for this business — switch it on in Settings → Features first, or staff won't see it">
                            <Box component="span" sx={{ fontSize: '0.58rem', fontWeight: 800, color: '#b45309', bgcolor: alpha('#f59e0b', 0.14), px: 0.5, py: 0.1, borderRadius: '4px', flexShrink: 0 }}>OFF</Box>
                          </Tooltip>
                        )}
                      </Box>
                    );
                  })}
                </Box>
                </Box>
                ))}
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.07em', mt: 2, mb: 0.75 }}>Restrictions</Typography>
                <Box onClick={() => toggleFeat('ownBillsOnly')} sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.875, borderRadius: '8px', cursor: 'pointer', border: '1.5px solid',
                  borderColor: featOn('ownBillsOnly') ? alpha('#d97706', 0.4) : '#f6efe9',
                  bgcolor: featOn('ownBillsOnly') ? alpha('#d97706', 0.06) : '#fafafa',
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: featOn('ownBillsOnly') ? '#b45309' : '#57433e' }}>Show only bills created by this staff</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: '#5f4f47' }}>Sales & Purchases lists show only the invoices / bills they created.</Typography>
                  </Box>
                  <Switch size="small" checked={featOn('ownBillsOnly')} onClick={(e) => e.stopPropagation()} onChange={() => toggleFeat('ownBillsOnly')} />
                </Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#5f4f47', mt: 0.75 }}>
                  Staff logins never see summary totals (receivables, payables, invoice totals, stock value).
                </Typography>
                {allOn && (
                  <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Check size={13} color={primary} />
                    <Typography sx={{ fontSize: '0.75rem', color: primary, fontWeight: 600 }}>Full access granted</Typography>
                  </Box>
                )}
              </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f6efe9', bgcolor: '#fafafa', gap: 1 }}>
              <Button onClick={() => { setMemberDialog({ open: false, editing: null }); setMemberError(''); }}
                sx={{ borderRadius: '8px', textTransform: 'none', color: '#57433e', '&:hover': { bgcolor: '#f6efe9' } }}>
                Cancel
              </Button>
              <Box sx={{ flex: 1, display: 'flex', gap: 0.75 }}>
                {dialogTabs.map((label, i) => (
                  <Box key={i} onClick={() => setDlgTab(i)}
                    sx={{ flex: 1, height: 3, borderRadius: '2px', cursor: 'pointer', transition: 'background 0.15s',
                      bgcolor: dlgTab === i ? primary : '#e8ddd6' }} />
                ))}
              </Box>
              <Button variant="contained" onClick={saveMember} disabled={!memberForm.name?.trim()}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, px: 2.5,
                  bgcolor: primary, '&:hover': { bgcolor: '#3f1417' }, '&.Mui-disabled': { bgcolor: alpha(primary, 0.2), color: alpha(primary, 0.45) } }}>
                {memberDialog.editing ? 'Save Changes' : 'Add Member'}
              </Button>
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* Hidden payslip for printing */}
      <div style={{ position: 'absolute', left: -99999, top: 0 }}>
        <PayslipTemplate ref={payslipRef} data={payslipData} />
      </div>

      {/* ══ DELETE CONFIRM ════════════════════════════════════════════════════ */}
      {/* ── Salary Payment Dialog ── */}
      <Dialog open={!!salPayDialog} onClose={() => { setSalPayDialog(null); setSalPayError(''); }} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
          Pay Salary — {salPayDialog?.member?.name}
          {salPayDialog && (salPayDialog.payYear !== salYear || salPayDialog.payMonth !== salMonth) && (
            <Typography component="span" sx={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#b91c1c', mt: 0.25 }}>
              Settling previous dues — {monthName(salPayDialog.payMonth)} {salPayDialog.payYear}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            {[
              { k: 'Net', v: salPayDialog?.netSalary || 0, c: 'text.primary' },
              { k: 'Paid', v: salPayDialog?.paidSoFar || 0, c: '#22c55e' },
              { k: 'Balance', v: salPayDialog?.balance || 0, c: (salPayDialog?.balance || 0) > 0 ? '#dc2626' : '#22c55e' },
            ].map(x => (
              <Box key={x.k} sx={{ flex: 1, textAlign: 'center', p: 0.75, borderRadius: '8px', bgcolor: '#f7f2ee', border: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{x.k}</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: x.c }}>₹{fmt(x.v)}</Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {new Date(salPayDialog?.payYear ?? salYear, salPayDialog?.payMonth ?? salMonth, 1).toLocaleString('en-IN', { month: 'long' })} {salPayDialog?.payYear ?? salYear}
            {' · '}{salPayDialog?.member?.salaryType === 'daily' ? 'daily wage' : salPayDialog?.member?.salaryType === 'hourly' ? 'hourly wage' : 'monthly'}
          </Typography>

          {salPayError && (
            <Box sx={{ mb: 2, p: 1.25, borderRadius: '8px', bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
              <Typography sx={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>{salPayError}</Typography>
            </Box>
          )}

          {/* Amount to pay now */}
          <TextField
            size="small" label="Amount to pay now (₹)" type="number" fullWidth autoFocus sx={{ mb: 2 }}
            value={salPayForm.amount}
            onChange={e => {
              const v = e.target.value;
              setSalPayForm(f => ({
                ...f, amount: v,
                cashAmt: f.paymentMode === 'Cash' ? v : f.cashAmt,
                bankAmt: f.paymentMode === 'Bank' ? v : f.bankAmt,
              }));
            }}
            helperText={
              (salPayDialog?.balance || 0) > 0
                ? `Pay the full ₹${fmt(salPayDialog.balance)} to settle, or less for a partial / advance payment.`
                : 'No balance due — recording this is optional.'
            }
          />

          {/* Payment Mode */}
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', mb: 0.75 }}>Payment Mode</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 2 }}>
            {['Cash', 'Bank', 'Split'].map(mode => (
              <Box key={mode} onClick={() => {
                const amt = salPayForm.amount || '';
                setSalPayForm(f => ({
                  ...f, paymentMode: mode,
                  cashAmt: mode === 'Cash' ? amt : mode === 'Split' ? '' : '',
                  bankAmt: mode === 'Bank' ? amt : mode === 'Split' ? '' : '',
                }));
              }}
                sx={{
                  flex: 1, py: 0.75, textAlign: 'center', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                  border: '1.5px solid', transition: 'all 0.12s',
                  borderColor: salPayForm.paymentMode === mode ? primary : '#e5e7eb',
                  bgcolor: salPayForm.paymentMode === mode ? alpha(primary, 0.08) : '#fafafa',
                  color: salPayForm.paymentMode === mode ? primary : '#57433e',
                }}>
                {mode}
              </Box>
            ))}
          </Box>

          {salPayForm.paymentMode === 'Split' && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField size="small" label="Cash ₹" type="number" fullWidth
                value={salPayForm.cashAmt}
                onChange={e => setSalPayForm(f => ({ ...f, cashAmt: e.target.value }))}
                helperText={`Cash + Bank must total ₹${fmt(Number(salPayForm.amount) || 0)}`}
              />
              <TextField size="small" label="Bank ₹" type="number" fullWidth
                value={salPayForm.bankAmt}
                onChange={e => setSalPayForm(f => ({ ...f, bankAmt: e.target.value }))}
              />
            </Box>
          )}

          {/* Payment history for this month */}
          {Array.isArray(salPayDialog?.existing?.payments) && salPayDialog.existing.payments.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
                Payments so far
              </Typography>
              {salPayDialog.existing.payments.map((p, i) => (
                <Box key={p.id || i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.4, borderBottom: i < salPayDialog.existing.payments.length - 1 ? '1px dashed' : 'none', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                    {new Date(p.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {p.paymentMode}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>₹{fmt(p.amount)}</Typography>
                </Box>
              ))}
            </Box>
          )}

          <TextField size="small" label="Payment Date" type="date" fullWidth sx={{ mb: 1.5 }}
            value={salPayForm.date}
            onChange={e => setSalPayForm(f => ({ ...f, date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField size="small" label="Notes (optional)" fullWidth
            value={salPayForm.notes}
            onChange={e => setSalPayForm(f => ({ ...f, notes: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ pb: 2.5, px: 2.5, gap: 1 }}>
          <Button onClick={() => { setSalPayDialog(null); setSalPayError(''); }} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" sx={{ borderRadius: 2, fontWeight: 700, bgcolor: primary, '&:hover': { bgcolor: '#3f1417' } }}
            onClick={confirmSalaryPayment}>
            Confirm Payment
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Staff Member?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Remove <strong>{deleteConfirm?.name}</strong> from your team? This also removes their attendance and salary records.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ pb: 2.5, px: 2.5 }}>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" color="error" sx={{ borderRadius: 2, fontWeight: 600 }} onClick={() => {
            const id = deleteConfirm.id;
            deleteItem('staffMembers', id);
            rawAttendance.filter(a => String(a.staffId) === String(id)).forEach(a => deleteItem('staffAttendance', a.id));
            rawSalary.filter(s => String(s.staffId) === String(id)).forEach(s => deleteItem('staffSalary', s.id));
            deleteFromStaffAccounts(id);
            setDeleteConfirm(null);
          }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
