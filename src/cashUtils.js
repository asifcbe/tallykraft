// Cash-in-hand computation.
// Cash in hand = opening cash
//   + cash sales              (money received in cash)
//   + cash payments-in        (customer paid in cash)
//   - cash purchases          (paid supplier in cash)
//   - cash payments-out       (paid vendor in cash)
//   - cash expenses           (paid expense in cash)
// Only transactions whose payment mode is "Cash" affect cash in hand. Credit /
// Bank movements do NOT change cash in hand.

const num = (v) => Number(v) || 0;
const isCash = (mode) => String(mode || '').trim().toLowerCase() === 'cash';
const isBank = (mode) => { const m = String(mode || '').trim().toLowerCase(); return m === 'bank' || m === 'cheque' || m === 'neft' || m === 'rtgs'; };
const isDigital = (mode) => isBank(mode);
const isSplit = (mode) => String(mode || '').trim().toLowerCase() === 'split';

// For a split-mode record return the cash portion (or 0 for non-split)
const splitCashAmt = (r) => isSplit(r.paymentMode) ? num(r.paymentSplit?.cash) : 0;
// For a split-mode record return the bank/digital portion (or 0 for non-split)
const splitBankAmt = (r) => isSplit(r.paymentMode) ? num(r.paymentSplit?.bank) : 0;

// Cash & Carry = walk-in sale with no party on record (money received immediately).
// Named-party invoices are credit transactions — money moves only when a payment entry is recorded.
const CASH_CARRY_NAMES = ['cash & carry', 'cash purchase', 'cash sale'];
export const isCashCarry = (r) =>
  !r.partyId && (!r.partyName || CASH_CARRY_NAMES.includes(String(r.partyName).trim().toLowerCase()));

// A sale/purchase only contributes to cash/bank THROUGH ITS OWN ROW when it
// was settled via Payment Mode at creation (Cash/Bank saleType) or is a Cash
// & Carry walk-in — not merely because status is currently 'paid'. A credit
// sale (saleType:'credit') that later gets "Received Payment" recorded keeps
// saleType:'credit' forever (Sales.jsx's confirmReceivePayment only ever
// writes status/dueDate/paidDate, never saleType) even though status flips
// to 'paid' — that payment is already its own separate payments/RCV- record,
// which computeCashInHand/Day Book both already count on its own. Treating
// status:'paid' alone as "this row also moved cash" double-counted the same
// money twice: once via the invoice's own total, once via its linked
// payment. saleType is the reliable signal for "did creating THIS row itself
// move cash" — status can (and, for a credit invoice, correctly does) change
// afterward without a second cash movement happening through the row itself.
//   - saleType === 'paid': settled — Cash/Bank/Split chosen at creation.
//   - saleType === 'credit': never settled via its own row, regardless of
//     status — any cash movement for it comes from its linked payment(s).
//   - No saleType at all (legacy record predating this field, or a non-
//     sales/purchases record type): falls back to the original status-based
//     rule — status:'paid' means settled, no status means settled only for
//     Cash & Carry.
// Exported so other reports (e.g. Reports.jsx's Day Book) can reuse the exact
// same settlement rule instead of re-deriving it — keeps "is this money
// actually moved" consistent everywhere it's asked.
export const isSettled = (r) => {
  const status = String(r.status || '').trim().toLowerCase();
  if (status === 'unpaid' || status === 'partial' || status === 'pending') return false;
  if (r.saleType === 'credit') return false;
  if (r.saleType === 'paid') return true;
  if (status === 'paid') return true;
  return isCashCarry(r); // no status → settled only for cash & carry, not credit invoices
};

/**
 * @param {object} opts
 *   openingCash : starting cash (₹)
 *   sales       : sale records
 *   purchases   : purchase records
 *   payments    : payment records (type 'PaymentIn' | 'PaymentOut')
 *   expenses    : expense records
 *   cashEntries : manual cash-book entries (type 'in' | 'out')
 *   upto        : optional ISO date string (yyyy-mm-dd) — only count on/before
 * Returns { opening, cashIn, cashOut, balance, breakdown }
 */
