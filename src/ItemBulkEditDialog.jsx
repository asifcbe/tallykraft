import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, TextField,
  MenuItem, Select, Chip, Tooltip, Backdrop, CircularProgress,
  TablePagination, InputAdornment,
  alpha, useTheme, useMediaQuery,
} from '@mui/material';
import { X, ClipboardPaste, Save, Search, PencilLine } from 'lucide-react';
import { useData } from './DataContext';
import { useConfig } from './ConfigContext';
import { useItemCategories } from './useItemCategories';

const DEFAULT_UNITS = ['NOS', 'BAGS', 'BOX', 'KGS', 'Ltr', 'Mtr', 'Pcs'];
const TAX_SLABS = [0, 0.25, 1, 3, 5, 6, 12, 18, 28];
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_ROWS_PER_PAGE = 50;
const SEARCH_DEBOUNCE_MS = 200;

const EDIT_COLS = [
  { key: 'name',          label: 'Name *',          width: 200, required: true },
  { key: 'itemCode',      label: 'Item Code',        width: 120 },
  { key: 'category',      label: 'Category',         width: 150, type: 'category' },
  { key: 'unit',          label: 'Unit',             width: 90,  type: 'unit' },
  { key: 'salePrice',     label: 'Sale Price',       width: 110, numeric: true },
  { key: 'mrp',           label: 'MRP',              width: 100, numeric: true },
  { key: 'purchasePrice', label: 'Purchase Price',   width: 120, numeric: true },
  { key: 'stock',         label: 'Stock',            width: 100, numeric: true },
  { key: 'taxRate',       label: 'GST %',            width: 90,  type: 'tax' },
  { key: 'hsnCode',       label: 'HSN / SAC Code',   width: 130 },
  { key: 'barcode',       label: 'Barcode',          width: 140 },
  { key: 'description',   label: 'Description',      width: 200 },
];
const IDX_COL_W = 48;
const GRID_TEMPLATE = `${IDX_COL_W}px ` + EDIT_COLS.map(c => `${c.width}px`).join(' ');
const TOTAL_W = IDX_COL_W + EDIT_COLS.reduce((s, c) => s + c.width, 0);

const parsePaste = (text) =>
  text.trim().split('\n').map(line =>
    line.split(/\t|,/).map(c => c.trim().replace(/^"|"$/g, ''))
  );

const seedRow = (item) => ({
  _id: item.id,
  name: item.name || '',
  itemCode: item.itemCode || '',
  category: item.category || '',
  unit: item.unit || 'NOS',
  salePrice: item.salePrice != null ? String(item.salePrice) : '',
  mrp: item.mrp != null ? String(item.mrp) : '',
  purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : '',
  stock: item.stock != null ? String(item.stock) : '',
  taxRate: item.taxRate != null ? Number(item.taxRate) : 0,
  hsnCode: item.hsnCode || '',
  barcode: item.barcode || '',
  description: item.description || '',
});

