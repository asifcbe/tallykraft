import React from 'react';
import { Autocomplete, TextField, Box, Typography, Chip } from '@mui/material';
import { Plus } from 'lucide-react';
import { FixedSizeList } from 'react-window';

// Row height must match the rendered <li> height exactly (py:1 + content) —
// see renderOption below. Used by the virtualized listbox to position rows.
const ROW_HEIGHT = 54;
const MAX_VISIBLE_ROWS = 340 / ROW_HEIGHT; // keeps the same ~340px dropdown height as before

// With 3000+ items, MUI's default Autocomplete listbox mounts a real DOM
// node for every filtered option at once — with an empty/short search that's
// thousands of <li> elements, which is what made opening the dropdown slow.
// This swaps in a windowed listbox (react-window) that only renders the rows
// actually visible in the ~340px scroll area, regardless of how many options
// matched. Follows MUI's documented "Virtualized list" Autocomplete pattern.
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

// Below this many matched options, plain rendering is cheap and avoids any
// virtualization edge cases (e.g. very short lists, the "+ New Item" row) —
// virtualization only kicks in once it actually matters.
const VIRTUALIZE_THRESHOLD = 50;

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
  // Same fix as PartySelect.jsx's dropdownSx — a flat 320px could exceed the
  // available viewport width on a narrow phone (this select's anchor is
  // often only ~200-280px wide inside Sales.jsx's item row at 375-414px).
  minWidth: 'min(320px, calc(100vw - 24px))',
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
 *   inputRef          optional — ref to the underlying <input>, so a caller
 *                     can move focus here programmatically (used by Sales.jsx's
 *                     keyboard-first guided flow to focus a newly added row)
 *   onInputKeyDown    optional — raw keydown on the input, for caller-defined
 *                     navigation (e.g. Enter → jump to the Qty field). Fires
 *                     BEFORE Autocomplete's own handling, so a caller must
 *                     check `event.defaultPrevented` semantics carefully; see
 *                     Sales.jsx for the one consumer.
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
  inputRef,
  onInputKeyDown,
  sx,
}) => (
  <Autocomplete
    freeSolo
    autoHighlight
    autoSelect
    fullWidth={fullWidth}
    options={options}
    {...(options.length > VIRTUALIZE_THRESHOLD ? { ListboxComponent: VirtualListboxInner, disableListWrap: true } : {})}
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
          <li key="__new_item__" {...rest} style={{ ...rest.style, height: ROW_HEIGHT }}>
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
        <li key={option.id} {...rest} style={{ ...rest.style, height: ROW_HEIGHT, overflow: 'hidden' }}>
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
              {/* Fixed row height (needed for virtualization) means these tags
                  must stay on one line — nowrap + hidden overflow instead of
                  wrapping to a second line. */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'nowrap', overflow: 'hidden' }}>
                <Typography variant="caption" color="text.secondary" sx={{
                  fontSize: '0.72rem', lineHeight: 1.4, flexShrink: 0,
                  ...(!isSale && !canViewPurchasePrice ? { filter: 'blur(5px)', userSelect: 'none' } : {}),
                }}>
                  ₹{Number(price).toFixed(2)}{option.unit ? ` / ${option.unit}` : ''}
                </Typography>
                {option.color && (
                  <Chip label={option.color} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'rgba(236,72,153,0.08)', color: '#3f3f46', border: 'none', flexShrink: 0 }} />
                )}
                {option.size && (
                  <Chip label={option.size} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'rgba(14,165,233,0.08)', color: '#27272a', border: 'none', flexShrink: 0 }} />
                )}
                {option.category && (
                  <Chip label={option.category} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 600, bgcolor: 'rgba(17,17,17,0.06)', color: '#27272a', border: 'none', flexShrink: 0 }} />
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
        onKeyDown={onInputKeyDown}
        sx={{ minWidth: 160, ...sx }}
        slotProps={{
          input: {
            ...params.InputProps,
            ref: params.InputProps.ref,
            sx: { '& input': { fieldSizing: 'content', minWidth: '8ch' } },
          },
          htmlInput: {
            ...params.inputProps,
            ref: (el) => {
              // Autocomplete supplies its own ref on inputProps — chain ours
              // after it rather than replacing it, or the dropdown loses its
              // anchor/measurement element.
              const own = params.inputProps?.ref;
              if (typeof own === 'function') own(el);
              else if (own) own.current = el;
              if (typeof inputRef === 'function') inputRef(el);
              else if (inputRef) inputRef.current = el;
            },
          },
        }}
      />
    )}
  />
);

export default ItemSelect;