export const computeCashInHand = ({ openingCash = 0, sales = [], purchases = [], payments = [], expenses = [], cashEntries = [], upto = null } = {}) => {
  const within = (d) => !upto || !d || d <= upto;

  // Helper: cash amount contributed by a record (full amount if Cash mode, split.cash if Split, 0 otherwise)
  const cashAmt = (r, amtKey = 'totalAmount') =>
    isCash(r.paymentMode) ? num(r[amtKey]) : splitCashAmt(r);

  // Inflows
  const cashSales = sales
    .filter((s) => (isCash(s.paymentMode) || isSplit(s.paymentMode)) && isSettled(s) && within(s.date))
    .reduce((a, s) => a + cashAmt(s), 0);
  const cashPaymentsIn = payments
    .filter((p) => p.type === 'PaymentIn' && (isCash(p.paymentMode) || isSplit(p.paymentMode)) && within(p.date))
    .reduce((a, p) => a + cashAmt(p), 0);

  // Outflows
  const cashPurchases = purchases
    .filter((p) => (isCash(p.paymentMode) || isSplit(p.paymentMode)) && isSettled(p) && within(p.date))
    .reduce((a, p) => a + cashAmt(p), 0);
  const cashPaymentsOut = payments
    .filter((p) => p.type === 'PaymentOut' && (isCash(p.paymentMode) || isSplit(p.paymentMode)) && within(p.date))
    .reduce((a, p) => a + cashAmt(p), 0);
  // Expenses default to Cash when no payment mode is recorded (most expenses are
  // paid in cash, and the expense form historically had no mode field).
  const cashExpenses = expenses
    .filter((e) => (e.paymentMode == null || isCash(e.paymentMode) || isSplit(e.paymentMode)) && within(e.date))
    .reduce((a, e) => a + cashAmt(e, 'amount'), 0);

  // Manual cash-book entries (deposits, drawings, capital added, etc.)
  const manualIn = cashEntries
    .filter((c) => c.type === 'in' && within(c.date))
    .reduce((a, c) => a + num(c.amount), 0);
  const manualOut = cashEntries
    .filter((c) => c.type === 'out' && within(c.date))
    .reduce((a, c) => a + num(c.amount), 0);

  const opening = num(openingCash);
  const cashIn = cashSales + cashPaymentsIn + manualIn;
  const cashOut = cashPurchases + cashPaymentsOut + cashExpenses + manualOut;
  const balance = opening + cashIn - cashOut;

  return {
    opening,
    cashIn,
    cashOut,
    balance,
    breakdown: { cashSales, cashPaymentsIn, cashPurchases, cashPaymentsOut, cashExpenses, manualIn, manualOut },
  };
};

/**
 * Bank balance = openingBank
 *   + bank sales (settled)
 *   + bank payments-in from customers
 *   - bank purchases (settled)
 *   - bank payments-out to vendors
 *   - bank expenses
 *   + manual bank credits (cashEntries type='bank_in')
 *   - manual bank debits (cashEntries type='bank_out')
 *
 * @param {object} opts – same shape as computeCashInHand plus openingBank
 * Returns { opening, bankIn, bankOut, balance, breakdown }
 */
export const computeBankBalance = ({ openingBank = 0, sales = [], purchases = [], payments = [], expenses = [], cashEntries = [], upto = null } = {}) => {
  const within = (d) => !upto || !d || d <= upto;

  // Helper: bank amount contributed by a record (full amount if digital mode, split.bank if Split, 0 otherwise)
  const bankAmt = (r, amtKey = 'totalAmount') =>
    isDigital(r.paymentMode) ? num(r[amtKey]) : splitBankAmt(r);

  const bankSales = sales
    .filter((s) => (isDigital(s.paymentMode) || isSplit(s.paymentMode)) && isSettled(s) && within(s.date))
    .reduce((a, s) => a + bankAmt(s), 0);
  const bankPaymentsIn = payments
    .filter((p) => p.type === 'PaymentIn' && (isDigital(p.paymentMode) || isSplit(p.paymentMode)) && within(p.date))
    .reduce((a, p) => a + bankAmt(p), 0);

  const bankPurchases = purchases
    .filter((p) => (isDigital(p.paymentMode) || isSplit(p.paymentMode)) && isSettled(p) && within(p.date))
    .reduce((a, p) => a + bankAmt(p), 0);
  const bankPaymentsOut = payments
    .filter((p) => p.type === 'PaymentOut' && (isDigital(p.paymentMode) || isSplit(p.paymentMode)) && within(p.date))
    .reduce((a, p) => a + bankAmt(p), 0);
  const bankExpenses = expenses
    .filter((e) => e.paymentMode != null && (isDigital(e.paymentMode) || isSplit(e.paymentMode)) && within(e.date))
    .reduce((a, e) => a + bankAmt(e, 'amount'), 0);

  const bankIn  = cashEntries.filter((c) => c.type === 'bank_in'  && within(c.date)).reduce((a, c) => a + num(c.amount), 0);
  const bankOut = cashEntries.filter((c) => c.type === 'bank_out' && within(c.date)).reduce((a, c) => a + num(c.amount), 0);

  const opening   = num(openingBank);
  const totalIn   = bankSales + bankPaymentsIn + bankIn;
  const totalOut  = bankPurchases + bankPaymentsOut + bankExpenses + bankOut;
  const balance   = opening + totalIn - totalOut;

  return {
    opening,
    bankIn: totalIn,
    bankOut: totalOut,
    balance,
    breakdown: { bankSales, bankPaymentsIn, bankPurchases, bankPaymentsOut, bankExpenses, bankIn, bankOut },
  };
};

/**
 * Aggregate payment-mode breakdown across any transaction array.
 * Returns { cash, bank, upi, card, other } totals.
 */
export const paymentModeSplit = (records = [], amountKey = 'totalAmount') =>
  records.reduce((acc, r) => {
    const m = String(r.paymentMode || '').trim().toLowerCase();
    const v = num(r[amountKey]);
    if (m === 'cash')             acc.cash  += v;
    else if (isBank(r.paymentMode)) acc.bank  += v;
    else if (m === 'upi')         acc.upi   += v;
    else if (m === 'card')        acc.card  += v;
    else acc.other += v;
    return acc;
  }, { cash: 0, bank: 0, upi: 0, card: 0, other: 0 });