// One plain (non-virtualized) row. Memoized so typing in one row doesn't
// re-render the rest of the current page.
const Row = React.memo(function Row({ displayIndex, row, dirty, primary, allCategories, allUnits, updateCell, handleCellPaste }) {
  const hasError = !row.name?.trim();
  const cellBorder = alpha(primary, 0.15);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        alignItems: 'center',
        minHeight: 44,
        borderBottom: `1px solid ${alpha(primary, 0.07)}`,
        bgcolor: hasError ? alpha('#ef4444', 0.04) : dirty ? alpha(primary, 0.035) : 'transparent',
        '&:hover': { bgcolor: hasError ? alpha('#ef4444', 0.06) : alpha(primary, 0.06) },
      }}
    >
      <Box sx={{ pl: 1.5, display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.disabled', fontSize: '0.72rem', fontWeight: 600 }}>
        {displayIndex}
        {dirty && (
          <Tooltip title="Edited — not saved yet">
            <PencilLine size={11} color={primary} style={{ flexShrink: 0 }} />
          </Tooltip>
        )}
      </Box>
      {EDIT_COLS.map((col, colIdx) => (
        <Box key={col.key} sx={{ px: 0.4, py: 0.5 }}>
          {col.type === 'category' ? (
            <Select
              size="small"
              value={row[col.key] || ''}
              onChange={e => updateCell(row._id, col.key, e.target.value)}
              displayEmpty
              fullWidth
              sx={{ fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: cellBorder } }}
              MenuProps={{ PaperProps: { sx: { maxHeight: 260 } } }}
            >
              <MenuItem value="" sx={{ fontSize: '0.78rem', color: 'text.disabled' }}>None</MenuItem>
              {allCategories.map(cat => (
                <MenuItem key={cat} value={cat} sx={{ fontSize: '0.78rem' }}>{cat}</MenuItem>
              ))}
            </Select>
          ) : col.type === 'unit' ? (
            <Select
              size="small"
              value={row[col.key] || 'NOS'}
              onChange={e => updateCell(row._id, col.key, e.target.value)}
              fullWidth
              sx={{ fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: cellBorder } }}
            >
              {allUnits.map(u => <MenuItem key={u} value={u} sx={{ fontSize: '0.8rem' }}>{u}</MenuItem>)}
            </Select>
          ) : col.type === 'tax' ? (
            <Select
              size="small"
              value={Number(row[col.key]) || 0}
              onChange={e => updateCell(row._id, col.key, e.target.value)}
              fullWidth
              sx={{ fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: cellBorder } }}
            >
              {TAX_SLABS.map(t => <MenuItem key={t} value={t} sx={{ fontSize: '0.8rem' }}>{t}%</MenuItem>)}
            </Select>
          ) : (
            <TextField
              size="small"
              fullWidth
              value={row[col.key] ?? ''}
              onChange={e => updateCell(row._id, col.key, e.target.value)}
              onPaste={e => handleCellPaste(e, row._id, colIdx)}
              type={col.numeric ? 'number' : 'text'}
              inputProps={col.numeric ? { step: 'any', min: 0, style: { textAlign: 'right' } } : {}}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '0.8rem',
                  '& fieldset': { borderColor: hasError && col.required ? 'error.main' : cellBorder },
                },
              }}
            />
          )}
        </Box>
      ))}
    </Box>
  );
});

