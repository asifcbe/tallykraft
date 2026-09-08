import React, { useState, useRef } from 'react';
import {
  Box, Button, Typography, TextField, Grid, IconButton, InputAdornment,
  Stack, Paper, Container, Autocomplete, Alert, Snackbar, MenuItem,
  Tabs, Tab, Chip
} from '@mui/material';
import { Save, Edit2, Trash2, ChevronLeft, Plus, Minus, Printer, User, Calendar, Info } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useConfig } from './ConfigContext';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import PartySelect from './PartySelect';
import { useDialog } from './DialogContext';
import DataGrid from './DataGrid';
import { useReactToPrint } from 'react-to-print';
import SectionPrintTemplate from './SectionPrintTemplate';
import SectionIcon from './SectionIcon';

const emptyTabForm = (tab) => {
  const fields = {};
  (tab?.fields || []).forEach(f => { fields[f.id] = ''; });
  return { partyName: '', date: new Date().toISOString().split('T')[0], fields, notes: '' };
};

const CustomSection = ({ sectionId: sectionIdProp } = {}) => {
  const params = useParams();
  const sectionId = sectionIdProp || params.sectionId;
  const { config } = useConfig();
  const { currentBusiness } = useBusiness();
  const { getItems, addItem, updateItem, deleteItem } = useData();
  const { confirm } = useDialog();

  const section = config.customSections?.find(s => s.id === sectionId);

  // Normalize to tabs array (handles legacy flat-fields sections too)
  const tabs = section?.tabs?.length > 0
    ? section.tabs
    : section?.fields?.length > 0
      ? [{ id: `${sectionId}_default`, name: section.name, fields: section.fields }]
      : [];
  const multiTab = tabs.length > 1;

  // Which tab is selected in the list view
  const [activeSectionTab, setActiveSectionTab] = useState(0);

  // Record form state
  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [activeTabForRecord, setActiveTabForRecord] = useState(null);
  const [form, setForm] = useState({});

  // Select field filters: { [tabId_fieldId]: selectedValue }
  const [selectFilters, setSelectFilters] = useState({});

  // Print state
  const [printingRecord, setPrintingRecord] = useState(null);
  const [printingTab, setPrintingTab] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const printRef = useRef();

  const showSnackbar = (message, severity = 'success') => setSnackbar({ open: true, message, severity });
  const handlePrint = useReactToPrint({ contentRef: printRef });

  const allRecords = (getItems('customSectionRecords') || []).filter(
    r => r.businessId === currentBusiness?.id && r.sectionId === sectionId
  );

  // Records for a specific tab; old records without tabId fall under the first tab
  const getTabRecords = (tab, tabIdx) =>
    allRecords.filter(r => r.tabId === tab.id || (!r.tabId && tabIdx === 0));

  const parties = (getItems('parties') || []).filter(
    p => p.businessId === currentBusiness?.id && p.type === 'Customer'
  );

  if (!section) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" color="text.secondary">Section not found</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          This section may have been removed. Contact your administrator.
        </Typography>
      </Box>
    );
  }

  const handleNewRecord = (tab) => {
    setActiveTabForRecord(tab);
    setForm(emptyTabForm(tab));
    setEditId(null);
    setView('create');
  };

  const handleEditRecord = (tab, row) => {
    setActiveTabForRecord(tab);
    const fields = {};
    (tab?.fields || []).forEach(f => { fields[f.id] = row.fields?.[f.id] ?? ''; });
    setForm({
      partyName: row.partyName || '',
      date: row.date || new Date().toISOString().split('T')[0],
      notes: row.notes || '',
      fields
    });
    setEditId(row.id);
    setView('edit');
  };

  const handleFieldChange = (fieldId, value) => {
    setForm(prev => ({ ...prev, fields: { ...prev.fields, [fieldId]: value } }));
  };

  const handleSave = async () => {
    if (!currentBusiness?.id) { showSnackbar('Business not selected', 'error'); return; }
    if (!form.date) { showSnackbar('Please select a date', 'warning'); return; }

    for (const f of (activeTabForRecord?.fields || [])) {
      if (f.required && !form.fields[f.id]) {
        showSnackbar(`${f.name} is required`, 'warning');
        return;
      }
    }

    const dataToSave = {
      ...form,
      sectionId,
      tabId: activeTabForRecord?.id,
      businessId: currentBusiness.id,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editId) {
        await updateItem('customSectionRecords', editId, dataToSave);
      } else {
        await addItem('customSectionRecords', { ...dataToSave, createdAt: new Date().toISOString() });
      }
      showSnackbar(editId ? 'Record updated!' : 'Record saved!', 'success');
      setView('list');
      setEditId(null);
    } catch {
      showSnackbar('Error saving record', 'error');
    }
  };

  const renderField = (field, tabFields = []) => {
    const value = form.fields?.[field.id] ?? '';
    const onChange = (e) => handleFieldChange(field.id, e.target.value);
    const label = field.name + (field.required ? ' *' : '');

    if (field.type === 'select') {
      return (
        <TextField select fullWidth label={label} value={value} onChange={onChange}>
          <MenuItem value="">None</MenuItem>
          {(field.options || []).map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
        </TextField>
      );
    }
    if (field.type === 'textarea') {
      return <TextField fullWidth label={label} value={value} onChange={onChange} multiline rows={3} />;
    }
    if (field.type === 'counter') {
      const cv = (value && typeof value === 'object') ? value : { used: 0, total: 0 };
      const unit = field.unit || 'sessions';
      const remaining = Math.max(0, (cv.total || 0) - (cv.used || 0));
      const pct = cv.total > 0 ? Math.round((cv.used / cv.total) * 100) : 0;
      return (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
            <TextField size="small" type="number" label={`Total ${unit}`} value={cv.total === 0 ? '' : cv.total}
              onChange={e => { const v = e.target.value; handleFieldChange(field.id, { ...cv, total: v === '' ? 0 : Math.max(0, Number(v)) }); }}
              sx={{ width: 110 }} inputProps={{ min: 0 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton size="small" onClick={() => handleFieldChange(field.id, { ...cv, used: Math.max(0, (cv.used || 0) - 1) })}
                sx={{ border: '1px solid', borderColor: 'divider' }}>
                <Minus size={14} />
              </IconButton>
              <Typography sx={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{cv.used}</Typography>
              <IconButton size="small" onClick={() => handleFieldChange(field.id, { ...cv, used: Math.min(cv.total || 999, (cv.used || 0) + 1) })}
                sx={{ border: '1px solid', borderColor: 'divider' }}>
                <Plus size={14} />
              </IconButton>
            </Box>
            <Chip
              label={`${remaining} remaining`} size="small"
              color={remaining === 0 ? 'error' : pct >= 75 ? 'warning' : 'success'}
              sx={{ fontWeight: 600 }} />
          </Box>
        </Box>
      );
    }
    if (field.type === 'penalty') {
      const rate = field.ratePerDay || 0;
      const dueDateField = tabFields.find(f =>
        f.type === 'date' && /due|return|deadline|end/i.test(f.name)
      ) || tabFields.find(f => f.type === 'date');
      const dueDateVal = dueDateField ? (form.fields?.[dueDateField.id] || '') : '';
      let fine = 0;
      let daysOverdue = 0;
      if (dueDateVal) {
        daysOverdue = Math.ceil((new Date() - new Date(dueDateVal)) / 86400000);
        fine = Math.max(0, daysOverdue) * rate;
      }
      return (
        <Box sx={{ border: '1px solid', borderColor: fine > 0 ? 'error.main' : 'divider', borderRadius: 1, p: 1.5, bgcolor: fine > 0 ? 'error.50' : 'background.paper' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: fine > 0 ? 'error.main' : 'text.secondary' }}>
              ₹{fine.toFixed(2)}
            </Typography>
            {dueDateVal && (
              <Typography variant="caption" color="text.secondary">
                {daysOverdue > 0 ? `${daysOverdue} days overdue × ₹${rate}/day` : 'Not overdue'}
              </Typography>
            )}
            {!dueDateVal && (
              <Typography variant="caption" color="text.disabled">Add a due/return date field</Typography>
            )}
          </Box>
        </Box>
      );
    }
    return (
      <TextField
        fullWidth label={label} value={value} onChange={onChange}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
        InputProps={field.unit ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> } : undefined}
      />
    );
  };

  const snackbarEl = (
    <Snackbar open={snackbar.open} autoHideDuration={5000}
      onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled">
        {snackbar.message}
      </Alert>
    </Snackbar>
  );

  // Build a section-like object for printing (uses only the relevant tab's fields)
  const buildPrintSection = (tab) => ({
    ...section,
    name: multiTab ? tab?.name : section.name,
    fields: tab?.fields || [],
    tabs: null
  });

  // ─── Create / Edit View ───────────────────────────────────────────────────
  if (view === 'create' || view === 'edit') {
    const tab = activeTabForRecord;
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: { xs: 2, md: 4 } }}>
        <div style={{ display: 'none' }}>
          <SectionPrintTemplate ref={printRef} section={buildPrintSection(tab)} record={form} business={currentBusiness} />
        </div>
        <Container maxWidth="lg">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <IconButton onClick={() => { setView('list'); setEditId(null); }}
                sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'action.hover' } }}>
                <ChevronLeft size={20} />
              </IconButton>
              <Button startIcon={<Printer size={18} />} onClick={() => handlePrint()} variant="outlined" sx={{ borderRadius: 2 }}>
                Print
              </Button>
            </Stack>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {editId ? 'Edit' : 'New'} {multiTab ? tab?.name : section.name}
              </Typography>
              {multiTab && (
                <Typography variant="caption" color="text.secondary">{section.name}</Typography>
              )}
            </Box>
            <Button variant="contained" disableElevation startIcon={<Save size={18} />} onClick={handleSave}
              sx={{ borderRadius: 2, px: 3 }}>
              Save
            </Button>
          </Stack>

          <Stack spacing={3}>
            {/* Basic Info */}
            <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Basic Information</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <PartySelect
                    options={parties}
                    value={form.partyName}
                    onChange={(v) => setForm(prev => ({ ...prev, partyName: v }))}
                    label="Customer Name"
                    nameOnly
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth type="date" label="Date" value={form.date} required
                    onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Calendar size={18} color="rgba(0,0,0,0.54)" /></InputAdornment> }}
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Fields for this tab */}
            {(tab?.fields || []).length > 0 && (
              <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
                  <Box sx={{
                    width: 32, height: 32, borderRadius: 1.5,
                    bgcolor: section.color || 'primary.main',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                  }}>
                    <SectionIcon name={section.icon} size={16} />
                  </Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {multiTab ? tab?.name : section.name} Details
                  </Typography>
                </Stack>
                <Grid container spacing={2.5}>
                  {(tab?.fields || []).map(field => {
                    const fullWidth = ['textarea', 'counter', 'penalty'].includes(field.type);
                    return (
                      <Grid item xs={12} sm={fullWidth ? 12 : 6} md={fullWidth ? 12 : 4} key={field.id}>
                        {renderField(field, tab?.fields || [])}
                      </Grid>
                    );
                  })}
                </Grid>
              </Paper>
            )}

            {/* Notes */}
            <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Info size={18} /> Notes
              </Typography>
              <TextField fullWidth multiline rows={3} placeholder="Additional notes..."
                value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </Paper>
          </Stack>
          {snackbarEl}
        </Container>
      </Box>
    );
  }

  // ─── Per-tab record list renderer ────────────────────────────────────────
  const renderTabContent = (tab, tabIdx) => {
    const selectFields = (tab?.fields || []).filter(f => f.type === 'select');
    const baseRecords = getTabRecords(tab, tabIdx);
    const tabRecords = baseRecords.filter(r => {
      return selectFields.every(f => {
        const filterVal = selectFilters[`${tab.id}_${f.id}`];
        if (!filterVal) return true;
        return (r.fields?.[f.id] || '') === filterVal;
      });
    });

    const dynColumns = (tab?.fields || []).filter(f => !['counter', 'penalty'].includes(f.type)).slice(0, 3).map(f => ({
      key: 'fields',
      header: `${f.name}${f.unit ? ` (${f.unit})` : ''}`,
      width: 130,
      render: (fields) => {
        const v = fields?.[f.id];
        if (f.type === 'select' && v) return <Chip label={v} size="small" variant="outlined" />;
        return v ? `${v}${f.unit ? ` ${f.unit}` : ''}` : '—';
      }
    }));

    const counterFields = (tab?.fields || []).filter(f => f.type === 'counter');
    const counterColumns = counterFields.slice(0, 1).map(f => ({
      key: 'fields',
      header: f.name,
      width: 150,
      render: (fields) => {
        const v = fields?.[f.id];
        const cv = (v && typeof v === 'object') ? v : null;
        if (!cv) return '—';
        const remaining = Math.max(0, (cv.total || 0) - (cv.used || 0));
        return <Chip label={`${cv.used}/${cv.total} · ${remaining} left`} size="small"
          color={remaining === 0 ? 'error' : cv.used > 0 ? 'warning' : 'success'} />;
      }
    }));

    return (
      <Box>
        <div style={{ display: 'none' }}>
          <SectionPrintTemplate
            ref={printRef}
            section={buildPrintSection(printingTab || tab)}
            record={printingRecord}
            business={currentBusiness}
          />
        </div>

        {selectFields.length > 0 && (
          <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectFields.map(f => (
              <TextField
                key={f.id} select size="small" label={`Filter: ${f.name}`}
                value={selectFilters[`${tab.id}_${f.id}`] || ''}
                onChange={e => setSelectFilters(prev => ({ ...prev, [`${tab.id}_${f.id}`]: e.target.value }))}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">All</MenuItem>
                {(f.options || []).map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
              </TextField>
            ))}
            {Object.values(selectFilters).some(Boolean) && (
              <Button size="small" variant="text" onClick={() => setSelectFilters({})}>Clear filters</Button>
            )}
          </Box>
        )}

        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button variant="contained" disableElevation startIcon={<Plus size={18} />}
            onClick={() => handleNewRecord(tab)}
            sx={{ bgcolor: section.color || '#1A1C1E', borderRadius: 2, px: 3 }}>
            New Record
          </Button>
        </Stack>

        <DataGrid
          data={tabRecords}
          columns={[
            { key: 'date', header: 'Date', width: 110 },
            { key: 'partyName', header: 'Customer', width: 180, render: v => v || '—' },
            ...dynColumns,
            ...counterColumns
          ]}
          actions={row => (
            <Stack direction="row" spacing={1}>
              <IconButton size="small" color="primary" title="Print"
                onClick={() => {
                  setPrintingRecord(row);
                  setPrintingTab(tab);
                  setTimeout(() => handlePrint(), 100);
                }}>
                <Printer size={18} />
              </IconButton>
              <IconButton size="small" onClick={() => handleEditRecord(tab, row)}>
                <Edit2 size={18} />
              </IconButton>
              <IconButton size="small" color="error" onClick={async () => {
                const ok = await confirm({ title: 'Delete Record', message: 'Delete this record? This action cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
                if (ok) deleteItem('customSectionRecords', row.id);
              }}>
                <Trash2 size={18} />
              </IconButton>
            </Stack>
          )}
        />
      </Box>
    );
  };

  // ─── List View ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: { xs: 2, md: 4 }, mx: 0 }}>
      {/* Section header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{
            width: 44, height: 44, borderRadius: 2,
            bgcolor: section.color || 'primary.main',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
          }}>
            <SectionIcon name={section.icon} size={22} />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{section.name}</Typography>
            {section.description && (
              <Typography variant="body2" color="text.secondary">{section.description}</Typography>
            )}
          </Box>
        </Stack>
        {/* Single-tab New Record button lives in the header */}
        {!multiTab && (
          <Button variant="contained" disableElevation startIcon={<Plus />}
            onClick={() => handleNewRecord(tabs[0])}
            sx={{ bgcolor: section.color || '#1A1C1E', borderRadius: 2, px: 3 }}>
            New Record
          </Button>
        )}
      </Stack>

      {multiTab ? (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          {/* Tab bar */}
          <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
            <Tabs
              value={activeSectionTab}
              onChange={(_, v) => setActiveSectionTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                '& .MuiTabs-indicator': { bgcolor: section.color || 'primary.main', height: 3 },
                '& .Mui-selected': { color: `${section.color || 'primary.main'} !important`, fontWeight: 700 }
              }}
            >
              {tabs.map((tab, i) => (
                <Tab key={tab.id} label={tab.name} value={i}
                  sx={{ minHeight: 52, fontWeight: 500, fontSize: '0.875rem' }} />
              ))}
            </Tabs>
          </Box>
          {/* Active tab record list */}
          <Box sx={{ p: 3 }}>
            {renderTabContent(tabs[activeSectionTab], activeSectionTab)}
          </Box>
        </Paper>
      ) : (
        renderTabContent(tabs[0], 0)
      )}

      {snackbarEl}
    </Box>
  );
};

export default CustomSection;
