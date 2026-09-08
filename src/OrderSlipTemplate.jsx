import React, { forwardRef } from 'react';

// Standalone, purpose-built print layout for Orders — deliberately NOT the
// InvoiceTemplate (a tax-invoice document with GST/HSN tables, payment/round-off
// blocks, etc. that don't apply to an order slip). A slip's job is to tell
// whoever's packing/delivering the order what to pack and where it's going —
// so the delivery details block is the visual centerpiece, not an afterthought
// tacked onto an invoice layout.

const PAPER_DIM = {
  'A3': { width: '297mm', minHeight: '410mm', pad: '18mm' },
  'A4': { width: '210mm', minHeight: '287mm', pad: '14mm' },
  'A5': { width: '148mm', minHeight: '200mm', pad: '10mm' },
  'A6': { width: '105mm', minHeight: '138mm', pad: '7mm' },
  'Letter': { width: '216mm', minHeight: '269mm', pad: '14mm' },
  'Legal': { width: '216mm', minHeight: '346mm', pad: '14mm' },
  'Executive': { width: '184mm', minHeight: '257mm', pad: '12mm' },
  'Statement': { width: '140mm', minHeight: '206mm', pad: '10mm' },
};

const STATUS_COLORS = {
  Pending: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Confirmed: { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  Processing: { color: '#7c3aed', bg: '#f5f3ff', border: '#e8ddd6' },
  Ready: { color: '#5c1f22', bg: '#f6efe9', border: '#e8ddd6' },
  Delivered: { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  Cancelled: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
};

const OrderSlipTemplate = forwardRef(({ order, business, paperSize = 'A4' }, ref) => {
  if (!order || !business) return null;
  const isThermal = paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm';
  const thermalWidth = paperSize === 'Thermal 58mm' ? '58mm' : '80mm';
  const dim = PAPER_DIM[paperSize] || PAPER_DIM['A4'];
  const sc = STATUS_COLORS[order.status] || STATUS_COLORS.Pending;

  const items = order.items || [];
  const total = Number(order.totalAmount) || items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

  if (isThermal) {
    return (
      <div ref={ref} style={{
        width: thermalWidth, minHeight: 'auto', padding: '4mm', backgroundColor: 'white', color: 'black',
        fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: 1.5,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          {business.logo && <img src={business.logo} alt="Logo" style={{ maxHeight: '48px', maxWidth: '70%', objectFit: 'contain', marginBottom: '4px' }} />}
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{business.name}</div>
          {business.phone && <div style={{ fontSize: '11px' }}>Ph: {business.phone}</div>}
        </div>
        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '6px 0' }}>
          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>ORDER SLIP</div>
          <div>Order #: <strong>{order.orderNumber}</strong></div>
          <div>Status: <strong>{order.status}</strong></div>
          <div>Date: {order.orderDate}</div>
          {order.deliveryDate && <div>Delivery: {order.deliveryDate}</div>}
        </div>
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontWeight: 'bold' }}>Customer: {order.partyName}</div>
          {order.partyPhone && <div>Ph: {order.partyPhone}</div>}
        </div>
        {(order.deliveryAddress || order.deliveryPhone) && (
          <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', marginBottom: '6px' }}>
            <div style={{ fontWeight: 'bold' }}>Deliver To:</div>
            {order.deliveryAddress && <div>{order.deliveryAddress}</div>}
            {order.deliveryPhone && <div>Ph: {order.deliveryPhone}</div>}
          </div>
        )}
        <div style={{ borderTop: '1px dashed #000', paddingTop: '6px' }}>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>{it.name} x{it.qty}{it.unit ? ` ${it.unit}` : ''}</span>
              <span>₹{((Number(it.qty) || 0) * (Number(it.price) || 0)).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px' }}>
          <span>Total</span><span>₹{total.toFixed(2)}</span>
        </div>
        {order.notes && (
          <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '6px' }}>
            <div style={{ fontWeight: 'bold' }}>Notes:</div>
            <div>{order.notes}</div>
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px', color: '#888' }}>Powered by TallyKraft</div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{
      padding: dim.pad, backgroundColor: 'white', color: 'black',
      width: dim.width, minHeight: dim.minHeight, margin: 'auto',
      fontFamily: 'Arial, sans-serif', lineHeight: 1.5, boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '2px solid #5c1f22', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          {business.logo && <img src={business.logo} alt="Logo" style={{ maxHeight: '56px', maxWidth: '130px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#3f1417' }}>{business.name}</div>
            {business.address && <div style={{ fontSize: '12px', color: '#7a2e30' }}>{business.address}</div>}
            {business.phone && <div style={{ fontSize: '12px', color: '#7a2e30' }}>Phone: {business.phone}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '0.05em', color: '#3f1417' }}>ORDER SLIP</div>
          <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold', marginTop: '4px' }}>{order.orderNumber}</div>
        </div>
      </div>

      {/* Status + dates row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{
          display: 'inline-block', padding: '5px 14px', borderRadius: '100px', fontWeight: 'bold', fontSize: '13px',
          color: sc.color, backgroundColor: sc.bg, border: `1.5px solid ${sc.border}`,
        }}>
          {order.status}
        </div>
        <div style={{ fontSize: '12px', color: '#7a2e30' }}>Order Date: <strong>{order.orderDate}</strong></div>
        {order.deliveryDate && <div style={{ fontSize: '12px', color: '#7a2e30' }}>Delivery Date: <strong>{order.deliveryDate}</strong></div>}
      </div>

      {/* Customer + Delivery details */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', padding: '14px', backgroundColor: '#f6efe9', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Customer</div>
          <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{order.partyName || '—'}</div>
          {order.partyPhone && <div style={{ fontSize: '12px', color: '#7a2e30', marginTop: '2px' }}>{order.partyPhone}</div>}
        </div>
        <div style={{ flex: 1, minWidth: '200px', padding: '14px', backgroundColor: '#f6efe9', borderRadius: '8px', border: '1px solid #e8ddd6' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#5c1f22', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Delivery Details</div>
          {order.deliveryAddress ? (
            <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'pre-wrap' }}>{order.deliveryAddress}</div>
          ) : (
            <div style={{ fontSize: '12px', color: '#5f4f47' }}>Same as customer address</div>
          )}
          {order.deliveryPhone && <div style={{ fontSize: '12px', color: '#7a2e30', marginTop: '4px' }}>Contact: {order.deliveryPhone}</div>}
          {order.deliveryInstructions && (
            <div style={{ fontSize: '11.5px', color: '#5c1f22', marginTop: '6px', fontStyle: 'italic' }}>{order.deliveryInstructions}</div>
          )}
        </div>
      </div>

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 10px', backgroundColor: '#f6efe9', border: '1px solid #e8ddd6', fontSize: '11px', textTransform: 'uppercase' }}>Item</th>
            <th style={{ textAlign: 'center', padding: '8px 10px', backgroundColor: '#f6efe9', border: '1px solid #e8ddd6', fontSize: '11px', textTransform: 'uppercase', width: '70px' }}>Qty</th>
            <th style={{ textAlign: 'center', padding: '8px 10px', backgroundColor: '#f6efe9', border: '1px solid #e8ddd6', fontSize: '11px', textTransform: 'uppercase', width: '70px' }}>Unit</th>
            <th style={{ textAlign: 'right', padding: '8px 10px', backgroundColor: '#f6efe9', border: '1px solid #e8ddd6', fontSize: '11px', textTransform: 'uppercase', width: '90px' }}>Price</th>
            <th style={{ textAlign: 'right', padding: '8px 10px', backgroundColor: '#f6efe9', border: '1px solid #e8ddd6', fontSize: '11px', textTransform: 'uppercase', width: '100px' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx}>
              <td style={{ padding: '8px 10px', border: '1px solid #e8ddd6', fontSize: '13px', fontWeight: 500 }}>{it.name}</td>
              <td style={{ padding: '8px 10px', border: '1px solid #e8ddd6', fontSize: '13px', textAlign: 'center' }}>{it.qty}</td>
              <td style={{ padding: '8px 10px', border: '1px solid #e8ddd6', fontSize: '13px', textAlign: 'center' }}>{it.unit || '—'}</td>
              <td style={{ padding: '8px 10px', border: '1px solid #e8ddd6', fontSize: '13px', textAlign: 'right' }}>₹{(Number(it.price) || 0).toFixed(2)}</td>
              <td style={{ padding: '8px 10px', border: '1px solid #e8ddd6', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>₹{((Number(it.qty) || 0) * (Number(it.price) || 0)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <div style={{ minWidth: '220px', padding: '10px 16px', backgroundColor: '#f6efe9', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#7a2e30' }}>TOTAL</span>
          <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#5c1f22' }}>₹{total.toFixed(2)}</span>
        </div>
      </div>

      {/* Notes */}
      {order.notes?.trim() && (
        <div style={{ marginBottom: '30px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Notes</div>
          <div style={{ padding: '12px', border: '1px solid #e8ddd6', borderRadius: '6px', fontSize: '13px', color: '#5c1f22', minHeight: '40px' }}>{order.notes}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '20px', marginTop: 'auto' }}>
        <div style={{ fontSize: '10px', color: '#5f4f47' }}>Powered by TallyKraft · www.tallykraft.com</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '140px', borderBottom: '1px solid #000', marginBottom: '4px' }} />
          <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Received By</div>
        </div>
      </div>
    </div>
  );
});

export default OrderSlipTemplate;
