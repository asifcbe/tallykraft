import React, { useState, useEffect } from 'react';
import { CheckCircle, Printer, MessageCircle, FileDown, Plus } from 'lucide-react';

const P    = '#5c1f22';
const P2   = '#3f1417';
const GRAD = `linear-gradient(135deg,${P} 0%,${P2} 100%)`;

const PARTY  = 'Ravi Kumar Enterprises';
const PHONE  = '+91 98765 43210';
const INV_NO = 'INV-2025-0042';
const DATE   = '20 May 2025';

const ITEMS = [
  { name: 'Wireless Keyboard', qty: 2, price: 850,  tax: 18 },
  { name: 'USB-C Hub 7-Port',  qty: 1, price: 1200, tax: 18 },
  { name: 'Monitor Stand',     qty: 1, price: 650,  tax: 12 },
];

const rowTotal  = i => i.qty * i.price;
const rowTax    = i => Math.round(rowTotal(i) * i.tax / 100);
const subtotal  = items => items.reduce((s, i) => s + rowTotal(i), 0);
const totalTax  = items => items.reduce((s, i) => s + rowTax(i), 0);
const grandTotal = items => subtotal(items) + totalTax(items);
const fmt = n => '₹' + Number(n).toLocaleString('en-IN');

/* ── tiny helpers ── */
const Fade = ({ show, delay = 0, children, style = {} }) => (
  <div style={{
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0)' : 'translateY(8px)',
    transition: `opacity 0.45s ease ${delay}s, transform 0.45s ease ${delay}s`,
    ...style,
  }}>
    {children}
  </div>
);

const StepBadge = ({ active, done, n, label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '.7rem', fontWeight: 800,
      background: done ? '#16a34a' : active ? GRAD : 'rgba(92,31,34,.12)',
      color: (done || active) ? '#fff' : P,
      border: active && !done ? `2px solid ${P}` : 'none',
      transition: 'all .4s ease',
      boxShadow: active && !done ? `0 0 0 4px rgba(92,31,34,.18)` : 'none',
    }}>
      {done ? <CheckCircle size={14} /> : n}
    </div>
    <span style={{
      fontSize: '.82rem', fontWeight: active || done ? 700 : 500,
      color: active || done ? '#5c1f22' : '#9c8a84',
      transition: 'color .3s',
    }}>{label}</span>
  </div>
);

