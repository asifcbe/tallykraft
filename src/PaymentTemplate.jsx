import React, { forwardRef } from 'react';

const PAPER = {
  A3:        { width: '297mm', minHeight: '420mm' },
  A4:        { width: '210mm', minHeight: '297mm' },
  A5:        { width: '148mm', minHeight: '210mm' },
  A6:        { width: '105mm', minHeight: '148mm' },
  Letter:    { width: '216mm', minHeight: '279mm' },
  Legal:     { width: '216mm', minHeight: '356mm' },
  Executive: { width: '184mm', minHeight: '267mm' },
  Statement: { width: '140mm', minHeight: '216mm' },
};

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[parseInt(m, 10) - 1]} ${y}`;
};

const Row = ({ label, value, bold, borderTop, borderBottom, large, muted }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: large ? '10px 0' : '7px 0',
    borderTop: borderTop ? '1px solid #000' : 'none',
    borderBottom: borderBottom ? '1px solid #000' : 'none',
  }}>
    <span style={{
      fontSize: large ? '13px' : '12px',
      fontWeight: bold ? '700' : '400',
      color: muted ? '#666' : '#000',
    }}>
      {label}
    </span>
    <span style={{
      fontSize: large ? '15px' : '12px',
      fontWeight: bold ? '700' : '400',
      color: muted ? '#666' : '#000',
      textAlign: 'right',
    }}>
      {value}
    </span>
  </div>
);

const PaymentTemplate = forwardRef(({ data, business, paperSize = 'A4' }, ref) => {
  if (!data || !business) return null;

  const { partyName, totalAmount, date, paymentMode, paymentSplit, referenceNo, notes, type } = data;
  const isIn = type === 'PaymentIn';
  const isSplit = paymentMode === 'Split' && paymentSplit;
  const size = PAPER[paperSize] || PAPER.A4;

  const isA5 = paperSize === 'A5' || paperSize === 'A6' || paperSize === 'Statement';
  const pad = isA5 ? '28px 32px' : '40px 48px';
  const titleSize = isA5 ? '18px' : '22px';
  const bodySize = isA5 ? '12px' : '13px';
  const smallSize = isA5 ? '10px' : '11px';

  return (
    <div ref={ref} style={{
      width: size.width,
      minHeight: size.minHeight,
      backgroundColor: '#fff',
      color: '#000',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: bodySize,
      lineHeight: '1.5',
      margin: 'auto',
      boxSizing: 'border-box',
      padding: pad,
    }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          {business.logo && (
            <img src={business.logo} alt="" style={{ maxHeight: '56px', maxWidth: '120px', objectFit: 'contain' }} />
          )}
          <div>
            <div style={{ fontSize: titleSize, fontWeight: '700', color: '#000', lineHeight: 1.1, marginBottom: '4px' }}>
              {business.name}
            </div>
            {business.address && <div style={{ fontSize: smallSize, color: '#333' }}>{business.address}</div>}
            {business.phone && <div style={{ fontSize: smallSize, color: '#333' }}>Ph: {business.phone}</div>}
            {business.gstNumber && <div style={{ fontSize: smallSize, color: '#333' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: isA5 ? '14px' : '16px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '6px',
          }}>
            {isIn ? 'Receipt' : 'Payment Voucher'}
          </div>
          <div style={{ fontSize: smallSize, color: '#333', marginBottom: '2px' }}>
            No: <strong style={{ color: '#000', fontFamily: 'monospace' }}>{referenceNo}</strong>
          </div>
          <div style={{ fontSize: smallSize, color: '#333' }}>
            Date: <strong style={{ color: '#000' }}>{fmtDate(date)}</strong>
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '0 0 20px 0' }} />

      {/* ── PARTY ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: smallSize, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', marginBottom: '4px' }}>
          {isIn ? 'Received with thanks from' : 'Paid to'}
        </div>
        <div style={{ fontSize: isA5 ? '16px' : '18px', fontWeight: '700', color: '#000' }}>{partyName}</div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '0 0 16px 0' }} />

      {/* ── AMOUNT SECTION ── */}
      <div style={{ marginBottom: '20px' }}>
        {isSplit ? (
          <>
            {/* Split breakdown table */}
            <div style={{ fontSize: smallSize, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', marginBottom: '10px' }}>
              Payment Breakdown
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: bodySize }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: '700', fontSize: smallSize, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555' }}>Mode</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: '700', fontSize: smallSize, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 0', fontWeight: '400' }}>Cash</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: '400' }}>
                    {fmt(paymentSplit.cash)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 0', fontWeight: '400' }}>{paymentSplit.bankMode || 'Bank'}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: '400' }}>
                    {fmt(paymentSplit.bank)}
                  </td>
                </tr>
                <tr style={{ borderTop: '2px solid #000' }}>
                  <td style={{ padding: '10px 0 6px', fontWeight: '700', fontSize: isA5 ? '13px' : '14px' }}>Total Amount</td>
                  <td style={{ padding: '10px 0 6px', textAlign: 'right', fontWeight: '700', fontSize: isA5 ? '15px' : '17px', fontFamily: 'monospace' }}>
                    ₹ {fmt(totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          /* Single mode — large centred amount block */
          <div style={{
            textAlign: 'center',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '20px',
          }}>
            <div style={{ fontSize: smallSize, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '6px' }}>
              {isIn ? 'Amount Received' : 'Amount Paid'}
            </div>
            <div style={{ fontSize: isA5 ? '28px' : '34px', fontWeight: '700', letterSpacing: '-0.02em', fontFamily: 'Arial, sans-serif' }}>
              ₹ {fmt(totalAmount)}
            </div>
            <div style={{ fontSize: smallSize, color: '#555', marginTop: '6px' }}>
              Mode: <strong style={{ color: '#000' }}>{paymentMode}</strong>
            </div>
          </div>
        )}
      </div>

      {/* ── META DETAILS ── */}
      <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '0 0 12px 0' }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: notes ? '1fr 1fr 2fr' : '1fr 1fr',
        gap: '12px 24px',
        marginBottom: '20px',
        fontSize: smallSize,
      }}>
        <div>
          <div style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555', marginBottom: '3px' }}>Date</div>
          <div style={{ color: '#000' }}>{fmtDate(date)}</div>
        </div>
        <div>
          <div style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555', marginBottom: '3px' }}>Mode</div>
          <div style={{ color: '#000' }}>
            {isSplit ? `Cash + ${paymentSplit?.bankMode || 'Bank'}` : paymentMode}
          </div>
        </div>
        {notes && (
          <div>
            <div style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555', marginBottom: '3px' }}>Notes</div>
            <div style={{ color: '#000' }}>{notes}</div>
          </div>
        )}
      </div>

      {/* ── FOOTER / SIGNATURE ── */}
      <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '0 0 40px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
        <div style={{ fontSize: smallSize, color: '#666', lineHeight: '1.7' }}>
          <div>This is a computer-generated document.</div>
          <div>No signature is required unless specified.</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '140px', borderTop: '1px solid #000', paddingTop: '6px' }}>
            <div style={{ fontSize: smallSize, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#333' }}>
              Authorised Signatory
            </div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{business.name}</div>
          </div>
        </div>
      </div>

    </div>
  );
});

PaymentTemplate.displayName = 'PaymentTemplate';
export default PaymentTemplate;
