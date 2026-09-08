import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Receipt, ShoppingCart, Users, Package, Wallet, BarChart3,
  Printer, UserCheck, Building2, CloudUpload, Globe, Shield,
  FileText, TrendingUp, CheckCircle, ArrowRight, Zap,
  Smartphone, Monitor, Tablet, Wifi, Star, ChevronDown,
  CreditCard, ArrowUpRight, Lock, ClipboardList, Download,
  Layers, Eye, Plus, AlignLeft,
  Scissors, Activity, Wrench, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { firestore } from './db';
import { doc, getDoc } from 'firebase/firestore';
import TallyKraftLogo from './TallyKraftLogo';
import FeatureDemos from './FeatureDemos';

/* ── accent (fixed regardless of theme) ── */
const P    = '#5c1f22';
const P2   = '#3f1417';
const GRAD = `linear-gradient(135deg, ${P} 0%, ${P2} 100%)`;

/* ── static data ── */
const FEATURES = [
  { icon: Receipt,      title: 'GST Invoicing',        desc: 'Create professional tax invoices instantly. Auto-calculate GST, discounts, and round-off.' },
  { icon: ShoppingCart, title: 'Purchase Management',  desc: 'Track supplier bills, manage purchase orders, and monitor outstanding payables.' },
  { icon: Users,        title: 'Party Ledger',         desc: 'Complete customer & vendor management with real-time balance tracking.' },
  { icon: Package,      title: 'Inventory Control',    desc: 'Real-time stock tracking with item-level pricing, units, and barcode support.' },
  { icon: Wallet,       title: 'Payment Tracking',     desc: 'Record payment-in and payment-out. Know who owes you and what you owe.' },
  { icon: BarChart3,    title: 'Financial Reports',    desc: 'Profit & Loss, balance sheet, GST reports — all at a single click.' },
  { icon: Printer,      title: 'Print & Share',        desc: 'Print A4/thermal bills or share as PDF/image via WhatsApp in seconds.' },
  { icon: UserCheck,    title: 'Staff Management',     desc: 'Add staff with custom permissions. Control what each person can see or do.' },
  { icon: Building2,    title: 'Multi-Business',       desc: 'Run multiple businesses from one account. Switch between them instantly.' },
  { icon: CloudUpload,  title: 'Cloud Backup',         desc: 'Your data syncs to the cloud automatically. Never lose a record again.' },
  { icon: Globe,        title: 'Any Device, Anywhere', desc: 'Open on any phone, tablet, or desktop — all you need is a browser and internet.' },
  { icon: FileText,     title: 'Estimates & Notes',    desc: 'Send quotations, credit notes, debit notes, and delivery notes professionally.' },
  { icon: Layers,        title: 'Custom Sections & Fields',          desc: 'Build any form your business needs — eye exams, tailoring measurements, gym records, clinic notes, and more.' },
  { icon: Lock,          title: 'Complete Offline Mode (if Needed)', desc: 'Keep all data on your device only. No cloud sync — full privacy, works without internet.' },
  { icon: ClipboardList, title: 'Auditor Login',                     desc: 'Give your CA or auditor a secure PIN. They log in, view reports, and export what they need — no owner involvement.' },
];

const STEPS = [
  { n: '01', title: 'Sign In',         desc: 'Log in with your Google account in one click. No lengthy registration.' },
  { n: '02', title: 'Set Up Business', desc: 'Enter your business details, logo, and GSTIN. Ready in under 2 minutes.' },
  { n: '03', title: 'Start Billing',   desc: "Add parties, items, and create your first invoice. It's that simple." },
];

const PLAN_FEATURES = [
  'Covers 1 business',
  'Every feature unlocked',
  'Unlimited invoices, POS, purchases & expenses',
  'GST reports & party ledgers',
  'Custom section builder',
  'Export to Excel & Tally XML',
  'Online cloud backup & restore',
  'Access & sync from any device',
  'Staff accounts with permissions',
  'WhatsApp bill sharing & barcode scanning',
];

/* ── carousel examples ── */
const EXAMPLES = [
  {
    badge:'OPTICALS SHOP', icon:Eye, color:'#6b5550',
    sectionTitle:'Eye Examination', heading:'Eye Exam + Order Tracking',
    desc:'Track every prescription linked to the customer. Store Right/Left eye readings, PD, Add power, frame choice, and lens type — printable as a prescription slip.',
    tabs:['Exam Details','Order Details'],
    topFields:[{label:'Customer',value:'John Mathew',accent:true},{label:'Date',value:'15/05/2025'}],
    detailGroup:{leftLabel:'RIGHT EYE (OD)',rightLabel:'LEFT EYE (OS)',leftRows:[['SPH','-1.50'],['CYL','-0.50'],['AXIS','180°']],rightRows:[['SPH','-2.00'],['CYL','-0.75'],['AXIS','175°']]},
    midFields:[{label:'Add Power',value:'+1.25'},{label:'PD (mm)',value:'62'}],
    notes:'Advised to wear glasses while driving.',
    records:[{name:'Priya S.',meta:'−1.00 / −1.25',date:'10 May'},{name:'Ravi K.',meta:'−0.75 / −0.50',date:'08 May'},{name:'Anita M.',meta:'−2.50 / −2.00',date:'06 May'}],
  },
  {
    badge:'TAILORING SHOP', icon:Scissors, color:'#f472b6',
    sectionTitle:'Tailoring Measurements', heading:'Customer Measurements + Order Details',
    desc:"Record each customer's exact measurements and delivery timeline. Never lose a measurement — every stitch detail saved and linked to the party ledger.",
    tabs:['Measurements','Order Details'],
    topFields:[{label:'Customer',value:'Suresh Pillai',accent:true},{label:'Delivery',value:'20/05/2025'}],
    detailGroup:{leftLabel:'UPPER BODY',rightLabel:'LOWER BODY',leftRows:[['Chest','40"'],['Shoulder','17"'],['Sleeve','25"']],rightRows:[['Waist','34"'],['Hip','38"'],['Length','42"']]},
    midFields:[{label:'Collar',value:'15.5"'},{label:'Fit Style',value:'Slim Fit'}],
    notes:'Customer prefers slim fit. Use interlock lining.',
    records:[{name:'Arjun T.',meta:'Blazer + Shirt',date:'11 May'},{name:'Maria J.',meta:'Salwar Kameez',date:'09 May'},{name:'Kumar R.',meta:'3-Piece Suit',date:'07 May'}],
  },
  {
    badge:'CLINIC / DOCTOR', icon:Activity, color:'#34d399',
    sectionTitle:'Patient Consultation', heading:'Patient Records + Prescriptions',
    desc:"Maintain complete consultation history for every patient. Vitals, diagnosis, prescriptions — all in one place, linked to the patient's ledger.",
    tabs:['Vitals & Symptoms','Prescription'],
    topFields:[{label:'Patient',value:'Deepa Nair',accent:true},{label:'Date',value:'15/05/2025'}],
    detailGroup:{leftLabel:'VITALS',rightLabel:'READINGS',leftRows:[['BP','120/80'],['Temp','98.6°F'],['Weight','62 kg']],rightRows:[['SpO2','98%'],['Pulse','72 bpm'],['Blood Grp','B+']]},
    midFields:[{label:'Diagnosis',value:'Viral Fever'},{label:'Follow-up',value:'22/05/2025'}],
    notes:'Prescribed paracetamol 500mg. Rest advised for 3 days.',
    records:[{name:'Ramesh P.',meta:'Diabetes Review',date:'12 May'},{name:'Latha S.',meta:'General Checkup',date:'10 May'},{name:'Babu N.',meta:'Hypertension',date:'08 May'}],
  },
  {
    badge:'GYM / FITNESS', icon:Zap, color:'#fb923c',
    sectionTitle:'Member Progress', heading:'Body Metrics + Workout Tracking',
    desc:"Track each member's body measurements and fitness milestones. Know their goal, package, and progress at a glance — session by session.",
    tabs:['Body Metrics','Workout Plan'],
    topFields:[{label:'Member',value:'Arun Menon',accent:true},{label:'Date',value:'15/05/2025'}],
    detailGroup:{leftLabel:'BODY METRICS',rightLabel:'MEASUREMENTS',leftRows:[['Weight','78 kg'],['Body Fat','18%'],['BMI','24.2']],rightRows:[['Chest','40"'],['Waist','34"'],['Arms','14"']]},
    midFields:[{label:'Goal',value:'Weight Loss'},{label:'Package',value:'3 Months'}],
    notes:'Target: lose 5 kg in 2 months. Cardio 4×/week.',
    records:[{name:'Pradeep K.',meta:'Muscle Gain',date:'13 May'},{name:'Sneha R.',meta:'Weight Loss',date:'11 May'},{name:'Manu T.',meta:'Maintenance',date:'09 May'}],
  },
  {
    badge:'SERVICE CENTRE', icon:Wrench, color:'#60a5fa',
    sectionTitle:'Job Card / Repair', heading:'Repair Orders + Job Card Tracking',
    desc:'Manage every repair job from intake to delivery. Track device, complaint, technician, status, and estimated cost — all linked to the customer.',
    tabs:['Device Info','Service Details'],
    topFields:[{label:'Customer',value:'Vijay Kumar',accent:true},{label:'Date In',value:'15/05/2025'}],
    detailGroup:{leftLabel:'DEVICE',rightLabel:'JOB STATUS',leftRows:[['Brand','Samsung'],['Model','A54'],['IMEI','352···890']],rightRows:[['Complaint','Screen Crack'],['Status','In Progress'],['Est. Cost','₹3,500']]},
    midFields:[{label:'Technician',value:'Manoj R.'},{label:'Delivery',value:'17/05/2025'}],
    notes:'Screen replacement + camera cleaning. Backup taken.',
    records:[{name:'Ajith P.',meta:'iPhone 13 — Battery',date:'13 May'},{name:'Divya M.',meta:'Laptop — Keyboard',date:'11 May'},{name:'Sajan K.',meta:'TV — No Display',date:'09 May'}],
  },
  {
    badge:'SALON / PARLOUR', icon:Star, color:'#e879f9',
    sectionTitle:'Treatment Record', heading:'Treatment History + Client Profile',
    desc:"Maintain a full treatment card for every client. Know their skin type, preferred products, allergies, and service history at every visit.",
    tabs:['Treatment Details','Products Used'],
    topFields:[{label:'Customer',value:'Nithya Krishnan',accent:true},{label:'Date',value:'15/05/2025'}],
    detailGroup:{leftLabel:'SERVICE',rightLabel:'CLIENT PROFILE',leftRows:[['Treatment','Facial + Hair Spa'],['Duration','90 min'],['Therapist','Rekha']],rightRows:[['Skin Type','Combination'],['Allergies','None'],['Hair Type','Wavy']]},
    midFields:[{label:'Package',value:'Premium'},{label:'Next Visit',value:'15/06/2025'}],
    notes:'Prefers organic products. Avoid sulfate-based shampoos.',
    records:[{name:'Meera V.',meta:'Bridal Package',date:'14 May'},{name:'Asha T.',meta:'Hair Colouring',date:'12 May'},{name:'Priya K.',meta:'Mani + Pedi',date:'10 May'}],
  },
];

