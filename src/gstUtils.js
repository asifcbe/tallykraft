export const GST_RATES = [
  { value: 0,    label: '0% — Exempt / Nil rated' },
  { value: 0.1,  label: '0.1% — Gold, diamonds (special)' },
  { value: 0.25, label: '0.25% — Cut & semi-polished stones' },
  { value: 1,    label: '1% — Composite scheme (turnover)' },
  { value: 1.5,  label: '1.5% — Composite (manufacturer)' },
  { value: 3,    label: '3% — Gold, silver, jewellery' },
  { value: 5,    label: '5% — Essential goods, basic food' },
  { value: 6,    label: '6% — Composite (service providers)' },
  { value: 7.5,  label: '7.5% — Specified goods & services' },
  { value: 12,   label: '12% — Processed food, business travel' },
  { value: 18,   label: '18% — Standard rate (most goods)' },
  { value: 28,   label: '28% — Luxury / demerit goods' },
  { value: 28.5, label: '28% + 0.5% Cess' },
  { value: 29,   label: '28% + 1% Cess — Tobacco, pan masala' },
  { value: 30,   label: '28% + 2% Cess — Small cars' },
  { value: 31,   label: '28% + 3% Cess — Cars / motor vehicles' },
  { value: 33,   label: '28% + 5% Cess — Aerated drinks' },
  { value: 38,   label: '28% + 10% Cess — Luxury cars' },
  { value: 43,   label: '28% + 15% Cess — SUVs' },
  { value: 65,   label: '28% + 37% Cess — Bidis' },
];

// GST helpers for subscription billing.
// Place of supply for a SaaS service = the customer's state. If the customer's
// state matches the seller's (admin's) state → intra-state → CGST + SGST.
// Otherwise → inter-state → IGST. Union territories follow the same rule
// (a UT supply from a different state is IGST; within the same UT is CGST+UTGST,
// which we label CGST+SGST for simplicity as the rate/treatment is identical).

// Indian states & union territories with their GST state codes.
export const INDIAN_STATES = [
  { name: 'Andhra Pradesh', code: '37', ut: false },
  { name: 'Arunachal Pradesh', code: '12', ut: false },
  { name: 'Assam', code: '18', ut: false },
  { name: 'Bihar', code: '10', ut: false },
  { name: 'Chhattisgarh', code: '22', ut: false },
  { name: 'Goa', code: '30', ut: false },
  { name: 'Gujarat', code: '24', ut: false },
  { name: 'Haryana', code: '06', ut: false },
  { name: 'Himachal Pradesh', code: '02', ut: false },
  { name: 'Jharkhand', code: '20', ut: false },
  { name: 'Karnataka', code: '29', ut: false },
  { name: 'Kerala', code: '32', ut: false },
  { name: 'Madhya Pradesh', code: '23', ut: false },
  { name: 'Maharashtra', code: '27', ut: false },
  { name: 'Manipur', code: '14', ut: false },
  { name: 'Meghalaya', code: '17', ut: false },
  { name: 'Mizoram', code: '15', ut: false },
  { name: 'Nagaland', code: '13', ut: false },
  { name: 'Odisha', code: '21', ut: false },
  { name: 'Punjab', code: '03', ut: false },
  { name: 'Rajasthan', code: '08', ut: false },
  { name: 'Sikkim', code: '11', ut: false },
  { name: 'Tamil Nadu', code: '33', ut: false },
  { name: 'Telangana', code: '36', ut: false },
  { name: 'Tripura', code: '16', ut: false },
  { name: 'Uttar Pradesh', code: '09', ut: false },
  { name: 'Uttarakhand', code: '05', ut: false },
  { name: 'West Bengal', code: '19', ut: false },
  // Union territories
  { name: 'Andaman and Nicobar Islands', code: '35', ut: true },
  { name: 'Chandigarh', code: '04', ut: true },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26', ut: true },
  { name: 'Delhi', code: '07', ut: true },
  { name: 'Jammu and Kashmir', code: '01', ut: true },
  { name: 'Ladakh', code: '38', ut: true },
  { name: 'Lakshadweep', code: '31', ut: true },
  { name: 'Puducherry', code: '34', ut: true },
];

export const STATE_NAMES = INDIAN_STATES.map((s) => s.name);

export const getStateMeta = (name) =>
  INDIAN_STATES.find((s) => s.name?.trim().toLowerCase() === String(name || '').trim().toLowerCase()) || null;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Compute the GST breakup for a subscription price.
 *
 * @param {object} opts
 *  - listPrice   : the headline plan price (e.g. 99 or 299)
 *  - ratePct     : total GST rate, e.g. 18
 *  - inclusive   : true => listPrice already includes GST; false => GST added on top
 *  - customerState : customer's state name
 *  - sellerState   : admin/seller's state name (place of registration)
 *
 * Returns:
 *  { taxable, rate, intraState, cgst, sgst, igst, taxAmount, total,
 *    amountPaise }  — amountPaise is the integer paise total for Razorpay.
 */
export const computeGST = ({ listPrice, ratePct = 18, inclusive = false, customerState, sellerState }) => {
  const price = Number(listPrice) || 0;
  const rate = Number(ratePct) || 0;
  const intraState = !!(customerState && sellerState &&
    customerState.trim().toLowerCase() === sellerState.trim().toLowerCase());

  let taxable, taxAmount, total;
  if (inclusive) {
    // List price already includes GST — back-calculate the taxable value.
    total = price;
    taxable = round2(price / (1 + rate / 100));
    taxAmount = round2(total - taxable);
  } else {
    taxable = price;
    taxAmount = round2(price * (rate / 100));
    total = round2(taxable + taxAmount);
  }

  let cgst = 0, sgst = 0, igst = 0;
  if (intraState) {
    cgst = round2(taxAmount / 2);
    sgst = round2(taxAmount - cgst); // keep the halves summing exactly to taxAmount
  } else {
    igst = taxAmount;
  }

  return {
    taxable,
    rate,
    intraState,
    cgst, sgst, igst,
    taxAmount,
    total,
    amountPaise: Math.round(total * 100),
  };
};

// SAC code for "Information technology software services".
export const SAC_CODE = '997331';
