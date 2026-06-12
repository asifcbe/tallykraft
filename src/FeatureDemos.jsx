import React, { useState, useEffect } from 'react';

const P    = '#667eea';
const P2   = '#764ba2';
const GRAD = `linear-gradient(135deg,${P},${P2})`;
const WA   = '#25D366';
const GRN  = '#16a34a';

/* cycles through phase durations (ms) indefinitely */
function useLoop(durations, offset = 0) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let id;
    const run = p => {
      id = setTimeout(() => {
        const n = (p + 1) % durations.length;
        setPhase(n);
        run(n);
      }, durations[p]);
    };
    id = setTimeout(() => run(0), offset);
    return () => clearTimeout(id);
  }, []);
  return phase;
}

/* shared card shell */
function DemoCard({ preview, label, title, desc, accent = P, isDark, C }) {
  const bg     = isDark ? 'rgba(255,255,255,.045)' : '#fff';
  const border = isDark ? 'rgba(255,255,255,.08)'  : '#e2e8f0';
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 18, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxShadow: isDark ? 'none' : '0 2px 20px rgba(15,23,42,.07)' }}>
      {/* animated preview */}
      <div style={{ background: isDark ? 'rgba(0,0,0,.22)' : `${accent}09`,
        borderBottom: `1px solid ${border}`, minHeight: 178,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', padding: '22px 16px' }}>
        {preview}
      </div>
      {/* text */}
      <div style={{ padding: '16px 20px 22px' }}>
        <div style={{ fontSize: '.66rem', fontWeight: 700, color: accent,
          letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
        <div style={{ fontWeight: 700, fontSize: '.9rem', color: isDark ? '#fff' : '#0f172a',
          marginBottom: 6, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: '.81rem', color: C.muted, lineHeight: 1.65 }}>{desc}</div>
      </div>
    </div>
  );
}

/* ─── 1. BARCODE SCANNER ─── */
function BarcodeDemo({ isDark, C }) {
  const phase = useLoop([2600, 2400]); // 0=scanning 1=detected
  const c     = phase === 1 ? GRN : P;

  return (
    <DemoCard isDark={isDark} C={C} accent={P}
      label="Built-In Barcode Scanner"
      title="No External Scanner Needed"
      desc="Open your phone camera, point at any barcode or QR code — TallyKraft identifies the item and adds it to your bill in one tap."
      preview={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {/* viewfinder */}
          <div style={{ width: 188, height: 120, borderRadius: 12, background: '#0d1117',
            border: `2px solid ${c}`, position: 'relative', overflow: 'hidden',
            transition: 'border-color .5s' }}>
            {/* corners */}
            {[{ t:6, l:6, bt:true, bl:true }, { t:6, r:6, bt:true, br:true },
              { b:6, l:6, bb:true, bl:true }, { b:6, r:6, bb:true, br:true }].map((s, i) => (
              <div key={i} style={{
                position: 'absolute', top: s.t, bottom: s.b, left: s.l, right: s.r,
                width: 14, height: 14,
                borderTop:    s.bt ? `3px solid ${c}` : 'none',
                borderBottom: s.bb ? `3px solid ${c}` : 'none',
                borderLeft:   s.bl ? `3px solid ${c}` : 'none',
                borderRight:  s.br ? `3px solid ${c}` : 'none',
                transition: 'border-color .5s',
              }} />
            ))}
            {/* barcode bars */}
            <div style={{ position: 'absolute', top: '18%', left: '10%', right: '10%', height: '62%',
              display: 'flex', gap: 2, opacity: phase === 1 ? 0.15 : 0.75, transition: 'opacity .5s' }}>
              {[3,1,2,1,3,1,2,3,1,2,1,3,2,1,2].map((w, i) => (
                <div key={i} style={{ flex: w, background: i % 2 === 0 ? 'rgba(255,255,255,.9)' : 'transparent' }} />
              ))}
            </div>
            {/* scan beam */}
            <div style={{
              position: 'absolute', left: 8, right: 8, height: 2,
              background: 'rgba(255,55,55,.9)', boxShadow: '0 0 8px rgba(255,55,55,.7)',
              borderRadius: 2, top: '15%',
              animation: phase === 0 ? 'fd-scanBeam 1.5s ease-in-out infinite' : 'none',
              opacity: phase === 0 ? 1 : 0, transition: 'opacity .3s',
            }} />
            {/* detected overlay */}
            {phase === 1 && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(22,163,74,.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'fd-fadeIn .3s ease' }}>
                <span style={{ fontSize: '.75rem', fontWeight: 800, color: '#4ade80', letterSpacing: '.04em' }}>✓ ITEM DETECTED</span>
              </div>
            )}
          </div>
          {/* product popup */}
          <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {phase === 1 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                background: isDark ? 'rgba(22,28,40,.95)' : 'rgba(255,255,255,.97)',
                border: `1px solid ${GRN}55`, borderRadius: 8, padding: '5px 14px',
                boxShadow: '0 4px 14px rgba(0,0,0,.18)', animation: 'fd-popUp .35s cubic-bezier(.34,1.56,.64,1)' }}>
                <span style={{ fontSize: '.72rem', fontWeight: 800, color: isDark ? '#fff' : '#0f172a' }}>USB-C Hub</span>
                <span style={{ fontSize: '.68rem', color: GRN, fontWeight: 700 }}>₹1,200 · Added ✓</span>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

/* ─── 2. GST AUTO-CALCULATION ─── */
function GSTDemo({ isDark, C }) {
  const phase = useLoop([1200, 1400, 2400], 400); // 0=empty 1=qty typed 2=totals shown
  const fBg  = 'rgba(255,255,255,.07)';
  const fBdr = 'rgba(255,255,255,.12)';

  return (
    <DemoCard isDark={isDark} C={C} accent='#818cf8'
      label="GST Auto-Calculation"
      title="Tax Calculated Automatically"
      desc="Select an item, enter quantity — CGST, SGST, and grand total update instantly. No manual tax math, ever."
      preview={
        <div style={{ width: '100%', maxWidth: 260 }}>
          <div style={{ background: '#1e2130', borderRadius: 10, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.1)' }}>
            <div style={{ background: 'rgba(102,126,234,.2)', padding: '7px 12px',
              fontSize: '.68rem', fontWeight: 700, color: P, letterSpacing: '.05em' }}>NEW INVOICE</div>

            <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              {/* column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 4,
                fontSize: '.59rem', color: 'rgba(255,255,255,.32)', fontWeight: 700,
                letterSpacing: '.05em', marginBottom: 5 }}>
                {['ITEM','QTY','RATE','GST'].map(h => <span key={h}>{h}</span>)}
              </div>
              {/* item row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 4 }}>
                {[
                  { val: 'USB-C Hub', highlight: false },
                  { val: phase >= 1 ? '2' : '', highlight: phase >= 1 },
                  { val: '₹1,200',   highlight: false },
                  { val: '18%',      highlight: false },
                ].map(({ val, highlight }, i) => (
                  <div key={i} style={{ background: fBg,
                    border: `1px solid ${highlight ? P + '88' : fBdr}`,
                    borderRadius: 5, padding: '4px 7px', fontSize: '.72rem',
                    color: 'rgba(255,255,255,.85)', fontWeight: 600,
                    transition: 'border-color .3s', textAlign: i === 1 ? 'center' : 'left' }}>
                    {val || <span style={{ opacity: .25 }}>_</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* totals */}
            <div style={{ padding: '8px 12px', opacity: phase >= 2 ? 1 : 0,
              transform: phase >= 2 ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity .45s, transform .45s', fontSize: '.7rem' }}>
              {[['Subtotal','₹2,400'],['CGST (9%)','₹216'],['SGST (9%)','₹216']].map(([l,v]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between',
                  marginBottom:4, color:'rgba(255,255,255,.5)' }}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6,
                padding: '5px 0', borderTop: '1px solid rgba(255,255,255,.12)',
                fontWeight: 800, fontSize: '.78rem' }}>
                <span style={{ color: 'rgba(255,255,255,.9)' }}>Grand Total</span>
                <span style={{ color: '#818cf8' }}>₹2,832</span>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}

/* ─── 3. WHATSAPP & PRINT SHARE ─── */
function WhatsAppDemo({ isDark, C }) {
  const phase = useLoop([2200, 1200, 1600]); // 0=idle 1=sending 2=sent

  return (
    <DemoCard isDark={isDark} C={C} accent={WA}
      label="WhatsApp & PDF Sharing"
      title="Share Invoices in One Tap"
      desc="Print A4 or thermal bills, export as PDF, or send directly to the customer's WhatsApp — all from the invoice screen."
      preview={
        <div style={{ width: '100%', maxWidth: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* invoice mini-card */}
          <div style={{ background: '#1e2130', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 700, color: P, marginBottom: 4 }}>INV-2025-0042</div>
            <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#fff', marginBottom: 2 }}>Ravi Kumar Enterprises</div>
            <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.45)' }}>3 items · ₹1,24,500 · GST 18%</div>
          </div>

          {/* action buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ key:'Print', color:'#64748b' }, { key:'WhatsApp', color: WA }, { key:'PDF', color:'#ef4444' }].map(({ key, color }) => {
              const isWA  = key === 'WhatsApp';
              const active = isWA && phase >= 1;
              return (
                <div key={key} style={{
                  flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 8,
                  fontSize: '.68rem', fontWeight: 700,
                  background: active ? WA : `${color}22`,
                  color: active ? '#fff' : color,
                  border: `1px solid ${active ? WA : color + '44'}`,
                  transition: 'all .35s',
                  transform: isWA && phase === 1 ? 'scale(.94)' : 'scale(1)',
                }}>
                  {isWA ? (phase === 1 ? 'Sending…' : phase === 2 ? '✓ Sent!' : 'WhatsApp') : key}
                </div>
              );
            })}
          </div>

          {/* confirmation */}
          <div style={{ height: 34, display: 'flex', alignItems: 'center' }}>
            {phase === 2 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7,
                background: `${WA}18`, border: `1px solid ${WA}44`, borderRadius: 8,
                padding: '7px 10px', animation: 'fd-fadeIn .3s ease', width: '100%' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: WA,
                  animation: 'fd-pulse 1.8s infinite' }} />
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: WA }}>Delivered to Ravi Kumar ✓</span>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

/* ─── 4. LIVE STOCK TRACKING ─── */
const STOCK_ITEMS = [
  { name: 'USB-C Hub',      delta: -3, base: 24 },
  { name: 'Keyboard Deluxe', delta: -1, base: 15 },
  { name: 'Monitor Stand',   delta:  0, base:  8 },
];

function StockDemo({ isDark, C }) {
  const phase = useLoop([2200, 1200, 2100]); // 0=normal 1=billing 2=updated

  return (
    <DemoCard isDark={isDark} C={C} accent='#34d399'
      label="Real-Time Inventory"
      title="Stock Updates on Every Sale"
      desc="When you create an invoice, stock levels drop automatically. Always know your exact inventory without manual counting."
      preview={
        <div style={{ width: '100%', maxWidth: 250 }}>
          <div style={{ background: '#1e2130', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: 'rgba(52,211,153,.12)', padding: '7px 12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#34d399', letterSpacing: '.05em' }}>INVENTORY</span>
              <span style={{ fontSize: '.62rem', color: 'rgba(52,211,153,.6)', fontWeight: 600 }}>
                {phase === 1 ? '⟳ Updating…' : 'Live'}
              </span>
            </div>

            {STOCK_ITEMS.map(item => {
              const updated = phase === 2 && item.delta !== 0;
              const qty = phase === 2 ? item.base + item.delta : item.base;
              return (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', padding: '9px 12px',
                  borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  <div>
                    <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>{item.name}</div>
                    <div style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.3)' }}>pcs</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '.86rem', fontWeight: 800,
                      color: updated ? '#34d399' : 'rgba(255,255,255,.65)',
                      transition: 'color .4s',
                      animation: updated ? 'fd-stockFlash .5s ease' : 'none' }}>{qty}</div>
                    {updated && <div style={{ fontSize: '.58rem', color: '#34d399', fontWeight: 700 }}>▼ auto-updated</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            {phase === 1 && (
              <div style={{ fontSize: '.7rem', fontWeight: 700, color: P,
                animation: 'fd-pulse 1s infinite' }}>Creating invoice…</div>
            )}
          </div>
        </div>
      }
    />
  );
}

/* ─── 5. MULTI-BUSINESS ─── */
const BIZS = [
  { name: 'Ravi Traders',     type: 'Wholesale · GSTIN', color: P,       inv: 142, rev: '₹8.4L' },
  { name: 'Kumar Electronics', type: 'Retail · GSTIN',    color: '#f472b6', inv:  89, rev: '₹3.2L' },
  { name: 'Anita Boutique',   type: 'Fashion · No GST',  color: '#fb923c', inv:  56, rev: '₹1.8L' },
];

function MultiBusinessDemo({ isDark, C }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % BIZS.length), 2000);
    return () => clearInterval(id);
  }, []);
  const biz = BIZS[active];

  return (
    <DemoCard isDark={isDark} C={C} accent='#f472b6'
      label="Multi-Business Support"
      title="Run Multiple Businesses From One Account"
      desc="Switch between all your businesses in a single tap. Each has its own invoices, data, and reports — fully isolated."
      preview={
        <div style={{ width: '100%', maxWidth: 248 }}>
          <div style={{ background: '#1e2130', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.28)', fontWeight: 700,
                letterSpacing: '.07em', marginBottom: 7 }}>SELECT BUSINESS</div>
              {BIZS.map((b, i) => (
                <div key={b.name} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                  borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                  background:  i === active ? `${b.color}1e` : 'transparent',
                  border: `1px solid ${i === active ? b.color + '55' : 'transparent'}`,
                  transition: 'all .4s',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: i === active ? b.color : 'rgba(255,255,255,.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.8rem', fontWeight: 800, color: '#fff', transition: 'background .4s',
                  }}>{b.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.74rem', fontWeight: 700,
                      color: i === active ? '#fff' : 'rgba(255,255,255,.4)',
                      transition: 'color .4s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                    <div style={{ fontSize: '.6rem', color: i === active ? b.color : 'rgba(255,255,255,.2)', transition: 'color .4s' }}>{b.type}</div>
                  </div>
                  {i === active && <div style={{ fontSize: '.65rem', color: b.color }}>✓</div>}
                </div>
              ))}
            </div>
            {/* stats */}
            <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[['Invoices', biz.inv], ['Revenue', biz.rev]].map(([lbl, val]) => (
                <div key={lbl} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 7, padding: '7px 10px' }}>
                  <div style={{ fontSize: '.58rem', color: 'rgba(255,255,255,.28)', fontWeight: 700, letterSpacing: '.07em' }}>{lbl.toUpperCase()}</div>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: biz.color, marginTop: 2, transition: 'color .4s' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}

/* ─── 6. OFFLINE MODE ─── */
function OfflineDemo({ isDark, C }) {
  const phase = useLoop([2800, 3200]); // 0=online 1=offline
  const online = phase === 0;

  return (
    <DemoCard isDark={isDark} C={C} accent={GRN}
      label="Complete Offline Mode"
      title="Works Without Internet"
      desc="Enable offline mode and all your data stays only on your device. No cloud, no syncing — full privacy and zero internet dependency."
      preview={
        <div style={{ width: '100%', maxWidth: 244 }}>
          {/* signal bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              {[5, 9, 13, 17].map((h, i) => (
                <div key={i} style={{
                  width: 4, height: h, borderRadius: 2,
                  background: online
                    ? (i < 4 ? P : 'rgba(255,255,255,.15)')
                    : (i === 0 ? '#ef4444' : 'rgba(255,255,255,.1)'),
                  transition: 'background .6s',
                }} />
              ))}
            </div>
            <span style={{ fontSize: '.72rem', fontWeight: 700, transition: 'color .5s',
              color: online ? P : '#ef4444' }}>
              {online ? 'Connected' : 'No Internet'}
            </span>
            {!online && (
              <span style={{ fontSize: '.6rem', fontWeight: 700, color: GRN,
                background: `${GRN}1e`, border: `1px solid ${GRN}44`, borderRadius: 5, padding: '1px 6px',
                animation: 'fd-popUp .35s ease' }}>OFFLINE ON</span>
            )}
          </div>

          {/* app mockup */}
          <div style={{ background: '#1e2130',
            border: `1px solid ${!online ? GRN + '55' : 'rgba(255,255,255,.1)'}`,
            borderRadius: 10, overflow: 'hidden', transition: 'border-color .5s' }}>
            <div style={{ padding: '7px 12px', fontSize: '.68rem', fontWeight: 700,
              letterSpacing: '.05em', display: 'flex', justifyContent: 'space-between',
              background: !online ? `${GRN}18` : 'rgba(102,126,234,.12)',
              color: !online ? GRN : P, transition: 'all .5s' }}>
              <span>NEW INVOICE</span>
              {!online && <span style={{ fontSize: '.6rem', opacity: .8 }}>Saved locally ✓</span>}
            </div>
            <div style={{ padding: '10px 12px' }}>
              {[['Party','Ravi Kumar'],['Item','Keyboard × 2'],['Total','₹1,700']].map(([l,v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '.75rem' }}>
                  <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 600 }}>{l}</span>
                  <span style={{ color: 'rgba(255,255,255,.82)', fontWeight: 700 }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, borderRadius: 7, padding: '6px 10px', textAlign: 'center',
                fontSize: '.72rem', fontWeight: 700, transition: 'all .5s',
                background: !online ? `${GRN}20` : `${P}20`,
                color: !online ? GRN : P }}>
                {!online ? '✓ Invoice Saved Offline' : 'Create Invoice →'}
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}

/* ─── 7. STAFF PERMISSIONS ─── */
function StaffDemo({ isDark, C }) {
  const phase = useLoop([2000, 1000, 2000, 1000]); // 0=staff1 1=switch 2=staff2 3=switch

  const staff = [
    { name: 'Meena (Cashier)', perms: ['Create Invoice','View Stock'], denied: ['Delete','Reports','Settings'], color: '#f472b6' },
    { name: 'Rahul (Manager)', perms: ['Create Invoice','View Stock','Reports','Settings'], denied: ['Delete'], color: '#fb923c' },
  ];
  const s = phase <= 1 ? staff[0] : staff[1];
  const transitioning = phase === 1 || phase === 3;

  return (
    <DemoCard isDark={isDark} C={C} accent='#fb923c'
      label="Staff Permissions"
      title="Control What Each Staff Can Access"
      desc="Add staff with custom roles. A cashier can create bills, but only a manager can view reports or change settings."
      preview={
        <div style={{ width: '100%', maxWidth: 250, opacity: transitioning ? 0.4 : 1, transition: 'opacity .3s' }}>
          <div style={{ background: '#1e2130', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: `${s.color}18`,
              borderBottom: '1px solid rgba(255,255,255,.07)',
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.8rem', fontWeight: 800, color: '#fff' }}>{s.name[0]}</div>
              <div>
                <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#fff' }}>{s.name}</div>
                <div style={{ fontSize: '.6rem', color: s.color }}>Logged in</div>
              </div>
            </div>

            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.28)', fontWeight: 700,
                letterSpacing: '.07em', marginBottom: 6 }}>PERMISSIONS</div>
              {[...s.perms.map(p => ({ label: p, allow: true })),
                ...s.denied.map(p => ({ label: p, allow: false }))].map(({ label, allow }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 5, fontSize: '.74rem',
                  color: allow ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.28)' }}>
                  <span style={{ fontSize: '.7rem', color: allow ? GRN : '#ef4444' }}>{allow ? '✓' : '✗'}</span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}

/* ─── 8. THERMAL / A4 PRINT ─── */
function PrintDemo({ isDark, C }) {
  const phase = useLoop([2500, 2500]); // 0=ready 1=printing

  return (
    <DemoCard isDark={isDark} C={C} accent='#60a5fa'
      label="Thermal & A4 Print"
      title="Print Any Bill Format Instantly"
      desc="Switch between A4 invoices and thermal receipt rolls in one click. Works with any Bluetooth or USB printer."
      preview={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 220 }}>
          {/* format toggle */}
          <div style={{ display: 'flex', background: '#1e2130', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 10, padding: 4, gap: 4 }}>
            {[{ label: 'A4 Invoice', icon: '📄' }, { label: 'Thermal Roll', icon: '🧾' }].map(({ label, icon }, i) => {
              const active = i === (phase === 0 ? 0 : 1);
              return (
                <div key={label} style={{ padding: '6px 12px', borderRadius: 7, fontSize: '.68rem',
                  fontWeight: 700, transition: 'all .5s',
                  background: active ? '#60a5fa' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,.35)' }}>
                  {icon} {label}
                </div>
              );
            })}
          </div>

          {/* paper mockup */}
          <div style={{ position: 'relative', width: phase === 1 ? 80 : 130, transition: 'width .5s',
            background: '#fff', borderRadius: phase === 1 ? 4 : 6,
            boxShadow: '0 4px 18px rgba(0,0,0,.3)', overflow: 'hidden' }}>
            {/* content lines */}
            <div style={{ padding: '10px 8px' }}>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 2, marginBottom: 6, width: '80%', margin: '0 auto 6px' }} />
              <div style={{ height: 5, background: '#f1f5f9', borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 5, background: '#f1f5f9', borderRadius: 2, marginBottom: 4, width: '75%' }} />
              <div style={{ height: 5, background: '#f1f5f9', borderRadius: 2, marginBottom: 8, width: '60%' }} />
              <div style={{ height: 1, background: '#e2e8f0', marginBottom: 6 }} />
              <div style={{ height: 7, background: '#dbeafe', borderRadius: 2, marginBottom: 4 }} />
              <div style={{ height: 7, background: '#dbeafe', borderRadius: 2, width: '85%' }} />
            </div>
          </div>

          {/* print button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#60a5fa',
            borderRadius: 8, padding: '7px 18px', fontSize: '.72rem', fontWeight: 700,
            color: '#fff', cursor: 'pointer',
            animation: phase === 1 ? 'fd-glowPulse 1s ease infinite' : 'none' }}>
            🖨 {phase === 1 ? 'Printing…' : 'Print Now'}
          </div>
        </div>
      }
    />
  );
}

/* ─── MAIN EXPORT ─── */
export default function FeatureDemos({ isDark, C }) {
  return (
    <>
      <style>{`
        @keyframes fd-scanBeam { 0%,100%{top:14%} 50%{top:72%} }
        @keyframes fd-fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes fd-popUp    { 0%{opacity:0;transform:translateY(6px) scale(.9)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes fd-stockFlash { 0%{transform:scale(1.22)} 100%{transform:scale(1)} }
        @keyframes fd-pulse    { 0%,100%{opacity:.55} 50%{opacity:1} }
        @keyframes fd-glowPulse { 0%,100%{box-shadow:0 0 0 0 rgba(96,165,250,.5)} 50%{box-shadow:0 0 0 8px rgba(96,165,250,0)} }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 18 }}>
        <BarcodeDemo      isDark={isDark} C={C} />
        <GSTDemo          isDark={isDark} C={C} />
        <WhatsAppDemo     isDark={isDark} C={C} />
        <StockDemo        isDark={isDark} C={C} />
        <MultiBusinessDemo isDark={isDark} C={C} />
        <OfflineDemo      isDark={isDark} C={C} />
        <StaffDemo        isDark={isDark} C={C} />
        <PrintDemo        isDark={isDark} C={C} />
      </div>
    </>
  );
}
