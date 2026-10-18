import React, { useMemo, useRef, useState } from 'react';
import {
  Box, Card, Typography, Switch, Button, IconButton, TextField, Chip, Menu, MenuItem,
  ListSubheader, Tooltip, ButtonBase, alpha,
} from '@mui/material';
import {
  LayoutDashboard, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown, Plus, Trash2,
  Zap, Clock, RotateCcw, Link2, Check,
} from 'lucide-react';
import {
  DASHBOARD_WIDGETS, DASHBOARD_KPIS, DASHBOARD_PERIODS, SHORTCUT_PRESETS, SHORTCUT_ICONS,
  SHORTCUT_COLORS, DEFAULT_DASHBOARD, resolveDashboard, shortcutAvailable,
} from './dashboardConfig';

const MAX_SHORTCUTS = 16;
const newId = () => `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const Section = ({ title, subtitle, action, children }) => (
  <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
    <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {action}
    </Box>
    <Box sx={{ p: 1.5 }}>{children}</Box>
  </Card>
);

const ShortcutIcon = ({ sc, size = 15 }) => (
  <Box sx={{ width: 28, height: 28, borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: sc.color || '#5c1f22', color: '#fff' }}>
    {React.createElement(SHORTCUT_ICONS[sc.icon] || SHORTCUT_ICONS.zap, { size })}
  </Box>
);

/**
 * Settings → Dashboard. Choose which widgets show and in what order, which
 * KPI cards appear, the default period, and the shortcut buttons. Edits are a
 * draft until "Save" (same pattern as the other Settings sections).
 */
const DashboardSettings = ({ config, saveConfig, primary = '#5c1f22', businessName }) => {
  const saved = useMemo(() => resolveDashboard(config?.dashboard), [config?.dashboard]);
  const [draft, setDraft] = useState(null);
  const d = draft || saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const [saving, setSaving] = useState(false);
  const [addAnchor, setAddAnchor] = useState(null);
  const [linkForm, setLinkForm] = useState(null); // { label, url } while adding a link
  const [editId, setEditId] = useState(null);
  const dragKey = useRef(null);
  const [dragOver, setDragOver] = useState(null);
  const features = config?.features || {};

  const update = (fn) => setDraft(prev => fn(JSON.parse(JSON.stringify(prev || saved))));

  // ── Widgets ──
  const moveWidget = (from, to) => update(x => {
    if (to < 0 || to >= x.widgets.length) return x;
    const [w] = x.widgets.splice(from, 1);
    x.widgets.splice(to, 0, w);
    return x;
  });
  const toggleWidget = (key) => update(x => { const w = x.widgets.find(v => v.key === key); w.visible = !w.visible; return x; });

  // ── Shortcuts ──
  const addPreset = (p) => {
    update(x => { x.shortcuts.push({ id: newId(), type: p.type, target: p.target, label: p.label, icon: p.icon, color: p.color }); return x; });
    setAddAnchor(null);
  };
  const addLink = () => {
    const label = (linkForm?.label || '').trim();
    const url = (linkForm?.url || '').trim();
    if (!label || !url) return;
    update(x => { x.shortcuts.push({ id: newId(), type: 'link', target: url, label, icon: 'link', color: '#7a2e30' }); return x; });
    setLinkForm(null);
  };
  const patchShortcut = (id, patch) => update(x => { const s = x.shortcuts.find(v => v.id === id); Object.assign(s, patch); return x; });
  const removeShortcut = (id) => update(x => { x.shortcuts = x.shortcuts.filter(v => v.id !== id); return x; });
  const moveShortcut = (from, to) => update(x => {
    if (to < 0 || to >= x.shortcuts.length) return x;
    const [s] = x.shortcuts.splice(from, 1);
    x.shortcuts.splice(to, 0, s);
    return x;
  });

  const save = async () => {
    setSaving(true);
    try { await saveConfig({ ...config, dashboard: d }); setDraft(null); }
    finally { setSaving(false); }
  };

  const atMax = d.shortcuts.length >= MAX_SHORTCUTS;
  const actionPresets = SHORTCUT_PRESETS.filter(p => p.type === 'action');
  const pagePresets = SHORTCUT_PRESETS.filter(p => p.type === 'page' && (!p.feature || features[p.feature] !== false));
  const visibleKpis = DASHBOARD_KPIS.filter(k => d.kpis[k.id] !== false).length;

  const pill = (on) => ({
    px: 1.25, py: 0.5, borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
    border: '1.5px solid', borderColor: on ? primary : '#e5e7eb',
    bgcolor: on ? alpha(primary, 0.08) : '#fff', color: on ? primary : 'text.secondary',
    display: 'inline-flex', alignItems: 'center', gap: 0.5,
  });

  return (
    <Box>
      {/* Header + save bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '9px', bgcolor: alpha(primary, 0.1), color: primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LayoutDashboard size={17} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Customize Dashboard</Typography>
          <Typography variant="caption" color="text.secondary">
            Choose what shows on the Dashboard{businessName ? ` for ${businessName}` : ''}. Applies to everyone using this business.
          </Typography>
        </Box>
        {dirty && <Chip size="small" label="Unsaved changes" sx={{ height: 22, fontWeight: 700, fontSize: '0.68rem', bgcolor: alpha('#f59e0b', 0.12), color: '#b45309' }} />}
        <Button size="small" startIcon={<RotateCcw size={14} />} onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_DASHBOARD)))}
          sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}>
          Reset to default
        </Button>
        {dirty && (
          <Button size="small" onClick={() => setDraft(null)} sx={{ textTransform: 'none', fontWeight: 600 }}>Discard</Button>
        )}
        <Button size="small" variant="contained" disableElevation disabled={!dirty || saving} onClick={save}
          startIcon={<Check size={14} />} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', bgcolor: primary }}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
        <Box>
          {/* Widgets */}
          <Section title="Sections" subtitle="Drag to reorder · eye to show or hide">
            {d.widgets.map((w, i) => {
              const meta = DASHBOARD_WIDGETS.find(x => x.key === w.key);
              return (
                <Box key={w.key}
                  draggable
                  onDragStart={() => { dragKey.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); if (dragKey.current != null && dragKey.current !== i) moveWidget(dragKey.current, i); dragKey.current = null; setDragOver(null); }}
                  onDragEnd={() => { dragKey.current = null; setDragOver(null); }}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, mb: 0.5, borderRadius: '10px',
                    border: '1px solid', borderColor: dragOver === i ? primary : '#eef0f2',
                    bgcolor: w.visible ? '#fff' : '#f6efe9', opacity: w.visible ? 1 : 0.65,
                  }}>
                  <Box sx={{ color: 'text.disabled', cursor: 'grab', display: 'flex' }}><GripVertical size={15} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 700, textDecoration: w.visible ? 'none' : 'line-through' }}>{meta?.label}</Typography>
                    <Typography noWrap sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{meta?.desc}</Typography>
                  </Box>
                  <IconButton size="small" onClick={() => moveWidget(i, i - 1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={15} /></IconButton>
                  <IconButton size="small" onClick={() => moveWidget(i, i + 1)} disabled={i === d.widgets.length - 1} aria-label="Move down"><ChevronDown size={15} /></IconButton>
                  <Tooltip title={w.visible ? 'Hide' : 'Show'}>
                    <IconButton size="small" onClick={() => toggleWidget(w.key)} aria-label={w.visible ? 'Hide' : 'Show'}
                      sx={{ color: w.visible ? primary : 'text.disabled' }}>
                      {w.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Section>

          {/* Summary options */}
          <Section title="Business summary" subtitle={`${visibleKpis} of ${DASHBOARD_KPIS.length} cards shown`}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>KPI cards</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
              {DASHBOARD_KPIS.map(k => {
                const on = d.kpis[k.id] !== false;
                return (
                  <ButtonBase key={k.id} onClick={() => update(x => { x.kpis[k.id] = !on; return x; })} sx={pill(on)}>
                    {on && <Check size={12} />}{k.label}
                  </ButtonBase>
                );
              })}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
              <Clock size={15} color="#57433e" />
              <Typography sx={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>Show clock & calendar</Typography>
              <Switch size="small" checked={d.showClock} onChange={(e) => update(x => { x.showClock = e.target.checked; return x; })} />
            </Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mt: 1, mb: 0.75 }}>Default period when the Dashboard opens</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {DASHBOARD_PERIODS.map(p => (
                <ButtonBase key={p.value} onClick={() => update(x => { x.defaultPeriod = p.value; return x; })} sx={pill(d.defaultPeriod === p.value)}>
                  {p.label}
                </ButtonBase>
              ))}
            </Box>
          </Section>
        </Box>

        {/* Shortcuts */}
        <Section
          title="Shortcuts"
          subtitle={`${d.shortcuts.length}/${MAX_SHORTCUTS} · one-tap buttons on the Dashboard`}
          action={
            <Button size="small" variant="outlined" startIcon={<Plus size={14} />} disabled={atMax}
              onClick={(e) => setAddAnchor(e.currentTarget)}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', borderColor: alpha(primary, 0.4), color: primary }}>
              Add shortcut
            </Button>
          }>
          {d.shortcuts.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
              <Zap size={22} style={{ opacity: 0.5 }} />
              <Typography sx={{ fontSize: '0.8rem', mt: 0.5 }}>No shortcuts yet. Add buttons for the things you do most.</Typography>
            </Box>
          )}
          {d.shortcuts.map((sc, i) => {
            const available = shortcutAvailable(sc, features);
            const editing = editId === sc.id;
            const kind = sc.type === 'link' ? 'Link' : sc.type === 'action' ? 'Action' : 'Page';
            return (
              <Box key={sc.id} sx={{ mb: 0.5, borderRadius: '10px', border: '1px solid', borderColor: editing ? alpha(primary, 0.5) : '#eef0f2', bgcolor: '#fff' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.6 }}>
                  <ShortcutIcon sc={sc} />
                  <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setEditId(editing ? null : sc.id)}>
                    <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{sc.label}</Typography>
                    <Typography noWrap sx={{ fontSize: '0.66rem', color: available ? 'text.secondary' : '#b45309' }}>
                      {kind}{sc.type === 'link' ? ` · ${sc.target}` : ''}{!available ? ' · hidden (module off)' : ''}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => moveShortcut(i, i - 1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={15} /></IconButton>
                  <IconButton size="small" onClick={() => moveShortcut(i, i + 1)} disabled={i === d.shortcuts.length - 1} aria-label="Move down"><ChevronDown size={15} /></IconButton>
                  <Button size="small" onClick={() => setEditId(editing ? null : sc.id)} sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0, px: 1 }}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                  <IconButton size="small" onClick={() => removeShortcut(sc.id)} aria-label="Remove" sx={{ color: '#dc2626' }}><Trash2 size={15} /></IconButton>
                </Box>
                {editing && (
                  <Box sx={{ px: 1.25, pb: 1.25, pt: 0.5, borderTop: '1px solid #f6efe9' }}>
                    <TextField size="small" fullWidth label="Label" value={sc.label}
                      onChange={(e) => patchShortcut(sc.id, { label: e.target.value.slice(0, 30) })} sx={{ mb: 1 }} />
                    {sc.type === 'link' && (
                      <TextField size="small" fullWidth label="Link (URL)" value={sc.target}
                        onChange={(e) => patchShortcut(sc.id, { target: e.target.value.trim() })} sx={{ mb: 1 }} />
                    )}
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>Icon</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {Object.entries(SHORTCUT_ICONS).map(([key, Ic]) => (
                        <IconButton key={key} size="small" onClick={() => patchShortcut(sc.id, { icon: key })}
                          sx={{ borderRadius: '7px', border: '1.5px solid', borderColor: sc.icon === key ? primary : 'transparent', color: sc.icon === key ? primary : 'text.secondary' }}>
                          {React.createElement(Ic, { size: 15 })}
                        </IconButton>
                      ))}
                    </Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>Color</Typography>
                    <Box sx={{ display: 'flex', gap: 0.75 }}>
                      {SHORTCUT_COLORS.map(c => (
                        <ButtonBase key={c} onClick={() => patchShortcut(sc.id, { color: c })} aria-label={`Color ${c}`}
                          sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: c, outline: sc.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}

          {linkForm && (
            <Box sx={{ mt: 1, p: 1.25, borderRadius: '10px', border: `1px dashed ${alpha(primary, 0.5)}` }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}><Link2 size={13} /> New link shortcut</Typography>
              <TextField size="small" fullWidth label="Label" value={linkForm.label} autoFocus
                onChange={(e) => setLinkForm(f => ({ ...f, label: e.target.value.slice(0, 30) }))} sx={{ mb: 1 }} />
              <TextField size="small" fullWidth label="Link (URL)" placeholder="e.g. gst.gov.in" value={linkForm.url}
                onChange={(e) => setLinkForm(f => ({ ...f, url: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addLink()} sx={{ mb: 1 }} />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setLinkForm(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
                <Button size="small" variant="contained" disableElevation onClick={addLink}
                  disabled={!linkForm.label.trim() || !linkForm.url.trim()} sx={{ textTransform: 'none', fontWeight: 700, bgcolor: primary }}>
                  Add link
                </Button>
              </Box>
            </Box>
          )}

          <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}
            slotProps={{ paper: { sx: { maxHeight: 420, minWidth: 240, borderRadius: '10px' } } }}>
            <ListSubheader sx={{ lineHeight: '30px', fontSize: '0.7rem', fontWeight: 800 }}>QUICK ACTIONS</ListSubheader>
            {actionPresets.map(p => (
              <MenuItem key={p.target} dense onClick={() => addPreset(p)} sx={{ gap: 1 }}>
                <ShortcutIcon sc={p} size={13} /> {p.label}
              </MenuItem>
            ))}
            <ListSubheader sx={{ lineHeight: '30px', fontSize: '0.7rem', fontWeight: 800 }}>OPEN A PAGE</ListSubheader>
            {pagePresets.map(p => (
              <MenuItem key={p.target} dense onClick={() => addPreset(p)} sx={{ gap: 1 }}>
                <ShortcutIcon sc={p} size={13} /> {p.label}
              </MenuItem>
            ))}
            <ListSubheader sx={{ lineHeight: '30px', fontSize: '0.7rem', fontWeight: 800 }}>CUSTOM</ListSubheader>
            <MenuItem dense onClick={() => { setAddAnchor(null); setLinkForm({ label: '', url: '' }); }} sx={{ gap: 1 }}>
              <ShortcutIcon sc={{ icon: 'link', color: '#7a2e30' }} size={13} /> Website link…
            </MenuItem>
          </Menu>
        </Section>
      </Box>
    </Box>
  );
};

export default DashboardSettings;