/* ─────────────── hooks ─────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function useCounter(target, inView, duration = 1400) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const prog = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setCount(Math.floor(ease * target));
      if (prog < 1) frame = requestAnimationFrame(tick);
      else setCount(target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, target, duration]);
  return count;
}

/* ─────────────── component ─────────────── */
export default function LandingPage({ onLoginClick }) {
  const [scrolled, setScrolled]           = useState(false);
  const [activeExample, setActiveExample] = useState(0);
  const [isDark, setIsDark]               = useState(() => localStorage.getItem('tallykraft_landing_dark') === 'true');
  const [expandedFeat, setExpandedFeat]   = useState(null);
  const featRef    = useRef(null);
  const carouselId = useRef(null);

  /* scroll-reveal refs */
  const [deviceRef,  deviceIn]  = useInView(0.2);
  const [featHdRef,  featHdIn]  = useInView(0.2);
  const [featDemoRef, featDemoIn] = useInView(0.1);
  const [stepsRef,   stepsIn]   = useInView(0.2);
  const [pricingRef, pricingIn] = useInView(0.15);
  const [offlineRef, offlineIn] = useInView(0.2);
  const [auditorRef, auditorIn] = useInView(0.2);
  const [statsRef,   statsIn]   = useInView(0.4);

  /* animated counters */
  const cInvoices = useCounter(50000, statsIn, 1600);
  const cBiz      = useCounter(3000,  statsIn, 1800);

  /* Sync theme from Firestore on mount (admin may have changed it) */
  useEffect(() => {
    getDoc(doc(firestore, 'globalConfig', 'landing'))
      .then(snap => {
        if (snap.exists()) {
          const dark = snap.data().theme === 'dark';
          setIsDark(dark);
          localStorage.setItem('tallykraft_landing_dark', dark ? 'true' : 'false');
        }
      })
      .catch(() => {});
  }, []);

  /* Auto-advance carousel every 3 s; resets when user manually picks a slide */
  const startCarousel = useCallback(() => {
    clearInterval(carouselId.current);
    carouselId.current = setInterval(() => setActiveExample(i => (i + 1) % EXAMPLES.length), 3000);
  }, []);

  useEffect(() => { startCarousel(); return () => clearInterval(carouselId.current); }, [startCarousel]);

  const goToExample = useCallback((idx) => {
    setActiveExample(typeof idx === 'function' ? idx : () => idx);
    startCarousel();
  }, [startCarousel]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth' });

  /* ── theme palette ── */
  const C = isDark ? {
    bg:           '#07080f',
    bgAlt:        'rgba(255,255,255,0.015)',
    card:         'rgba(255,255,255,0.045)',
    border:       'rgba(255,255,255,0.09)',
    text:         '#ffffff',
    soft:         'rgba(255,255,255,0.78)',
    muted:        'rgba(255,255,255,0.48)',
    dim:          'rgba(255,255,255,0.36)',
    faint:        'rgba(255,255,255,0.22)',
    navBg:        'rgba(7,8,15,0.9)',
    navBorder:    'rgba(255,255,255,0.07)',
    priceSep:     'rgba(255,255,255,0.08)',
    stepNum:      'rgba(255,255,255,0.06)',
    gridLine:     'rgba(255,255,255,0.025)',
    scroll:       '#374151',
    outlineBtn:   'rgba(255,255,255,0.06)',
    outlineBdr:   'rgba(255,255,255,0.14)',
    outlineHover: 'rgba(255,255,255,0.11)',
    devBanner:    'rgba(92,31,34,0.07)',
    heroBg:       'radial-gradient(ellipse at bottom,#1b2735 0%,#090a0f 100%)',
    sectionAlt:   'rgba(255,255,255,0.015)',
    cardShadow:   'none',
    footerText:   'rgba(255,255,255,0.28)',
    footerBrand:  'rgba(255,255,255,0.5)',
    mockBg:       'rgba(15,17,26,0.95)',
    mockField:    'rgba(255,255,255,0.06)',
    mockFieldBdr: 'rgba(255,255,255,0.1)',
    mockCol:      'rgba(255,255,255,0.04)',
    mockColBdr:   'rgba(255,255,255,0.09)',
    mockHr:       'rgba(255,255,255,0.07)',
    mockLabel:    'rgba(255,255,255,0.38)',
    mockVal:      'rgba(255,255,255,0.88)',
    mockColHead:  'rgba(255,255,255,0.32)',
    mockRowLabel: 'rgba(255,255,255,0.38)',
    mockNotesTxt: 'rgba(255,255,255,0.6)',
    mockRecMeta:  'rgba(255,255,255,0.38)',
    mockRecDate:  'rgba(255,255,255,0.25)',
    mockRecHead:  'rgba(255,255,255,0.22)',
    mockTabInact: 'rgba(255,255,255,0.3)',
    mockSubtitle: 'rgba(255,255,255,0.35)',
    pillInact:    'rgba(255,255,255,0.05)',
    pillInactBdr: 'rgba(255,255,255,0.1)',
    pillInactTxt: 'rgba(255,255,255,0.5)',
    priceLbl:     'rgba(255,255,255,0.42)',
    priceSub:     'rgba(255,255,255,0.38)',
  } : {
    bg:           '#f6efe9',
    bgAlt:        '#ffffff',
    card:         '#ffffff',
    border:       '#e8ddd6',
    text:         '#3f1417',
    soft:         '#5c1f22',
    muted:        '#6b5550',
    dim:          '#9c8a84',
    faint:        '#ddd0c9',
    navBg:        'rgba(255,255,255,0.92)',
    navBorder:    '#e8ddd6',
    priceSep:     '#e8ddd6',
    stepNum:      'rgba(63,20,23,0.05)',
    gridLine:     'rgba(92,31,34,0.05)',
    scroll:       '#ddd0c9',
    outlineBtn:   'rgba(92,31,34,0.06)',
    outlineBdr:   'rgba(92,31,34,0.25)',
    outlineHover: 'rgba(92,31,34,0.1)',
    devBanner:    'rgba(92,31,34,0.06)',
    heroBg:       'linear-gradient(135deg,#faf7f4 0%,#f6efe9 55%,#f3ece4 100%)',
    sectionAlt:   '#ffffff',
    cardShadow:   '0 2px 12px rgba(63,20,23,0.07)',
    footerText:   '#9c8a84',
    footerBrand:  '#6b5550',
    mockBg:       '#1e2130',
    mockField:    'rgba(255,255,255,0.07)',
    mockFieldBdr: 'rgba(255,255,255,0.12)',
    mockCol:      'rgba(255,255,255,0.05)',
    mockColBdr:   'rgba(255,255,255,0.1)',
    mockHr:       'rgba(255,255,255,0.08)',
    mockLabel:    'rgba(255,255,255,0.4)',
    mockVal:      'rgba(255,255,255,0.9)',
    mockColHead:  'rgba(255,255,255,0.35)',
    mockRowLabel: 'rgba(255,255,255,0.4)',
    mockNotesTxt: 'rgba(255,255,255,0.62)',
    mockRecMeta:  'rgba(255,255,255,0.4)',
    mockRecDate:  'rgba(255,255,255,0.28)',
    mockRecHead:  'rgba(255,255,255,0.25)',
    mockTabInact: 'rgba(255,255,255,0.32)',
    mockSubtitle: 'rgba(255,255,255,0.38)',
    pillInact:    'rgba(63,20,23,0.05)',
    pillInactBdr: '#e8ddd6',
    pillInactTxt: '#6b5550',
    priceLbl:     '#6b5550',
    priceSub:     '#9c8a84',
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", overflowX: 'hidden', transition:'background .3s,color .3s' }}>

      {/* ── Global styles + responsive overrides ── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        /* animations */
        @keyframes floatA     { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-60px,70px)} }
        @keyframes floatB     { 0%,100%{transform:translate(0,0)} 50%{transform:translate(70px,-60px)} }
        @keyframes floatC     { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-40px,-50px)} }
        @keyframes pulse      { 0%,100%{opacity:.45} 50%{opacity:.85} }
        @keyframes fadeUp     { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer    { from{background-position:200% center} to{background-position:-200% center} }
        @keyframes mockFade   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp    { from{opacity:0;transform:translateY(44px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideLeft  { from{opacity:0;transform:translateX(36px)} to{opacity:1;transform:translateX(0)} }
        @keyframes slideRight { from{opacity:0;transform:translateX(-36px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scaleIn    { from{opacity:0;transform:scale(.92)} to{opacity:1;transform:scale(1)} }
        @keyframes popIn      { 0%{opacity:0;transform:scale(.7)} 70%{transform:scale(1.06)} 100%{opacity:1;transform:scale(1)} }
        @keyframes floatChip  { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-14px) rotate(1.5deg)} }
        @keyframes floatChip2 { 0%,100%{transform:translateY(0) rotate(2deg)} 50%{transform:translateY(-10px) rotate(-2deg)} }
        @keyframes floatChip3 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-18px) rotate(1deg)} }
        @keyframes twinkle    { 0%,100%{opacity:.15;transform:scale(.7)} 50%{opacity:.6;transform:scale(1.1)} }
        @keyframes marquee    { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes drawLine   { from{width:0} to{width:100%} }
        @keyframes glowPulse  { 0%,100%{box-shadow:0 0 0 0 rgba(92,31,34,.4)} 50%{box-shadow:0 0 0 12px rgba(92,31,34,0)} }

        .fade-up   { animation: fadeUp .7s ease both; }
        .fade-up-2 { animation: fadeUp .7s .15s ease both; }
        .fade-up-3 { animation: fadeUp .7s .30s ease both; }
        .mock-fade { animation: mockFade .35s ease both; }

        /* scroll-reveal base — transitions kick in when .in-view is added */
        .reveal       { opacity:0; transform:translateY(40px); transition:opacity .75s cubic-bezier(.22,1,.36,1),transform .75s cubic-bezier(.22,1,.36,1); }
        .reveal.in-view{ opacity:1; transform:translateY(0); }
        .reveal-l     { opacity:0; transform:translateX(-36px); transition:opacity .75s cubic-bezier(.22,1,.36,1),transform .75s cubic-bezier(.22,1,.36,1); }
        .reveal-l.in-view{ opacity:1; transform:translateX(0); }
        .reveal-r     { opacity:0; transform:translateX(36px); transition:opacity .75s cubic-bezier(.22,1,.36,1),transform .75s cubic-bezier(.22,1,.36,1); }
        .reveal-r.in-view{ opacity:1; transform:translateX(0); }
        .reveal-scale { opacity:0; transform:scale(.93); transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1); }
        .reveal-scale.in-view{ opacity:1; transform:scale(1); }

        /* stagger helpers */
        .d1{transition-delay:.05s!important} .d2{transition-delay:.15s!important}
        .d3{transition-delay:.25s!important} .d4{transition-delay:.38s!important}
        .d5{transition-delay:.52s!important} .d6{transition-delay:.68s!important}

        /* interactive states */
        .login-btn { transition: transform .25s, box-shadow .25s; }
        .login-btn:hover { transform:translateY(-2px); box-shadow:0 10px 30px rgba(92,31,34,.55)!important; }

        .feat-card { transition: transform .3s, box-shadow .3s, border-color .3s; }
        .feat-card:hover { transform:translateY(-5px); border-color:rgba(92,31,34,.45)!important; box-shadow:0 8px 28px rgba(92,31,34,.14)!important; }
        .feat-header  { display:flex; align-items:center; gap:14px; }
        .feat-chevron { display:none; margin-left:auto; flex-shrink:0; transition:transform .22s; }
        .feat-desc    { margin-top:12px; }

        /* shimmer headline */
        .grad-text {
          background: linear-gradient(90deg,#c8a04e,#e6d3a8,#9c8a84,#c8a04e);
          background-size: 300% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 6s linear infinite;
        }

        /* check-item */
        .check-item { display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; font-size:.92rem; color:${C.soft}; line-height:1.5; }

        /* scrollbar */
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${C.scroll}; border-radius:3px; }

        /* ── hero ── */
        .hero-section { padding: 128px 24px 80px; }
        .hero-btns    { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; }
        .hero-btn-primary, .hero-btn-outline { width: auto; }
        .stat-strip   { display:flex; gap:40px; justify-content:center; flex-wrap:wrap; margin-top:52px; }

        /* ── navbar ── */
        .nav-links { display:flex; gap:32px; align-items:center; }

        /* ── device banner ── */
        .device-banner-inner { display:flex; align-items:center; gap:28px; flex-wrap:wrap; justify-content:center; }
        .device-divider { height:1px; flex:1; min-width:32px; background:${C.border}; }

        /* ── features ── */
        .feat-section { padding: 96px 24px; }
        .feat-grid    { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }

        /* ── steps ── */
        .step-section { padding: 80px 24px; }
        .step-grid    { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:20px; }

        /* ── pricing ── */
        .pricing-section { padding: 96px 24px; }
        .pricing-card    { padding: 44px 40px; }
        .price-blocks  { display:flex; gap:0; justify-content:center; flex-wrap:nowrap; margin-bottom:32px; }
        .price-block-1 { flex:1; min-width:0; padding:0 24px; border-right:1px solid ${C.priceSep}; text-align:center; }
        .price-block-2 { flex:1; min-width:0; padding:0 24px; text-align:center; }
        .price-plus    { display:flex; align-items:center; padding:0 12px; font-size:1.6rem; color:${C.faint}; font-weight:300; flex-shrink:0; }
        .price-amount  { font-size:3.2rem; font-weight:900; line-height:1; letter-spacing:-.03em; color:${C.text}; }
        .includes-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:2px 20px; text-align:left; margin-bottom:32px; }

        /* ── custom sections ── */
        .custom-split      { display:flex; gap:56px; align-items:flex-start; flex-wrap:wrap; }
        .custom-split-text { flex:1 1 280px; }
        .custom-split-mock { flex:1 1 360px; min-width:0; }
        .mock-field-row  { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
        .mock-field      { background:${C.mockField}; border:1px solid ${C.mockFieldBdr}; border-radius:8px; padding:7px 10px; }
        .mock-field-label{ font-size:.62rem; color:${C.mockLabel}; font-weight:700; letter-spacing:.06em; text-transform:uppercase; margin-bottom:2px; }
        .mock-field-val  { font-size:.82rem; color:${C.mockVal}; font-weight:600; }
        .mock-eye-grid   { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
        .mock-eye-col    { background:${C.mockCol}; border:1px solid ${C.mockColBdr}; border-radius:10px; padding:10px 12px; }
        .mock-record-row { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; border-radius:8px; }
        .mock-record-row:hover { background:rgba(92,31,34,.1); }

        /* carousel */
        .carousel-nav-btn { background:${C.card}; border:1px solid ${C.border}; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .2s,border-color .2s; flex-shrink:0; box-shadow:${C.cardShadow}; }
        .carousel-nav-btn:hover { border-color:${P}; }

        /* desktop-only / mobile-only visibility */
        .carousel-desktop { display:flex; }
        .carousel-mobile  { display:none; }

        /* ── footer ── */
        .site-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; }

        /* hide floating chips on any screen too narrow to show them cleanly */
        @media (max-width:899px) {
          .hero-chip { display:none !important; }
        }

        /* ════════════ MOBILE (≤639px) ════════════ */
        @media (max-width:639px) {
          .nav-links { display:none !important; }
          .hero-section { padding:96px 18px 60px !important; }
          .hero-btns    { flex-direction:column !important; gap:12px !important; }
          .hero-btn-primary,.hero-btn-outline { width:100% !important; justify-content:center !important; }
          .stat-strip   { gap:20px !important; margin-top:36px !important; }
          .device-banner-inner { flex-direction:column !important; gap:20px !important; text-align:center !important; }
          .device-divider { display:none !important; }
          .feat-section { padding:60px 16px !important; }
          .feat-grid       { grid-template-columns:1fr 1fr !important; gap:8px !important; }
          .feat-card       { padding:16px 12px !important; cursor:pointer; text-align:center; }
          .feat-card:hover { transform:none !important; }
          .feat-header     { flex-direction:column !important; align-items:center !important; gap:8px !important; }
          .feat-icon       { width:36px !important; height:36px !important; border-radius:9px !important; }
          .feat-title      { font-size:.8rem !important; line-height:1.3 !important; }
          .feat-chevron    { display:none !important; }
          .feat-desc       { display:none; text-align:left; }
          .feat-desc--open { display:block !important; margin-top:10px; padding-top:10px; border-top:1px solid ${C.border}; }
          .step-section { padding:56px 16px !important; }
          .step-grid    { grid-template-columns:1fr !important; gap:12px !important; }
          .pricing-section { padding:60px 16px !important; }
          .pricing-card    { padding:28px 18px !important; }
          .price-blocks  { flex-direction:column !important; align-items:center !important; gap:0 !important; }
          .price-block-1 { border-right:none !important; border-bottom:1px solid ${C.priceSep} !important; padding:0 0 20px !important; width:100% !important; }
          .price-block-2 { padding:20px 0 0 !important; width:100% !important; }
          .price-plus    { display:none !important; }
          .price-amount  { font-size:2.8rem !important; }
          .includes-grid { grid-template-columns:1fr !important; }
          /* pill nav: horizontal scroll */
          .pill-nav { overflow-x:auto !important; flex-wrap:nowrap !important; justify-content:flex-start !important; padding:0 16px 8px !important; margin:0 -24px 36px !important; scrollbar-width:none; gap:6px !important; }
          .pill-nav::-webkit-scrollbar { display:none; }
          /* show mobile card, hide desktop split */
          .carousel-desktop { display:none !important; }
          .carousel-mobile  { display:block !important; }
          /* desktop-specific helpers still needed for mock-field-row */
          .mock-field-row { grid-template-columns:1fr !important; }
          .mock-eye-grid  { grid-template-columns:1fr !important; }
          .cta-section { padding:60px 18px !important; }
          .cta-btn     { width:100% !important; justify-content:center !important; }
          .site-footer { flex-direction:column !important; align-items:center !important; text-align:center !important; gap:10px !important; }
        }

        /* ════════════ SMALL TABLET (640–767px) ════════════ */
        @media (min-width:640px) and (max-width:767px) {
          .feat-grid    { grid-template-columns:repeat(2,1fr) !important; }
          .step-grid    { grid-template-columns:1fr !important; }
          .price-amount { font-size:2.8rem !important; }
        }
      `}</style>

      {/* ══════════════ NAVBAR ══════════════ */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:999,
        padding:'0 20px', height:60,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        background: scrolled ? C.navBg : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? `1px solid ${C.navBorder}` : 'none',
        transition:'all .35s ease',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, flexShrink:0 }}>
          <TallyKraftLogo size={48} />
          <span style={{ fontWeight:800, fontSize:'1.05rem', letterSpacing:'.04em', color:C.text }}>TALLYKRAFT</span>
        </div>

        <div className="nav-links">
          {[['Features', () => scrollTo(featRef)], ['Pricing', () => document.getElementById('pricing')?.scrollIntoView({ behavior:'smooth' })]].map(([label, fn]) => (
            <a key={label} href="#" onClick={e => { e.preventDefault(); fn(); }}
              style={{ color:C.muted, fontSize:'.88rem', textDecoration:'none', fontWeight:500 }}>{label}</a>
          ))}
        </div>

        <button className="login-btn" onClick={onLoginClick} style={{
          background:GRAD, border:'none', borderRadius:10,
          color:'#fff', fontWeight:700, fontSize:'.88rem',
          padding:'8px 20px', cursor:'pointer',
          boxShadow:'0 4px 14px rgba(92,31,34,.35)', flexShrink:0,
        }}>Login →</button>
      </nav>

      {/* ══════════════ HERO ══════════════ */}
      <section className="hero-section" style={{ position:'relative', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', overflow:'hidden', background:C.heroBg }}>

        {/* Animated orbs */}
        <div style={{ position:'absolute', top:'15%', left:'8%', width:'42vw', height:'42vw', maxWidth:500, maxHeight:500, background:'radial-gradient(circle,rgba(92,31,34,.18) 0%,transparent 70%)', borderRadius:'50%', filter:'blur(70px)', animation:'floatA 18s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'8%', right:'6%', width:'46vw', height:'46vw', maxWidth:560, maxHeight:560, background:'radial-gradient(circle,rgba(92,31,34,.15) 0%,transparent 70%)', borderRadius:'50%', filter:'blur(88px)', animation:'floatB 22s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'52%', left:'45%', width:'30vw', height:'30vw', maxWidth:360, maxHeight:360, background:'radial-gradient(circle,rgba(200,160,78,.1) 0%,transparent 70%)', borderRadius:'50%', filter:'blur(60px)', animation:'floatC 16s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(${C.gridLine} 1px,transparent 1px),linear-gradient(90deg,${C.gridLine} 1px,transparent 1px)`, backgroundSize:'48px 48px', opacity:.7, pointerEvents:'none' }} />

        {/* floating particle dots */}
        {[[12,22,6,'#5c1f22',7],[88,14,4,'#5c1f22',11],[6,68,5,'#c8a04e',9],[92,72,4,'#c8a04e',8],[50,88,3,'#5c1f22',13],[78,42,5,'#5c1f22',6],[20,48,3,'#c8a04e',10]].map(([x,y,r,c,d],i)=>(
          <div key={i} style={{ position:'absolute', left:`${x}%`, top:`${y}%`, width:r*2, height:r*2, borderRadius:'50%', background:c, opacity:.25, animation:`twinkle ${d}s ease-in-out ${i*.7}s infinite`, pointerEvents:'none' }} />
        ))}

        {/* floating data chips — hidden below 900px where they clash with hero text */}
        <div className="hero-chip" style={{ position:'absolute', top:'18%', right:'7%', background:isDark?'rgba(15,17,26,.85)':'rgba(255,255,255,.88)', backdropFilter:'blur(12px)', border:'1px solid rgba(92,31,34,.3)', borderRadius:14, padding:'10px 16px', boxShadow:'0 8px 28px rgba(92,31,34,.18)', animation:'floatChip 7s ease-in-out infinite', pointerEvents:'none', zIndex:1 }}>
          <div style={{ fontSize:'.62rem', color:P, fontWeight:700, letterSpacing:'.07em', marginBottom:3 }}>INVOICE CREATED</div>
          <div style={{ fontSize:'.88rem', fontWeight:800, color:isDark?'#fff':'#3f1417' }}>₹1,24,500</div>
          <div style={{ fontSize:'.65rem', color:isDark?'rgba(255,255,255,.4)':'#9c8a84', marginTop:2 }}>INV-2025-0042 · GST 18%</div>
        </div>

        <div className="hero-chip" style={{ position:'absolute', bottom:'24%', left:'5%', background:isDark?'rgba(15,17,26,.85)':'rgba(255,255,255,.88)', backdropFilter:'blur(12px)', border:'1px solid rgba(37,211,102,.35)', borderRadius:14, padding:'10px 16px', boxShadow:'0 8px 28px rgba(37,211,102,.15)', animation:'floatChip2 9s ease-in-out 1.2s infinite', pointerEvents:'none', zIndex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#25D366', animation:'pulse 2s infinite' }} />
            <span style={{ fontSize:'.65rem', fontWeight:700, color:'#16a34a' }}>SENT VIA WHATSAPP</span>
          </div>
          <div style={{ fontSize:'.82rem', fontWeight:700, color:isDark?'#fff':'#3f1417', marginTop:4 }}>Ravi Kumar Enterprises</div>
        </div>

        <div className="hero-chip" style={{ position:'absolute', top:'60%', right:'4%', background:isDark?'rgba(15,17,26,.85)':'rgba(255,255,255,.88)', backdropFilter:'blur(12px)', border:'1px solid rgba(92,31,34,.3)', borderRadius:14, padding:'10px 16px', boxShadow:'0 8px 28px rgba(92,31,34,.15)', animation:'floatChip3 8s ease-in-out 2s infinite', pointerEvents:'none', zIndex:1 }}>
          <div style={{ fontSize:'.62rem', color:P2, fontWeight:700, letterSpacing:'.07em', marginBottom:3 }}>STOCK UPDATED</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ fontSize:'.85rem', fontWeight:800, color:isDark?'#fff':'#3f1417' }}>234 units</div>
            <div style={{ fontSize:'.68rem', color:'#16a34a', fontWeight:700, background:'rgba(22,163,74,.1)', borderRadius:100, padding:'1px 7px' }}>↑ In stock</div>
          </div>
        </div>

        <div style={{ position:'relative', zIndex:2, maxWidth:820, width:'100%' }}>
          <div className="fade-up" style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(92,31,34,.12)', border:'1px solid rgba(92,31,34,.25)', borderRadius:100, padding:'5px 15px', marginBottom:24 }}>
            <Zap size={12} color={P} />
            <span style={{ fontSize:'.75rem', fontWeight:700, color:P, letterSpacing:'.06em' }}>PREMIUM BUSINESS ACCOUNTING</span>
          </div>

          <h1 className="fade-up-2" style={{ fontSize:'clamp(2.1rem,6vw,4rem)', fontWeight:900, lineHeight:1.1, margin:'0 0 20px', letterSpacing:'-.025em', color:C.text }}>
            Run Your Business<br />
            <span className="grad-text">Smarter. Faster. Anywhere.</span>
          </h1>

          <p className="fade-up-3" style={{ fontSize:'clamp(.95rem,2.5vw,1.18rem)', color:C.muted, lineHeight:1.72, maxWidth:580, margin:'0 auto 40px' }}>
            TallyKraft is an all-in-one accounting platform for Indian businesses — invoicing, inventory, GST reports, staff management and more. Works on <strong style={{ color:C.text }}>any device with a browser</strong>, no installs ever.
          </p>

          <div className="fade-up-3 hero-btns">
            <button className="login-btn hero-btn-primary" onClick={onLoginClick} style={{
              background:GRAD, border:'none', borderRadius:13,
              color:'#fff', fontWeight:800, fontSize:'1rem',
              padding:'14px 32px', cursor:'pointer',
              boxShadow:'0 6px 22px rgba(92,31,34,.4)',
              display:'flex', alignItems:'center', gap:8,
            }}>
              Get Started Free <ArrowRight size={17} />
            </button>
            <button onClick={() => scrollTo(featRef)} style={{
              background:C.outlineBtn, border:`1px solid ${C.outlineBdr}`,
              borderRadius:13, color:C.text, fontWeight:700, fontSize:'1rem',
              padding:'14px 28px', cursor:'pointer',
              display:'flex', alignItems:'center', gap:8, transition:'background .2s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.outlineHover}
              onMouseLeave={e => e.currentTarget.style.background = C.outlineBtn}
            >
              See Features <ChevronDown size={16} />
            </button>
          </div>

          <div className="stat-strip" ref={statsRef}>
            {[
              { val: `${cInvoices.toLocaleString('en-IN')}+`, label:'Invoices Generated' },
              { val: `${cBiz.toLocaleString('en-IN')}+`,     label:'Businesses Onboarded' },
              { val: '100%', label:'Web-based, no install' },
              { val: '∞',    label:'Unlimited Records' },
            ].map((s,i) => (
              <div key={s.label} className={`reveal d${i+1}${statsIn?' in-view':''}`} style={{ textAlign:'center' }}>
                <div style={{ fontSize:'1.8rem', fontWeight:900, background:GRAD, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', letterSpacing:'-.02em' }}>{s.val}</div>
                <div style={{ fontSize:'.75rem', color:C.dim, marginTop:3, fontWeight:500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div onClick={() => scrollTo(featRef)} style={{ position:'absolute', bottom:24, left:'50%', transform:'translateX(-50%)', cursor:'pointer', animation:'pulse 2s infinite', color:C.dim }}>
          <ChevronDown size={22} />
        </div>
      </section>

      {/* ══════════════ DEVICE ACCESS BANNER ══════════════ */}
      <section style={{ padding:'48px 20px', background:C.devBanner, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div ref={deviceRef} className="device-banner-inner" style={{ maxWidth:900, margin:'0 auto' }}>

          <div className={`reveal-l${deviceIn?' in-view':''}`} style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <Wifi size={26} color={P} />
            <div>
              <div style={{ fontWeight:800, fontSize:'1rem', lineHeight:1.3, color:C.text }}>Access on Any Device</div>
              <div style={{ color:C.dim, fontSize:'.82rem', marginTop:2 }}>Phone · Tablet · Laptop · Desktop</div>
            </div>
          </div>

          <div className="device-divider" />

          <div className={`reveal d2${deviceIn?' in-view':''}`} style={{ display:'flex', gap:20, alignItems:'center', justifyContent:'center', flexWrap:'wrap' }}>
            {[{ Icon:Smartphone, label:'Mobile' }, { Icon:Tablet, label:'Tablet' }, { Icon:Monitor, label:'Desktop' }].map(({ Icon, label }) => (
              <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                <div style={{ width:44, height:44, borderRadius:11, background:'rgba(92,31,34,.12)', border:'1px solid rgba(92,31,34,.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon size={20} color={P} />
                </div>
                <span style={{ fontSize:'.72rem', color:C.dim, fontWeight:600 }}>{label}</span>
              </div>
            ))}
          </div>

          <div className="device-divider" />

          <div className={`reveal-r${deviceIn?' in-view':''}`} style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <Globe size={19} color='#c8a04e' />
            <span style={{ color:C.soft, fontSize:'.88rem', fontWeight:600 }}>Just a browser + internet. That's it.</span>
          </div>
        </div>
      </section>

      {/* ══════════════ MARQUEE TICKER ══════════════ */}
      <div style={{ overflow:'hidden', borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, background:isDark?'rgba(92,31,34,.04)':'rgba(92,31,34,.04)', padding:'13px 0', userSelect:'none' }}>
        <div style={{ display:'flex', animation:'marquee 28s linear infinite', width:'max-content', gap:0 }}>
          {[...Array(2)].map((_,pass) => (
            <div key={pass} style={{ display:'flex', alignItems:'center', gap:0 }}>
              {['GST Invoice Ready','WhatsApp Sharing','Stock Management','Multi-Business','PDF & Print','Tally XML Export','Offline Mode','Auditor Login','Barcode Support','Custom Sections','Party Ledger','Financial Reports'].map(item => (
                <span key={item} style={{ display:'inline-flex', alignItems:'center', gap:28, whiteSpace:'nowrap', padding:'0 28px' }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:GRAD, display:'inline-block', flexShrink:0 }} />
                  <span style={{ fontSize:'.78rem', fontWeight:600, color:C.muted, letterSpacing:'.03em' }}>{item}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════ FEATURES ══════════════ */}
      <section id="features" ref={featRef} className="feat-section" style={{ background:C.bgAlt }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div ref={featHdRef} style={{ textAlign:'center', marginBottom:52 }}>
            <div className={`reveal${featHdIn?' in-view':''}`} style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(92,31,34,.1)', border:'1px solid rgba(92,31,34,.22)', borderRadius:100, padding:'5px 14px', marginBottom:14 }}>
              <Star size={11} color={P} />
              <span style={{ fontSize:'.72rem', fontWeight:700, color:P, letterSpacing:'.07em' }}>EVERYTHING YOU NEED</span>
            </div>
            <h2 className={`reveal d2${featHdIn?' in-view':''}`} style={{ fontSize:'clamp(1.6rem,4vw,2.6rem)', fontWeight:900, margin:'0 0 12px', letterSpacing:'-.02em', color:C.text }}>All Features. One Platform.</h2>
            <p className={`reveal d3${featHdIn?' in-view':''}`} style={{ color:C.muted, fontSize:'.95rem', maxWidth:480, margin:'0 auto', lineHeight:1.65 }}>
              No juggling between apps. TallyKraft covers your entire business workflow from day one.
            </p>
          </div>

          <div className="feat-grid">
            {FEATURES.map(({ icon: Icon, title, desc }, idx) => {
              const open = expandedFeat === idx;
              return (
                <div
                  key={title}
                  className={`feat-card reveal d${(idx % 6) + 1}${featHdIn?' in-view':''}`}
                  onClick={() => setExpandedFeat(open ? null : idx)}
                  style={{ background:C.card, border:`1px solid ${open ? 'rgba(92,31,34,.4)' : C.border}`, borderRadius:15, padding:'22px', boxShadow:C.cardShadow }}
                >
                  {/* Header row — icon + title (+ chevron on mobile) */}
                  <div className="feat-header">
                    <div className="feat-icon" style={{ width:42, height:42, borderRadius:11, background:'rgba(92,31,34,.1)', border:'1px solid rgba(92,31,34,.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon size={19} color={P} />
                    </div>
                    <div className="feat-title" style={{ fontWeight:700, fontSize:'.97rem', color:C.text, lineHeight:1.3 }}>{title}</div>
                    <div className="feat-chevron" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      <ChevronDown size={16} color={C.muted} />
                    </div>
                  </div>

                  {/* Description — always visible on desktop, accordion on mobile */}
                  <div className={`feat-desc${open ? ' feat-desc--open' : ''}`}>
                    <div style={{ fontSize:'.84rem', color:C.muted, lineHeight:1.65 }}>{desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════ FEATURE DEMOS ══════════════ */}
      <section style={{ padding:'96px 24px', background:C.bgAlt, borderTop:`1px solid ${C.border}`, overflow:'hidden' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>

          {/* heading */}
          <div ref={featDemoRef} style={{ textAlign:'center', marginBottom:60 }}>
            <div className={`reveal${featDemoIn?' in-view':''}`} style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(92,31,34,.1)', border:'1px solid rgba(92,31,34,.22)', borderRadius:100, padding:'5px 14px', marginBottom:14 }}>
              <Zap size={11} color={P} />
              <span style={{ fontSize:'.72rem', fontWeight:700, color:P, letterSpacing:'.07em' }}>SEE IT IN ACTION</span>
            </div>
            <h2 className={`reveal d2${featDemoIn?' in-view':''}`} style={{ fontSize:'clamp(1.6rem,4vw,2.6rem)', fontWeight:900, margin:'0 0 14px', letterSpacing:'-.02em', color:C.text }}>
              Designed for Real Business<br />Challenges
            </h2>
            <p className={`reveal d3${featDemoIn?' in-view':''}`} style={{ color:C.muted, fontSize:'.95rem', maxWidth:520, margin:'0 auto', lineHeight:1.7 }}>
              Every feature is built around a real problem. Watch live demos of the tools your business will actually use every day.
            </p>
          </div>

          <div className={`reveal d4${featDemoIn?' in-view':''}`}>
            <FeatureDemos isDark={isDark} C={C} />
          </div>
        </div>
      </section>

      {/* ══════════════ CUSTOM SECTIONS SHOWCASE ══════════════ */}
      {(() => {
        const ex = EXAMPLES[activeExample];
        const ExIcon = ex.icon;
        const accent = ex.color;
        const accentBg = `${accent}22`;
        const accentBorder = `${accent}44`;
        return (
          <section style={{ padding:'96px 24px', borderTop:`1px solid ${C.border}`, background:C.bg, overflow:'hidden' }}>
            <div style={{ maxWidth:1100, margin:'0 auto' }}>

              <div style={{ textAlign:'center', marginBottom:56 }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.25)', borderRadius:100, padding:'5px 14px', marginBottom:14 }}>
                  <Layers size={11} color='#fbbf24' />
                  <span style={{ fontSize:'.72rem', fontWeight:700, color:'#fbbf24', letterSpacing:'.07em' }}>CUSTOM SECTIONS</span>
                </div>
                <h2 style={{ fontSize:'clamp(1.6rem,4vw,2.6rem)', fontWeight:900, margin:'0 0 12px', letterSpacing:'-.02em', color:C.text }}>Build Any Form Your Business Needs</h2>
                <p style={{ color:C.muted, fontSize:'.95rem', maxWidth:520, margin:'0 auto', lineHeight:1.65 }}>
                  Not just invoicing — create fully custom data-entry sections for your specific workflow. Linked to customers, printable, and searchable.
                </p>
              </div>

              {/* Industry pill nav */}
              <div className="pill-nav" style={{ display:'flex', justifyContent:'center', flexWrap:'wrap', gap:8, marginBottom:52 }}>
                {EXAMPLES.map((e, i) => {
                  const PillIcon = e.icon;
                  const active = i === activeExample;
                  return (
                    <button key={e.badge} onClick={() => goToExample(i)} style={{
                      display:'flex', alignItems:'center', gap:6,
                      background: active ? e.color : C.pillInact,
                      border: `1px solid ${active ? e.color : C.pillInactBdr}`,
                      borderRadius:100, padding:'6px 14px', cursor:'pointer',
                      color: active ? '#fff' : C.pillInactTxt,
                      fontSize:'.76rem', fontWeight:700, letterSpacing:'.04em',
                      transition:'all .2s',
                    }}>
                      <PillIcon size={12} />
                      {e.badge}
                    </button>
                  );
                })}
              </div>

              <div className="custom-split carousel-desktop" key={activeExample}>

                {/* Left */}
                <div className="custom-split-text mock-fade">
                  <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:accentBg, border:`1px solid ${accentBorder}`, borderRadius:8, padding:'4px 10px', marginBottom:20, fontSize:'.72rem', fontWeight:700, color:accent, letterSpacing:'.06em' }}>
                    {ex.badge}
                  </div>
                  <h3 style={{ fontSize:'clamp(1.1rem,2.5vw,1.5rem)', fontWeight:900, margin:'0 0 10px', letterSpacing:'-.015em', color:C.text }}>{ex.heading}</h3>
                  <p style={{ color:C.muted, fontSize:'.88rem', lineHeight:1.75, marginBottom:24 }}>{ex.desc}</p>

                  {[
                    { icon:AlignLeft,   text:'Text, number, date, dropdown, and long-text field types' },
                    { icon:ExIcon,      text:'Link every record to a customer from your party list' },
                    { icon:Layers,      text:`Multiple tabs per section — e.g. ${ex.tabs[0]} + ${ex.tabs[1]}` },
                    { icon:CheckCircle, text:'Print or share any record as a formatted PDF' },
                  ].map(({ icon:Icon, text }) => (
                    <div key={text} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:14 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:accentBg, border:`1px solid ${accentBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                        <Icon size={13} color={accent} />
                      </div>
                      <span style={{ fontSize:'.88rem', color:C.soft, lineHeight:1.65 }}>{text}</span>
                    </div>
                  ))}

                  <div style={{ marginTop:28, padding:'14px 16px', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, boxShadow:C.cardShadow }}>
                    <div style={{ fontSize:'.72rem', fontWeight:700, color:C.dim, letterSpacing:'.07em', marginBottom:8 }}>WORKS FOR ANY INDUSTRY</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      {['Opticals','Tailoring','Clinics','Gyms','Service Centres','Salons','Coaching'].map(tag => (
                        <span key={tag} style={{ background:C.pillInact, border:`1px solid ${C.border}`, borderRadius:100, padding:'3px 10px', fontSize:'.74rem', color:C.muted }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right — always-dark mockup card */}
                <div className="custom-split-mock">
                  <div className="mock-fade" style={{ background:C.mockBg, border:`1px solid ${accentBorder}`, borderRadius:16, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,.35)' }}>

                    <div style={{ padding:'12px 16px', background:accentBg, borderBottom:`1px solid ${accentBorder}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:32, height:32, borderRadius:9, background:`${accent}33`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <ExIcon size={15} color={accent} />
                        </div>
                        <div>
                          <div style={{ fontSize:'.88rem', fontWeight:800, color:'#fff' }}>{ex.sectionTitle}</div>
                          <div style={{ fontSize:'.65rem', color:C.mockSubtitle }}>Custom Section</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, background:accent, borderRadius:7, padding:'5px 10px', fontSize:'.72rem', fontWeight:700, cursor:'pointer', color:'#fff' }}>
                        <Plus size={11} />New
                      </div>
                    </div>

                    <div style={{ display:'flex', borderBottom:`1px solid ${C.mockHr}`, padding:'0 16px' }}>
                      {ex.tabs.map((t, i) => (
                        <div key={t} style={{ padding:'9px 14px', fontSize:'.78rem', fontWeight:i===0?700:500, color:i===0?accent:C.mockTabInact, borderBottom:i===0?`2px solid ${accent}`:'2px solid transparent', marginBottom:-1, cursor:'pointer' }}>{t}</div>
                      ))}
                    </div>

                    <div style={{ padding:'14px' }}>
                      <div className="mock-field-row">
                        {ex.topFields.map(f => (
                          <div key={f.label} className="mock-field">
                            <div className="mock-field-label">{f.label}</div>
                            <div className="mock-field-val" style={{ color: f.accent ? accent : undefined }}>{f.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mock-eye-grid" style={{ marginBottom:8 }}>
                        {[{ label:ex.detailGroup.leftLabel, rows:ex.detailGroup.leftRows }, { label:ex.detailGroup.rightLabel, rows:ex.detailGroup.rightRows }].map(col => (
                          <div key={col.label} className="mock-eye-col">
                            <div style={{ fontSize:'.66rem', fontWeight:800, color:C.mockColHead, letterSpacing:'.08em', marginBottom:7 }}>{col.label}</div>
                            {col.rows.map(([l, v]) => (
                              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                                <span style={{ fontSize:'.75rem', color:C.mockRowLabel }}>{l}</span>
                                <span style={{ fontSize:'.8rem', fontWeight:700, color:C.mockVal }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      <div className="mock-field-row">
                        {ex.midFields.map(f => (
                          <div key={f.label} className="mock-field">
                            <div className="mock-field-label">{f.label}</div>
                            <div className="mock-field-val">{f.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ background:C.mockField, border:`1px solid ${C.mockFieldBdr}`, borderRadius:8, padding:'7px 10px', marginBottom:12 }}>
                        <div className="mock-field-label">Notes</div>
                        <div style={{ fontSize:'.81rem', color:C.mockNotesTxt }}>{ex.notes}</div>
                      </div>

                      <div style={{ display:'flex', justifyContent:'flex-end' }}>
                        <div style={{ background:accent, borderRadius:8, padding:'7px 20px', fontSize:'.8rem', fontWeight:700, cursor:'pointer', color:'#fff' }}>
                          Save Record
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop:`1px solid ${C.mockHr}`, padding:'10px 14px' }}>
                      <div style={{ fontSize:'.63rem', fontWeight:700, color:C.mockRecHead, letterSpacing:'.08em', marginBottom:7 }}>RECENT RECORDS</div>
                      {ex.records.map(r => (
                        <div key={r.name} className="mock-record-row">
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:24, height:24, borderRadius:'50%', background:`${accent}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.65rem', fontWeight:800, color:accent }}>{r.name[0]}</div>
                            <span style={{ fontSize:'.8rem', fontWeight:600, color:'#fff' }}>{r.name}</span>
                          </div>
                          <span style={{ fontSize:'.72rem', color:C.mockRecMeta }}>{r.meta}</span>
                          <span style={{ fontSize:'.7rem', color:C.mockRecDate }}>{r.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>

              {/* ── MOBILE CARD (hidden on desktop) ── */}
              <div className="carousel-mobile" key={`mob-${activeExample}`}>

                {/* Compact app-style mockup */}
                <div style={{ background:C.mockBg, border:`1px solid ${accentBorder}`, borderRadius:16, overflow:'hidden', boxShadow:'0 16px 48px rgba(0,0,0,.3)', marginBottom:20 }}>

                  {/* Header */}
                  <div style={{ padding:'12px 14px', background:accentBg, borderBottom:`1px solid ${accentBorder}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <div style={{ width:34, height:34, borderRadius:10, background:`${accent}33`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <ExIcon size={16} color={accent} />
                      </div>
                      <div>
                        <div style={{ fontSize:'.85rem', fontWeight:800, color:'#fff', lineHeight:1.2 }}>{ex.sectionTitle}</div>
                        <div style={{ fontSize:'.62rem', color:C.mockSubtitle }}>Custom Section</div>
                      </div>
                    </div>
                    <div style={{ background:accent, borderRadius:7, padding:'5px 11px', fontSize:'.72rem', fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:4 }}>
                      <Plus size={11} />New
                    </div>
                  </div>

                  {/* Tabs row */}
                  <div style={{ display:'flex', borderBottom:`1px solid ${C.mockHr}`, padding:'0 14px' }}>
                    {ex.tabs.map((t, ti) => (
                      <div key={t} style={{ padding:'8px 12px', fontSize:'.76rem', fontWeight:ti===0?700:500, color:ti===0?accent:C.mockTabInact, borderBottom:ti===0?`2px solid ${accent}`:'2px solid transparent', marginBottom:-1, cursor:'pointer' }}>{t}</div>
                    ))}
                  </div>

                  {/* Fields — label:value rows, easy to scan */}
                  <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:7 }}>
                    {[...ex.topFields, ...ex.midFields].map(f => (
                      <div key={f.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:C.mockField, border:`1px solid ${C.mockFieldBdr}`, borderRadius:9, padding:'8px 12px' }}>
                        <span style={{ fontSize:'.7rem', fontWeight:700, color:C.mockLabel, textTransform:'uppercase', letterSpacing:'.06em' }}>{f.label}</span>
                        <span style={{ fontSize:'.84rem', fontWeight:600, color:f.accent?accent:C.mockVal }}>{f.value}</span>
                      </div>
                    ))}
                    {/* Key detail rows (first 3 from left+right) */}
                    {[...ex.detailGroup.leftRows.slice(0,2), ...ex.detailGroup.rightRows.slice(0,1)].map(([l,v]) => (
                      <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:C.mockField, border:`1px solid ${C.mockFieldBdr}`, borderRadius:9, padding:'8px 12px' }}>
                        <span style={{ fontSize:'.7rem', fontWeight:700, color:C.mockLabel, textTransform:'uppercase', letterSpacing:'.06em' }}>{l}</span>
                        <span style={{ fontSize:'.84rem', fontWeight:600, color:C.mockVal }}>{v}</span>
                      </div>
                    ))}
                    {/* Notes */}
                    <div style={{ background:C.mockField, border:`1px solid ${C.mockFieldBdr}`, borderRadius:9, padding:'8px 12px' }}>
                      <div style={{ fontSize:'.62rem', fontWeight:700, color:C.mockLabel, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:4 }}>NOTES</div>
                      <div style={{ fontSize:'.8rem', color:C.mockNotesTxt, lineHeight:1.5 }}>{ex.notes}</div>
                    </div>
                    {/* Save */}
                    <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:2 }}>
                      <div style={{ background:accent, borderRadius:8, padding:'7px 20px', fontSize:'.8rem', fontWeight:700, color:'#fff', cursor:'pointer' }}>Save Record</div>
                    </div>
                  </div>
                </div>

                {/* Info below mockup */}
                <div style={{ padding:'0 2px' }}>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:accentBg, border:`1px solid ${accentBorder}`, borderRadius:7, padding:'3px 10px', marginBottom:10, fontSize:'.7rem', fontWeight:700, color:accent, letterSpacing:'.05em' }}>
                    {ex.badge}
                  </div>
                  <h3 style={{ fontSize:'1.15rem', fontWeight:900, margin:'0 0 8px', color:C.text, lineHeight:1.3, letterSpacing:'-.01em' }}>{ex.heading}</h3>
                  <p style={{ color:C.muted, fontSize:'.875rem', lineHeight:1.7, margin:'0 0 16px' }}>{ex.desc}</p>
                  {[
                    { icon:Layers,      text:`Multiple tabs — ${ex.tabs[0]} + ${ex.tabs[1]}` },
                    { icon:CheckCircle, text:'Print or share any record as a formatted PDF' },
                  ].map(({ icon:Icon, text }) => (
                    <div key={text} style={{ display:'flex', alignItems:'center', gap:9, marginBottom:9 }}>
                      <div style={{ width:24, height:24, borderRadius:7, background:accentBg, border:`1px solid ${accentBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon size={12} color={accent} />
                      </div>
                      <span style={{ fontSize:'.84rem', color:C.soft, lineHeight:1.5 }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── SHARED CAROUSEL NAV ── */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14, marginTop:28 }}>
                <button className="carousel-nav-btn" onClick={() => goToExample(i => (i - 1 + EXAMPLES.length) % EXAMPLES.length)}>
                  <ChevronLeft size={16} color={C.muted} />
                </button>
                <div style={{ display:'flex', gap:6 }}>
                  {EXAMPLES.map((_, i) => (
                    <button key={i} onClick={() => goToExample(i)} style={{ width:i===activeExample?20:7, height:7, borderRadius:4, background:i===activeExample?accent:C.faint, border:'none', cursor:'pointer', transition:'all .25s', padding:0 }} />
                  ))}
                </div>
                <button className="carousel-nav-btn" onClick={() => goToExample(i => (i + 1) % EXAMPLES.length)}>
                  <ChevronRight size={16} color={C.muted} />
                </button>
              </div>

            </div>
          </section>
        );
      })()}

      {/* ══════════════ OFFLINE MODE CALLOUT ══════════════ */}
      <section style={{ padding:'72px 24px', borderTop:`1px solid ${C.border}`, background:C.bgAlt }}>
        <div ref={offlineRef} style={{ maxWidth:860, margin:'0 auto', display:'flex', alignItems:'center', gap:40, flexWrap:'wrap' }}>
          <div className={`reveal-l${offlineIn?' in-view':''}`} style={{ flex:'0 0 auto', width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,rgba(56,142,60,.2),rgba(56,142,60,.08))', border:'1px solid rgba(56,142,60,.28)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Lock size={32} color='#16a34a' />
          </div>
          <div className={`reveal d2${offlineIn?' in-view':''}`} style={{ flex:1, minWidth:240 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(56,142,60,.1)', border:'1px solid rgba(56,142,60,.22)', borderRadius:100, padding:'4px 12px', marginBottom:10 }}>
              <span style={{ fontSize:'.7rem', fontWeight:700, color:'#16a34a', letterSpacing:'.07em' }}>COMPLETE OFFLINE MODE (IF NEEDED)</span>
            </div>
            <h3 style={{ fontSize:'clamp(1.2rem,3vw,1.7rem)', fontWeight:900, margin:'0 0 8px', letterSpacing:'-.02em', color:C.text }}>Your Data, Your Device — Always Private</h3>
            <p style={{ color:C.muted, fontSize:'.9rem', lineHeight:1.7, margin:0, maxWidth:540 }}>
              Prefer maximum privacy? Enable <strong style={{ color:'#16a34a' }}>Complete Offline Mode</strong> and all your business data stays exclusively on your device. No cloud uploads, no external servers. Works without internet — full control in your hands.
            </p>
          </div>
          <div className={`reveal-r d3${offlineIn?' in-view':''}`} style={{ flex:'0 0 auto', display:'flex', flexDirection:'column', gap:10 }}>
            {['No data leaves your device', 'Works without internet', 'Switch modes anytime'].map(pt => (
              <div key={pt} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <CheckCircle size={14} color='#16a34a' />
                <span style={{ fontSize:'.84rem', color:C.soft }}>{pt}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ AUDITOR LOGIN CALLOUT ══════════════ */}
      <section style={{ padding:'72px 24px', borderTop:`1px solid ${C.border}`, background:C.bg }}>
        <div ref={auditorRef} style={{ maxWidth:860, margin:'0 auto', display:'flex', alignItems:'center', gap:40, flexWrap:'wrap' }}>
          <div className={`reveal-l${auditorIn?' in-view':''}`} style={{ flex:'0 0 auto', width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,rgba(92,31,34,.18),rgba(92,31,34,.07))', border:'1px solid rgba(92,31,34,.28)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ClipboardList size={32} color='#5c1f22' />
          </div>
          <div className={`reveal d2${auditorIn?' in-view':''}`} style={{ flex:1, minWidth:240 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(92,31,34,.1)', border:'1px solid rgba(92,31,34,.22)', borderRadius:100, padding:'4px 12px', marginBottom:10 }}>
              <span style={{ fontSize:'.7rem', fontWeight:700, color:'#5c1f22', letterSpacing:'.07em' }}>AUDITOR ACCESS</span>
            </div>
            <h3 style={{ fontSize:'clamp(1.2rem,3vw,1.7rem)', fontWeight:900, margin:'0 0 8px', letterSpacing:'-.02em', color:C.text }}>Your CA Can Log In — On Their Own</h3>
            <p style={{ color:C.muted, fontSize:'.9rem', lineHeight:1.7, margin:0, maxWidth:560 }}>
              Generate a secure <strong style={{ color:'#5c1f22' }}>Auditor PIN</strong> from Settings and share it with your chartered accountant. They sign in using a dedicated Auditor Login, view all financial reports and ledgers, and download whatever they need — completely independently.
            </p>
          </div>
          <div className={`reveal-r d3${auditorIn?' in-view':''}`} style={{ flex:'0 0 auto', display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { label:'Read-only — nothing can be edited',  Icon:CheckCircle },
              { label:'View ledgers, P&L, and GST reports', Icon:CheckCircle },
              { label:'Download & export data directly',     Icon:Download    },
              { label:'No owner account sharing needed',     Icon:CheckCircle },
            ].map(({ label, Icon }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Icon size={14} color='#5c1f22' />
                <span style={{ fontSize:'.84rem', color:C.soft }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ HOW IT WORKS ══════════════ */}
      <section className="step-section" style={{ background:C.bgAlt, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div ref={stepsRef} style={{ maxWidth:880, margin:'0 auto', textAlign:'center' }}>
          <div className={`reveal${stepsIn?' in-view':''}`} style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(200,160,78,.1)', border:'1px solid rgba(200,160,78,.22)', borderRadius:100, padding:'5px 14px', marginBottom:14 }}>
            <TrendingUp size={11} color='#c8a04e' />
            <span style={{ fontSize:'.72rem', fontWeight:700, color:'#c8a04e', letterSpacing:'.07em' }}>SIMPLE ONBOARDING</span>
          </div>
          <h2 className={`reveal d2${stepsIn?' in-view':''}`} style={{ fontSize:'clamp(1.6rem,4vw,2.4rem)', fontWeight:900, marginBottom:12, letterSpacing:'-.02em', color:C.text }}>Up and Running in Minutes</h2>
          <p className={`reveal d3${stepsIn?' in-view':''}`} style={{ color:C.muted, fontSize:'.9rem', marginBottom:44, lineHeight:1.65 }}>No technical expertise. No downloads. No complicated setup.</p>

          <div className="step-grid">
            {STEPS.map(({ n, title, desc }, si) => (
              <div key={n} className={`reveal d${si + 4}${stepsIn?' in-view':''}`} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:'28px 22px', textAlign:'left', boxShadow:C.cardShadow }}>
                <div style={{ fontSize:'3.4rem', fontWeight:900, color:C.stepNum, lineHeight:1, marginBottom:14 }}>{n}</div>
                <div style={{ fontWeight:800, fontSize:'1rem', marginBottom:6, color:C.text }}>{title}</div>
                <div style={{ fontSize:'.84rem', color:C.muted, lineHeight:1.65 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ PRICING ══════════════ */}
      <section id="pricing" className="pricing-section" style={{ background:C.bg }}>
        <div ref={pricingRef} style={{ maxWidth:860, margin:'0 auto', textAlign:'center' }}>

          {/* Header */}
          <div className={`reveal${pricingIn?' in-view':''}`} style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(92,31,34,.1)', border:'1px solid rgba(92,31,34,.22)', borderRadius:100, padding:'5px 14px', marginBottom:14 }}>
            <CreditCard size={11} color={P} />
            <span style={{ fontSize:'.72rem', fontWeight:700, color:P, letterSpacing:'.07em' }}>SIMPLE PRICING · PER BUSINESS</span>
          </div>
          <h2 className={`reveal d2${pricingIn?' in-view':''}`} style={{ fontSize:'clamp(1.6rem,4vw,2.4rem)', fontWeight:900, marginBottom:10, letterSpacing:'-.02em', color:C.text }}>Transparent. No Surprises.</h2>
          <p className={`reveal d3${pricingIn?' in-view':''}`} style={{ color:C.muted, fontSize:'.9rem', marginBottom:12, lineHeight:1.65 }}>
            One simple plan — every feature, cloud backup, multi-device sync. No auto-renewal; pay only when you want to continue.
          </p>

          {/* Trial pill */}
          <div className={`reveal d3${pricingIn?' in-view':''}`} style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.28)', borderRadius:100, padding:'5px 16px', marginBottom:36 }}>
            <Zap size={11} color='#f59e0b' />
            <span style={{ fontSize:'.78rem', fontWeight:700, color:'#b45309' }}>3-day free trial · No credit card required</span>
          </div>

          {/* Single plan card */}
          <div className={`reveal-scale d4${pricingIn?' in-view':''}`} style={{ display:'flex', gap:20, justifyContent:'center', flexWrap:'wrap', marginBottom:20, textAlign:'left' }}>

            <div style={{
              flex:'1 1 360px', maxWidth:440,
              background: isDark ? 'linear-gradient(145deg,rgba(92,31,34,.15) 0%,rgba(92,31,34,.12) 100%)' : '#fff',
              border:`2px solid ${P}`, borderRadius:22, padding:'32px 28px',
              boxShadow: isDark ? 'none' : '0 10px 48px rgba(92,31,34,.18)',
              position:'relative', overflow:'visible', textAlign:'left',
            }}>
              {/* Plan name */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:`rgba(92,31,34,.12)`, border:`1px solid rgba(92,31,34,.22)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <CloudUpload size={16} color={P} />
                </div>
                <div>
                  <div style={{ fontWeight:800, fontSize:'1.05rem', color:C.text, lineHeight:1.2 }}>TallyKraft</div>
                  <div style={{ fontSize:'.72rem', color:P, fontWeight:700 }}>All features + cloud backup · 1 business</div>
                </div>
              </div>

              <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:`rgba(92,31,34,.1)`, border:`1px solid rgba(92,31,34,.22)`, borderRadius:100, padding:'3px 10px', marginBottom:20 }}>
                <Globe size={11} color={P} />
                <span style={{ fontSize:'.68rem', fontWeight:700, color:P, letterSpacing:'.04em' }}>EVERYTHING INCLUDED</span>
              </div>

              {/* Pricing rows */}
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:22 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background: isDark ? 'rgba(255,255,255,.05)' : 'rgba(92,31,34,.05)', borderRadius:12, border:`1px solid rgba(92,31,34,.15)` }}>
                  <div style={{ fontSize:'.82rem', color:C.muted, fontWeight:600 }}>Monthly</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
                    <span style={{ fontSize:'1.5rem', fontWeight:900, color:C.text, lineHeight:1 }}>₹299</span>
                    <span style={{ fontSize:'.72rem', color:C.muted }}>/month</span>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background: isDark ? 'rgba(255,255,255,.05)' : 'rgba(92,31,34,.05)', borderRadius:12, border:`1px solid rgba(92,31,34,.15)` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:'.82rem', color:C.muted, fontWeight:600 }}>Yearly</span>
                    <span style={{ fontSize:'.65rem', fontWeight:700, color:'#16a34a', background:'rgba(22,163,74,.1)', borderRadius:100, padding:'2px 8px' }}>Save ₹589</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
                    <span style={{ fontSize:'1.5rem', fontWeight:900, color:C.text, lineHeight:1 }}>₹2,999</span>
                    <span style={{ fontSize:'.72rem', color:C.muted }}>/year</span>
                  </div>
                </div>
              </div>

              <button className="login-btn" onClick={onLoginClick} style={{
                background:GRAD, border:'none', borderRadius:11, color:'#fff',
                fontWeight:800, fontSize:'.88rem', padding:'11px 24px', cursor:'pointer',
                width:'100%', marginBottom:22, boxShadow:'0 5px 16px rgba(92,31,34,.35)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:7,
              }}>
                Start Free Trial <ArrowRight size={15} />
              </button>

              {/* Features */}
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {PLAN_FEATURES.map(f => (
                  <div key={f} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                    <CheckCircle size={13} color={P} style={{ flexShrink:0, marginTop:2 }} />
                    <span style={{ fontSize:'.8rem', color:C.muted, lineHeight:1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Multi-business note */}
          <div className={`reveal d5${pricingIn?' in-view':''}`} style={{ display:'flex', alignItems:'flex-start', gap:8, background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 18px', maxWidth:640, margin:'0 auto 16px', textAlign:'left' }}>
            <ArrowRight size={14} color={P} style={{ flexShrink:0, marginTop:2 }} />
            <span style={{ fontSize:'.78rem', color:C.muted, lineHeight:1.55 }}>
              <strong style={{ color:C.text }}>Running more than one business?</strong> Each plan covers one business — subscribe each extra business separately (e.g. 3 businesses = ₹299 × 3).
            </span>
          </div>

          {/* No auto-renewal note */}
          <div className={`reveal d5${pricingIn?' in-view':''}`} style={{ display:'flex', alignItems:'center', gap:7, justifyContent:'center' }}>
            <Shield size={13} color='#16a34a' />
            <span style={{ fontSize:'.78rem', color:C.muted }}>
              No auto-renewal. Plan stays active until the period ends — renew only when you're ready, or stop anytime.
            </span>
          </div>

        </div>
      </section>

      {/* ══════════════ BOTTOM CTA ══════════════ */}
      <section className="cta-section" style={{ padding:'80px 24px', background:`linear-gradient(135deg,rgba(92,31,34,.1) 0%,rgba(92,31,34,.08) 100%)`, borderTop:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:640, margin:'0 auto', textAlign:'center' }}>
          <div style={{ width:56, height:56, borderRadius:15, background:GRAD, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:'0 8px 28px rgba(92,31,34,.35)' }}>
            <TallyKraftLogo size={42} variant="wordmark-light" />
          </div>
          <h2 style={{ fontSize:'clamp(1.6rem,4vw,2.4rem)', fontWeight:900, marginBottom:14, letterSpacing:'-.02em', color:C.text }}>
            Ready to Transform<br />Your Business?
          </h2>
          <p style={{ color:C.muted, fontSize:'.95rem', marginBottom:36, lineHeight:1.7 }}>
            Get started today — no installs, no hassle, just great accounting on any device.
          </p>
          <button className="login-btn cta-btn" onClick={onLoginClick} style={{
            background:GRAD, border:'none', borderRadius:13,
            color:'#fff', fontWeight:800, fontSize:'1rem',
            padding:'15px 40px', cursor:'pointer',
            boxShadow:'0 6px 22px rgba(92,31,34,.38)',
            display:'inline-flex', alignItems:'center', gap:8,
          }}>
            Open TallyKraft <ArrowUpRight size={17} />
          </button>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="site-footer" style={{ padding:'28px 20px', borderTop:`1px solid ${C.border}`, background:C.bgAlt }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <TallyKraftLogo size={36} />
          <span style={{ fontWeight:700, fontSize:'.85rem', color:C.footerBrand, letterSpacing:'.04em' }}>TALLYKRAFT</span>
        </div>
        <div style={{ color:C.footerText, fontSize:'.78rem' }}>
          © {new Date().getFullYear()} TallyKraft · Premium Business Accounting
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <a href="/privacy" style={{ color:C.footerText, fontSize:'.78rem', textDecoration:'none', fontWeight:600 }}>
            Privacy Policy
          </a>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <Shield size={12} color={C.footerText} />
            <span style={{ color:C.footerText, fontSize:'.78rem' }}>Secure Cloud Platform</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
