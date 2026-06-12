import React, { forwardRef } from 'react';

const ReportTemplate = forwardRef(({ reportData, business, filters, title, paperSize = 'A4' }, ref) => {
  if (!reportData || !business) return null;

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
      padding: '40px', 
      backgroundColor: 'white', 
      color: 'black', 
      width: selectedSize.width, 
      minHeight: selectedSize.height, 
      margin: 'auto', 
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      lineHeight: '1.4'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
          {business.logo && (
            <img src={business.logo} alt="Logo" style={{ maxHeight: '64px', maxWidth: '140px', objectFit: 'contain' }} />
          )}
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#1976d2', margin: '0 0 4px 0' }}>
              {business.name}
            </h1>
            <p style={{ margin: '2px 0' }}>{business.address}</p>
            <p style={{ margin: '2px 0' }}>Phone: {business.phone}</p>
            {business.gstNumber && <p style={{ margin: '2px 0' }}>GSTIN: {business.gstNumber}</p>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 4px 0', textTransform: 'uppercase' }}>
            {title}
          </h2>
          <p style={{ margin: '2px 0', color: '#666' }}>Generated on: {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Report Period & Filters</h4>
        <div style={{ display: 'flex', gap: '20px' }}>
          {filters.periodLabel ? (
            <div><strong>Period:</strong> {filters.periodLabel}</div>
          ) : (
            <>
              <div><strong>From:</strong> {filters.dateFrom || 'Start'}</div>
              <div><strong>To:</strong> {filters.dateTo || 'End'}</div>
            </>
          )}
          {filters.partyName && <div><strong>Party:</strong> {filters.partyName}</div>}
          {filters.itemName && <div><strong>Item:</strong> {filters.itemName}</div>}
        </div>
      </div>

      {/* Report Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9' }}>
            {reportData.columns.map((col, idx) => (
              <th key={idx} style={{ 
                padding: '10px', 
                textAlign: col.align || 'left', 
                fontWeight: 'bold', 
                border: '1px solid #e2e8f0',
                fontSize: '11px',
                textTransform: 'uppercase'
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reportData.rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {reportData.columns.map((col, colIdx) => (
                <td key={colIdx} style={{ 
                  padding: '8px 10px', 
                  border: '1px solid #e2e8f0',
                  textAlign: col.align || 'left'
                }}>
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {reportData.totals && Object.keys(reportData.totals).length > 0 && (
          <tfoot>
            <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
              {reportData.columns.map((col, idx) => (
                <td key={idx} style={{
                  padding: '10px',
                  border: '1px solid #e2e8f0',
                  textAlign: col.align || 'left'
                }}>
                  {col.isTotal && reportData.totals[col.key] != null ? `₹${reportData.totals[col.key].toFixed(2)}` : idx === 0 ? 'TOTAL' : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '10px' }}>
        <p>This is a computer-generated report and does not require a physical signature.</p>
        <p>© TALLYKRAFT Accounting Software</p>
      </div>
    </div>
  );
});

export default ReportTemplate;
