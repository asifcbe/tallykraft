import React, { forwardRef } from 'react';
import { alpha } from '@mui/material';

const OpticalTemplate = forwardRef(({ data, business, paperSize = 'A4' }, ref) => {
  if (!data || !business) return null;

  const { rightEye, leftEye, patientName, phone, gender, age, date, frameType, lensType, notes } = data;

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

  const tableHeaderStyle = {
    padding: '10px',
    backgroundColor: '#f6efe9',
    border: '1px solid #e8ddd6',
    fontWeight: 'bold',
    fontSize: '11px',
    textTransform: 'uppercase',
    textAlign: 'center'
  };

  const cellStyle = {
    padding: '12px 10px',
    border: '1px solid #e8ddd6',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', borderBottom: '2px solid #5c1f22', paddingBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
          {business.logo && (
            <img src={business.logo} alt="Logo" style={{ maxHeight: '64px', maxWidth: '140px', objectFit: 'contain' }} />
          )}
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#5c1f22', margin: '0 0 5px 0' }}>
              {business.name}
            </h1>
            <p style={{ margin: '2px 0', fontSize: '14px' }}>{business.address}</p>
            <p style={{ margin: '2px 0', fontSize: '14px' }}>Phone: {business.phone}</p>
            {business.gstNumber && <p style={{ margin: '2px 0', fontSize: '14px' }}>GSTIN: {business.gstNumber}</p>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '2px 0' }}>Date: <strong>{date}</strong></p>
        </div>
      </div>

      {/* Patient Info */}
      <div style={{ marginBottom: '40px', backgroundColor: '#f6efe9', padding: '15px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          <div><span style={{ color: '#57433e', fontSize: '12px', textTransform: 'uppercase' }}>Patient Name:</span> <br/> <strong style={{ fontSize: '18px' }}>{patientName}</strong></div>
          <div><span style={{ color: '#57433e', fontSize: '12px', textTransform: 'uppercase' }}>Phone:</span> <br/> <strong style={{ fontSize: '18px' }}>{phone || 'N/A'}</strong></div>
          {gender && (
            <div><span style={{ color: '#57433e', fontSize: '12px', textTransform: 'uppercase' }}>Gender:</span> <br/> <strong style={{ fontSize: '18px' }}>{gender}</strong></div>
          )}
          {age && (
            <div><span style={{ color: '#57433e', fontSize: '12px', textTransform: 'uppercase' }}>Age:</span> <br/> <strong style={{ fontSize: '18px' }}>{age} yrs</strong></div>
          )}
        </div>
      </div>

      {/* Refraction Table */}
      <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#5c1f22', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '1px' }}>
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
            <th style={tableHeaderStyle}>PD (mm)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold', color: '#5c1f22' }}>Right Eye (OD)</td>
            <td style={cellStyle}>{rightEye.sphere || '0.00'}</td>
            <td style={cellStyle}>{rightEye.cylinder || '0.00'}</td>
            <td style={cellStyle}>{rightEye.axis || '0'}°</td>
            <td style={cellStyle}>{rightEye.add || '0.00'}</td>
            <td style={cellStyle}>{rightEye.va || 'N/A'}</td>
            <td style={cellStyle}>{rightEye.pd || '—'}</td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold', color: '#dc004e' }}>Left Eye (OS)</td>
            <td style={cellStyle}>{leftEye.sphere || '0.00'}</td>
            <td style={cellStyle}>{leftEye.cylinder || '0.00'}</td>
            <td style={cellStyle}>{leftEye.axis || '0'}°</td>
            <td style={cellStyle}>{leftEye.add || '0.00'}</td>
            <td style={cellStyle}>{leftEye.va || 'N/A'}</td>
            <td style={cellStyle}>{leftEye.pd || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Recommendations */}
      <div style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: '#57433e', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Frame Recommended</h4>
          <div style={{ padding: '10px', border: '1px solid #e8ddd6', borderRadius: '4px', minHeight: '40px' }}>{frameType || 'N/A'}</div>
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: '#57433e', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Lens Recommended</h4>
          <div style={{ padding: '10px', border: '1px solid #e8ddd6', borderRadius: '4px', minHeight: '40px' }}>{lensType || 'N/A'}</div>
        </div>
      </div>

      {/* Clinical Notes */}
      <div style={{ marginBottom: '60px' }}>
        <h4 style={{ fontSize: '12px', fontWeight: 'bold', color: '#57433e', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Clinical Notes & Advice</h4>
        <div style={{ padding: '15px', border: '1px solid #e8ddd6', borderRadius: '4px', minHeight: '80px', fontSize: '14px', color: '#5c1f22' }}>
          {notes || 'No additional notes.'}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '40px' }}>
        <div style={{ fontSize: '10px', color: '#5f4f47' }}>
          <p>© DIGITZEBRA Optical Management</p>
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
