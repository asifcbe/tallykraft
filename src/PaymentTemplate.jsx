import React, { forwardRef } from 'react';

const PaymentTemplate = forwardRef(({ data, business, paperSize = 'A4' }, ref) => {
  if (!data || !business) return null;

  const { partyName, totalAmount, date, paymentMode, referenceNo, notes, type } = data;
  const isPaymentIn = type === 'PaymentIn';

  // Paper size dimensions (width x height in mm)
  const paperSizes = {
    'A4': { width: '210mm', height: '297mm' },
    'A5': { width: '148mm', height: '210mm' },
    'Letter': { width: '216mm', height: '279mm' },
    'Legal': { width: '216mm', height: '356mm' }
  };
  
  const selectedSize = paperSizes[paperSize] || paperSizes['A4'];

  return (
    <div ref={ref} style={{ 
      padding: '50px', 
      backgroundColor: 'white', 
      color: 'black', 
      width: selectedSize.width, 
      minHeight: selectedSize.height, 
      margin: 'auto', 
      fontFamily: 'Arial, sans-serif',
      lineHeight: '1.5',
      border: '1px solid #e2e8f0'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', borderBottom: '2px solid #10b981', paddingBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
          {business.logo && (
            <img src={business.logo} alt="Logo" style={{ maxHeight: '64px', maxWidth: '140px', objectFit: 'contain' }} />
          )}
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981', margin: '0 0 5px 0' }}>
              {business.name}
            </h1>
            <p style={{ margin: '2px 0', fontSize: '12px' }}>{business.address}</p>
            <p style={{ margin: '2px 0', fontSize: '12px' }}>Phone: {business.phone}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#64748b' }}>
            PAYMENT RECEIPT
          </h2>
          <p style={{ margin: '0' }}>Date: <strong>{date}</strong></p>
          <p style={{ margin: '0', fontSize: '12px' }}>Ref: {referenceNo}</p>
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0', padding: '15px', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
        <p style={{ margin: '0', color: '#15803d', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {isPaymentIn ? 'Received With Thanks From' : 'Paid With Regards To'}
        </p>
        <h3 style={{ margin: '5px 0', fontSize: '22px', fontWeight: 'bold' }}>{partyName}</h3>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '30px 0' }}>
        <div style={{ padding: '15px 40px', border: '2px dashed #10b981', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ margin: '0', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Amount Paid</p>
          <h2 style={{ margin: '0', fontSize: '32px', fontWeight: '900', color: '#10b981' }}>₹{totalAmount.toLocaleString()}</h2>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '40px', marginBottom: '30px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Payment Mode:</span>
          <p style={{ margin: '2px 0', fontWeight: 'bold' }}>{paymentMode}</p>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Reference No:</span>
          <p style={{ margin: '2px 0', fontWeight: 'bold' }}>{referenceNo}</p>
        </div>
        {notes && (
          <div style={{ flex: 2 }}>
            <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Notes:</span>
            <p style={{ margin: '2px 0', fontSize: '13px' }}>{notes}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
          <p>© TALLYKRAFT Accounting</p>
          <p>This is an automated payment receipt.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '120px', borderBottom: '1px solid #000', marginBottom: '5px' }}></div>
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Authorized Signature</p>
        </div>
      </div>
    </div>
  );
});

export default PaymentTemplate;