/* ── main component ── */
export default function InvoiceDemo({ isDark = false }) {
  const [phase, setPhase]               = useState(0);
  const [typedChars, setTypedChars]     = useState(0);
  const [visibleItems, setVisibleItems] = useState(0);
  const [showTotal, setShowTotal]       = useState(false);
  const [showPrint, setShowPrint]       = useState(false);
  const [flashPrint, setFlashPrint]     = useState(false);

  const PHASES = 4; // 0:typing 1:items 2:totals 3:share

  useEffect(() => {
    const T = [];
    setTypedChars(0); setVisibleItems(0);
    setShowTotal(false); setShowPrint(false); setFlashPrint(false);

    if (phase === 0) {
      // Type the party name
      for (let i = 1; i <= PARTY.length; i++)
        T.push(setTimeout(() => setTypedChars(i), i * 55));
      T.push(setTimeout(() => setPhase(1), PARTY.length * 55 + 600));
    }

    if (phase === 1) {
      setTypedChars(PARTY.length);
      T.push(setTimeout(() => setVisibleItems(1), 300));
      T.push(setTimeout(() => setVisibleItems(2), 900));
      T.push(setTimeout(() => setVisibleItems(3), 1500));
      T.push(setTimeout(() => setPhase(2), 2300));
    }

    if (phase === 2) {
      setTypedChars(PARTY.length); setVisibleItems(3);
      T.push(setTimeout(() => setShowTotal(true), 400));
      T.push(setTimeout(() => setPhase(3), 2000));
    }

    if (phase === 3) {
      setTypedChars(PARTY.length); setVisibleItems(3); setShowTotal(true);
      T.push(setTimeout(() => setShowPrint(true), 300));
      T.push(setTimeout(() => setFlashPrint(true), 1400));
      T.push(setTimeout(() => setFlashPrint(false), 2000));
      T.push(setTimeout(() => setPhase(0), 4200));
    }

    return () => T.forEach(clearTimeout);
  }, [phase]);

  const shownItems = ITEMS.slice(0, visibleItems);
  const partyText  = PARTY.slice(0, typedChars);
  const partyDone  = typedChars === PARTY.length;

  const bg      = isDark ? '#3f1417' : '#ffffff';
  const bgAlt   = isDark ? '#5c1f22' : '#f6efe9';
  const border  = isDark ? 'rgba(255,255,255,.07)' : '#e8ddd6';
  const text    = isDark ? '#f6efe9' : '#5c1f22';
  const muted   = isDark ? '#9c8a84' : '#6b5550';
  const dim     = isDark ? '#7a2e30' : '#ddd0c9';
  const accent  = 'rgba(92,31,34,.1)';

  return (
    <div style={{ display:'flex', gap:28, alignItems:'flex-start', maxWidth:1020, margin:'0 auto' }}>

      {/* ── LEFT PANEL: step-by-step form ── */}
      <div style={{
        flex:'0 0 340px', minWidth:0,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: isDark ? '0 24px 60px rgba(0,0,0,.4)' : '0 24px 60px rgba(92,31,34,.12)',
      }}>
        {/* Header bar */}
        <div style={{ background: GRAD, padding:'14px 20px', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:6 }}>
            {['#ff5f57','#febc2e','#28c840'].map(c => (
              <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c }} />
            ))}
          </div>
          <span style={{ color:'rgba(255,255,255,.85)', fontSize:'.75rem', fontWeight:700, letterSpacing:'.06em' }}>
            NEW INVOICE
          </span>
        </div>

        <div style={{ padding:'20px 20px 24px' }}>
          {/* Progress steps */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:22, padding:'14px 16px', background:bgAlt, borderRadius:12, border:`1px solid ${border}` }}>
            <StepBadge n="1" label="Select Customer"  active={phase===0} done={phase>0} />
            <StepBadge n="2" label="Add Items"        active={phase===1} done={phase>1} />
            <StepBadge n="3" label="Review Totals"    active={phase===2} done={phase>2} />
            <StepBadge n="4" label="Print &amp; Share"    active={phase===3} done={false} />
          </div>

          {/* Customer field */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:'.72rem', fontWeight:700, color:muted, letterSpacing:'.05em', display:'block', marginBottom:5 }}>CUSTOMER</label>
            <div style={{
              border: `1.5px solid ${partyDone ? P : border}`,
              borderRadius: 10, padding:'10px 14px', background: bg,
              fontSize:'.88rem', fontWeight:600, color: partyDone ? text : muted,
              minHeight: 40, display:'flex', alignItems:'center',
              transition: 'border-color .3s',
              boxShadow: partyDone ? `0 0 0 3px rgba(92,31,34,.12)` : 'none',
            }}>
              {partyText || <span style={{ color:dim }}>Search customer…</span>}
              {!partyDone && (
                <span style={{
                  display:'inline-block', width:2, height:14,
                  background: P, marginLeft:2,
                  animation:'blink 1s step-end infinite',
                }} />
              )}
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <label style={{ fontSize:'.72rem', fontWeight:700, color:muted, letterSpacing:'.05em' }}>ITEMS</label>
              <div style={{
                display:'flex', alignItems:'center', gap:4,
                fontSize:'.7rem', fontWeight:700, color:P, cursor:'default',
                opacity: phase >= 1 ? 1 : 0, transition:'opacity .3s',
              }}>
                <Plus size={11} /> ADD ITEM
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {ITEMS.map((item, idx) => {
                const visible = visibleItems > idx;
                return (
                  <Fade key={item.name} show={visible} delay={0}>
                    <div style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'9px 12px', background:bgAlt,
                      border:`1px solid ${visible ? 'rgba(92,31,34,.2)' : border}`,
                      borderRadius:9,
                    }}>
                      <div>
                        <div style={{ fontSize:'.82rem', fontWeight:700, color:text }}>{item.name}</div>
                        <div style={{ fontSize:'.7rem', color:muted, marginTop:1 }}>{item.qty} × {fmt(item.price)}</div>
                      </div>
                      <div style={{ fontSize:'.85rem', fontWeight:800, color:P }}>{fmt(rowTotal(item))}</div>
                    </div>
                  </Fade>
                );
              })}
              {visibleItems === 0 && (
                <div style={{ padding:'20px 12px', textAlign:'center', color:dim, fontSize:'.8rem', border:`1px dashed ${border}`, borderRadius:9 }}>
                  Items will appear here…
                </div>
              )}
            </div>
          </div>

          {/* Total box */}
          <Fade show={showTotal}>
            <div style={{
              background: isDark ? 'rgba(92,31,34,.15)' : 'rgba(92,31,34,.07)',
              border:`1px solid rgba(92,31,34,.25)`,
              borderRadius:11, padding:'13px 14px', marginBottom:16,
            }}>
              {[
                { label:'Subtotal', value:fmt(subtotal(shownItems)) },
                { label:'GST',      value:fmt(totalTax(shownItems)) },
              ].map(r => (
                <div key={r.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:'.82rem' }}>
                  <span style={{ color:muted }}>{r.label}</span>
                  <span style={{ color:text, fontWeight:600 }}>{r.value}</span>
                </div>
              ))}
              <div style={{ borderTop:`1px solid rgba(92,31,34,.2)`, marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontWeight:800, fontSize:'.9rem', background:GRAD, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Total</span>
                <span style={{ fontWeight:800, fontSize:'.95rem', background:GRAD, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>{fmt(grandTotal(shownItems))}</span>
              </div>
            </div>
          </Fade>

          {/* Action buttons */}
          <Fade show={showPrint}>
            <div style={{ display:'flex', gap:8 }}>
              <button style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'10px 0', borderRadius:10, border:'none', cursor:'default',
                background: flashPrint ? '#16a34a' : GRAD,
                color:'#fff', fontWeight:700, fontSize:'.8rem',
                boxShadow: flashPrint ? '0 4px 14px rgba(22,163,74,.4)' : '0 4px 14px rgba(92,31,34,.35)',
                transition:'all .4s ease',
              }}>
                {flashPrint ? <CheckCircle size={14}/> : <Printer size={14}/>}
                {flashPrint ? 'Printed!' : 'Print'}
              </button>
              <button style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'10px 0', borderRadius:10, border:'none', cursor:'default',
                background:'#25D366', color:'#fff', fontWeight:700, fontSize:'.8rem',
                boxShadow:'0 4px 14px rgba(37,211,102,.3)',
              }}>
                <MessageCircle size={14}/> WhatsApp
              </button>
              <button style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                padding:'10px 12px', borderRadius:10, cursor:'default',
                border:`1.5px solid ${border}`, background:bg,
                color:muted,
              }}>
                <FileDown size={14}/>
              </button>
            </div>
          </Fade>
        </div>
      </div>

      {/* ── RIGHT PANEL: invoice preview ── */}
      <div style={{
        flex:1, minWidth:0,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: isDark ? '0 24px 60px rgba(0,0,0,.4)' : '0 24px 60px rgba(92,31,34,.12)',
      }}>
        {/* Invoice header gradient bar */}
        <div style={{ background: GRAD, padding:'22px 24px 18px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:'1.1rem', fontWeight:900, color:'#fff', letterSpacing:'-.01em' }}>TAX INVOICE</div>
              <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.7)', marginTop:3, fontWeight:600 }}>Your Business Name</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.75)', fontWeight:600 }}>{INV_NO}</div>
              <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.6)', marginTop:2 }}>{DATE}</div>
            </div>
          </div>
        </div>

        <div style={{ padding:'20px 24px 24px' }}>
          {/* Bill to */}
          <Fade show={partyDone}>
            <div style={{ marginBottom:18, padding:'12px 14px', background:bgAlt, borderRadius:11, border:`1px solid ${border}` }}>
              <div style={{ fontSize:'.68rem', fontWeight:700, color:muted, letterSpacing:'.06em', marginBottom:6 }}>BILL TO</div>
              <div style={{ fontWeight:700, fontSize:'.9rem', color:text }}>{PARTY}</div>
              <div style={{ fontSize:'.78rem', color:muted, marginTop:2 }}>{PHONE}</div>
            </div>
          </Fade>

          {/* Items table */}
          <div style={{ marginBottom:16 }}>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr auto auto',
              gap:'4px 12px', padding:'6px 0',
              borderBottom:`1px solid ${border}`, marginBottom:6,
            }}>
              {['ITEM','QTY','AMOUNT'].map(h => (
                <span key={h} style={{ fontSize:'.65rem', fontWeight:700, color:dim, letterSpacing:'.06em' }}>{h}</span>
              ))}
            </div>

            {ITEMS.map((item, idx) => {
              const visible = visibleItems > idx;
              return (
                <Fade key={item.name} show={visible} delay={0}>
                  <div style={{
                    display:'grid', gridTemplateColumns:'1fr auto auto',
                    gap:'4px 12px', padding:'7px 0',
                    borderBottom:`1px solid ${border}`,
                  }}>
                    <div>
                      <div style={{ fontSize:'.83rem', fontWeight:600, color:text }}>{item.name}</div>
                      <div style={{ fontSize:'.7rem', color:muted }}>GST {item.tax}%</div>
                    </div>
                    <span style={{ fontSize:'.83rem', color:muted, alignSelf:'center' }}>{item.qty}</span>
                    <span style={{ fontSize:'.85rem', fontWeight:700, color:text, alignSelf:'center' }}>{fmt(rowTotal(item))}</span>
                  </div>
                </Fade>
              );
            })}
          </div>

          {/* Totals */}
          <Fade show={showTotal}>
            <div style={{ marginBottom:20 }}>
              {[
                { label:'Subtotal', value:fmt(subtotal(shownItems)), small:true },
                { label:'GST',      value:fmt(totalTax(shownItems)), small:true },
                { label:'Grand Total', value:fmt(grandTotal(shownItems)), small:false },
              ].map((r, i) => (
                <div key={r.label} style={{
                  display:'flex', justifyContent:'space-between',
                  padding: r.small ? '4px 0' : '10px 0 0',
                  borderTop: !r.small ? `1.5px solid ${border}` : 'none',
                  marginTop: !r.small ? 6 : 0,
                }}>
                  <span style={{ fontSize: r.small ? '.8rem' : '.92rem', color: r.small ? muted : text, fontWeight: r.small ? 500 : 800 }}>{r.label}</span>
                  <span style={{ fontSize: r.small ? '.8rem' : '.95rem', color: r.small ? muted : P, fontWeight: r.small ? 600 : 900 }}>{r.value}</span>
                </div>
              ))}
            </div>
          </Fade>

          {/* Footer note */}
          <Fade show={showPrint} delay={0.1}>
            <div style={{
              borderTop:`1px solid ${border}`, paddingTop:14,
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <div style={{ fontSize:'.72rem', color:dim, fontStyle:'italic' }}>Thank you for your business!</div>
              <div style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'5px 11px', borderRadius:100,
                background: flashPrint ? 'rgba(22,163,74,.1)' : 'rgba(92,31,34,.1)',
                border:`1px solid ${flashPrint ? 'rgba(22,163,74,.3)' : 'rgba(92,31,34,.25)'}`,
                transition:'all .4s',
              }}>
                {flashPrint
                  ? <><CheckCircle size={11} color="#16a34a"/><span style={{ fontSize:'.68rem', fontWeight:700, color:'#16a34a' }}>Sent!</span></>
                  : <><div style={{ width:6, height:6, borderRadius:'50%', background:P, animation:'pulse 1.5s ease-in-out infinite' }}/><span style={{ fontSize:'.68rem', fontWeight:700, color:P }}>Ready</span></>
                }
              </div>
            </div>
          </Fade>

          {/* Idle placeholder when nothing is shown yet */}
          {!partyDone && visibleItems === 0 && !showTotal && (
            <div style={{ textAlign:'center', padding:'20px 0', color:dim, fontSize:'.8rem' }}>
              <div style={{ marginBottom:8 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ height:10, background:border, borderRadius:5, marginBottom:8, width:`${90-i*15}%`, margin:'0 auto 8px', animation:`shimmer 1.8s ease-in-out ${i*0.2}s infinite` }} />
                ))}
              </div>
              Invoice preview will appear here
            </div>
          )}
        </div>
      </div>

      {/* keyframe animations */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
        @keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.15} }
        @media (max-width:700px) {
          .inv-demo-wrap { flex-direction:column !important; }
        }
      `}</style>
    </div>
  );
}
