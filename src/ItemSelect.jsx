import React from 'react';
import { Autocomplete, TextField, Box, Typography, Chip } from '@mui/material';
import { Plus } from 'lucide-react';

const COLORS = [
  { bg: '#EEF2FF', fg: '#4F46E5', bd: '#C7D2FE' },
  { bg: '#F0FDF4', fg: '#16A34A', bd: '#BBF7D0' },
  { bg: '#FFF7ED', fg: '#C2410C', bd: '#FED7AA' },
  { bg: '#FDF4FF', fg: '#7C3AED', bd: '#DDD6FE' },
  { bg: '#EFF6FF', fg: '#1D4ED8', bd: '#BFDBFE' },
];

const itemColor = (name) => COLORS[(name?.charCodeAt(0) || 0) % COLORS.length];

const dropdownSx = {
  borderRadius: 2,
  boxShadow: '0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
  border: '1px solid',
  borderColor: 'divider',
  mt: 0.5,
  minWidth: 320,
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
 * ItemSelect — enhanced item / product selector with freeSolo support
 *
 * Props:
 *   options[]         array of stock item objects from DataContext
 *   value             stock item object, typed string, or null
 *   onChange(v)       called with stock item object or null when a selection is made
 *   onInputChange(s)  called with the typed string during freeSolo input
 *   onAddNew(str)     optional — called when user clicks "+ New Item"
 *   isSale            boolean — controls which price field (salePrice vs purchasePrice) is shown
 *   placeholder       input placeholder
 *   size              "small" (default) | "medium"
 *   sx                extra sx for the TextField input
 */
const ItemSelect = ({
  options = [],
  value,
  onChange,
  onInputChange,
  onAddNew,
  isSale = true,
  canViewPurchasePrice = true,
  placeholder = 'Search or select item…',
  size = 'small',
  fullWidth = true,
  sx,
}) => (
  <Autocomplete
    freeSolo
    fullWidth={fullWidth}
    options={options}
    getOptionLabel={(opt) => {
      if (typeof opt === 'string') return opt;
      return opt._addNew ? '' : (opt.name || '');
    }}
    value={value}
    isOptionEqualToValue={(opt, val) => {
      if (typeof opt === 'string' || typeof val === 'string') return opt === val;
      return opt?.id === val?.id;
    }}
    filterOptions={(opts, { inputValue }) => {
      const lc = inputValue.toLowerCase();
      const filtered = opts.filter((o) => !o._addNew && o.name?.toLowerCase().includes(lc));
      if (onAddNew) {
        filtered.push({
          _addNew: true,
          _display: inputValue ? `Create "${inputValue}"` : 'New Item',
          _inputValue: inputValue,
          id: '__add_new_item__',
          name: '',
        });
      }
      return filtered;
    }}
    onChange={(_, v) => {
      if (typeof v === 'string') { onChange?.(v); return; }
      if (v?._addNew) { onAddNew?.(v._inputValue || ''); return; }
      onChange?.(v);
    }}
    onInputChange={(_, val, reason) => {
      if (reason === 'input') onInputChange?.(val);
    }}
    renderOption={(props, option) => {
      const { key, ...rest } = props;
      if (option._addNew) {
        return (
          <li key="__new_item__" {...rest}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
              <Box sx={{
                width: 34, height: 34, borderRadius: 1.5, flexShrink: 0,
                bgcolor: 'primary.50', border: '1.5px dashed', borderColor: 'primary.main',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Plus size={15} color="#4F46E5" />
              </Box>
              <Typography sx={{ fontWeight: 700, color: 'primary.main', fontSize: '0.875rem' }}>
                {option._display}
              </Typography>
            </Box>
          </li>
        );
      }
      const c = itemColor(option.name);
      const price = isSale
        ? (option.salePrice ?? option.price ?? 0)
        : (option.purchasePrice ?? option.price ?? 0);
      const stock = option.stock ?? null;
      return (
        <li key={option.id} {...rest}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, width: '100%' }}>
            <Box sx={{
              width: 34, height: 34, borderRadius: 1.5, flexShrink: 0,
              bgcolor: c.bg, border: `1.5px solid ${c.bd}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: c.fg, fontWeight: 800, fontSize: '0.875rem', userSelect: 'none',
            }}>
              {(option.name || '?').charAt(0).toUpperCase()}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.3 }} noWrap>
                {option.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary" sx={{
                  fontSize: '0.72rem', lineHeight: 1.4,
                  ...(!isSale && !canViewPurchasePrice ? { filter: 'blur(5px)', userSelect: 'none' } : {}),
                }}>
                  ₹{Number(price).toFixed(2)}{option.unit ? ` / ${option.unit}` : ''}
                </Typography>
                {option.color && (
                  <Chip label={option.color} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'rgba(236,72,153,0.08)', color: '#be185d', border: 'none' }} />
                )}
                {option.size && (
                  <Chip label={option.size} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'rgba(14,165,233,0.08)', color: '#0369a1', border: 'none' }} />
                )}
                {option.category && (
                  <Chip label={option.category} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'rgba(99,102,241,0.07)', color: '#4338ca', border: 'none' }} />
                )}
              </Box>
            </Box>
            {stock !== null && (
              <Chip
                label={`${stock}${option.unit ? ' ' + option.unit : ''}`}
                size="small"
                color={stock === 0 ? 'error' : stock < 5 ? 'warning' : 'default'}
                variant={stock === 0 ? 'filled' : 'outlined'}
                sx={{ fontWeight: 600, fontSize: '0.68rem', height: 22, flexShrink: 0 }}
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
        placeholder={placeholder}
        size={size}
        sx={{ minWidth: 160, ...sx }}
        slotProps={{
          input: {
            ...params.InputProps,
            sx: { '& input': { fieldSizing: 'content', minWidth: '8ch' } },
          },
        }}
      />
    )}
  />
);

export default ItemSelect;
