import React from 'react';
import { Autocomplete, TextField, Box, Typography, Chip } from '@mui/material';
import { User, UserPlus } from 'lucide-react';

const COLORS = [
  { bg: '#EEF2FF', fg: '#4F46E5', bd: '#C7D2FE' },
  { bg: '#F0FDF4', fg: '#16A34A', bd: '#BBF7D0' },
  { bg: '#FFF7ED', fg: '#C2410C', bd: '#FED7AA' },
  { bg: '#FDF4FF', fg: '#7C3AED', bd: '#DDD6FE' },
  { bg: '#EFF6FF', fg: '#1D4ED8', bd: '#BFDBFE' },
  { bg: '#FFF1F2', fg: '#BE123C', bd: '#FECDD3' },
];

const avatarColor = (name) => COLORS[(name?.charCodeAt(0) || 0) % COLORS.length];

const dropdownSx = {
  borderRadius: 2,
  boxShadow: '0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
  border: '1px solid',
  borderColor: 'divider',
  mt: 0.5,
  minWidth: 360,
  '& .MuiAutocomplete-listbox': {
    py: 0.75,
    maxHeight: 340,
    '& .MuiAutocomplete-option': {
      px: 1.25,
      py: 0,
      borderRadius: 1.5,
      mx: 0.75,
      my: 0.25,
      '&[aria-selected="true"], &[aria-selected="true"].Mui-focused': {
        bgcolor: 'primary.50',
      },
    },
  },
};

/**
 * PartySelect — enhanced customer / vendor selector
 *
 * Props:
 *   options[]     array of party objects from DataContext
 *   value         selected party object or null (string when nameOnly=true)
 *   onChange(v)   called with the party object, or null when cleared (string when nameOnly=true)
 *   onAddNew(str) optional — called with typed text when user clicks "+ New" (not used in nameOnly mode)
 *   label         "Customer" | "Vendor" | etc.
 *   placeholder   input placeholder
 *   nameOnly      boolean — freeSolo mode: value/onChange use the name string, not a party object
 *   size          "small" (default) | "medium"
 *   fullWidth     boolean (default true)
 *   sx            extra sx for the input TextField
 *   disabled      boolean
 */
const PartySelect = ({
  options = [],
  value,
  onChange,
  onAddNew,
  label = 'Customer',
  placeholder,
  nameOnly = false,
  size = 'small',
  fullWidth = true,
  sx,
  disabled,
}) => {
  if (nameOnly) {
    return (
      <Autocomplete
        freeSolo
        options={options}
        getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name || '')}
        value={value || ''}
        fullWidth={fullWidth}
        disabled={disabled}
        onChange={(_, v) => onChange(typeof v === 'string' ? v : (v?.name || ''))}
        onInputChange={(_, v, reason) => { if (reason === 'input') onChange(v); }}
        renderOption={(props, option) => {
          if (typeof option === 'string') return <li {...props}>{option}</li>;
          const { key, ...rest } = props;
          const c = avatarColor(option.name);
          return (
            <li key={option.id} {...rest}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, width: '100%' }}>
                <Box sx={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  bgcolor: c.bg, border: `1.5px solid ${c.bd}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: c.fg, fontWeight: 800, fontSize: '0.9rem', userSelect: 'none',
                }}>
                  {(option.name || '?').charAt(0).toUpperCase()}
                </Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }} noWrap>
                  {option.name}
                </Typography>
              </Box>
            </li>
          );
        }}
        slotProps={{ paper: { elevation: 0, sx: dropdownSx } }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            size={size}
            sx={{ minWidth: 180, ...sx }}
            slotProps={{
              input: {
                ...params.InputProps,
                sx: { '& input': { fieldSizing: 'content', minWidth: '10ch' } },
                startAdornment: (
                  <>
                    <User size={15} style={{ marginRight: 4, color: 'rgba(0,0,0,0.38)', flexShrink: 0 }} />
                    {params.InputProps?.startAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    );
  }
  return (
  <Autocomplete
    options={options}
    getOptionLabel={(opt) => (opt._addNew ? '' : opt.name || '')}
    value={value || null}
    isOptionEqualToValue={(opt, val) => opt?.id === val?.id}
    fullWidth={fullWidth}
    disabled={disabled}
    filterOptions={(opts, { inputValue }) => {
      const lc = inputValue.toLowerCase();
      const filtered = opts.filter((o) => o.name?.toLowerCase().includes(lc));
      if (onAddNew) {
        filtered.push({
          _addNew: true,
          _display: inputValue ? `Create "${inputValue}"` : `New ${label}`,
          _inputValue: inputValue,
          id: '__add_new__',
          name: '',
        });
      }
      return filtered;
    }}
    onChange={(_, v) => {
      if (v?._addNew) { onAddNew?.(v._inputValue || ''); return; }
      onChange(v);
    }}
    renderOption={(props, option) => {
      const { key, ...rest } = props;
      if (option._addNew) {
        return (
          <li key="__new__" {...rest}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                bgcolor: 'primary.50', border: '1.5px dashed', borderColor: 'primary.main',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <UserPlus size={16} color="#4F46E5" />
              </Box>
              <Typography sx={{ fontWeight: 700, color: 'primary.main', fontSize: '0.875rem' }}>
                {option._display}
              </Typography>
            </Box>
          </li>
        );
      }
      const c = avatarColor(option.name);
      const balance = option.balance || 0;
      return (
        <li key={option.id} {...rest}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, width: '100%' }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              bgcolor: c.bg, border: `1.5px solid ${c.bd}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: c.fg, fontWeight: 800, fontSize: '0.9rem', userSelect: 'none',
            }}>
              {(option.name || '?').charAt(0).toUpperCase()}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.3 }} noWrap>
                {option.name}
              </Typography>
              {option.phone && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.72rem' }}>
                  {option.phone}
                </Typography>
              )}
            </Box>
            {balance !== 0 && (
              <Chip
                label={`₹${Math.abs(balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                size="small"
                color={balance > 0 ? 'error' : 'success'}
                variant="outlined"
                sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22, flexShrink: 0 }}
              />
            )}
          </Box>
        </li>
      );
    }}
    slotProps={{ paper: { elevation: 0, sx: dropdownSx } }}
    renderInput={(params) => (
      <TextField
        {...params}
        label={label}
        placeholder={placeholder}
        size={size}
        sx={sx}
        slotProps={{
          input: {
            ...params.InputProps,
            startAdornment: (
              <>
                <User size={15} style={{ marginRight: 4, color: 'rgba(0,0,0,0.38)', flexShrink: 0 }} />
                {params.InputProps?.startAdornment}
              </>
            ),
          },
        }}
      />
    )}
  />
  );
};

export default PartySelect;
