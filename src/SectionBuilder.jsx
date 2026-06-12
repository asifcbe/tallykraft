import React, { useState, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, IconButton, MenuItem,
  Chip, Divider, Tooltip, Switch, FormControlLabel, Alert, Stack, useTheme, alpha,
} from '@mui/material';
import { Plus, Trash2, Layers, Wand2, Check, X, Pencil, ShoppingBag, Wrench, Heart, Coffee, FileText } from 'lucide-react';
import { useConfig } from './ConfigContext';
import { useDialog } from './DialogContext';
import {
  SECTION_TEMPLATES, instantiateTemplate, MAX_USER_SECTIONS, MAX_TABS, MAX_FIELDS,
} from './sectionTemplates';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Long Text' },
];

const TPL_ICON = { ShoppingBag, Wrench, Heart, Coffee, FileText };

let _seq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${_seq++}`;

const countFields = (tabs) => tabs.reduce((s, t) => s + (t.fields?.length || 0), 0);

const emptyDraft = () => ({
  id: uid('sec'),
  name: '',
  description: '',
  icon: 'FileText',
  color: '#4f46e5',
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
      options: Array.isArray(f.options) ? f.options.join(', ') : (f.options || ''),
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

  const startNew = () => { setError(''); setDraft(emptyDraft()); };
  const startEdit = (section) => { setError(''); setDraft(toEditable(section)); };

  const addTab = () => {
    if (draft.tabs.length >= MAX_TABS) { setError(`Maximum ${MAX_TABS} tabs allowed.`); return; }
    setDraft({ ...draft, tabs: [...draft.tabs, { id: uid('t'), name: `Tab ${draft.tabs.length + 1}`, fields: [] }] });
  };
  const removeTab = (ti) => {
    if (draft.tabs.length <= 1) { setError('At least one tab is required.'); return; }
    setDraft({ ...draft, tabs: draft.tabs.filter((_, i) => i !== ti) });
  };
  const updateTab = (ti, name) => {
    const tabs = [...draft.tabs]; tabs[ti] = { ...tabs[ti], name }; setDraft({ ...draft, tabs });
  };
  const addField = (ti) => {
    if (countFields(draft.tabs) >= MAX_FIELDS) { setError(`Maximum ${MAX_FIELDS} fields across all tabs.`); return; }
    const tabs = [...draft.tabs];
    tabs[ti] = { ...tabs[ti], fields: [...tabs[ti].fields, { id: uid('f'), name: '', type: 'text', unit: '', required: false, options: '' }] };
    setDraft({ ...draft, tabs });
  };
  const updateField = (ti, fi, patch) => {
    const tabs = [...draft.tabs];
    const fields = [...tabs[ti].fields]; fields[fi] = { ...fields[fi], ...patch };
    tabs[ti] = { ...tabs[ti], fields }; setDraft({ ...draft, tabs });
  };
  const removeField = (ti, fi) => {
    const tabs = [...draft.tabs];
    tabs[ti] = { ...tabs[ti], fields: tabs[ti].fields.filter((_, i) => i !== fi) };
    setDraft({ ...draft, tabs });
  };

  const saveDraft = async () => {
    if (!draft.name.trim()) { setError('Give your section a name.'); return; }
    if (countFields(draft.tabs) === 0) { setError('Add at least one field.'); return; }
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
    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Layers size={18} color={primary} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
            {userSections.some((s) => s.id === draft.id) ? 'Edit section' : 'Build a section'}
          </Typography>
          <Chip size="small" label={`${fieldCount}/${MAX_FIELDS} fields`} color={fieldCount > MAX_FIELDS ? 'error' : 'default'} />
          <Chip size="small" label={`${draft.tabs.length}/${MAX_TABS} tabs`} color={draft.tabs.length > MAX_TABS ? 'error' : 'default'} />
        </Stack>

        {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Section name" fullWidth size="small" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Job Cards" />
              <TextField label="Description (optional)" fullWidth size="small" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Stack>
          </CardContent>
        </Card>

        {draft.tabs.map((tab, ti) => (
          <Card key={tab.id} variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <TextField size="small" label={`Tab ${ti + 1} name`} value={tab.name} onChange={(e) => updateTab(ti, e.target.value)} sx={{ maxWidth: 240 }} />
                <Box sx={{ flex: 1 }} />
                {draft.tabs.length > 1 && (
                  <Tooltip title="Remove tab"><IconButton size="small" color="error" onClick={() => removeTab(ti)}><Trash2 size={16} /></IconButton></Tooltip>
                )}
              </Stack>

              {tab.fields.map((f, fi) => (
                <Stack key={f.id} direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1, alignItems: { md: 'center' } }}>
                  <TextField size="small" label="Field name" value={f.name} onChange={(e) => updateField(ti, fi, { name: e.target.value })} sx={{ flex: 1 }} />
                  <TextField size="small" select label="Type" value={f.type} onChange={(e) => updateField(ti, fi, { type: e.target.value })} sx={{ width: { xs: '100%', md: 130 } }}>
                    {FIELD_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                  {f.type === 'select' && (
                    <TextField size="small" label="Options (comma separated)" value={f.options} onChange={(e) => updateField(ti, fi, { options: e.target.value })} sx={{ flex: 1 }} />
                  )}
                  <FormControlLabel
                    control={<Switch size="small" checked={!!f.required} onChange={(e) => updateField(ti, fi, { required: e.target.checked })} />}
                    label={<Typography variant="caption">Required</Typography>}
                    sx={{ mr: 0 }}
                  />
                  <Tooltip title="Remove field"><IconButton size="small" color="error" onClick={() => removeField(ti, fi)}><Trash2 size={15} /></IconButton></Tooltip>
                </Stack>
              ))}

              <Button size="small" startIcon={<Plus size={15} />} onClick={() => addField(ti)} disabled={fieldCount >= MAX_FIELDS} sx={{ mt: 0.5, textTransform: 'none' }}>
                Add field
              </Button>
            </CardContent>
          </Card>
        ))}

        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <Button variant="outlined" startIcon={<Plus size={16} />} onClick={addTab} disabled={draft.tabs.length >= MAX_TABS} sx={{ textTransform: 'none' }}>
            Add tab
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button color="inherit" startIcon={<X size={16} />} onClick={() => setDraft(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" startIcon={<Check size={16} />} onClick={saveDraft} sx={{ textTransform: 'none', fontWeight: 700 }}>Save section</Button>
        </Stack>
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
                <Button
                  fullWidth size="small" variant="outlined" startIcon={<Plus size={15} />}
                  onClick={() => applyTemplate(tpl)} disabled={atLimit}
                  sx={{ mt: 1.5, textTransform: 'none', fontWeight: 700, borderColor: alpha(tpl.color, 0.4), color: tpl.color, '&:hover': { borderColor: tpl.color, bgcolor: alpha(tpl.color, 0.06) } }}
                >
                  Use this template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

export default SectionBuilder;
