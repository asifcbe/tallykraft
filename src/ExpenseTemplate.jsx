import React, { forwardRef } from 'react';

const ExpenseTemplate = forwardRef(({ data, business, paperSize = 'A4' }, ref) => {
  if (!data || !business) return null;

  const { category, amount, date, description } = data;

  // Paper size dimensions (width x height in mm)
  const paperSizes = {
    'A3': { width: '297mm', height: '420mm' },
    'A4': { width: '210mm', height: '297mm' },
    'A5': { width: '148mm', height: '210mm' },
    'A6': { width: '105mm', height: '148mm' },
    'Letter': { width: '216mm', height: '279mm' },
    'Legal': { width: '216mm', height: '356mm' },
    'Executive': { width: '184mm', height: '267mm' },
    'Statement': { width: '140mm', height: '216mm' }
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
      border: '1px solid #e8ddd6'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', borderBottom: '2px solid #ef4444', paddingBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
          {business.logo && (
            <img src={business.logo} alt="Logo" style={{ maxHeight: '64px', maxWidth: '140px', objectFit: 'contain' }} />
          )}
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444', margin: '0 0 5px 0' }}>
              {business.name}
            </h1>
            <p style={{ margin: '2px 0', fontSize: '12px' }}>{business.address}</p>
            <p style={{ margin: '2px 0', fontSize: '12px' }}>Phone: {business.phone}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#6b5550' }}>
            EXPENSE VOUCHER
          </h2>
          <p style={{ margin: '0' }}>Date: <strong>{date}</strong></p>
          <p style={{ margin: '0', fontSize: '12px' }}>Category: {category}</p>
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0', padding: '15px', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
        <p style={{ margin: '0', color: '#b91c1c', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Payment Towards
        </p>
        <h3 style={{ margin: '5px 0', fontSize: '20px', fontWeight: 'bold' }}>{category}</h3>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '30px 0' }}>
        <div style={{ padding: '15px 40px', border: '2px dashed #ef4444', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ margin: '0', fontSize: '12px', color: '#6b5550', textTransform: 'uppercase' }}>Expense Amount</p>
          <h2 style={{ margin: '0', fontSize: '32px', fontWeight: '900', color: '#ef4444' }}>₹{amount.toLocaleString()}</h2>
        </div>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <span style={{ color: '#6b5550', fontSize: '11px', textTransform: 'uppercase' }}>Description / Purpose:</span>
        <div style={{ padding: '10px', border: '1px solid #e8ddd6', borderRadius: '4px', minHeight: '60px', marginTop: '5px', fontSize: '14px' }}>
          {description}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: '10px', color: '#9c8a84' }}>
          <p>© DIGITZEBRA Expense Management</p>
          <p>This is an automated expense voucher.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '120px', borderBottom: '1px solid #000', marginBottom: '5px' }}></div>
          <p style={{ fontSize: '11px', fontWeight: 'bold' }}>Authorized Signature</p>
        </div>
      </div>
    </div>
  );
});

export default ExpenseTemplate;
