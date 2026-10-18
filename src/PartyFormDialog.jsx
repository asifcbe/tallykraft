import React, { useState, useEffect, useRef } from 'react';

const randomUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
};
import {
  Box, Button, Typography, TextField, Dialog,
  DialogContent, DialogActions, Grid, MenuItem,
  InputAdornment, IconButton, Snackbar, Alert, Divider,
  alpha, useTheme, FormControl, InputLabel, Select, Collapse,
  useMediaQuery,
} from '@mui/material';
import { Plus, X, FolderOpen, ChevronsUpDown, Landmark, ChevronDown, Users } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import {
  COUNTRY_CODES, CUSTOMER_CATEGORIES, VENDOR_CATEGORIES,
  loadCustomCategories, saveCustomCategories, generatePartyId,
  loadCustomGroups,
} from './partyUtils';
import { STATE_NAMES } from './gstUtils';

/**
 * PartyFormDialog — the single "Add / Edit Customer or Vendor" dialog.
 *
 * Props:
 *   open          boolean
 *   onClose       () => void
 *   partyType     'Customer' | 'Vendor'   (default: 'Customer')
 *   editingParty  party object | null
 *   onSaved       (savedParty) => void    called after successful save
 */
const PartyFormDialog = ({ open, onClose, partyType = 'Customer', editingParty = null, initialName = '', initialPhone = '', onSaved, compact = false }) => {
  const { currentBusiness } = useBusiness();
  const { addItem, updateItem, getItems } = useData();
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: 1.5 } };

  const isVendor = partyType === 'Vendor';
  const builtinCats = isVendor ? VENDOR_CATEGORIES : CUSTOMER_CATEGORIES;

  const [customCats, setCustomCats] = useState([]);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [customGroups, setCustomGroups] = useState([]);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [showAltPhone, setShowAltPhone] = useState(false);
  const [balanceDir, setBalanceDir] = useState(isVendor ? 'pay' : 'collect');
  const [balanceAmt, setBalanceAmt] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'error' });
  const snap = (msg, sev = 'error') => setSnack({ open: true, msg, sev });
  const newCatRef = useRef(null);
  const phoneInputRef = useRef(null);

  const blank = () => ({
    name: '', phone: '', altPhone: '', countryCode: '+91', gstNumber: '', address: '', additionalAddress: '', category: '', group: '',
    state: '',
    description: '',
    bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '',
  });

  const [form, setForm] = useState(blank());
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  // Load custom categories/groups when business changes or dialog opens
  useEffect(() => {
    if (currentBusiness?.id) {
      setCustomCats(loadCustomCategories(currentBusiness.id, partyType));
      setCustomGroups(loadCustomGroups(currentBusiness.id, partyType));
    }
  }, [currentBusiness?.id, partyType]);

  // Populate form when opening
  useEffect(() => {
    if (!open) return;
    if (editingParty) {
      setForm({ ...blank(), ...editingParty });
      const bal = Number(editingParty.balance) || 0;
      const isCollect = isVendor ? bal > 0 : bal >= 0;
      setBalanceDir(bal === 0 ? 'collect' : (isCollect ? 'collect' : 'pay'));
      setBalanceAmt(bal === 0 ? '' : String(Math.abs(bal)));
      setShowBankDetails(!!(editingParty.bankName || editingParty.accountNumber || editingParty.ifscCode || editingParty.accountHolderName));
      setShowAltPhone(!!editingParty.altPhone);
    } else {
      setForm({ ...blank(), name: initialName || '', phone: initialPhone || '' });
      setBalanceDir(isVendor ? 'pay' : 'collect');
      setBalanceAmt('');
      setShowBankDetails(false);
      setShowAltPhone(false);
    }
    setShowNewCatInput(false);
    setNewCatInput('');
    if (compact) setShowMore(false);
  }, [open, editingParty, initialName, initialPhone]); // eslint-disable-line

  const handleAddCustomCat = () => {
    const name = newCatInput.trim();
    if (!name || !currentBusiness?.id) return;
    const all = [...builtinCats, ...customCats];
    if (!all.some(c => c.toLowerCase() === name.toLowerCase())) {
      const updated = [...customCats, name];
      setCustomCats(updated);
      saveCustomCategories(currentBusiness.id, partyType, updated);
    }
    set({ category: name });
    setShowNewCatInput(false);
    setNewCatInput('');
  };

  const handleDeleteCustomCat = (cat) => {
    if (!currentBusiness?.id) return;
    const updated = customCats.filter(c => c !== cat);
    setCustomCats(updated);
    saveCustomCategories(currentBusiness.id, partyType, updated);
    if (form.category === cat) set({ category: '' });
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    // Guards against a duplicate submit — e.g. the Phone field's own Enter
    // handler calling this directly while a native form-submit-on-Enter
    // (suppressed via preventDefault, but not guaranteed across every
    // browser) also fires, or a fast repeated Enter keypress.
    if (saving) return;
    if (!currentBusiness?.id) { snap('No business selected.'); return; }
    if (!form.name?.trim()) { snap('Name is required', 'warning'); return; }
    setSaving(true);
    try {
      const parties = getItems('parties').filter(p => p.businessId === currentBusiness.id);
      const partyId = editingParty?.partyId || generatePartyId(partyType, parties);
      const absAmt = Math.abs(Number(balanceAmt) || 0);
      const signedBalance = balanceDir === 'pay' ? -absAmt : absAmt;
      const recordId = editingParty?.id || randomUUID();
      const partyData = {
        ...form,
        id: recordId,
        businessId: currentBusiness.id,
        name: form.name.trim(),
        type: partyType,
        balance: signedBalance,
        partyId,
      };

      if (editingParty) {
        await updateItem('parties', editingParty.id, partyData);
      } else {
        await addItem('parties', partyData);
      }

      snap(editingParty ? `${partyType} updated!` : `${partyType} added!`, 'success');
      onSaved?.(partyData);
      onClose();
    } catch {
      snap('Error saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const catMenuItems = [
    <MenuItem key="__none__" value="">None</MenuItem>,
    ...builtinCats.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>),
    ...(customCats.length > 0 ? [<Divider key="__div1__" sx={{ my: 0.5 }} />] : []),
    ...customCats.map(c => (
      <MenuItem key={`cc_${c}`} value={c} sx={{ display: 'flex', justifyContent: 'space-between', pr: 0.5 }}>
        <span>{c}</span>
        <IconButton size="small"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); handleDeleteCustomCat(c); }}
          sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
          <X size={12} />
        </IconButton>
      </MenuItem>
    )),
    <Divider key="__div2__" sx={{ my: 0.5 }} />,
    showNewCatInput ? (
      <Box key="__new_input__" sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.75 }}
        onKeyDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}>
        <TextField autoFocus ref={newCatRef} size="small" placeholder="Category name" value={newCatInput}
          onChange={e => setNewCatInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCat(); }
            if (e.key === 'Escape') { setShowNewCatInput(false); setNewCatInput(''); }
          }}
          sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.6 } }} />
        <Button size="small" variant="contained" onClick={handleAddCustomCat}
          sx={{ minWidth: 0, px: 1.5, py: 0.4, fontSize: '0.75rem', flexShrink: 0 }}>Add</Button>
      </Box>
    ) : (
      <MenuItem key="__add_new__"
        onMouseDown={() => { setShowNewCatInput(true); setNewCatInput(''); }}
        sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.82rem', gap: 0.75 }}>
        <Plus size={13} /> New category
      </MenuItem>
    ),
  ];

  const title = editingParty
    ? `Edit ${partyType}`
    : `Add New ${partyType}`;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: { xs: 0, sm: 3 }, overflow: 'hidden', maxHeight: { xs: '100%', sm: 'calc(100% - 64px)' } } }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%' }}>

          {/* Gradient header */}
          <Box sx={{
            background: isVendor
              ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
              : '#ffffff',
            px: 2.5, py: 1.75,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <Box>
              <Typography sx={{ color: '#5c1f22', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>
                {title}
              </Typography>
              {editingParty?.partyId && (
                <Typography sx={{ color: '#57433e', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                  {editingParty.partyId}
                </Typography>
              )}
            </Box>
            <IconButton size="small" onClick={onClose}
              sx={{ color: '#57433e', '&:hover': { bgcolor: 'rgba(92,31,34,0.08)' } }}>
              <X size={17} />
            </IconButton>
          </Box>

          {/* Scrolls internally when the form's content (Bank Details, extra
              fields, etc.) grows taller than the viewport — without this the
              form's own height could exceed the Paper's clamped max-height
              and, combined with overflow:hidden on the Paper, silently clip
              whatever sits below the fold, including the Save/Cancel footer. */}
          <DialogContent sx={{ px: 2.5, py: 2, overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            <Grid container spacing={1.5}>

              {/* Name */}
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth required size="small"
                  label={isVendor ? 'Vendor / Supplier Name' : 'Customer Name'}
                  placeholder={isVendor ? 'e.g. ABC Traders, XYZ Supplies…' : 'e.g. John Doe, ABC Shop…'}
                  value={form.name} autoFocus
                  onChange={e => set({ name: e.target.value })}
                  onKeyDown={e => {
                    // Enter moves to Phone instead of submitting the form
                    // early (a name-only submit would otherwise succeed
                    // immediately, skipping the phone number) — lets the
                    // whole add-customer flow be done with keyboard only:
                    // type name, Enter, type phone, Enter to create.
                    if (e.key === 'Enter') { e.preventDefault(); phoneInputRef.current?.focus(); }
                  }}
                  sx={fieldSx} />
              </Grid>

              {/* Phone with country code */}
              <Grid size={{ xs: 12 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField select size="small" label="Code"
                    value={form.countryCode}
                    onChange={e => set({ countryCode: e.target.value })}
                    sx={{ minWidth: 110, flexShrink: 0, ...fieldSx }}
                    SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 280 } } } }}>
                    {COUNTRY_CODES.map(c => (
                      <MenuItem key={c.code + c.country} value={c.code}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 34 }}>{c.code}</Typography>
                          <Typography variant="caption" color="text.secondary">{c.name}</Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField fullWidth size="small" label="Phone Number"
                    inputRef={phoneInputRef}
                    value={form.phone}
                    onChange={e => set({ phone: e.target.value.replace(/\D/g, '') })}
                    onKeyDown={e => {
                      // Enter here submits (creates the customer) — same as
                      // native form-submit-on-Enter, but explicit so it's
                      // guaranteed regardless of any MUI/browser quirk.
                      if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); }
                    }}
                    inputProps={{ inputMode: 'numeric', maxLength: 15 }}
                    sx={fieldSx} />
                </Box>
              </Grid>

              {/* Additional phone number */}
              <Grid size={{ xs: 12 }}>
                {showAltPhone || form.altPhone ? (
                  <TextField fullWidth size="small" label="Additional Phone Number"
                    value={form.altPhone}
                    onChange={e => set({ altPhone: e.target.value.replace(/\D/g, '') })}
                    inputProps={{ inputMode: 'numeric', maxLength: 15 }}
                    InputProps={{
                      endAdornment: (
                        <IconButton size="small" edge="end"
                          onClick={() => { set({ altPhone: '' }); setShowAltPhone(false); }}
                          sx={{ color: 'text.disabled' }}>
                          <X size={14} />
                        </IconButton>
                      ),
                    }}
                    sx={fieldSx} />
                ) : (
                  <Box onClick={() => setShowAltPhone(true)}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                      color: primary, fontSize: '0.8rem', fontWeight: 600, userSelect: 'none',
                      '&:hover': { opacity: 0.75 },
                    }}>
                    <Plus size={13} /> Add another number
                  </Box>
                )}
              </Grid>

              {/* More details toggle — compact (POS) mode only */}
              {compact && (
                <Grid size={{ xs: 12 }}>
                  <Box onClick={() => setShowMore(v => !v)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
                      py: 0.6, px: 1, borderRadius: 1.5, userSelect: 'none',
                      color: 'text.secondary', fontSize: '0.82rem', fontWeight: 600,
                      '&:hover': { color: primary },
                    }}>
                    <ChevronDown size={15} style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    {showMore ? 'Less details' : 'More details'}
                  </Box>
                </Grid>
              )}

              <Collapse in={!compact || showMore} timeout={200} style={{ width: '100%' }}>
                <Grid container spacing={1.5} sx={{ px: 0, pt: compact ? 0.5 : 0 }}>

                  {/* GSTIN + Category */}
                  <Grid size={{ xs: 6 }}>
                    <TextField fullWidth size="small" label="GSTIN (Optional)"
                      value={form.gstNumber}
                      onChange={e => set({ gstNumber: e.target.value.toUpperCase() })}
                      placeholder="22AAAAA0000A1Z5"
                      sx={fieldSx} />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <FormControl fullWidth size="small" sx={fieldSx}>
                      <InputLabel shrink>Category</InputLabel>
                      <Select
                        value={form.category}
                        label="Category"
                        displayEmpty
                        notched
                        renderValue={v => v || <span style={{ color: '#aaa' }}>None</span>}
                        onChange={e => { if (e.target.value !== '__add__') set({ category: e.target.value }); }}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}>
                        {catMenuItems}
                      </Select>
                    </FormControl>
                  </Grid>

                  {/* Group — strict pick-from-list, independent of Category
                      (e.g. a sales territory or account family); reports can
                      filter and drill down by this. A plain MUI Select, not
                      an Autocomplete — a Select's value can ONLY ever be one
                      of its own <MenuItem> options (no free typing, no
                      browser-native autofill to fight, no separately
                      controlled input-text state to keep in sync), which is
                      exactly the "strict, nothing else can appear" behavior
                      this field needs. New groups are added via "Manage
                      Groups" (Parties page → More menu), not from here —
                      matches Category's own dropdown just above. */}
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth size="small" sx={fieldSx}>
                      <InputLabel shrink>Group</InputLabel>
                      <Select
                        value={customGroups.includes(form.group) ? form.group : ''}
                        label="Group"
                        displayEmpty
                        notched
                        renderValue={v => v || <span style={{ color: '#aaa' }}>{customGroups.length ? 'None' : 'No groups yet — add one via Manage Groups'}</span>}
                        onChange={e => set({ group: e.target.value })}
                        startAdornment={<InputAdornment position="start"><Users size={14} color="#9ca3af" /></InputAdornment>}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}>
                        <MenuItem value="">None</MenuItem>
                        {customGroups.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>

                  {/* Address */}
                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth size="small" multiline rows={2} label="Address"
                      value={form.address}
                      onChange={e => set({ address: e.target.value })}
                      placeholder="Street, City, State, PIN…"
                      sx={fieldSx} />
                  </Grid>

                  {/* State — drives GST Place of Supply / inter-state detection on invoices */}
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth size="small" sx={fieldSx}>
                      <InputLabel>State</InputLabel>
                      <Select label="State" value={form.state || ''} onChange={e => set({ state: e.target.value })}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}>
                        <MenuItem value=""><em>Not set</em></MenuItem>
                        {STATE_NAMES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>

                  {/* Additional Address */}
                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth size="small" multiline rows={2} label="Additional Address"
                      value={form.additionalAddress}
                      onChange={e => set({ additionalAddress: e.target.value })}
                      placeholder="Alternate delivery/billing address…"
                      sx={fieldSx} />
                  </Grid>

                  {/* Description */}
                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth size="small" multiline rows={2} label="Description"
                      value={form.description}
                      onChange={e => set({ description: e.target.value })}
                      placeholder="Notes about this customer/vendor…"
                      sx={fieldSx} />
                  </Grid>

                  {/* Bank Details collapsible */}
                  <Grid size={{ xs: 12 }}>
                    <Box onClick={() => setShowBankDetails(v => !v)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                        py: 0.75, px: 1.25, borderRadius: 1.5, userSelect: 'none',
                        border: '1px solid', borderColor: 'divider',
                        bgcolor: showBankDetails ? alpha(primary, 0.04) : 'background.paper',
                        '&:hover': { bgcolor: alpha(primary, 0.06) }, transition: 'all 0.15s',
                      }}>
                      <Landmark size={15} color={primary} />
                      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, fontSize: '0.82rem' }}>
                        Bank Details
                        {(form.bankName || form.accountNumber) && (
                          <Typography component="span" variant="caption" sx={{ ml: 1, color: 'primary.main', fontWeight: 600 }}>
                            {form.bankName || form.accountNumber}
                          </Typography>
                        )}
                      </Typography>
                      <ChevronsUpDown size={14} color={theme.palette.text.secondary}
                        style={{ transform: showBankDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </Box>
                    <Collapse in={showBankDetails} timeout={200}>
                      <Box sx={{ pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                        <Box sx={{ display: 'flex', gap: 1.25 }}>
                          <TextField fullWidth size="small" label="Bank Name"
                            value={form.bankName}
                            onChange={e => set({ bankName: e.target.value })}
                            placeholder="e.g. HDFC Bank"
                            sx={fieldSx} />
                          <TextField fullWidth size="small" label="IFSC Code"
                            value={form.ifscCode}
                            onChange={e => set({ ifscCode: e.target.value.toUpperCase() })}
                            inputProps={{ maxLength: 11 }} placeholder="e.g. HDFC0001234"
                            sx={fieldSx} />
                        </Box>
                        <TextField fullWidth size="small" label="Account Number"
                          value={form.accountNumber}
                          onChange={e => set({ accountNumber: e.target.value.replace(/\D/g, '') })}
                          inputProps={{ inputMode: 'numeric', maxLength: 20 }}
                          placeholder="Enter account number"
                          sx={fieldSx} />
                        <TextField fullWidth size="small" label="Account Holder Name"
                          value={form.accountHolderName}
                          onChange={e => set({ accountHolderName: e.target.value })}
                          placeholder="Name as per bank records"
                          sx={fieldSx} />
                      </Box>
                    </Collapse>
                  </Grid>

                  {/* Opening balance */}
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                      Opening Balance
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      {[
                        { dir: 'collect', label: 'To Collect', color: '#5c1f22', bg: '#57433e' },
                        { dir: 'pay',     label: 'To Pay',     color: '#dc2626', bg: '#ef4444' },
                      ].map(({ dir, label, color, bg }) => {
                        const active = balanceDir === dir;
                        return (
                          <Box key={dir} onClick={() => setBalanceDir(dir)}
                            sx={{
                              flex: 1, py: 0.9, px: 1.5, borderRadius: 1.5, cursor: 'pointer',
                              border: '1.5px solid', borderColor: active ? color : 'divider',
                              bgcolor: active ? alpha(bg, 0.08) : 'background.paper',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                              transition: 'all 0.15s', userSelect: 'none',
                            }}>
                            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: active ? color : 'text.disabled' }} />
                            <Typography variant="body2" sx={{ fontWeight: 700, color: active ? color : 'text.secondary', fontSize: '0.8rem' }}>
                              {label}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                    <TextField fullWidth size="small" type="number" placeholder="0"
                      value={balanceAmt}
                      onChange={e => setBalanceAmt(e.target.value.replace(/[^0-9.]/g, ''))}
                      inputProps={{ min: 0 }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText={balanceDir === 'collect' ? 'They owe you this amount' : 'You owe them this amount'}
                      sx={fieldSx} />
                  </Grid>

                </Grid>
              </Collapse>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ px: 2.5, pb: 2, gap: 1, flexShrink: 0, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button onClick={onClose} disabled={saving} sx={{ borderRadius: 1.5, color: 'text.secondary' }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}
              sx={{
                borderRadius: 1.5, fontWeight: 700, px: 3,
                background: isVendor
                  ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                  : '#ffffff',
                '&:hover': { opacity: 0.9 },
              }}>
              {saving ? 'Saving…' : (editingParty ? `Update ${partyType}` : `Save ${partyType}`)}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} onClose={() => setSnack(s => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
};

export default PartyFormDialog;
