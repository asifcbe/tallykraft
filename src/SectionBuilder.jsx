import React, { useState, useMemo, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, IconButton, MenuItem,
  Chip, Divider, Tooltip, Switch, FormControlLabel, Alert, Stack, useTheme, alpha,
} from '@mui/material';
import {
  Plus, Trash2, Layers, Wand2, Check, X, Pencil, ShoppingBag, Wrench, Heart, Coffee, FileText,
  Type, Hash, CalendarDays, ChevronDownSquare, AlignLeft, Phone, Mail, Timer, AlarmClock, GripVertical,
  ArrowUp, ArrowDown, Copy, MousePointerClick,
} from 'lucide-react';
import { useConfig } from './ConfigContext';
import { useDialog } from './DialogContext';
import {
  SECTION_TEMPLATES, instantiateTemplate, MAX_USER_SECTIONS, MAX_TABS, MAX_FIELDS,
} from './sectionTemplates';

// Field types the section page (CustomSection.jsx) knows how to render.
const FIELD_TYPES = [
  { value: 'text',     label: 'Text',        icon: Type,              hint: 'Short text, e.g. a name or code' },
  { value: 'number',   label: 'Number',      icon: Hash,              hint: 'Numbers, with an optional unit (₹, kg, days…)' },
  { value: 'date',     label: 'Date',        icon: CalendarDays,      hint: 'A calendar date' },
  { value: 'select',   label: 'Dropdown',    icon: ChevronDownSquare, hint: 'Pick one from a list you define' },
  { value: 'textarea', label: 'Long Text',   icon: AlignLeft,         hint: 'Notes or descriptions over several lines' },
  { value: 'phone',    label: 'Phone',       icon: Phone,             hint: 'A phone number' },
  { value: 'email',    label: 'Email',       icon: Mail,              hint: 'An email address' },
  { value: 'counter',  label: 'Counter',     icon: Timer,             hint: 'Used / total tracker, e.g. sessions left' },
  { value: 'penalty',  label: 'Late Fee',    icon: AlarmClock,        hint: 'Auto fine per day past a due/return date field' },
];
const typeMeta = (v) => FIELD_TYPES.find((t) => t.value === v) || FIELD_TYPES[0];

// A read-only look-alike of how the field appears on the section's form.
const FieldPreview = ({ f }) => {
  const label = `${f.name || typeMeta(f.type).label}${f.required ? ' *' : ''}`;
  const common = { size: 'small', fullWidth: true, label, disabled: true, sx: { '& .Mui-disabled': { WebkitTextFillColor: 'inherit' }, pointerEvents: 'none' } };
  if (f.type === 'select') return <TextField {...common} value={f.options?.[0] || ''} select>{(f.options || []).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}</TextField>;
  if (f.type === 'textarea') return <TextField {...common} multiline rows={2} value="" />;
  if (f.type === 'date') return <TextField {...common} type="date" value="" slotProps={{ inputLabel: { shrink: true } }} />;
  if (f.type === 'counter') return <TextField {...common} value={`0 / 10 ${f.unit || 'sessions'} used`} />;
  if (f.type === 'penalty') return <TextField {...common} value={`₹${Number(f.ratePerDay) || 0} per day overdue`} />;
  return <TextField {...common} value="" slotProps={f.unit ? { input: { endAdornment: <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>{f.unit}</Typography> } } : undefined} />;
};


const TPL_ICON = { ShoppingBag, Wrench, Heart, Coffee, FileText };

