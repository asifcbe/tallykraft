import React from 'react';
import { Autocomplete, TextField, Box, Typography, Chip } from '@mui/material';
import { User, UserPlus } from 'lucide-react';
import { FixedSizeList } from 'react-window';

// Same virtualization pattern as ItemSelect.jsx (added there first for the
// item picker's 3000+ item DOM-bloat slowness) — a business running enough
// sales to need Firestore write-path fixes plausibly also has thousands of
// parties (repeat customers, one-off cash-and-carry entries, etc.), and
// PartySelect is used on nearly every invoice/POS/payment entry screen, so
// it hit the exact same "opening the dropdown mounts thousands of <li> at
// once" slowness that virtualization fixed for items.
const ROW_HEIGHT = 56;
const MAX_VISIBLE_ROWS = 340 / ROW_HEIGHT;
const OuterElementContext = React.createContext({});
const VirtualListboxOuter = React.forwardRef((props, ref) => {
  const outerProps = React.useContext(OuterElementContext);
  return <div ref={ref} {...props} {...outerProps} />;
});
VirtualListboxOuter.displayName = 'VirtualListboxOuter';

const VirtualListboxInner = React.forwardRef(function VirtualListboxInner(props, ref) {
  const { children, ...other } = props;
  const items = React.Children.toArray(children);
  const itemCount = items.length;
  const height = Math.min(itemCount, MAX_VISIBLE_ROWS) * ROW_HEIGHT || ROW_HEIGHT;

  return (
    <div ref={ref}>
      <OuterElementContext.Provider value={other}>
        <FixedSizeList
          height={height}
          width="100%"
          itemSize={ROW_HEIGHT}
          itemCount={itemCount}
          overscanCount={8}
          outerElementType={VirtualListboxOuter}
        >
          {({ index, style }) => React.cloneElement(items[index], { style: { ...items[index].props.style, ...style } })}
        </FixedSizeList>
      </OuterElementContext.Provider>
    </div>
  );
});

const VIRTUALIZE_THRESHOLD = 50;

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
  // A flat 360px forced the dropdown wider than its anchor input on any
  // narrow phone (the input itself is often only ~300-330px inside a
  // card/cart at 375-414px viewports) — 33px+ of the dropdown hung off the
  // right edge of the screen. Capping at the viewport width (minus a small
  // margin) lets it shrink to fit on mobile while keeping the original
  // fixed 360px everywhere it actually has room.
  minWidth: 'min(360px, calc(100vw - 24px))',
  maxWidth: 'calc(100vw - 24px)',
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
        autoHighlight
        autoSelect
        options={options}
        {...(options.length > VIRTUALIZE_THRESHOLD ? { ListboxComponent: VirtualListboxInner, disableListWrap: true } : {})}
        getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name || '')}
        value={value || ''}
        fullWidth={fullWidth}
        disabled={disabled}
        onChange={(_, v) => onChange(typeof v === 'string' ? v : (v?.name || ''))}
        onInputChange={(_, v, reason) => { if (reason === 'input') onChange(v); }}
        renderOption={(props, option) => {
          if (typeof option === 'string') return <li {...props} style={{ ...props.style, height: ROW_HEIGHT }}>{option}</li>;
          const { key, ...rest } = props;
          const c = avatarColor(option.name);
          return (
            <li key={option.id} {...rest} style={{ ...rest.style, height: ROW_HEIGHT, overflow: 'hidden' }}>
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
  // Include a freshly-created party (not yet in the list) so the field shows it immediately.
  const mergedOptions = value && value.id && !options.find(o => o.id === value.id)
    ? [value, ...options]
    : options;

  return (
  <Autocomplete
    options={mergedOptions}
    autoHighlight
    // autoSelect commits the currently-highlighted option on Enter/blur —
    // without it, autoHighlight alone only visually highlights the top
    // match as you type; Enter did nothing unless the user had also
    // arrow-key-navigated to it first. This is what makes "type a name,
    // press Enter" actually select the party in one keystroke (needed for
    // Sales.jsx's One by One mode keyboard flow, and generally expected
    // search-and-select behavior everywhere this component is used).
    autoSelect
    {...(mergedOptions.length > VIRTUALIZE_THRESHOLD ? { ListboxComponent: VirtualListboxInner, disableListWrap: true } : {})}
    getOptionLabel={(opt) => (opt._addNew ? '' : opt.name || '')}
    value={value || null}
    isOptionEqualToValue={(opt, val) => opt?.id === val?.id}
    fullWidth={fullWidth}
    disabled={disabled}
    filterOptions={(opts, { inputValue }) => {
      const lc = inputValue.toLowerCase();
      const digits = inputValue.replace(/\D/g, '');
      const isAllDigits = inputValue.length > 0 && digits === inputValue;
      const filtered = opts.filter((o) =>
        o.name?.toLowerCase().includes(lc) ||
        (digits.length > 0 && o.phone && o.phone.replace(/\D/g, '').includes(digits)) ||
        (digits.length > 0 && o.altPhone && o.altPhone.replace(/\D/g, '').includes(digits))
      );
      if (onAddNew) {
        filtered.push({
          _addNew: true,
          _isPhone: isAllDigits,
          _display: isAllDigits
            ? `New ${label} (phone: ${inputValue})`
            : (inputValue ? `Create "${inputValue}"` : `New ${label}`),
          _inputValue: inputValue,
          id: '__add_new__',
          name: '',
        });
      }
      return filtered;
    }}
    onChange={(_, v) => {
      if (v?._addNew) { onAddNew?.(v._inputValue || '', !!v._isPhone); return; }
      onChange(v);
    }}
    renderOption={(props, option) => {
      const { key, ...rest } = props;
      if (option._addNew) {
        return (
          <li key="__new__" {...rest} style={{ ...rest.style, height: ROW_HEIGHT }}>
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
        <li key={option.id} {...rest} style={{ ...rest.style, height: ROW_HEIGHT, overflow: 'hidden' }}>
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
              // Sign convention (same for Customer and Vendor, per
              // PaymentEntry.jsx/Parties.jsx): positive = they owe us
              // (green, amount to collect), negative = we owe them (red,
              // amount to pay). Was inverted here — a positive receivable
              // showed red and a payable showed green, the opposite of
              // every other place in the app that colors this balance.
              <Chip
                label={`₹${Math.abs(balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                size="small"
                color={balance > 0 ? 'success' : 'error'}
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
