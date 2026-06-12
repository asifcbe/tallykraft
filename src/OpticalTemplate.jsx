import React, { forwardRef } from 'react';
import { alpha } from '@mui/material';

const OpticalTemplate = forwardRef(({ data, business, paperSize = 'A4' }, ref) => {
  if (!data || !business) return null;

  const { rightEye, leftEye, patientName, phone, date, frameType, lensType, notes } = data;

  // Paper size dimensions (width x height in mm)
  const paperSizes = {
    'A4': { width: '210mm', height: '297mm' },
    'A5': { width: '148mm', height: '210mm' },
    'Letter': { width: '216mm', height: '279mm' },
    'Legal': { width: '216mm', height: '356mm' }
  };
  
  const selectedSize = paperSizes[paperSize] || paperSizes['A4'];

  const tableHeaderStyle = {
    padding: '10px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    fontWeight: 'bold',
    fontSize: '11px',
    textTransform: 'uppercase',
    textAlign: 'center'
  };

  const cellStyle = {
    padding: '12px 10px',
    border: '1px solid #e2e8f0',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: '500'
  };

  return (
    <div ref={ref} style={{ 
      padding: '50px', 
      backgroundColor: 'white', 
      color: 'black', 
      width: selectedSize.width, 
      minHeight: selectedSize.height, 
      margin: 'auto', 
      fontFamily: 'Arial, sans-serif',
      lineHeight: '1.5'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', borderBottom: '2px solid #1976d2', paddingBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
          {business.logo && (
            <img src={business.logo} alt="Logo" style={{ maxHeight: '64px', maxWidth: '140px', objectFit: 'contain' }} />
          )}
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1976d2', margin: '0 0 5px 0' }}>
              {business.name}
            </h1>
            <p style={{ margin: '2px 0', fontSize: '14px' }}>{business.address}</p>
            <p style={{ margin: '2px 0', fontSize: '14px' }}>Phone: {business.phone}</p>
            {business.gstNumber && <p style={{ margin: '2px 0', fontSize: '14px' }}>GSTIN: {business.gstNumber}</p>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#64748b' }}>
            OPHTHALMIC PRESCRIPTION
          </h2>
          <p style={{ margin: '2px 0' }}>Date: <strong>{date}</strong></p>
        </div>
      </div>

      {/* Patient Info */}
      <div style={{ marginBottom: '40px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '40px' }}>
          <div><span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Patient Name:</span> <br/> <strong style={{ fontSize: '18px' }}>{patientName}</strong></div>
          <div><span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Phone:</span> <br/> <strong style={{ fontSize: '18px' }}>{phone || 'N/A'}</strong></div>
        </div>
      </div>

      {/* Refraction Table */}
      <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Refraction Details
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
        <thead>
          <tr>
            <th style={{ ...tableHeaderStyle, textAlign: 'left', width: '120px' }}>Eye</th>
            <th style={tableHeaderStyle}>Sphere (D)</th>
            <th style={tableHeaderStyle}>Cylinder (D)</th>
            <th style={tableHeaderStyle}>Axis (°)</th>
            <th style={tableHeaderStyle}>Add (D)</th>
            <th style={tableHeaderStyle}>VA</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold', color: '#1976d2' }}>Right Eye (OD)</td>
            <td style={cellStyle}>{rightEye.sphere || '0.00'}</td>
            <td style={cellStyle}>{rightEye.cylinder || '0.00'}</td>
            <td style={cellStyle}>{rightEye.axis || '0'}°</td>
            <td style={cellStyle}>{rightEye.add || '0.00'}</td>
            <td style={cellStyle}>{rightEye.va || 'N/A'}</td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold', color: '#dc004e' }}>Left Eye (OS)</td>
            <td style={cellStyle}>{leftEye.sphere || '0.00'}</td>
            <td style={cellStyle}>{leftEye.cylinder || '0.00'}</td>
            <td style={cellStyle}>{leftEye.axis || '0'}°</td>
            <td style={cellStyle}>{leftEye.add || '0.00'}</td>
            <td style={cellStyle}>{leftEye.va || 'N/A'}</td>
          </tr>
        </tbody>
      </table>

      {/* Recommendations */}
      <div style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Frame Recommended</h4>
          <div style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '4px', minHeight: '40px' }}>{frameType || 'N/A'}</div>
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Lens Recommended</h4>
          <div style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '4px', minHeight: '40px' }}>{lensType || 'N/A'}</div>
        </div>
      </div>

      {/* Clinical Notes */}
      <div style={{ marginBottom: '60px' }}>
        <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Clinical Notes & Advice</h4>
        <div style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '4px', minHeight: '80px', fontSize: '14px', color: '#334155' }}>
          {notes || 'No additional notes.'}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '40px' }}>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
          <p>© TALLYKRAFT Optical Management</p>
          <p>This prescription is valid for 6 months from the date of examination.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '150px', borderBottom: '1px solid #000', marginBottom: '5px' }}></div>
          <p style={{ fontSize: '12px', fontWeight: 'bold' }}>Optometrist Signature</p>
        </div>
      </div>
    </div>
  );
});

export default OpticalTemplate;
