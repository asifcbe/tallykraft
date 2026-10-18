// Helpers for invoice-level payment tracking (partial "Received Payment").

// What is still owed on a sale/purchase: total, minus the advance taken at
// creation, minus whatever has already been settled through this dialog
// (`amountPaid` accumulates across partial payments).
export const txOutstanding = (tx) => {
  if (!tx) return 0;
  const v = (Number(tx.totalAmount) || 0) - (Number(tx.advance) || 0) - (Number(tx.amountPaid) || 0);
  return Math.max(0, Math.round(v * 100) / 100);
};

// Sum of everything the RCV- payments for this invoice settled against the
// party balance (cash/bank collected + any write-off). Used by the delete
// handlers so deleting an invoice reverses its payments' balance effect too.
export const rcvSettledFor = (payments, tx, isSale, businessId) => {
  if (!tx) return 0;
  const ref = `RCV-${tx.invoiceNumber}`;
  const type = isSale ? 'PaymentIn' : 'PaymentOut';
  return (payments || [])
    .filter((p) => p.businessId === businessId && p.referenceNo === ref && (!p.type || p.type === type))
    .reduce((s, p) => s + (Number(p.totalAmount) || 0) + (Number(p.lessAmount) || 0), 0);
};

// Money actually collected against a bill — the advance taken at creation
// plus the cash/bank amounts of every part payment. Write-offs ("Less") are
// NOT money received, so they're tracked separately in `amountWrittenOff`;
// `amountPaid` stays the total settled (received + written off) and is what
// drives the outstanding balance. Bills saved before `amountReceived` existed
// fall back to `amountPaid`.
export const txPaidSoFar = (tx) => {
  if (!tx) return 0;
  const received = tx.amountReceived != null ? Number(tx.amountReceived) : Number(tx.amountPaid);
  return (Number(tx.advance) || 0) + (received || 0);
};

export const txWrittenOff = (tx) => (tx ? Number(tx.amountWrittenOff) || 0 : 0);

// An open (not fully paid) bill that has had some money paid against it.
export const isPartPaid = (tx) =>
  !!tx && tx.status !== 'paid' && txPaidSoFar(tx) > 0.009 && txOutstanding(tx) > 0.009;
