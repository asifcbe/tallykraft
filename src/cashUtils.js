// Cash-in-hand and bank-balance computation.
// Cash in hand = opening cash
//   + cash sales              (money received in cash)
//   + cash payments-in        (customer paid in cash)
//   - cash purchases          (paid supplier in cash)
//   - cash payments-out       (paid vendor in cash)
//   - cash expenses           (paid expense in cash)
// Only transactions whose payment mode is "Cash" affect cash in hand. Credit /
// UPI / Bank / Card movements do NOT change cash in hand.

const num = (v) => Number(v) || 0;
const isCash = (mode) => String(mode || '').trim().toLowerCase() === 'cash';
const isBank = (mode) => { const m = String(mode || '').trim().toLowerCase(); return m === 'bank' || m === 'cheque' || m === 'neft' || m === 'rtgs'; };
const isUpi  = (mode) => { const m = String(mode || '').trim().toLowerCase(); return m === 'upi'; };
const isDigital = (mode) => isBank(mode) || isUpi(mode) || String(mode || '').trim().toLowerCase() === 'card';

// A cash-mode sale/purchase only adds to cash-in-hand once it is actually
// settled. Most records carry no status (regular & POS transactions are paid in
// full on creation) and count immediately. Records explicitly marked unpaid, or
// still carrying an outstanding balance (e.g. a membership invoice awaiting
// payment), are excluded until their separate payment-in/out is recorded.
const isSettled = (r) => {
  const status = String(r.status || '').trim().toLowerCase();
  if (status === 'unpaid' || status === 'partial' || status === 'pending') return false;
  if (status === 'paid') return true;
  return num(r.balanceAmount) <= 0; // no status → settled unless a balance is owed
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

  // Inflows
  const cashSales = sales
    .filter((s) => isCash(s.paymentMode) && isSettled(s) && within(s.date))
    .reduce((a, s) => a + num(s.totalAmount), 0);
  const cashPaymentsIn = payments
    .filter((p) => p.type === 'PaymentIn' && isCash(p.paymentMode) && within(p.date))
    .reduce((a, p) => a + num(p.totalAmount), 0);

  // Outflows
  const cashPurchases = purchases
    .filter((p) => isCash(p.paymentMode) && isSettled(p) && within(p.date))
    .reduce((a, p) => a + num(p.totalAmount), 0);
  const cashPaymentsOut = payments
    .filter((p) => p.type === 'PaymentOut' && isCash(p.paymentMode) && within(p.date))
    .reduce((a, p) => a + num(p.totalAmount), 0);
  // Expenses default to Cash when no payment mode is recorded (most expenses are
  // paid in cash, and the expense form historically had no mode field).
  const cashExpenses = expenses
    .filter((e) => (e.paymentMode == null || isCash(e.paymentMode)) && within(e.date))
    .reduce((a, e) => a + num(e.amount), 0);

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
 *   + bank/UPI/card sales (settled)
 *   + bank/UPI payments-in from customers
 *   - bank/UPI purchases (settled)
 *   - bank/UPI payments-out to vendors
 *   - bank/UPI expenses
 *   + split cash→bank transfers (cashEntries type='bank_in')
 *   - split bank→cash transfers (cashEntries type='bank_out')
 *
 * Split payments on a single invoice are stored as separate payment records
 * alongside the main sale (see Sales.jsx handleSave). The mode on each record
 * identifies whether it hit cash or bank.
 *
 * @param {object} opts – same shape as computeCashInHand plus openingBank
 * Returns { opening, bankIn, bankOut, balance, breakdown }
 */
export const computeBankBalance = ({ openingBank = 0, sales = [], purchases = [], payments = [], expenses = [], cashEntries = [], upto = null } = {}) => {
  const within = (d) => !upto || !d || d <= upto;

  const bankSales = sales
    .filter((s) => isDigital(s.paymentMode) && isSettled(s) && within(s.date))
    .reduce((a, s) => a + num(s.totalAmount), 0);
  const bankPaymentsIn = payments
    .filter((p) => p.type === 'PaymentIn' && isDigital(p.paymentMode) && within(p.date))
    .reduce((a, p) => a + num(p.totalAmount), 0);

  const bankPurchases = purchases
    .filter((p) => isDigital(p.paymentMode) && isSettled(p) && within(p.date))
    .reduce((a, p) => a + num(p.totalAmount), 0);
  const bankPaymentsOut = payments
    .filter((p) => p.type === 'PaymentOut' && isDigital(p.paymentMode) && within(p.date))
    .reduce((a, p) => a + num(p.totalAmount), 0);
  const bankExpenses = expenses
    .filter((e) => e.paymentMode != null && isDigital(e.paymentMode) && within(e.date))
    .reduce((a, e) => a + num(e.amount), 0);

  // Manual cash-book entries that explicitly move money to/from bank account
  const bankIn  = cashEntries.filter((c) => c.type === 'bank_in'  && within(c.date)).reduce((a, c) => a + num(c.amount), 0);
  const bankOut = cashEntries.filter((c) => c.type === 'bank_out' && within(c.date)).reduce((a, c) => a + num(c.amount), 0);

  const opening = num(openingBank);
  const totalIn  = bankSales + bankPaymentsIn + bankIn;
  const totalOut = bankPurchases + bankPaymentsOut + bankExpenses + bankOut;
  const balance  = opening + totalIn - totalOut;

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
    if (m === 'cash')       acc.cash  += v;
    else if (isBank(r.paymentMode))  acc.bank  += v;
    else if (m === 'upi')   acc.upi   += v;
    else if (m === 'card')  acc.card  += v;
    else acc.other += v;
    return acc;
  }, { cash: 0, bank: 0, upi: 0, card: 0, other: 0 });
