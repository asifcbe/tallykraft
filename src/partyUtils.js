export const COUNTRY_CODES = [
  { code: '+91', country: 'IN', name: 'India' },
  { code: '+1', country: 'US', name: 'USA/Canada' },
  { code: '+44', country: 'GB', name: 'UK' },
  { code: '+61', country: 'AU', name: 'Australia' },
  { code: '+971', country: 'AE', name: 'UAE' },
  { code: '+966', country: 'SA', name: 'Saudi Arabia' },
  { code: '+65', country: 'SG', name: 'Singapore' },
  { code: '+60', country: 'MY', name: 'Malaysia' },
  { code: '+974', country: 'QA', name: 'Qatar' },
  { code: '+968', country: 'OM', name: 'Oman' },
  { code: '+973', country: 'BH', name: 'Bahrain' },
  { code: '+965', country: 'KW', name: 'Kuwait' },
  { code: '+64', country: 'NZ', name: 'New Zealand' },
  { code: '+27', country: 'ZA', name: 'South Africa' },
  { code: '+49', country: 'DE', name: 'Germany' },
  { code: '+33', country: 'FR', name: 'France' },
  { code: '+39', country: 'IT', name: 'Italy' },
  { code: '+34', country: 'ES', name: 'Spain' },
  { code: '+31', country: 'NL', name: 'Netherlands' },
  { code: '+46', country: 'SE', name: 'Sweden' },
  { code: '+47', country: 'NO', name: 'Norway' },
  { code: '+45', country: 'DK', name: 'Denmark' },
  { code: '+41', country: 'CH', name: 'Switzerland' },
  { code: '+43', country: 'AT', name: 'Austria' },
  { code: '+32', country: 'BE', name: 'Belgium' },
  { code: '+351', country: 'PT', name: 'Portugal' },
  { code: '+48', country: 'PL', name: 'Poland' },
  { code: '+420', country: 'CZ', name: 'Czech Republic' },
  { code: '+36', country: 'HU', name: 'Hungary' },
  { code: '+40', country: 'RO', name: 'Romania' },
  { code: '+7', country: 'RU', name: 'Russia' },
  { code: '+380', country: 'UA', name: 'Ukraine' },
  { code: '+90', country: 'TR', name: 'Turkey' },
  { code: '+20', country: 'EG', name: 'Egypt' },
  { code: '+234', country: 'NG', name: 'Nigeria' },
  { code: '+254', country: 'KE', name: 'Kenya' },
  { code: '+233', country: 'GH', name: 'Ghana' },
  { code: '+255', country: 'TZ', name: 'Tanzania' },
  { code: '+256', country: 'UG', name: 'Uganda' },
  { code: '+212', country: 'MA', name: 'Morocco' },
  { code: '+213', country: 'DZ', name: 'Algeria' },
  { code: '+216', country: 'TN', name: 'Tunisia' },
  { code: '+92', country: 'PK', name: 'Pakistan' },
  { code: '+880', country: 'BD', name: 'Bangladesh' },
  { code: '+94', country: 'LK', name: 'Sri Lanka' },
  { code: '+977', country: 'NP', name: 'Nepal' },
  { code: '+95', country: 'MM', name: 'Myanmar' },
  { code: '+66', country: 'TH', name: 'Thailand' },
  { code: '+84', country: 'VN', name: 'Vietnam' },
  { code: '+62', country: 'ID', name: 'Indonesia' },
  { code: '+63', country: 'PH', name: 'Philippines' },
  { code: '+82', country: 'KR', name: 'South Korea' },
  { code: '+81', country: 'JP', name: 'Japan' },
  { code: '+86', country: 'CN', name: 'China' },
  { code: '+852', country: 'HK', name: 'Hong Kong' },
  { code: '+886', country: 'TW', name: 'Taiwan' },
  { code: '+55', country: 'BR', name: 'Brazil' },
  { code: '+54', country: 'AR', name: 'Argentina' },
  { code: '+52', country: 'MX', name: 'Mexico' },
  { code: '+57', country: 'CO', name: 'Colombia' },
  { code: '+51', country: 'PE', name: 'Peru' },
  { code: '+56', country: 'CL', name: 'Chile' },
];

export const CUSTOMER_CATEGORIES = ['Retail', 'Wholesale', 'Distributor', 'Corporate', 'Walk-in', 'Online', 'VIP', 'Other'];
export const VENDOR_CATEGORIES = ['Supplier', 'Manufacturer', 'Distributor', 'Service Provider', 'Freelancer', 'Import', 'Other'];

export function loadCustomCategories(businessId, type) {
  try {
    return JSON.parse(localStorage.getItem(`dz_party_cats_${businessId}_${type}`) || '[]');
  } catch { return []; }
}

export function saveCustomCategories(businessId, type, cats) {
  try {
    localStorage.setItem(`dz_party_cats_${businessId}_${type}`, JSON.stringify(cats));
  } catch {}
}

// ── Party groups ───────────────────────────────────────────────────────────
// Free-form, business+type-scoped (same storage pattern as custom
// categories, just its own key) — lets a customer/vendor be grouped
// independently of Category (e.g. Category=Wholesale, Group="North Region").
// No built-in list — every group is user-created via the Group field's
// freeSolo Autocomplete on PartyFormDialog.
export function loadCustomGroups(businessId, type) {
  try {
    return JSON.parse(localStorage.getItem(`dz_party_groups_${businessId}_${type}`) || '[]');
  } catch { return []; }
}

export function saveCustomGroups(businessId, type, groups) {
  try {
    localStorage.setItem(`dz_party_groups_${businessId}_${type}`, JSON.stringify(groups));
  } catch {}
}

// ── Item categories (same keys as ItemFormDialog uses) ───────────────────────
export const BUILTIN_PRODUCT_CATEGORIES = [
  'Clothing', 'Footwear', 'Accessories', 'Electronics', 'Mobile & Tablets',
  'Food & Beverages', 'Grocery', 'Pharmacy', 'Cosmetics & Beauty',
  'Furniture', 'Hardware', 'Stationery', 'Books', 'Toys & Games',
  'Automotive', 'Agriculture', 'Jewellery', 'Sports & Fitness', 'Other',
];
export const BUILTIN_SERVICE_CATEGORIES = [
  'Consulting', 'Design & Creative', 'Software & IT', 'Maintenance & Repair',
  'Education & Training', 'Health & Wellness', 'Legal & Compliance',
  'Logistics & Delivery', 'Marketing & Advertising', 'Photography & Video',
  'Cleaning & Housekeeping', 'Security', 'Catering & Events', 'Other',
];
export const BUILTIN_MEMBERSHIP_CATEGORIES = [
  'Monthly', 'Quarterly', 'Half-yearly', 'Annual',
  'Lifetime', 'Trial', 'Premium', 'Basic', 'Other',
];

export function loadCustomItemCategories(businessId, itemType) {
  try {
    return JSON.parse(localStorage.getItem(`dz_item_cats_${businessId}_${itemType}`) || '[]');
  } catch { return []; }
}

export function saveCustomItemCategories(businessId, itemType, cats) {
  try {
    localStorage.setItem(`dz_item_cats_${businessId}_${itemType}`, JSON.stringify(cats));
  } catch {}
}

export function generatePartyId(type, existingParties) {
  const prefix = type === 'Customer' ? 'CUST' : 'VEND';
  const existing = existingParties.filter(p => p.partyId && p.partyId.startsWith(prefix));
  const nums = existing.map(p => parseInt(p.partyId.replace(prefix + '-', ''), 10)).filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}