let _seq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${_seq++}`;

const countFields = (tabs) => tabs.reduce((s, t) => s + (t.fields?.length || 0), 0);

const emptyDraft = () => ({
  id: uid('sec'),
  name: '',
  description: '',
  icon: 'FileText',
  color: '#111111',
  createdBy: 'user',
  tabs: [{ id: uid('t'), name: 'Details', fields: [] }],
});

// Normalize options between the editor (comma string) and stored (array).
const toEditable = (section) => ({
  ...section,
  tabs: (section.tabs || []).map((t) => ({
    ...t,
    fields: (t.fields || []).map((f) => ({
      ...f,
      options: Array.isArray(f.options) ? f.options : String(f.options || '').split(',').map((o) => o.trim()).filter(Boolean),
    })),
  })),
});
const toStored = (section) => ({
  ...section,
  createdBy: 'user',
  tabs: (section.tabs || []).map((t) => ({
    id: t.id || uid('t'),
    name: t.name?.trim() || 'Details',
    fields: (t.fields || []).filter((f) => f.name?.trim()).map((f) => ({
      id: f.id || uid('f'),
      name: f.name.trim(),
      type: f.type || 'text',
      unit: f.unit || '',
      required: !!f.required,
      options: f.type === 'select'
        ? (typeof f.options === 'string' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : (f.options || []))
        : [],
      ...(f.type === 'penalty' ? { ratePerDay: Number(f.ratePerDay) || 0 } : {}),
    })),
  })),
});

const SectionBuilder = () => {
  const theme = useTheme();
  const { config, saveConfig } = useConfig();
  const { confirm, showAlert } = useDialog();

  const allSections = useMemo(() => config.customSections || [], [config.customSections]);
  const userSections = useMemo(() => allSections.filter((s) => s.createdBy === 'user'), [allSections]);
  const atLimit = userSections.length >= MAX_USER_SECTIONS;

  const [draft, setDraft] = useState(null); // editing draft or null
  const [error, setError] = useState('');

  const persist = (nextUserSections) => {
    const adminSections = allSections.filter((s) => s.createdBy !== 'user');
    saveConfig?.({ customSections: [...adminSections, ...nextUserSections] });
  };

  const applyTemplate = async (tpl) => {
    if (atLimit) {
      await showAlert({ title: 'Limit reached', message: `Your plan includes ${MAX_USER_SECTIONS} custom section. Delete the existing one to add another.`, variant: 'warning' });
      return;
    }
    const section = instantiateTemplate(tpl);
    persist([...userSections, section]);
    await showAlert({ title: 'Section added', message: `"${section.name}" is now in your sidebar. You can edit it any time.`, variant: 'success' });
  };

  const startNew = () => { setError(''); setDraft(emptyDraft()); setActiveTab(0); setSelected(null); };
  const startEdit = (section) => { setError(''); setDraft(toEditable(section)); setActiveTab(0); setSelected(null); };
  // Open a template in the builder so it can be tweaked before saving.
  const customizeTemplate = (tpl) => startEdit(instantiateTemplate(tpl));

  // ── builder state ──
  const [activeTab, setActiveTab] = useState(0);
  const [selected, setSelected] = useState(null);      // { ti, fi } of the field being edited
  const [dropAt, setDropAt] = useState(null);          // index where a dragged field would land
  const [dragOverTab, setDragOverTab] = useState(null);
  const [newOption, setNewOption] = useState('');
  const dragRef = useRef(null);                         // { kind: 'new', type } | { kind: 'move', ti, fi }

  // Copy of the tabs (with copied field arrays) that's safe to mutate, then commit.
  const cloneTabs = () => draft.tabs.map((t) => ({ ...t, fields: [...t.fields] }));
  const commitTabs = (tabs) => setDraft({ ...draft, tabs });
  const withTabs = (fn) => commitTabs(fn(cloneTabs()));
  const newField = (type) => ({ id: uid('f'), name: '', type, unit: '', required: false, options: type === 'select' ? ['Option 1', 'Option 2'] : [], ...(type === 'penalty' ? { ratePerDay: 10 } : {}) });

  const insertField = (type, ti, index) => {
    if (countFields(draft.tabs) >= MAX_FIELDS) { setError(`Maximum ${MAX_FIELDS} fields across all tabs.`); return; }
    const f = { ...newField(type), name: typeMeta(type).label };
    const tabs = cloneTabs();
    const at = index == null ? tabs[ti].fields.length : index;
    tabs[ti].fields.splice(at, 0, f);
    commitTabs(tabs);
    setActiveTab(ti);
    setSelected({ ti, fi: at });
  };
  const moveField = (from, ti, index) => {
    const tabs = cloneTabs();
    // `index` was measured before the field was lifted out, so a move further
    // down the same tab lands one slot earlier once it's removed.
    let at = index == null ? null : (from.ti === ti && from.fi < index ? index - 1 : index);
    const [f] = tabs[from.ti].fields.splice(from.fi, 1);
    if (at == null) at = tabs[ti].fields.length;
    tabs[ti].fields.splice(at, 0, f);
    commitTabs(tabs);
    setActiveTab(ti);
    setSelected({ ti, fi: at });
  };

  const addTab = () => {
    if (draft.tabs.length >= MAX_TABS) { setError(`Maximum ${MAX_TABS} tabs allowed.`); return; }
    setDraft({ ...draft, tabs: [...draft.tabs, { id: uid('t'), name: `Tab ${draft.tabs.length + 1}`, fields: [] }] });
    setActiveTab(draft.tabs.length);
    setSelected(null);
  };
  const removeTab = (ti) => {
    if (draft.tabs.length <= 1) { setError('At least one tab is required.'); return; }
    setDraft({ ...draft, tabs: draft.tabs.filter((_, i) => i !== ti) });
    setActiveTab(0);
    setSelected(null);
  };
  const updateTab = (ti, name) => withTabs((tabs) => { tabs[ti] = { ...tabs[ti], name }; return tabs; });
  const updateField = (ti, fi, patch) => withTabs((tabs) => { tabs[ti].fields[fi] = { ...tabs[ti].fields[fi], ...patch }; return tabs; });
  const removeField = (ti, fi) => { withTabs((tabs) => { tabs[ti].fields.splice(fi, 1); return tabs; }); setSelected(null); };
  const duplicateField = (ti, fi) => {
    if (countFields(draft.tabs) >= MAX_FIELDS) { setError(`Maximum ${MAX_FIELDS} fields across all tabs.`); return; }
    withTabs((tabs) => { const f = tabs[ti].fields[fi]; tabs[ti].fields.splice(fi + 1, 0, { ...f, id: uid('f'), name: `${f.name} (copy)` }); return tabs; });
    setSelected({ ti, fi: fi + 1 });
  };
  const nudgeField = (ti, fi, dir) => {
    const j = fi + dir;
    if (j < 0 || j >= draft.tabs[ti].fields.length) return;
    withTabs((tabs) => { const fs = tabs[ti].fields; [fs[fi], fs[j]] = [fs[j], fs[fi]]; return tabs; });
    setSelected({ ti, fi: j });
  };

  // ── drag & drop (HTML5) ──
  const onDragEnd = () => { dragRef.current = null; setDropAt(null); setDragOverTab(null); };
  const onCardDragOver = (e, fi) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? fi : fi + 1);
  };
  const onListDrop = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    const at = dropAt;
    onDragEnd();
    if (!d) return;
    if (d.kind === 'new') insertField(d.type, activeTab, at);
    else moveField({ ti: d.ti, fi: d.fi }, activeTab, at);
  };
  const onTabDrop = (e, ti) => {
    e.preventDefault();
    const d = dragRef.current;
    onDragEnd();
    if (!d) return;
    if (d.kind === 'new') insertField(d.type, ti, null);
    else if (d.ti !== ti) moveField({ ti: d.ti, fi: d.fi }, ti, null);
  };

  const saveDraft = async () => {
    if (!draft.name.trim()) { setError('Give your section a name.'); return; }
    if (countFields(draft.tabs) === 0) { setError('Add at least one field.'); return; }
    const unnamed = draft.tabs.some((t) => t.fields.some((f) => !f.name?.trim()));
    if (unnamed) { setError('Every field needs a name — select it and type one in the right panel.'); return; }
    if (countFields(draft.tabs) > MAX_FIELDS) { setError(`Maximum ${MAX_FIELDS} fields allowed.`); return; }
    if (draft.tabs.length > MAX_TABS) { setError(`Maximum ${MAX_TABS} tabs allowed.`); return; }
    const stored = toStored(draft);
    const exists = userSections.some((s) => s.id === stored.id);
    if (!exists && atLimit) { setError(`Your plan includes ${MAX_USER_SECTIONS} custom section.`); return; }
    const next = exists ? userSections.map((s) => (s.id === stored.id ? stored : s)) : [...userSections, stored];
    persist(next);
    setDraft(null);
    await showAlert({ title: 'Saved', message: `"${stored.name}" saved. Find it in your sidebar.`, variant: 'success' });
  };

  const deleteSection = async (section) => {
    const ok = await confirm({ title: 'Delete section', message: `Delete "${section.name}"? Existing records in it stay in your data but the section is removed from the sidebar.`, confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    persist(userSections.filter((s) => s.id !== section.id));
  };

  const fieldCount = draft ? countFields(draft.tabs) : 0;
  const primary = theme.palette.primary.main;

  // ── Editor view ────────────────────────────────────────────────────────────
  if (draft) {
    const tab = draft.tabs[activeTab] || draft.tabs[0];
    const sel = selected && draft.tabs[selected.ti]?.fields[selected.fi] ? { ...selected, f: draft.tabs[selected.ti].fields[selected.fi] } : null;
    const sectionLabel = { fontSize: '0.64rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 };
    const dropLine = <Box sx={{ height: 3, borderRadius: 2, bgcolor: primary, my: 0.25 }} />;

    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Layers size={18} color={primary} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
            {userSections.some((s) => s.id === draft.id) ? 'Edit section' : 'Build a section'}
          </Typography>
          <Chip size="small" label={`${fieldCount}/${MAX_FIELDS} fields`} color={fieldCount >= MAX_FIELDS ? 'warning' : 'default'} />
          <Chip size="small" label={`${draft.tabs.length}/${MAX_TABS} tabs`} />
          <Button color="inherit" size="small" startIcon={<X size={15} />} onClick={() => setDraft(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" size="small" startIcon={<Check size={15} />} onClick={saveDraft} sx={{ textTransform: 'none', fontWeight: 700 }}>Save section</Button>
        </Stack>

        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField label="Section name" size="small" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Job Cards" sx={{ flex: 1 }} />
          <TextField label="Description (optional)" size="small" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} sx={{ flex: 2 }} />
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '190px minmax(0,1fr) 250px' }, gap: 1.5, alignItems: 'start' }}>
          {/* Palette */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25 }}>
            <Typography sx={sectionLabel}>Drag a field in</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr' }, gap: 0.5 }}>
              {FIELD_TYPES.map((t) => (
                <Tooltip key={t.value} title={`${t.hint} — drag onto the form, or click to add`} placement="right">
                  <Box
                    draggable
                    onDragStart={(e) => { dragRef.current = { kind: 'new', type: t.value }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', t.value); }}
                    onDragEnd={onDragEnd}
                    onClick={() => insertField(t.value, activeTab, null)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.7, borderRadius: '8px', cursor: 'grab', userSelect: 'none',
                      border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', fontSize: '0.8rem', fontWeight: 600,
                      '&:hover': { borderColor: primary, color: primary, bgcolor: alpha(primary, 0.05) }, '&:active': { cursor: 'grabbing' } }}>
                    <GripVertical size={12} style={{ opacity: 0.35, flexShrink: 0 }} />
                    <t.icon size={14} style={{ flexShrink: 0 }} />
                    {t.label}
                  </Box>
                </Tooltip>
              ))}
            </Box>
          </Box>

          {/* Form canvas */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', minWidth: 0 }}>
            {/* Tabs — drop a field on a tab to move it there */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha(primary, 0.03), flexWrap: 'wrap' }}>
              {draft.tabs.map((t, ti) => {
                const on = ti === activeTab;
                return (
                  <Box key={t.id}
                    onClick={() => { setActiveTab(ti); setSelected(null); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverTab(ti); }}
                    onDragLeave={() => setDragOverTab(null)}
                    onDrop={(e) => onTabDrop(e, ti)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.6, cursor: 'pointer', borderRadius: '8px 8px 0 0',
                      border: '1px solid', borderBottom: 'none', borderColor: on ? 'divider' : 'transparent',
                      bgcolor: dragOverTab === ti ? alpha(primary, 0.15) : on ? 'background.paper' : 'transparent', mb: '-1px' }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: on ? 800 : 600, color: on ? primary : 'text.secondary' }}>{t.name || `Tab ${ti + 1}`}</Typography>
                    <Chip size="small" label={t.fields.length} sx={{ height: 16, fontSize: '0.6rem' }} />
                  </Box>
                );
              })}
              <Tooltip title="Add tab">
                <span><IconButton size="small" onClick={addTab} disabled={draft.tabs.length >= MAX_TABS}><Plus size={15} /></IconButton></span>
              </Tooltip>
            </Box>

            <Box sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
                <TextField size="small" label="Tab name" value={tab.name} onChange={(e) => updateTab(activeTab, e.target.value)} sx={{ maxWidth: 220 }} />
                <Box sx={{ flex: 1 }} />
                {draft.tabs.length > 1 && (
                  <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={() => removeTab(activeTab)} sx={{ textTransform: 'none' }}>Remove tab</Button>
                )}
              </Stack>

              <Box
                onDragOver={(e) => { e.preventDefault(); if (tab.fields.length === 0) setDropAt(0); }}
                onDrop={onListDrop}
                sx={{ minHeight: 160, borderRadius: 2, p: 0.5, border: '1.5px dashed', borderColor: dropAt != null ? primary : 'divider', bgcolor: dropAt != null ? alpha(primary, 0.03) : 'transparent', transition: 'all 0.12s' }}>
                {tab.fields.length === 0 && (
                  <Box sx={{ py: 5, textAlign: 'center', color: 'text.disabled' }}>
                    <MousePointerClick size={22} style={{ opacity: 0.6 }} />
                    <Typography sx={{ fontSize: '0.82rem', mt: 0.75 }}>Drag a field here from the left — or click one to add it.</Typography>
                  </Box>
                )}
                {tab.fields.map((f, fi) => {
                  const isSel = sel && sel.ti === activeTab && sel.fi === fi;
                  const Icon = typeMeta(f.type).icon;
                  return (
                    <React.Fragment key={f.id}>
                      {dropAt === fi && dropLine}
                      <Box
                        draggable
                        onDragStart={(e) => { dragRef.current = { kind: 'move', ti: activeTab, fi }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id); }}
                        onDragEnd={onDragEnd}
                        onDragOver={(e) => onCardDragOver(e, fi)}
                        onClick={() => setSelected({ ti: activeTab, fi })}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, my: 0.5, borderRadius: '10px', cursor: 'pointer', bgcolor: 'background.paper',
                          border: '1.5px solid', borderColor: isSel ? primary : 'divider', boxShadow: isSel ? `0 0 0 3px ${alpha(primary, 0.12)}` : 'none',
                          '&:hover': { borderColor: isSel ? primary : alpha(primary, 0.5) } }}>
                        <Box sx={{ color: 'text.disabled', cursor: 'grab', display: 'flex' }}><GripVertical size={16} /></Box>
                        <Tooltip title={typeMeta(f.type).label}><Box sx={{ color: primary, display: 'flex' }}><Icon size={15} /></Box></Tooltip>
                        <Box sx={{ flex: 1, minWidth: 0 }}><FieldPreview f={f} /></Box>
                        <Tooltip title="Remove">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); removeField(activeTab, fi); }}><Trash2 size={15} /></IconButton>
                        </Tooltip>
                      </Box>
                    </React.Fragment>
                  );
                })}
                {dropAt === tab.fields.length && tab.fields.length > 0 && dropLine}
              </Box>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', mt: 0.75 }}>
                Drag ⋮⋮ to reorder · drop on another tab to move a field there · click a field to edit it
              </Typography>
            </Box>
          </Box>

          {/* Properties */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
            {!sel ? (
              <Box sx={{ textAlign: 'center', py: 3, color: 'text.disabled' }}>
                <Pencil size={20} style={{ opacity: 0.5 }} />
                <Typography sx={{ fontSize: '0.8rem', mt: 1 }}>Click a field on the form to edit it.</Typography>
              </Box>
            ) : (
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  <Typography sx={{ flex: 1, fontWeight: 800, fontSize: '0.86rem' }}>Field</Typography>
                  <Tooltip title="Move up"><span><IconButton size="small" disabled={sel.fi === 0} onClick={() => nudgeField(sel.ti, sel.fi, -1)}><ArrowUp size={15} /></IconButton></span></Tooltip>
                  <Tooltip title="Move down"><span><IconButton size="small" disabled={sel.fi === draft.tabs[sel.ti].fields.length - 1} onClick={() => nudgeField(sel.ti, sel.fi, 1)}><ArrowDown size={15} /></IconButton></span></Tooltip>
                  <Tooltip title="Duplicate"><IconButton size="small" onClick={() => duplicateField(sel.ti, sel.fi)}><Copy size={15} /></IconButton></Tooltip>
                  <Tooltip title="Remove"><IconButton size="small" color="error" onClick={() => removeField(sel.ti, sel.fi)}><Trash2 size={15} /></IconButton></Tooltip>
                </Stack>
                <TextField size="small" label="Field name" autoFocus value={sel.f.name} onChange={(e) => updateField(sel.ti, sel.fi, { name: e.target.value })} />
                <TextField size="small" select label="Type" value={sel.f.type}
                  onChange={(e) => updateField(sel.ti, sel.fi, { type: e.target.value, ...(e.target.value === 'select' && !(sel.f.options || []).length ? { options: ['Option 1', 'Option 2'] } : {}), ...(e.target.value === 'penalty' && sel.f.ratePerDay == null ? { ratePerDay: 10 } : {}) })}>
                  {FIELD_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: -0.5 }}>{typeMeta(sel.f.type).hint}</Typography>
                {(sel.f.type === 'number' || sel.f.type === 'counter') && (
                  <TextField size="small" label={sel.f.type === 'counter' ? 'Unit (e.g. sessions)' : 'Unit (optional, e.g. ₹, kg)'} value={sel.f.unit || ''} onChange={(e) => updateField(sel.ti, sel.fi, { unit: e.target.value })} />
                )}
                {sel.f.type === 'penalty' && (
                  <TextField size="small" type="number" label="Fine per day (₹)" value={sel.f.ratePerDay ?? 0} onChange={(e) => updateField(sel.ti, sel.fi, { ratePerDay: e.target.value })} helperText="Counts days past the first due / return / deadline date field on this tab." />
                )}
                {sel.f.type === 'select' && (
                  <Box>
                    <Typography sx={sectionLabel}>Options</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
                      {(sel.f.options || []).map((o, oi) => (
                        <Chip key={`${o}-${oi}`} size="small" label={o} onDelete={() => updateField(sel.ti, sel.fi, { options: sel.f.options.filter((_, i) => i !== oi) })} />
                      ))}
                    </Box>
                    <TextField size="small" fullWidth placeholder="Type an option, press Enter" value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newOption.trim()) {
                          e.preventDefault();
                          updateField(sel.ti, sel.fi, { options: [...(sel.f.options || []), newOption.trim()] });
                          setNewOption('');
                        }
                      }} />
                  </Box>
                )}
                <FormControlLabel
                  control={<Switch size="small" checked={!!sel.f.required} onChange={(e) => updateField(sel.ti, sel.fi, { required: e.target.checked })} />}
                  label={<Typography sx={{ fontSize: '0.8rem' }}>Required</Typography>}
                />
              </Stack>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // ── Gallery / manage view ───────────────────────────────────────────────────
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Layers size={18} color={primary} />
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Custom Sections</Typography>
        <Chip size="small" label={`${userSections.length}/${MAX_USER_SECTIONS} used`} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Add a tailored section to track anything your business needs — up to {MAX_FIELDS} fields across {MAX_TABS} tabs. Use a ready-made template or build your own.
      </Typography>

      {/* Your section(s) */}
      {userSections.length > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>Your section</Typography>
            {userSections.map((s) => (
              <Stack key={s.id} direction="row" alignItems="center" spacing={1} sx={{ mt: 1.25 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color || primary, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{s.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(s.tabs?.length || 1)} tab{(s.tabs?.length || 1) !== 1 ? 's' : ''} · {(s.tabs || []).reduce((a, t) => a + (t.fields?.length || 0), 0)} fields
                  </Typography>
                </Box>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => startEdit(s)}><Pencil size={16} /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => deleteSection(s)}><Trash2 size={16} /></IconButton></Tooltip>
              </Stack>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Build your own */}
      <Button
        variant="contained"
        startIcon={<Wand2 size={16} />}
        onClick={startNew}
        disabled={atLimit}
        sx={{ mb: 0.5, textTransform: 'none', fontWeight: 700 }}
      >
        Build your own section
      </Button>
      {atLimit && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          You&apos;ve used your custom section. Delete it above to create a different one.
        </Typography>
      )}

      <Divider sx={{ my: 2 }}>
        <Typography variant="caption" color="text.secondary">or start from a template</Typography>
      </Divider>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {SECTION_TEMPLATES.map((tpl) => {
          const Icon = TPL_ICON[tpl.icon] || FileText;
          return (
            <Card key={tpl.key} variant="outlined" sx={{ borderRadius: 2, transition: 'all 0.12s', '&:hover': { borderColor: tpl.color, boxShadow: theme.shadows[2] } }}>
              <CardContent>
                <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                  <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(tpl.color, 0.1), color: tpl.color, display: 'flex', flexShrink: 0 }}>
                    <Icon size={20} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{tpl.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{tpl.description}</Typography>
                    <Typography variant="caption" sx={{ color: tpl.color, fontWeight: 600 }}>
                      {tpl.tabs.length} tabs · {tpl.tabs.reduce((a, t) => a + t.fields.length, 0)} fields
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Button
                    fullWidth size="small" variant="outlined" startIcon={<Plus size={15} />}
                    onClick={() => applyTemplate(tpl)} disabled={atLimit}
                    sx={{ textTransform: 'none', fontWeight: 700, borderColor: alpha(tpl.color, 0.4), color: tpl.color, '&:hover': { borderColor: tpl.color, bgcolor: alpha(tpl.color, 0.06) } }}
                  >
                    Use as is
                  </Button>
                  <Button
                    fullWidth size="small" startIcon={<Pencil size={14} />}
                    onClick={() => customizeTemplate(tpl)} disabled={atLimit}
                    sx={{ textTransform: 'none', fontWeight: 700, color: tpl.color, bgcolor: alpha(tpl.color, 0.08), '&:hover': { bgcolor: alpha(tpl.color, 0.14) } }}
                  >
                    Customize
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

export default SectionBuilder;