const ItemBulkEditDialog = ({ open, onClose, items = [], onSuccess }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;
  const { updateItems } = useData();
  const { config } = useConfig();


  // The FULL edited dataset lives in a ref, not React state — editing a
  // field mutates one row object here in O(1) and never touches (or
  // re-creates) the other N-1 rows. This is the actual fix for the freeze:
  // the previous version kept the whole array in useState and re-created it
  // (`.slice()` + `.map()` in a `useMemo` keyed on that array) on every
  // single keystroke, which is O(totalItems) work per character typed —
  // fine at 20 items, a hard freeze at a few thousand. Only the current
  // page's rows (≤ rowsPerPage) are ever React state, so only they ever
  // trigger a re-render.
  const allRowsRef = useRef([]);
  const idToIndexRef = useRef(new Map());
  const origByIdRef = useRef(new Map());
  const dirtyIdsRef = useRef(new Set());

  const [totalCount, setTotalCount] = useState(0);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [hasBlankName, setHasBlankName] = useState(false);
  const [saving, setSaving] = useState(false);
  // True from the moment the dialog opens until the (potentially large)
  // dataset finishes seeding — see the effect below for why this exists.
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  // Bumped on every reseed AND every cell edit — the one piece of state that
  // `filteredIndex`/`pageRows` actually key off to know allRowsRef's
  // contents changed. Deliberately ALWAYS increments rather than resetting
  // to a fixed value on open: resetting page/version state back to the same
  // value they already held (e.g. 0 → 0 on a second open) leaves every
  // memo's dependency array unchanged, so React correctly (and silently)
  // skips recomputing them — even though the ref underneath was just
  // replaced with a brand new array. That was the actual bug behind "bulk
  // edit has no items in it": the seeding effect runs AFTER the render that
  // computed pageRows (effects always fire post-commit), so the first
  // render of a freshly opened dialog read allRowsRef before the effect had
  // populated it, and a same-valued page/pageVersion reset meant nothing
  // ever told React to look again.
  const [dataVersion, setDataVersion] = useState(0);

  // Populate everything the moment the dialog opens. Deferred one tick
  // (setTimeout 0 + requestAnimationFrame, the same pattern already used by
  // this app's other bulk dialogs — SalesBulkAddDialog, ItemBulkEditDialog's
  // own Save handler, etc.) so the Dialog's open transition and the loading
  // spinner actually PAINT before the synchronous seeding work runs — with
  // a large item count (thousands+), mapping every item into a row object
  // + building two id-lookup Maps is real work; without this deferral it
  // ran synchronously inside the effect that fires right as the dialog
  // opens, so the click-to-open felt like it hung instead of showing
  // anything. The seeding work itself is also down to ONE pass over `items`
  // now (was three separate traversals: map + two forEaches).
  useEffect(() => {
    if (!open) {
      setLoading(true);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      requestAnimationFrame(() => {
        const rows = new Array(items.length);
        const idToIndex = new Map();
        const origById = new Map();
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const row = seedRow(it);
          rows[i] = row;
          idToIndex.set(row._id, i);
          origById.set(it.id, it);
        }
        allRowsRef.current = rows;
        idToIndexRef.current = idToIndex;
        origByIdRef.current = origById;
        dirtyIdsRef.current = new Set();
        setTotalCount(rows.length);
        setDirtyCount(0);
        setHasBlankName(rows.some(r => !r.name?.trim()));
        setSearchInput('');
        setSearch('');
        setPage(0);
        setDataVersion(v => v + 1);
        setLoading(false);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [open, items]);

  // Debounce the search box so typing a query doesn't recompute the
  // (still O(totalItems), but only on actual search changes) filtered index
  // on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Index of rows matching the current search — only recomputed when
  // `search` itself changes (debounced) or the dataset is reseeded/edited
  // (dataVersion), never on every keystroke of typing the query.
  const filteredIndex = useMemo(() => {
    const all = allRowsRef.current;
    const q = search.trim().toLowerCase();
    if (!q) return null; // null = "no filter, use full range" sentinel
    const idx = [];
    for (let i = 0; i < all.length; i++) {
      const row = all[i];
      if (
        row.name?.toLowerCase().includes(q) ||
        row.itemCode?.toLowerCase().includes(q) ||
        row.barcode?.toLowerCase().includes(q) ||
        row.hsnCode?.toLowerCase().includes(q) ||
        row.category?.toLowerCase().includes(q)
      ) idx.push(i);
    }
    return idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dataVersion]);

  const matchCount = filteredIndex ? filteredIndex.length : totalCount;

  // The only per-render "big" read: a ≤ rowsPerPage slice of row objects
  // pulled straight out of the ref. Recomputed on page/search/rowsPerPage
  // change, or when dataVersion bumps (reseed, or an edit anywhere in the
  // dataset) — reading the slice itself is always O(rowsPerPage), regardless
  // of why it's being recomputed.
  const pageRows = useMemo(() => {
    const all = allRowsRef.current;
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    if (!filteredIndex) return all.slice(start, end);
    const out = [];
    for (let i = start; i < end && i < filteredIndex.length; i++) out.push(all[filteredIndex[i]]);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIndex, page, rowsPerPage, dataVersion]);

  // Replaces one row with a new object at its index (O(1) — the surrounding
  // array itself is never copied) and only re-renders if that row is on the
  // currently visible page. A NEW object reference (not an in-place mutation
  // of the existing one) matters here: <Row> is React.memo'd on shallow prop
  // equality, so mutating the same object in place would leave `row`
  // reference-equal across renders and silently skip the re-render.
  const updateCell = useCallback((id, key, value) => {
    const idx = idToIndexRef.current.get(id);
    if (idx == null) return;
    const row = { ...allRowsRef.current[idx], [key]: value };
    allRowsRef.current[idx] = row;
    if (key === 'name') {
      // Re-derive the blank-name flag by scanning — only actually needed
      // when the edited field IS the name, so this stays rare, not
      // per-keystroke on every field.
      setHasBlankName(allRowsRef.current.some(r => !r.name?.trim()));
    }
    if (!dirtyIdsRef.current.has(id)) {
      dirtyIdsRef.current.add(id);
      setDirtyCount(dirtyIdsRef.current.size);
    }
    setDataVersion(v => v + 1);
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const grid = parsePaste(text);
      if (!grid.length) return;
      const firstIsHeader = EDIT_COLS.some(c =>
        c.numeric && grid[0]?.[EDIT_COLS.indexOf(c)] && isNaN(Number(grid[0][EDIT_COLS.indexOf(c)]))
      );
      const dataRows = firstIsHeader ? grid.slice(1) : grid;
      // Paste always targets rows starting at the top of the CURRENT page.
      const rowsNow = pageRows;
      dataRows.forEach((cells, ri) => {
        const targetRow = rowsNow[ri];
        if (!targetRow) return;
        const idx = idToIndexRef.current.get(targetRow._id);
        if (idx == null) return;
        const patched = { ...targetRow };
        EDIT_COLS.forEach((col, ci) => {
          const val = cells[ci] ?? '';
          if (val !== '') patched[col.key] = val;
        });
        allRowsRef.current[idx] = patched;
        dirtyIdsRef.current.add(patched._id);
      });
      setDirtyCount(dirtyIdsRef.current.size);
      setHasBlankName(allRowsRef.current.some(r => !r.name?.trim()));
      setDataVersion(v => v + 1);
    } catch { /* clipboard denied */ }
  };

  const handleCellPaste = useCallback((e, id, colIdx) => {
    const text = e.clipboardData?.getData('text');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();
    const grid = parsePaste(text);
    const startIdx = idToIndexRef.current.get(id);
    if (startIdx == null) return;
    const all = allRowsRef.current;
    grid.forEach((cells, ri) => {
      const targetIdx = startIdx + ri;
      const existing = all[targetIdx];
      if (!existing) return;
      const patched = { ...existing };
      cells.forEach((val, ci) => {
        const targetCol = colIdx + ci;
        if (targetCol < EDIT_COLS.length) patched[EDIT_COLS[targetCol].key] = val;
      });
      all[targetIdx] = patched;
      dirtyIdsRef.current.add(patched._id);
    });
    setDirtyCount(dirtyIdsRef.current.size);
    setHasBlankName(all.some(r => !r.name?.trim()));
    setDataVersion(v => v + 1);
  }, []);

  const handleSave = () => {
    if (hasBlankName || dirtyIdsRef.current.size === 0) return;
    setSaving(true);
    setTimeout(() => requestAnimationFrame(() => {
      const origById = origByIdRef.current;
      const updates = [];
      for (const row of allRowsRef.current) {
        if (!dirtyIdsRef.current.has(row._id)) continue;
        const orig = origById.get(row._id);
        if (!orig) continue;
        updates.push({
          ...orig,
          id: row._id,
          name: row.name.trim(),
          itemCode: row.itemCode?.trim() || '',
          category: row.category?.trim() || '',
          unit: row.unit || 'NOS',
          salePrice: Number(row.salePrice) || 0,
          mrp: Number(row.mrp) || 0,
          purchasePrice: Number(row.purchasePrice) || 0,
          stock: Number(row.stock) || 0,
          taxRate: Number(row.taxRate) || 0,
          hsnCode: row.hsnCode?.trim() || '',
          barcode: row.barcode?.trim() || '',
          description: row.description?.trim() || '',
        });
      }
      if (updates.length) updateItems('items', updates);
      setSaving(false);
      if (onSuccess) onSuccess(updates.length);
      onClose();
    }), 0);
  };

  // Shared, synced category list (see useItemCategories.js).
  const { all: allItemCategories } = useItemCategories('product');
  const itemMeta = useMemo(() => {
    const allUnits = [...new Set([...DEFAULT_UNITS, ...(config.itemUnits || [])])];
    return { allUnits, allCategories: allItemCategories };
  }, [config.itemUnits, allItemCategories]);

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '92vh', position: 'relative' } }}
    >
      <Backdrop open={saving} sx={{ position: 'absolute', zIndex: 10, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.8)', flexDirection: 'column', gap: 1.5 }}>
        <CircularProgress size={40} sx={{ color: primary }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: primary }}>Saving {dirtyCount} item{dirtyCount === 1 ? '' : 's'}…</Typography>
      </Backdrop>
      {/* Shown the instant the dialog opens, while the (deferred) seeding
          effect maps every item into an editable row — keeps the click that
          opened this dialog feeling instantly responsive instead of the
          window appearing to hang while that work runs. */}
      <Backdrop open={loading && !saving} sx={{ position: 'absolute', zIndex: 10, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.8)', flexDirection: 'column', gap: 1.5 }}>
        <CircularProgress size={40} sx={{ color: primary }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: primary }}>Loading items…</Typography>
      </Backdrop>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pt: 2.5, px: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>Bulk Edit Items</Typography>
          <Typography variant="caption" color="text.secondary">
            {totalCount} item{totalCount === 1 ? '' : 's'} loaded — edit inline and click Save. Only Name is required.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
          <Tooltip title="Paste Tab-separated data from clipboard, starting at the top row of the current page">
            <IconButton size="small" onClick={handlePaste}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
              <ClipboardPaste size={16} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5, mt: 1 }}>
          <TextField
            size="small"
            placeholder="Search by name, code, barcode, HSN, category…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            sx={{ minWidth: 240, flex: '0 1 320px' }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchInput('')}><X size={13} /></IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          {dirtyCount > 0 && (
            <Chip label={`${dirtyCount} edited`} size="small" icon={<PencilLine size={12} />}
              sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700, bgcolor: alpha(primary, 0.1), color: primary }} />
          )}
          {search && (
            <Chip label={`${matchCount} match${matchCount === 1 ? '' : 'es'}`} size="small"
              sx={{ height: 22, fontSize: '0.68rem', bgcolor: alpha(primary, 0.05), color: 'text.secondary', border: `1px solid ${alpha(primary, 0.12)}` }} />
          )}
          <Chip label="Paste Tab-separated data from Excel into any cell" size="small"
            sx={{ height: 20, fontSize: '0.65rem', bgcolor: alpha(primary, 0.05), color: 'text.secondary', border: `1px solid ${alpha(primary, 0.12)}` }} />
        </Box>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: TOTAL_W }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, bgcolor: alpha(primary, 0.06), borderBottom: `2px solid ${alpha(primary, 0.15)}`, position: 'sticky', top: 0, zIndex: 1 }}>
                <Box sx={{ pl: 1.5, py: 1.25, fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}>#</Box>
                {EDIT_COLS.map(col => (
                  <Box key={col.key} sx={{ px: 0.4, py: 1.25, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                    {col.label}
                  </Box>
                ))}
              </Box>

              {pageRows.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center', color: 'text.disabled', fontSize: '0.85rem' }}>
                  {totalCount === 0 ? 'No items to edit.' : 'No items match your search.'}
                </Box>
              ) : (
                <Box sx={{ maxHeight: { xs: 'calc(92vh - 360px)', sm: 460 }, overflowY: 'auto' }}>
                  {pageRows.map((row, i) => (
                    <Row
                      key={row._id}
                      displayIndex={page * rowsPerPage + i + 1}
                      row={row}
                      dirty={dirtyIdsRef.current.has(row._id)}
                      primary={primary}
                      allCategories={itemMeta.allCategories}
                      allUnits={itemMeta.allUnits}
                      updateCell={updateCell}
                      handleCellPaste={handleCellPaste}
                    />
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          {matchCount > 0 && (
            <TablePagination
              component="div"
              count={matchCount}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={isMobile ? [25, 50] : ROWS_PER_PAGE_OPTIONS}
              labelRowsPerPage={isMobile ? 'Rows:' : 'Rows per page:'}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            />
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ fontWeight: 600 }} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<Save size={15} />}
          onClick={handleSave}
          disabled={saving || hasBlankName || dirtyCount === 0}
          sx={{
            fontWeight: 700, textTransform: 'none', borderRadius: 2,
            background: `linear-gradient(135deg, ${primary} 0%, ${theme.palette.primary.dark || primary} 100%)`,
            boxShadow: `0 4px 12px ${alpha(primary, 0.3)}`,
          }}
        >
          {saving ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} Changed Item${dirtyCount === 1 ? '' : 's'}` : 'No Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ItemBulkEditDialog;
