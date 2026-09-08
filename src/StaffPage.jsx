import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useTheme as useMuiTheme } from '@mui/material/styles';

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
  const map = { Manager: '#6366f1', Cashier: '#0ea5e9', 'Sales Staff': '#22c55e', Delivery: '#f59e0b', Accountant: '#8b5cf6', Helper: '#64748b', Security: '#ef4444', Other: '#64748b' };
  return map[role] || '#6366f1';
};

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const today = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
};

export default function StaffPage() {
  const theme = useMuiTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  const { currentBusiness } = useBusiness();
  const { addItem, updateItem, deleteItem, getItems } = useData();
  const bId = currentBusiness?.id;

  const rawMembers = getItems('staffMembers').filter(s => s.businessId === bId);
  const rawAttendance = getItems('staffAttendance').filter(s => s.businessId === bId);
  const rawSalary = getItems('staffSalary').filter(s => s.businessId === bId);

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().split('T')[0]);

  // ─ Members state ─
  const [memberDialog, setMemberDialog] = useState({ open: false, editing: null });
  const [memberForm, setMemberForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ─ Attendance state ─
  const t = today();
  const [attMonth, setAttMonth] = useState(t.month);
  const [attYear, setAttYear] = useState(t.year);

  // ─ Salary state ─
  const [salMonth, setSalMonth] = useState(t.month);
  const [salYear, setSalYear] = useState(t.year);

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
    rawAttendance.forEach(a => { m[`${a.staffId}_${a.date}`] = a; });
    return m;
  }, [rawAttendance]);

  const getAtt = (staffId, day) => {
    const dateStr = `${attYear}-${String(attMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return attMap[`${staffId}_${dateStr}`];
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
  const calcNetSalary = (member, year, month) => {
    if (member.salaryType === 'monthly') return member.salary || 0;
    if (member.salaryType === 'daily') {
      const days = getDaysInMonth(year, month);
      const summary = getMonthAttendanceSummary_ym(member.id, year, month);
      const worked = summary.present + summary.halfDay * 0.5;
      return Math.round((member.salary || 0) * worked);
    }
    return member.salary || 0;
  };

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
    rawSalary.find(s => s.staffId === staffId && s.month === salMonth && s.year === salYear);

  const toggleSalaryPaid = (member) => {
    const existing = getSalaryRecord(member.id);
    const net = calcNetSalary(member, salYear, salMonth);
    if (existing) {
      if (existing.status === 'paid') {
        updateItem('staffSalary', existing.id, { status: 'pending', paidDate: null });
      } else {
        updateItem('staffSalary', existing.id, { status: 'paid', paidDate: new Date().toISOString() });
      }
    } else {
      addItem('staffSalary', {
        businessId: bId, staffId: member.id, staffName: member.name,
        month: salMonth, year: salYear,
        baseSalary: member.salary || 0, netSalary: net,
        status: 'paid', paidDate: new Date().toISOString(),
        id: Date.now() + Math.random(),
      });
    }
  };

  // ─ Member dialog ─
  const openAddMember = () => {
    setMemberForm({ name: '', role: 'Sales Staff', phone: '', email: '', salary: '', salaryType: 'monthly', joiningDate: '', notes: '', status: 'active' });
    setMemberDialog({ open: true, editing: null });
  };
  const openEditMember = (m) => {
    setMemberForm({ ...m });
    setMemberDialog({ open: true, editing: m });
  };
  const saveMember = () => {
    if (!memberForm.name?.trim()) return;
    const record = { ...memberForm, salary: Number(memberForm.salary) || 0, businessId: bId };
    if (memberDialog.editing) {
      updateItem('staffMembers', memberDialog.editing.id, record);
    } else {
      addItem('staffMembers', { ...record, id: Date.now() });
    }
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
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1, color: '#fff' }}>{value}</Typography>
        <Typography variant="caption" sx={{ color: alpha('#fff', 0.7), lineHeight: 1.2 }}>{label}</Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1320, mx: 'auto' }}>
      {/* ── Hero ── */}
      <Box sx={{
        borderRadius: 4,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #4f46e5 100%)',
        p: { xs: 2.5, sm: 3.5 },
        mb: 3,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: alpha('#fff', 0.04), pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -30, right: 80, width: 120, height: 120, borderRadius: '50%', bgcolor: alpha('#fff', 0.03), pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff', mb: 0.5 }}>Staff Management</Typography>
            <Typography variant="body2" sx={{ color: alpha('#fff', 0.7) }}>Manage your team, track attendance and process payroll</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={openAddMember}
            sx={{ bgcolor: alpha('#fff', 0.15), color: '#fff', backdropFilter: 'blur(4px)', borderRadius: 2, fontWeight: 600, border: `1px solid ${alpha('#fff', 0.2)}`, '&:hover': { bgcolor: alpha('#fff', 0.25) } }}
          >
            Add Staff
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: { xs: 3, sm: 5 }, mt: 3, flexWrap: 'wrap' }}>
          <StatCard icon={Users} value={activeMembers.length} label="Total Active Staff" color="#a5b4fc" />
          <StatCard icon={UserCheck} value={presentToday} label="Present Today" color="#6ee7b7" />
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
              <Box sx={{ minWidth: 700 }}>
                {/* Header row */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '160px repeat(' + daysInMonth + ', 1fr)', bgcolor: isDark ? alpha('#fff', 0.04) : '#f8fafc', borderBottom: `1px solid ${theme.palette.divider}` }}>
                  <Box sx={{ p: 1, pl: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Staff</Typography>
                  </Box>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                    const dayOfWeek = new Date(attYear, attMonth, d).getDay();
                    const isSun = dayOfWeek === 0;
                    const isToday = attYear === t.year && attMonth === t.month && d === t.day;
                    return (
                      <Box key={d} sx={{ p: 0.5, textAlign: 'center', borderLeft: `1px solid ${theme.palette.divider}` }}>
                        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: isSun ? '#ef4444' : 'text.secondary', fontWeight: isToday ? 800 : 500 }}>{d}</Typography>
                        <Typography sx={{ display: 'block', fontSize: '0.55rem', color: 'text.disabled' }}>{DAYS_IN_WEEK[dayOfWeek].slice(0, 1)}</Typography>
                      </Box>
                    );
                  })}
                </Box>

                {/* Staff rows */}
                {activeMembers.map((m, mi) => (
                  <Box key={m.id} sx={{ display: 'grid', gridTemplateColumns: '160px repeat(' + daysInMonth + ', 1fr)', borderBottom: mi < activeMembers.length - 1 ? `1px solid ${theme.palette.divider}` : 'none', '&:hover': { bgcolor: isDark ? alpha('#fff', 0.02) : '#fafbfc' } }}>
                    <Box sx={{ p: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 24, height: 24, fontSize: '0.65rem', bgcolor: alpha(roleColor(m.role), 0.15), color: roleColor(m.role) }}>{initials(m.name)}</Avatar>
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
                              height: 36, cursor: 'pointer',
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
                  const isPaid = salRec?.status === 'paid';
                  const netSalary = calcNetSalary(m, salYear, salMonth);
                  const attSummary = getMonthAttendanceSummary_ym(m.id, salYear, salMonth);

                  return (
                    <Grid item xs={12} sm={6} md={4} key={m.id}>
                      <Card elevation={0} sx={{ ...cardSx, position: 'relative', overflow: 'visible' }}>
                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: '12px 12px 0 0', bgcolor: isPaid ? '#22c55e' : '#f59e0b' }} />
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
                              label={isPaid ? 'Paid' : 'Pending'}
                              size="small"
                              sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: isPaid ? alpha('#22c55e', 0.1) : alpha('#f59e0b', 0.1), color: isPaid ? '#22c55e' : '#d97706' }}
                            />
                          </Box>

                          <Divider sx={{ mb: 1.5 }} />

                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">Base ({m.salaryType})</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>₹{fmt(m.salary)}</Typography>
                          </Box>

                          {m.salaryType === 'daily' && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="caption" color="text.secondary">Days worked</Typography>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {attSummary.present + attSummary.halfDay * 0.5} / {getDaysInMonth(salYear, salMonth)}
                              </Typography>
                            </Box>
                          )}

                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>Net Salary</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: primary }}>₹{fmt(netSalary)}</Typography>
                          </Box>

                          {isPaid && salRec?.paidDate && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
                              Paid on {new Date(salRec.paidDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Typography>
                          )}

                          <Button
                            fullWidth
                            variant={isPaid ? 'outlined' : 'contained'}
                            size="small"
                            color={isPaid ? 'success' : 'primary'}
                            startIcon={isPaid ? <Check size={14} /> : <DollarSign size={14} />}
                            onClick={() => toggleSalaryPaid(m)}
                            sx={{ borderRadius: 2, fontWeight: 600, mt: 0.5 }}
                          >
                            {isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}
                          </Button>
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
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    {[
                      { label: 'Paid', color: '#22c55e', count: activeMembers.filter(m => getSalaryRecord(m.id)?.status === 'paid').length },
                      { label: 'Pending', color: '#f59e0b', count: activeMembers.filter(m => !getSalaryRecord(m.id) || getSalaryRecord(m.id)?.status === 'pending').length },
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
      <Dialog open={memberDialog.open} onClose={() => setMemberDialog({ open: false, editing: null })} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 0 }}>
          {memberDialog.editing ? 'Edit Staff Member' : 'Add Staff Member'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Full Name" size="small" value={memberForm.name || ''} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select label="Role" value={memberForm.role || 'Sales Staff'} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Phone" size="small" value={memberForm.phone || ''} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Email" size="small" value={memberForm.email || ''} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Salary Amount (₹)" size="small" type="number" value={memberForm.salary || ''} onChange={e => setMemberForm(f => ({ ...f, salary: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Salary Type</InputLabel>
                <Select label="Salary Type" value={memberForm.salaryType || 'monthly'} onChange={e => setMemberForm(f => ({ ...f, salaryType: e.target.value }))}>
                  {SALARY_TYPES.map(t => <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Joining Date" size="small" type="date" InputLabelProps={{ shrink: true }} value={memberForm.joiningDate || ''} onChange={e => setMemberForm(f => ({ ...f, joiningDate: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select label="Status" value={memberForm.status || 'active'} onChange={e => setMemberForm(f => ({ ...f, status: e.target.value }))}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={!!memberForm.showInSalesSelector} onChange={e => setMemberForm(f => ({ ...f, showInSalesSelector: e.target.checked }))} />}
                label="Show in Sales / POS staff selector"
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Section Access (for staff login)
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {[
                  { key: 'dashboard', label: 'Dashboard' },
                  { key: 'parties', label: 'Parties' },
                  { key: 'items', label: 'Items' },
                  { key: 'pos', label: 'POS' },
                  { key: 'sales', label: 'Sales' },
                  { key: 'purchases', label: 'Purchases' },
                  { key: 'expenses', label: 'Expenses' },
                  { key: 'payments', label: 'Payments' },
                  { key: 'cash', label: 'Cash & Bank' },
                  { key: 'reports', label: 'Reports' },
                  { key: 'estimates', label: 'Estimates' },
                  { key: 'creditNotes', label: 'Credit Notes' },
                  { key: 'debitNotes', label: 'Debit Notes' },
                  { key: 'deliveryNotes', label: 'Delivery Notes' },
                  { key: 'ledger', label: 'Ledger' },
                  { key: 'membership', label: 'Membership' },
                  { key: 'opticals', label: 'Opticals' },
                  { key: 'viewPurchasePrice', label: 'View Purchase Price' },
                ].map(({ key, label }) => {
                  const on = !!(memberForm.features || {})[key];
                  return (
                    <Chip
                      key={key}
                      label={label}
                      size="small"
                      clickable
                      onClick={() => setMemberForm(f => ({ ...f, features: { ...(f.features || {}), [key]: !on } }))}
                      sx={{
                        fontWeight: 600, fontSize: '0.72rem',
                        bgcolor: on ? 'primary.main' : 'action.hover',
                        color: on ? '#fff' : 'text.secondary',
                        '&:hover': { opacity: 0.85 },
                      }}
                    />
                  );
                })}
              </Box>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Notes (optional)" size="small" multiline rows={2} value={memberForm.notes || ''} onChange={e => setMemberForm(f => ({ ...f, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setMemberDialog({ open: false, editing: null })} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" onClick={saveMember} disabled={!memberForm.name?.trim()} sx={{ borderRadius: 2, fontWeight: 600 }}>
            {memberDialog.editing ? 'Save Changes' : 'Add Member'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ DELETE CONFIRM ════════════════════════════════════════════════════ */}
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
            deleteItem('staffMembers', deleteConfirm.id);
            rawAttendance.filter(a => a.staffId === deleteConfirm.id).forEach(a => deleteItem('staffAttendance', a.id));
            rawSalary.filter(s => s.staffId === deleteConfirm.id).forEach(s => deleteItem('staffSalary', s.id));
            setDeleteConfirm(null);
          }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
