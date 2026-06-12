import React, { forwardRef } from 'react';

const DEFAULT_PRINT_OPTIONS = {
  showLogo: true,
  showGSTIN: true,
  showInvoiceNumber: true,
  showDate: true,
  showGSTColumn: true,
  showDiscountColumn: true,
  showCGSTSGST: false,
  showIGST: false,
  showTerms: true,
  showSignature: true,
  showOldBalance: false,
  dateFormat: 'DD/MM/YYYY',
};

const formatDate = (dateStr, fmt = 'DD/MM/YYYY') => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  switch (fmt) {
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'DD-MM-YYYY': return `${day}-${month}-${year}`;
    case 'DD MMM YYYY': {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${day} ${months[parseInt(month, 10) - 1] || month} ${year}`;
    }
    default: return `${day}/${month}/${year}`;
  }
};

// Thermal receipt layout — compact single-column for 58/80mm printers
const ThermalTemplate = ({ transaction, business, paperSize, printOptions = DEFAULT_PRINT_OPTIONS }) => {
  if (!transaction || !business) return null;
  const opts = { ...DEFAULT_PRINT_OPTIONS, ...printOptions };

  const isSale = transaction.type === 'Sales';
  const is58mm = paperSize === 'Thermal 58mm';
  const width = is58mm ? '58mm' : '80mm';
  const padding = is58mm ? '4px 6px' : '6px 10px';
  const titleFontSize = is58mm ? '13px' : '15px';
  const bodyFontSize = is58mm ? '10px' : '11px';
  const smallFontSize = is58mm ? '8.5px' : '9.5px';
  const totalFontSize = is58mm ? '13px' : '15px';
  const dividerChar = is58mm ? '- - - - - - - - - - - - - -' : '- - - - - - - - - - - - - - - - - - -';

  const advanceAmount = transaction.advance ?? 0;
  const balanceDue = Math.max(0, (transaction.totalAmount ?? 0) - advanceAmount);

  const lineStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' };
  const centerStyle = { textAlign: 'center' };

  return (
    <div style={{
      width,
      padding,
      backgroundColor: '#fff',
      color: '#000',
      fontFamily: 'monospace, Arial, sans-serif',
      fontSize: bodyFontSize,
      lineHeight: '1.35',
    }}>
      {/* Business header */}
      <div style={{ ...centerStyle, marginBottom: '6px' }}>
        {opts.showLogo && business.logo && (
          <img src={business.logo} alt="Logo" style={{ maxHeight: '40px', objectFit: 'contain', marginBottom: '4px' }} />
        )}
        <div style={{ fontSize: titleFontSize, fontWeight: 'bold', letterSpacing: '0.03em' }}>{business.name}</div>
        {business.address && <div style={{ fontSize: smallFontSize }}>{business.address}</div>}
        {business.phone && <div style={{ fontSize: smallFontSize }}>Ph: {business.phone}</div>}
        {opts.showGSTIN && business.gstNumber && <div style={{ fontSize: smallFontSize }}>GSTIN: {business.gstNumber}</div>}
      </div>

      <div style={{ textAlign: 'center', fontSize: smallFontSize }}>{dividerChar}</div>

      <div style={{ ...centerStyle, fontWeight: 'bold', fontSize: bodyFontSize, margin: '4px 0' }}>
        {isSale ? 'TAX INVOICE' : 'PURCHASE BILL'}
      </div>

      <div style={{ ...lineStyle, fontSize: smallFontSize }}>
        {opts.showInvoiceNumber && <span>#{transaction.invoiceNumber}</span>}
        {opts.showDate && <span>{formatDate(transaction.date, opts.dateFormat)}</span>}
      </div>
      {transaction.partyName && (
        <div style={{ fontSize: smallFontSize, marginBottom: '2px' }}>
          {isSale ? 'To: ' : 'From: '}<strong>{transaction.partyName}</strong>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: smallFontSize, margin: '4px 0' }}>{dividerChar}</div>

      {/* Items */}
      {(transaction.items || []).map((item, i) => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        const discPct = Number(item.discountPercent) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const lineAfterDisc = qty * price * (1 - discPct / 100);
        const lineTotal = item.total != null ? Number(item.total) : lineAfterDisc * (1 + taxRate / 100);
        return (
          <div key={i} style={{ marginBottom: '4px' }}>
            <div style={{ fontWeight: '600', fontSize: bodyFontSize }}>{item.name}</div>
            <div style={{ ...lineStyle, fontSize: smallFontSize }}>
              <span>
                {qty} × ₹{price.toFixed(2)}
                {opts.showDiscountColumn && discPct ? ` (${discPct}% off)` : ''}
                {opts.showGSTColumn && taxRate ? ` +${taxRate}%GST` : ''}
              </span>
              <span style={{ fontWeight: '700' }}>₹{lineTotal.toFixed(2)}</span>
            </div>
          </div>
        );
      })}

      <div style={{ textAlign: 'center', fontSize: smallFontSize, margin: '4px 0' }}>{dividerChar}</div>

      {/* Totals */}
      {transaction.discountAmount > 0 && (
        <div style={lineStyle}>
          <span>Discount{transaction.discountPercent ? ` (${transaction.discountPercent}%)` : ''}</span>
          <span>-₹{Number(transaction.discountAmount).toFixed(2)}</span>
        </div>
      )}
      <div style={lineStyle}>
        <span>Subtotal</span>
        <span>₹{Number(transaction.subtotal).toFixed(2)}</span>
      </div>
      {opts.showCGSTSGST ? (
        <>
          <div style={lineStyle}>
            <span>CGST</span>
            <span>₹{(Number(transaction.taxAmount) / 2).toFixed(2)}</span>
          </div>
          <div style={lineStyle}>
            <span>SGST</span>
            <span>₹{(Number(transaction.taxAmount) / 2).toFixed(2)}</span>
          </div>
        </>
      ) : opts.showIGST ? (
        <div style={lineStyle}>
          <span>IGST</span>
          <span>₹{Number(transaction.taxAmount).toFixed(2)}</span>
        </div>
      ) : (
        <div style={lineStyle}>
          <span>Tax</span>
          <span>₹{Number(transaction.taxAmount).toFixed(2)}</span>
        </div>
      )}
      {transaction.roundOffAmount != null && transaction.roundOffAmount !== 0 && (
        <div style={lineStyle}>
          <span>Round Off</span>
          <span>{transaction.roundOffAmount >= 0 ? '+' : ''}₹{Number(transaction.roundOffAmount).toFixed(2)}</span>
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: smallFontSize, margin: '3px 0' }}>{dividerChar}</div>
      <div style={{ ...lineStyle, fontSize: totalFontSize, fontWeight: 'bold' }}>
        <span>TOTAL</span>
        <span>₹{Number(transaction.totalAmount).toFixed(2)}</span>
      </div>
      {isSale && advanceAmount > 0 && (
        <>
          <div style={{ ...lineStyle, marginTop: '3px' }}>
            <span>Advance</span>
            <span>-₹{advanceAmount.toFixed(2)}</span>
          </div>
          <div style={{ ...lineStyle, fontWeight: 'bold' }}>
            <span>Balance Due</span>
            <span>₹{balanceDue.toFixed(2)}</span>
          </div>
        </>
      )}

      <div style={{ textAlign: 'center', fontSize: smallFontSize, margin: '6px 0 4px' }}>
        Thank you! Visit again.
      </div>
      <div style={{ textAlign: 'center', fontSize: smallFontSize }}>{dividerChar}</div>
    </div>
  );
};

const InvoiceTemplate = forwardRef(({ transaction, business, paperSize = 'A4', title, partyBalance, printOptions }, ref) => {
  if (!transaction || !business) return null;

  const opts = { ...DEFAULT_PRINT_OPTIONS, ...printOptions };

  // Route thermal sizes to compact receipt layout
  if (paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm') {
    return (
      <div ref={ref}>
        <ThermalTemplate transaction={transaction} business={business} paperSize={paperSize} printOptions={opts} />
      </div>
    );
  }

  const isSale = transaction.type === 'Sales';
  const headerTitle = title || (isSale ? 'TAX INVOICE' : 'PURCHASE BILL');
  const currentBillTotal = transaction.totalAmount ?? 0;
  const balanceNum = partyBalance != null ? Number(partyBalance) : null;
  const openingBalance = balanceNum != null ? balanceNum - currentBillTotal : null;
  const showBalanceSection = isSale && balanceNum != null && opts.showOldBalance;

  const paperSizes = {
    'A4': { width: '210mm', height: '297mm' },
    'A5': { width: '148mm', height: '210mm' },
    'Letter': { width: '216mm', height: '279mm' },
    'Legal': { width: '216mm', height: '356mm' },
  };

  const selectedSize = paperSizes[paperSize] || paperSizes['A4'];
  const discountAmount = transaction.discountAmount ?? 0;
  const advanceAmount = transaction.advance ?? 0;
  const balanceDue = Math.max(0, (transaction.totalAmount ?? 0) - advanceAmount);

  // Determine which table columns to show
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showGST = opts.showGSTColumn;

  // Col count for colSpan on empty states
  const colCount = 4 + (showDisc ? 1 : 0) + (showGST ? 1 : 0);

  return (
    <div ref={ref} className="invoice-for-print" style={{
      padding: '40px',
      backgroundColor: 'white',
      color: 'black',
      width: selectedSize.width,
      minHeight: selectedSize.height,
      margin: 'auto',
      border: '1px solid #ddd',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      lineHeight: '1.4',
      boxSizing: 'border-box',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
          {opts.showLogo && business.logo && (
            <img src={business.logo} alt="Logo" style={{ maxHeight: '64px', maxWidth: '140px', objectFit: 'contain' }} />
          )}
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#000', margin: '0 0 4px 0' }}>
              {business.name}
            </h1>
            <p style={{ margin: '4px 0', color: '#000' }}>{business.address}</p>
            <p style={{ margin: '4px 0', color: '#000' }}>Phone: {business.phone}</p>
            {opts.showGSTIN && business.gstNumber && (
              <p style={{ margin: '4px 0', color: '#000' }}>GSTIN: {business.gstNumber}</p>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          {business.qrCode && (
            <img src={business.qrCode} alt="QR" style={{ width: '72px', height: '72px', objectFit: 'contain' }} />
          )}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#000' }}>
              {headerTitle}
            </h2>
            {opts.showInvoiceNumber && (
              <p style={{ margin: '4px 0', color: '#000' }}># {transaction.invoiceNumber}</p>
            )}
            {opts.showDate && (
              <p style={{ margin: '4px 0', color: '#000' }}>Date: {formatDate(transaction.date, opts.dateFormat)}</p>
            )}
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #999', marginBottom: '24px' }} />

      {/* Bill To / From */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0', textTransform: 'uppercase', color: '#555', letterSpacing: '0.06em' }}>
          {isSale ? 'Bill To:' : 'Vendor Details:'}
        </h3>
        <h4 style={{ fontSize: '17px', fontWeight: 'bold', margin: '0', color: '#000' }}>{transaction.partyName}</h4>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={thStyle}>#</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>Item Description</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Rate</th>
            {showDisc && <th style={{ ...thStyle, textAlign: 'right' }}>Disc %</th>}
            {showGST && <th style={{ ...thStyle, textAlign: 'right' }}>GST %</th>}
            <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {transaction.items.map((item, index) => {
            const qty = Number(item.qty) || 0;
            const price = Number(item.price) || 0;
            const discPct = Number(item.discountPercent) || 0;
            const taxRate = Number(item.taxRate) || 0;
            const lineAfterDisc = qty * price * (1 - discPct / 100);
            const lineTotal = item.total != null ? Number(item.total) : lineAfterDisc * (1 + taxRate / 100);
            return (
              <tr key={index}>
                <td style={tdStyle}>{index + 1}</td>
                <td style={{ ...tdStyle, fontWeight: '500' }}>{item.name}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{qty}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>₹{price.toFixed(2)}</td>
                {showDisc && <td style={{ ...tdStyle, textAlign: 'right' }}>{discPct ? `${discPct}%` : '-'}</td>}
                {showGST && <td style={{ ...tdStyle, textAlign: 'right' }}>{taxRate}%</td>}
                <td style={{ ...tdStyle, textAlign: 'right' }}>₹{lineTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '260px' }}>
          <div style={rowStyle}>
            <span style={{ color: '#555' }}>Subtotal</span>
            <span style={{ color: '#000' }}>₹{transaction.subtotal?.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={rowStyle}>
              <span style={{ color: '#555' }}>Discount{transaction.discountPercent ? ` (${transaction.discountPercent}%)` : ''}</span>
              <span style={{ color: '#000' }}>-₹{discountAmount.toFixed(2)}</span>
            </div>
          )}
          {opts.showCGSTSGST ? (
            <>
              <div style={rowStyle}>
                <span style={{ color: '#555' }}>CGST</span>
                <span style={{ color: '#000' }}>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: '#555' }}>SGST</span>
                <span style={{ color: '#000' }}>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span>
              </div>
            </>
          ) : opts.showIGST ? (
            <div style={rowStyle}>
              <span style={{ color: '#555' }}>IGST</span>
              <span style={{ color: '#000' }}>₹{(transaction.taxAmount ?? 0).toFixed(2)}</span>
            </div>
          ) : (
            <div style={rowStyle}>
              <span style={{ color: '#555' }}>Tax Amount</span>
              <span style={{ color: '#000' }}>₹{transaction.taxAmount?.toFixed(2)}</span>
            </div>
          )}
          {transaction.roundOffAmount != null && transaction.roundOffAmount !== 0 && (
            <div style={rowStyle}>
              <span style={{ color: '#555' }}>Round Off</span>
              <span style={{ color: '#000' }}>{transaction.roundOffAmount >= 0 ? '+' : ''}₹{Number(transaction.roundOffAmount).toFixed(2)}</span>
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1px solid #999', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '17px', fontWeight: 'bold', color: '#000' }}>Total</span>
            <span style={{ fontSize: '17px', fontWeight: 'bold', color: '#000' }}>₹{transaction.totalAmount?.toFixed(2)}</span>
          </div>
          {isSale && advanceAmount > 0 && (
            <>
              <hr style={{ border: 'none', borderTop: '1px dashed #aaa', margin: '10px 0' }} />
              <div style={{ ...rowStyle, marginBottom: '6px' }}>
                <span style={{ color: '#059669', fontWeight: '600' }}>Advance Received</span>
                <span style={{ color: '#059669', fontWeight: '600' }}>-₹{advanceAmount.toFixed(2)}</span>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid #999', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#dc2626' }}>Balance Due</span>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#dc2626' }}>₹{balanceDue.toFixed(2)}</span>
              </div>
            </>
          )}
          {showBalanceSection && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid #bbb', margin: '14px 0 8px' }} />
              <div style={{ ...rowStyle, marginBottom: '6px' }}>
                <span style={{ color: '#555' }}>Opening balance</span>
                <span style={{ color: '#000' }}>₹{(openingBalance ?? 0).toFixed(2)}</span>
              </div>
              <div style={{ ...rowStyle, marginBottom: '6px' }}>
                <span style={{ color: '#555' }}>Current bill</span>
                <span style={{ color: '#000' }}>₹{currentBillTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #999' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#000' }}>Total balance (pending)</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#000' }}>₹{(balanceNum ?? 0).toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      {(opts.showTerms || opts.showSignature) && (
        <div style={{ marginTop: '48px' }}>
          <div style={{ display: 'flex', gap: '32px' }}>
            {opts.showTerms && (
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#444', fontWeight: 'bold' }}>Terms & Conditions:</p>
                <p style={{ margin: '0', fontSize: '12px', color: '#555' }}>
                  1. Goods once sold will not be taken back.<br />
                  2. Interest @ 18% will be charged if payment is not made within 7 days.
                </p>
              </div>
            )}
            {opts.showSignature && (
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ height: '40px' }}></div>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold', color: '#000' }}>For {business.name}</p>
                <p style={{ margin: '0', fontSize: '12px', color: '#555' }}>Authorized Signatory</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// Shared cell styles
const thStyle = {
  padding: '10px 12px',
  fontWeight: 'bold',
  border: '1px solid #ccc',
  color: '#000',
  whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '10px 12px',
  border: '1px solid #ccc',
  color: '#000',
  verticalAlign: 'top',
};
const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '8px',
};

InvoiceTemplate.displayName = 'InvoiceTemplate';

export default InvoiceTemplate;
