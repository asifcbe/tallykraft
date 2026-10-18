import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Box, Table, TableHead, TableBody, TableRow, TableCell, TableSortLabel,
  Checkbox, IconButton, Chip, Tooltip, TablePagination, Menu, MenuItem,
  Popover, TextField, Typography, alpha,
} from '@mui/material';
import { Filter, Eye, Share2, Printer, MoreVertical, X, ReceiptText } from 'lucide-react';
import { txSortKey, formatCreatedTime } from './txTimeUtils';
import { isPartPaid, txPaidSoFar, txOutstanding, txWrittenOff } from './paymentUtils';

// Same visual language as TxListView.jsx's own ConvertedChip — small green
// "Converted" indicator shown next to a row's number once it has already
// been converted to a sale.
const ConvertedChip = ({ label, onClick }) => (
  <Tooltip title={label}>
    <Chip
      size="small"
      icon={<ReceiptText size={11} />}
      label={label}
      onClick={onClick}
      sx={{
        fontWeight: 700, fontSize: '0.62rem', height: 20, ml: 0.75,
        bgcolor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
        cursor: onClick ? 'pointer' : 'default',
        '& .MuiChip-icon': { color: '#15803d' },
      }}
    />
  </Tooltip>
);

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const daysOverdue = (dueDate) => {
  if (!dueDate) return 0;
  const due = new Date(dueDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((today - due) / 86400000);
};

// Same color code as Sales.jsx's STATUS_COLOR — kept as an identical
// literal here (not imported) since this component is generic/shared
// across Sales, Purchases, Estimates, Credit/Debit/Delivery Notes. Used
// for both the Status chip and the full-row mild tint below, so a row's
// background always agrees with its own chip and the filter pills above.
const STATUS_COLOR = { paid: '#16a34a', unpaid: '#ca8a04', overdue: '#dc2626', partial: '#2563eb' };

// Column filter popover — text contains-match for strings, exact-match
// checkbox list for a fixed set of options (e.g. Payment Type, Status).
const ColumnFilterIcon = ({ active, onClick }) => (
  <IconButton size="small" onClick={onClick} sx={{ p: 0.25, ml: 0.25, color: active ? 'primary.main' : 'text.disabled' }}>
    <Filter size={12} fill={active ? 'currentColor' : 'none'} />
  </IconButton>
);

const TextFilterPopover = ({ anchorEl, onClose, value, onChange, label }) => (
  <Popover
    open={Boolean(anchorEl)}
    anchorEl={anchorEl}
    onClose={onClose}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
  >
    <Box sx={{ p: 1.5, width: 220 }}>
      <TextField
        autoFocus
        fullWidth
        size="small"
        placeholder={`Filter ${label}…`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{ input: { endAdornment: value ? (
          <IconButton size="small" onClick={() => onChange('')}><X size={13} /></IconButton>
        ) : null } }}
      />
    </Box>
  </Popover>
);

const HeaderCell = ({ field, label, filterKey, filterActive, align = 'left', minWidth, sortBy, sortDir, onSort, onOpenFilter }) => (
  <TableCell align={align} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', minWidth, bgcolor: 'rgba(0,0,0,0.015)' }}>
    <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {field ? (
        <TableSortLabel active={sortBy === field} direction={sortBy === field ? sortDir : 'asc'} onClick={() => onSort(field)}
          sx={{ '&.MuiTableSortLabel-root': { color: 'inherit' }, '&.Mui-active': { color: 'text.primary' } }}>
          {label}
        </TableSortLabel>
      ) : label}
      {filterKey && <ColumnFilterIcon active={filterActive} onClick={onOpenFilter(filterKey)} />}
    </Box>
  </TableCell>
);

const OptionFilterPopover = ({ anchorEl, onClose, options, selected, onToggle, onClear }) => (
  <Popover
    open={Boolean(anchorEl)}
    anchorEl={anchorEl}
    onClose={onClose}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
  >
    <Box sx={{ py: 0.5, minWidth: 170 }}>
      {options.map((opt) => (
        <MenuItem key={opt.value} dense onClick={() => onToggle(opt.value)} sx={{ gap: 1 }}>
          <Checkbox size="small" checked={selected.has(opt.value)} sx={{ p: 0 }} />
          <Typography variant="body2">{opt.label}</Typography>
        </MenuItem>
      ))}
      {selected.size > 0 && (
        <MenuItem dense onClick={onClear} sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
          Clear filter
        </MenuItem>
      )}
    </Box>
  </Popover>
);

/**
 * Dense filterable data table for transaction lists (Sales/Purchases,
 * Estimates, Credit/Debit/Delivery Notes) — matches the "Transactions" table
 * layout: per-column filter icons in the header, the eye icon (only) opens a
 * read-only preview (no inline edit) — clicking elsewhere on the row does
 * nothing, and no record is previewed by default. Row actions are
 * Print / Share / More (⋮).
 *
 * Columns are opt-in via accessors — a column is omitted entirely when its
 * accessor returns undefined for every row (e.g. Estimates has no Payment
 * Type/Status), so this one component serves every document type.
 *
 * Props:
 *  - records: array (already filtered by parent date-range/search if any)
 *  - accessors: { id, number, party, phone, transaction, paymentMode, amount,
 *                 date, dueDate, status, isCash }
 *  - onRowClick(record) — opens preview; wired only to the eye icon
 *  - onEdit / onDelete / onShare / onPrint / extraMenuItems(record) — row actions;
 *    onEdit also fires on a row double-click, opening the record straight into
 *    edit mode without going through the "more" menu
 *  - isConverted(record) / convertedLabel(record) / onViewConverted(record)
 *    — optional; shows a small "Converted" chip next to the number cell
 *  - selectable / selectedIds / setSelectedIds — bulk-select checkboxes
 *  - defaultRowsPerPage — defaults to 50
 */
const TxDataTable = ({
  records,
  accessors = {},
  onRowClick,
  onEdit,
  onDelete,
  onShare,
  onPrint,
  extraMenuItems,
  isConverted,
  convertedLabel,
  onViewConverted,
  selectable = false,
  selectedIds,
  setSelectedIds,
  defaultRowsPerPage = 50,
}) => {
  const a = {
    id: (r) => r.id,
    number: (r) => r.invoiceNumber || r.number || '',
    party: (r) => r.partyName || '',
    phone: (r) => r.partyPhone || '',
    transaction: (r) => r.type || '',
    paymentMode: (r) => r.paymentMode,
    amount: (r) => Number(r.totalAmount ?? r.total ?? 0),
    date: (r) => r.date,
    dueDate: (r) => r.dueDate,
    status: (r) => r.status,
    isCash: (r) => !r.partyId,
    ...accessors,
  };

  // Detect which optional columns actually carry data for this record set —
  // an Estimates/Notes table has no paymentMode/status, so those columns
  // disappear rather than rendering as an always-empty column.
  const hasCol = useMemo(() => ({
    phone: records.some((r) => a.phone(r) != null && a.phone(r) !== ''),
    transaction: records.some((r) => a.transaction(r) != null && a.transaction(r) !== ''),
    paymentMode: records.some((r) => a.paymentMode(r) != null && a.paymentMode(r) !== ''),
    dueDate: records.some((r) => a.dueDate(r)),
    status: records.some((r) => a.status(r) != null && a.status(r) !== ''),
  }), [records]); // eslint-disable-line react-hooks/exhaustive-deps

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [rowMenu, setRowMenu] = useState({ anchorEl: null, record: null });

  // Per-column filter state.
  const [numberFilter, setNumberFilter] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [transactionFilter, setTransactionFilter] = useState(new Set());
  const [paymentFilter, setPaymentFilter] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState(new Set());
  const [filterAnchor, setFilterAnchor] = useState({ key: null, el: null });
  const openFilter = (key) => (e) => setFilterAnchor({ key, el: e.currentTarget });
  const closeFilter = () => setFilterAnchor({ key: null, el: null });

  const transactionOptions = useMemo(() => {
    const set = new Set(records.map((r) => a.transaction(r)).filter(Boolean));
    return [...set].map((v) => ({ value: v, label: v }));
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps
  const paymentOptions = useMemo(() => {
    const set = new Set(records.map((r) => a.paymentMode(r)).filter(Boolean));
    return [...set].map((v) => ({ value: v, label: v }));
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps
  const statusOptions = useMemo(() => {
    const set = new Set(records.map((r) => {
      const s = a.status(r);
      if (s) return s === 'paid' ? 'paid' : 'unpaid';
      return null;
    }).filter(Boolean));
    const opts = [...set].map((v) => ({ value: v, label: v === 'paid' ? 'Paid' : 'Unpaid' }));
    if (records.some((r) => isPartPaid(r))) opts.push({ value: 'partial', label: 'Part Paid' });
    if (records.some((r) => a.dueDate(r) && a.status(r) !== 'paid' && daysOverdue(a.dueDate(r)) > 0)) {
      opts.push({ value: 'overdue', label: 'Overdue' });
    }
    return opts;
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSetValue = (setter) => (value) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });

  const filtered = useMemo(() => {
    let list = records;
    if (numberFilter.trim()) {
      const q = numberFilter.trim().toLowerCase();
      list = list.filter((r) => String(a.number(r) || '').toLowerCase().includes(q));
    }
    if (partyFilter.trim()) {
      const q = partyFilter.trim().toLowerCase();
      list = list.filter((r) => String(a.party(r) || '').toLowerCase().includes(q));
    }
    if (phoneFilter.trim()) {
      // Digits-only match so a partial number (with or without spaces/dashes) still finds the record.
      const q = phoneFilter.replace(/\D/g, '');
      list = list.filter((r) => String(a.phone(r) || '').replace(/\D/g, '').includes(q));
    }
    if (transactionFilter.size > 0) list = list.filter((r) => transactionFilter.has(a.transaction(r)));
    if (paymentFilter.size > 0) list = list.filter((r) => paymentFilter.has(a.paymentMode(r)));
    if (statusFilter.size > 0) {
      list = list.filter((r) => {
        const isPaid = a.status(r) === 'paid';
        const overdue = !isPaid && a.dueDate(r) && daysOverdue(a.dueDate(r)) > 0;
        const tags = [isPaid ? 'paid' : 'unpaid', ...(overdue ? ['overdue'] : []), ...(isPartPaid(r) ? ['partial'] : [])];
        return tags.some((tag) => statusFilter.has(tag));
      });
    }
    return [...list].sort((x, y) => {
      let cmp = 0;
      if (sortBy === 'amount') cmp = a.amount(x) - a.amount(y);
      else if (sortBy === 'party') cmp = (a.party(x) || '').localeCompare(a.party(y) || '', undefined, { numeric: true, sensitivity: 'base' });
      else if (sortBy === 'number') cmp = String(a.number(x) || '').localeCompare(String(a.number(y) || ''), undefined, { numeric: true, sensitivity: 'base' });
      else {
        cmp = new Date(a.date(x)) - new Date(a.date(y));
        // Same-date tiebreak: real creation timestamp first (true creation
        // order), invoice number as a last-resort fallback for any record
        // saved before createdAt existed.
        if (cmp === 0) cmp = txSortKey(x) - txSortKey(y);
        if (cmp === 0) cmp = String(a.number(x) || '').localeCompare(String(a.number(y) || ''), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [records, numberFilter, partyFilter, phoneFilter, transactionFilter, paymentFilter, statusFilter, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageRecords = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('desc'); }
  };

  const headerProps = { sortBy, sortDir, onSort: handleSort, onOpenFilter: openFilter };

  // Land on the first row of a new page — scroll the table body back to the top
  // whenever the page or page-size changes.
  const scrollBoxRef = useRef(null);
  useEffect(() => {
    scrollBoxRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [page, rowsPerPage]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, width: '100%' }}>
      <Box ref={scrollBoxRef} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox" sx={{ bgcolor: 'rgba(0,0,0,0.015)' }}>
                  <Checkbox
                    size="small"
                    indeterminate={selectedIds?.size > 0 && selectedIds?.size < filtered.length}
                    checked={filtered.length > 0 && selectedIds?.size === filtered.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds?.(new Set(filtered.map((r) => a.id(r))));
                      else setSelectedIds?.(new Set());
                    }}
                  />
                </TableCell>
              )}
              <HeaderCell {...headerProps} field="date" label="Date" minWidth={100} />
              <HeaderCell {...headerProps} field="number" label="Invoice no" filterKey="number" filterActive={!!numberFilter} minWidth={110} />
              <HeaderCell {...headerProps} field="party" label="Party Name" filterKey="party" filterActive={!!partyFilter} minWidth={160} />
              {hasCol.phone && <HeaderCell {...headerProps} label="Phone Number" filterKey="phone" filterActive={!!phoneFilter} minWidth={130} />}
              {hasCol.transaction && <HeaderCell {...headerProps} label="Transaction" filterKey="transaction" filterActive={transactionFilter.size > 0} minWidth={90} />}
              {hasCol.paymentMode && <HeaderCell {...headerProps} label="Payment Type" filterKey="payment" filterActive={paymentFilter.size > 0} minWidth={110} />}
              <HeaderCell {...headerProps} field="amount" label="Amount" align="right" minWidth={100} />
              {hasCol.dueDate && <HeaderCell {...headerProps} label="Due date" minWidth={100} />}
              {hasCol.status && <HeaderCell {...headerProps} label="Status" filterKey="status" filterActive={statusFilter.size > 0} minWidth={100} />}
              {/* Sticky to the right edge of the scrollable table (in
                  addition to stickyHeader's own top-stick) so Print/Share/
                  More are always one click away, without first scrolling
                  all the way right on a wide table (minWidth:900, more
                  columns than fit most viewports). zIndex above the
                  regular sticky header (1) so it stays on top at the
                  header/body corner too. */}
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', bgcolor: 'rgba(0,0,0,0.015)', minWidth: 120, position: 'sticky', right: 0, zIndex: 2, boxShadow: '-4px 0 6px -4px rgba(0,0,0,0.12)' }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRecords.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                  No matching records
                </TableCell>
              </TableRow>
            )}
            {pageRecords.map((r, idx) => {
              const id = a.id(r);
              const due = a.dueDate(r);
              const status = a.status(r);
              const overdue = due && status !== 'paid' && daysOverdue(due) > 0;
              const partPaid = isPartPaid(r);
              const statusKey = overdue ? 'overdue' : status === 'unpaid' ? 'unpaid' : status === 'paid' ? 'paid' : null;
              const rowColor = statusKey && statusKey !== 'paid' ? STATUS_COLOR[statusKey] : null;
              const statusTint = hasCol.status && rowColor ? alpha(rowColor, 0.055) : null;
              return (
                <TableRow
                  key={id}
                  hover
                  onDoubleClick={onEdit ? () => onEdit(r) : undefined}
                  sx={{
                    '&:last-child td': { borderBottom: 0 },
                    bgcolor: statusTint || (idx % 2 === 1 ? 'rgba(0,0,0,0.02)' : 'transparent'),
                    '&:hover': { bgcolor: statusTint ? alpha(rowColor, 0.1) : 'rgba(0,0,0,0.045)' },
                    cursor: onEdit ? 'pointer' : 'default',
                  }}
                >
                  {selectable && (
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={selectedIds?.has(id) || false}
                        onChange={(e) => {
                          setSelectedIds?.((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(id); else next.delete(id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                  )}
                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {fmtDate(a.date(r))}
                    {formatCreatedTime(r) && (
                      <Typography component="div" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 500, lineHeight: 1.3 }}>
                        {formatCreatedTime(r)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {a.number(r)}
                    {isConverted?.(r) && (
                      <ConvertedChip
                        label={convertedLabel?.(r) || 'Converted'}
                        onClick={onViewConverted ? (e) => { e.stopPropagation(); onViewConverted(r); } : undefined}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.isCash(r) ? (
                      <Chip size="small" label={a.party(r) || 'Cash'} sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, bgcolor: 'rgba(100,116,139,0.08)', color: 'success.dark', border: '1px solid rgba(100,116,139,0.22)' }} />
                    ) : (a.party(r) || '—')}
                  </TableCell>
                  {hasCol.phone && <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{a.phone(r) || '—'}</TableCell>}
                  {hasCol.transaction && <TableCell sx={{ fontSize: '0.8rem' }}>{a.transaction(r) === 'Purchases' ? 'Purchase' : a.transaction(r) || '—'}</TableCell>}
                  {hasCol.paymentMode && <TableCell sx={{ fontSize: '0.8rem' }}>{a.paymentMode(r) || (status === 'unpaid' ? 'Credit' : '—')}</TableCell>}
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 700 }}>₹{a.amount(r).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</TableCell>
                  {hasCol.dueDate && (
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: overdue ? STATUS_COLOR.overdue : 'inherit', fontWeight: overdue ? 700 : 400 }}>
                      {due ? fmtDate(due) : '—'}
                    </TableCell>
                  )}
                  {hasCol.status && (
                    <TableCell>
                      {overdue ? (
                        <Chip size="small" label={`Overdue (${daysOverdue(due)}d)${partPaid ? ' · Part Paid' : ''}`} sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, bgcolor: alpha(STATUS_COLOR.overdue, 0.1), color: STATUS_COLOR.overdue }} />
                      ) : partPaid ? (
                        <Chip size="small" label="Part Paid" sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, bgcolor: alpha(STATUS_COLOR.partial, 0.1), color: STATUS_COLOR.partial }} />
                      ) : status ? (
                        <Chip size="small" label={status === 'paid' ? 'Paid' : 'Unpaid'} sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, bgcolor: alpha(status === 'paid' ? STATUS_COLOR.paid : STATUS_COLOR.unpaid, 0.1), color: status === 'paid' ? STATUS_COLOR.paid : STATUS_COLOR.unpaid }} />
                      ) : '—'}
                      {partPaid && (
                        <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary', mt: 0.25, whiteSpace: 'nowrap' }}>
                          Paid <Box component="span" sx={{ fontWeight: 700, color: STATUS_COLOR.paid }}>₹{txPaidSoFar(r).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Box>
                          {' · '}Bal <Box component="span" sx={{ fontWeight: 700, color: '#b45309' }}>₹{txOutstanding(r).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Box>
                        </Typography>
                      )}
                      {txWrittenOff(r) > 0 && (
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          ₹{txWrittenOff(r).toLocaleString('en-IN', { maximumFractionDigits: 2 })} written off
                        </Typography>
                      )}
                    </TableCell>
                  )}
                  {/* Sticky to the right edge, matching the header's Actions
                      cell — needs its own explicit background (a sticky
                      cell paints above whatever scrolls underneath it, so
                      it must opt out of relying on the row's own bgcolor,
                      which a plain non-sticky cell would otherwise inherit
                      through) matching this row's own zebra stripe, with a
                      slightly stronger tint on hover to mirror the row
                      hover state the rest of the row already gets from
                      TableRow's own '&:hover' above. */}
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}
                    sx={{
                      position: 'sticky', right: 0, zIndex: 1,
                      bgcolor: idx % 2 === 1 ? '#fbfbfb' : '#fff',
                      boxShadow: '-4px 0 6px -4px rgba(0,0,0,0.12)',
                      '.MuiTableRow-root:hover &': { bgcolor: '#f2f2f2' },
                    }}>
                    <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }}>
                      {onRowClick && (
                        <Tooltip title="Preview">
                          <IconButton size="small" onClick={() => onRowClick(r)}><Eye size={15} /></IconButton>
                        </Tooltip>
                      )}
                      {onPrint && (
                        <Tooltip title="Print">
                          <IconButton size="small" onClick={() => onPrint(r)}><Printer size={15} /></IconButton>
                        </Tooltip>
                      )}
                      {onShare && (
                        <Tooltip title="Share">
                          <IconButton size="small" onClick={() => onShare(r)}><Share2 size={15} color="#25D366" /></IconButton>
                        </Tooltip>
                      )}
                      {(onEdit || onDelete || extraMenuItems) && (
                        <Tooltip title="More">
                          <IconButton size="small" onClick={(e) => setRowMenu({ anchorEl: e.currentTarget, record: r })}><MoreVertical size={15} /></IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      <TablePagination
        component="div"
        count={filtered.length}
        page={page}
        onPageChange={(_e, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[25, 50, 100, 200]}
        sx={{ borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}
      />

      {/* Column filter popovers */}
      <TextFilterPopover anchorEl={filterAnchor.key === 'number' ? filterAnchor.el : null} onClose={closeFilter} value={numberFilter} onChange={setNumberFilter} label="Invoice no" />
      <TextFilterPopover anchorEl={filterAnchor.key === 'party' ? filterAnchor.el : null} onClose={closeFilter} value={partyFilter} onChange={setPartyFilter} label="Party Name" />
      <TextFilterPopover anchorEl={filterAnchor.key === 'phone' ? filterAnchor.el : null} onClose={closeFilter} value={phoneFilter} onChange={setPhoneFilter} label="Phone Number" />
      <OptionFilterPopover anchorEl={filterAnchor.key === 'transaction' ? filterAnchor.el : null} onClose={closeFilter} options={transactionOptions} selected={transactionFilter} onToggle={toggleSetValue(setTransactionFilter)} onClear={() => setTransactionFilter(new Set())} />
      <OptionFilterPopover anchorEl={filterAnchor.key === 'payment' ? filterAnchor.el : null} onClose={closeFilter} options={paymentOptions} selected={paymentFilter} onToggle={toggleSetValue(setPaymentFilter)} onClear={() => setPaymentFilter(new Set())} />
      <OptionFilterPopover anchorEl={filterAnchor.key === 'status' ? filterAnchor.el : null} onClose={closeFilter} options={statusOptions} selected={statusFilter} onToggle={toggleSetValue(setStatusFilter)} onClear={() => setStatusFilter(new Set())} />

      {/* Row "more" menu */}
      <Menu
        anchorEl={rowMenu.anchorEl}
        open={Boolean(rowMenu.anchorEl)}
        onClose={() => setRowMenu({ anchorEl: null, record: null })}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {onEdit && (
          <MenuItem onClick={() => { onEdit(rowMenu.record); setRowMenu({ anchorEl: null, record: null }); }}>
            Edit
          </MenuItem>
        )}
        {extraMenuItems && rowMenu.record && extraMenuItems(rowMenu.record, () => setRowMenu({ anchorEl: null, record: null }))}
        {onDelete && (
          <MenuItem onClick={() => { const rec = rowMenu.record; setRowMenu({ anchorEl: null, record: null }); onDelete(rec); }} sx={{ color: 'error.main' }}>
            Delete
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

export default TxDataTable;
