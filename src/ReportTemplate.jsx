import React, { forwardRef } from 'react';

const ReportTemplate = forwardRef(({ reportData, business, filters, title, paperSize = 'A4' }, ref) => {
  if (!reportData || !business) return null;

  const pageSizeCSS = paperSize === 'A3' ? '297mm 420mm'
    : paperSize === 'A5' ? '148mm 210mm'
    : paperSize === 'A6' ? '105mm 148mm'
    : paperSize === 'Letter' ? '216mm 279mm'
    : paperSize === 'Legal' ? '216mm 356mm'
    : paperSize === 'Executive' ? '184mm 267mm'
    : paperSize === 'Statement' ? '140mm 216mm'
    : '210mm 297mm';

  const printStyles = `
    @media print {
      @page { size: ${pageSizeCSS} portrait; margin: 10mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table { width: 100% !important; }
    }
  `;

  return (
    <div ref={ref} style={{
      padding: '32px',
      backgroundColor: 'white',
      color: 'black',
      margin: 'auto',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      lineHeight: '1.4',
    }}>
      <style>{printStyles}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
          {business.logo && (
            <img src={business.logo} alt="Logo" style={{ maxHeight: '64px', maxWidth: '140px', objectFit: 'contain' }} />
          )}
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#5c1f22', margin: '0 0 4px 0' }}>
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

      <div style={{ backgroundColor: '#f6efe9', padding: '10px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #e8ddd6' }}>
        <h4 style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Report Period & Filters</h4>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
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
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', tableLayout: 'auto' }}>
        <thead>
          <tr style={{ backgroundColor: '#f6efe9' }}>
            {reportData.columns.map((col, idx) => (
              <th key={idx} style={{
                padding: '10px',
                textAlign: col.align || 'left',
                fontWeight: 'bold',
                border: '1px solid #e8ddd6',
                fontSize: '11px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reportData.rows.map((row, rowIdx) => (
            <tr key={rowIdx} style={{ backgroundColor: rowIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
              {reportData.columns.map((col, colIdx) => (
                <td key={colIdx} style={{
                  padding: '8px 10px',
                  border: '1px solid #e8ddd6',
                  textAlign: col.align || 'left',
                  fontWeight: row._bold ? 'bold' : 'normal',
                  color: row._color || 'inherit',
                  backgroundColor: row._section ? '#f6efe9' : 'inherit',
                }}>
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {reportData.totals && Object.keys(reportData.totals).length > 0 && (
          <tfoot>
            <tr style={{ backgroundColor: '#f6efe9', fontWeight: 'bold' }}>
              {reportData.columns.map((col, idx) => (
                <td key={idx} style={{
                  padding: '10px',
                  border: '1px solid #e8ddd6',
                  textAlign: col.align || 'left',
                }}>
                  {col.isTotal && reportData.totals[col.key] != null
                    ? `₹${Number(reportData.totals[col.key]).toFixed(2)}`
                    : idx === 0 ? 'TOTAL' : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: '40px', textAlign: 'center', color: '#5f4f47', fontSize: '10px' }}>
        <p>This is a computer-generated report and does not require a physical signature.</p>
        <p>© DIGITZEBRA Accounting Software</p>
      </div>
    </div>
  );
});

export default ReportTemplate;
