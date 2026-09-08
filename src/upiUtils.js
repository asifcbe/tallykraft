// UPI payment QR helpers — shared by Settings.jsx (business payment QR,
// printed on bills), Sales.jsx and POS.jsx (on-demand "Show Payment QR" for
// the exact invoice/cart amount at checkout).
//
// Encodes the standard `upi://pay?...` deep link that GPay/PhonePe/Paytm/BHIM
// etc. all recognize as a payable QR (as opposed to encoding the bare UPI ID,
// which most apps would only show as plain text when scanned).

/**
 * Builds a UPI payment deep link.
 * @param {Object} opts
 * @param {string} opts.upiId       Payee VPA, e.g. "business@okhdfcbank" — required, returns '' without it.
 * @param {string} [opts.payeeName] Shown on the payer's app as who they're paying.
 * @param {number} [opts.amount]    Pre-fills the amount; omit for an open "any amount" QR.
 * @param {string} [opts.note]      Payment note/reference, e.g. an invoice number.
 * @returns {string} the `upi://pay?...` URI, or '' if no UPI ID is set.
 */
export const buildUpiUri = ({ upiId, payeeName, amount, note } = {}) => {
  const pa = (upiId || '').trim();
  if (!pa) return '';
  const params = new URLSearchParams();
  params.set('pa', pa);
  if (payeeName) params.set('pn', payeeName);
  params.set('cu', 'INR');
  if (amount != null && Number(amount) > 0) {
    params.set('am', Number(amount).toFixed(2));
  }
  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
};
