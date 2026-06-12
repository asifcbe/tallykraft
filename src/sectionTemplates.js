// Ready-made custom-section templates customers can use as-is or as a starting
// point. Each matches the CustomSection data shape:
//   { name, description, icon, color, tabs: [{ id, name, fields: [{ id, name, type, options, required }] }] }
// Limits enforced by the builder: max 1 customer section, 10 fields total, 3 tabs.

let _seq = 0;
const fid = () => `f_${Date.now().toString(36)}_${_seq++}`;
const tid = () => `t_${Date.now().toString(36)}_${_seq++}`;

const F = (name, type = 'text', extra = {}) => ({ id: fid(), name, type, options: [], required: false, unit: '', ...extra });

export const SECTION_TEMPLATES = [
  {
    key: 'retail',
    name: 'Product Catalog',
    description: 'Track products, suppliers & warranties for a retail/general store',
    icon: 'ShoppingBag',
    color: '#2563eb',
    tabs: [
      { id: tid(), name: 'Product', fields: [
        F('Product Name'), F('SKU / Code'), F('Category', 'select', { options: ['Grocery', 'Electronics', 'Apparel', 'Other'] }),
        F('MRP', 'number', { unit: '₹' }), F('Notes', 'textarea'),
      ]},
      { id: tid(), name: 'Supplier', fields: [
        F('Supplier Name'), F('Contact No.'), F('Lead Time (days)', 'number'),
      ]},
      { id: tid(), name: 'Warranty', fields: [
        F('Warranty Period'), F('Expiry Date', 'date'),
      ]},
    ],
  },
  {
    key: 'service',
    name: 'Job Cards',
    description: 'Service tickets, repair jobs & AMC tracking for a service/repair shop',
    icon: 'Wrench',
    color: '#d97706',
    tabs: [
      { id: tid(), name: 'Job', fields: [
        F('Device / Item'), F('Reported Issue', 'textarea'),
        F('Status', 'select', { options: ['Received', 'In Progress', 'Ready', 'Delivered'] }),
        F('Estimated Cost', 'number', { unit: '₹' }),
      ]},
      { id: tid(), name: 'Customer', fields: [
        F('Contact No.'), F('Alternate No.'),
      ]},
      { id: tid(), name: 'AMC', fields: [
        F('AMC Plan'), F('Next Service', 'date'), F('Remarks', 'textarea'),
      ]},
    ],
  },
  {
    key: 'clinic',
    name: 'Patient Records',
    description: 'Appointments, client records & treatment log for a clinic/salon',
    icon: 'Heart',
    color: '#db2777',
    tabs: [
      { id: tid(), name: 'Visit', fields: [
        F('Service / Treatment'), F('Appointment Date', 'date'),
        F('Status', 'select', { options: ['Booked', 'Completed', 'Cancelled', 'No-show'] }),
        F('Amount', 'number', { unit: '₹' }),
      ]},
      { id: tid(), name: 'Client', fields: [
        F('Phone'), F('Age', 'number'), F('Allergies / Notes', 'textarea'),
      ]},
      { id: tid(), name: 'Follow-up', fields: [
        F('Next Visit', 'date'), F('Advice', 'textarea'),
      ]},
    ],
  },
  {
    key: 'restaurant',
    name: 'Menu & Reservations',
    description: 'Menu items, table reservations & supplier list for a restaurant/cafe',
    icon: 'Coffee',
    color: '#16a34a',
    tabs: [
      { id: tid(), name: 'Menu Item', fields: [
        F('Dish Name'), F('Category', 'select', { options: ['Starter', 'Main', 'Dessert', 'Beverage'] }),
        F('Price', 'number', { unit: '₹' }), F('Veg / Non-veg', 'select', { options: ['Veg', 'Non-veg', 'Egg'] }),
      ]},
      { id: tid(), name: 'Reservation', fields: [
        F('Guest Name'), F('Date', 'date'), F('Guests', 'number'),
      ]},
      { id: tid(), name: 'Supplier', fields: [
        F('Supplier'), F('Contact'),
      ]},
    ],
  },
];

// Build a fresh section object (new ids) from a template, ready to save into config.
export const instantiateTemplate = (tpl) => ({
  id: `sec_${Date.now().toString(36)}`,
  name: tpl.name,
  description: tpl.description,
  icon: tpl.icon,
  color: tpl.color,
  createdBy: 'user',
  tabs: tpl.tabs.map((t) => ({
    id: tid(),
    name: t.name,
    fields: t.fields.map((f) => ({ ...f, id: fid() })),
  })),
});

export const MAX_USER_SECTIONS = 1;
export const MAX_TABS = 3;
export const MAX_FIELDS = 10;
