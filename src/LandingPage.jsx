import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Receipt, ShoppingCart, Users, Package, Wallet, BarChart3,
  Printer, UserCheck, Building2, CloudUpload, Globe, ShieldCheck,
  FileText, Check, ArrowRight, ArrowUpRight, Lock, ClipboardList,
  Layers, Eye, Plus, Minus, Scissors, Activity, Wrench, Zap, Star,
  Smartphone, Monitor, Tablet, TrendingUp, Send,
} from 'lucide-react';
import { firestore } from './db';
import { doc, getDoc } from 'firebase/firestore';
import BillDhekoLogo, { TM } from './BillDhekoLogo';
import FeatureDemos from './FeatureDemos';
import { TRIAL_DAYS, PLANS, PLAN_PRICE, YEARLY_PRICE } from './planTiers';
import { LEGAL_PAGES, linkTo } from './legalPagesConfig';

/* ── brand ── */
const P    = '#5c1f22';   // oxblood
const P2   = '#3f1417';   // deep oxblood
const GOLD = '#b08d57';   // champagne gold accent

/* ── content ── */
const FEATURE_GROUPS = [
  {
    title: 'Billing & GST',
    items: [
      { icon: Receipt,  title: 'GST Invoicing',     desc: 'Professional tax invoices in seconds — GST, discounts and round-off calculated for you.' },
      { icon: FileText, title: 'Estimates & Notes', desc: 'Quotations, credit, debit and delivery notes that convert to invoices in one tap.' },
      { icon: Printer,  title: 'Print & Share',     desc: 'A4 or thermal bills, or a PDF straight to your customer on WhatsApp.' },
    ],
  },
  {
    title: 'Stock & Purchases',
    items: [
      { icon: Package,      title: 'Inventory Control',   desc: 'Live stock with item pricing, units, variants, batches and barcode support.' },
      { icon: ShoppingCart, title: 'Purchase Management', desc: 'Supplier bills, purchase orders and payables — all in one place.' },
      { icon: Layers,       title: 'Custom Sections',     desc: 'Build any form your trade needs — eye exams, measurements, job cards and more.' },
    ],
  },
  {
    title: 'Money & Reports',
    items: [
      { icon: Wallet,    title: 'Payment Tracking',  desc: 'Payments in and out, part payments and cash or bank — always reconciled.' },
      { icon: Users,     title: 'Party Ledger',      desc: 'Every customer and vendor with a real-time running balance.' },
      { icon: BarChart3, title: 'Financial Reports', desc: 'Profit & loss, day book, GST returns and more — one click away.' },
    ],
  },
  {
    title: 'Team & Scale',
    items: [
      { icon: UserCheck, title: 'Staff Management',     desc: 'Add staff with precise permissions over what each person can see and do.' },
      { icon: Building2, title: 'Multi-Business',       desc: 'Run several businesses from one account and switch instantly.' },
      { icon: Globe,     title: 'Any Device, Anywhere', desc: 'Phone, tablet or desktop — all you need is a browser.' },
    ],
  },
];

const TRUST = [
  {
    icon: CloudUpload, title: 'Cloud backup & sync',
    desc: 'Every entry is backed up online and synced across your devices automatically. Never lose a record again.',
    points: ['Automatic backup', 'Sync across devices', 'Restore any time'],
  },
  {
    icon: Lock, title: 'Complete offline mode',
    desc: 'Prefer maximum privacy? Keep all business data on your own device — no cloud uploads, works without internet.',
    points: ['Data stays on your device', 'Works without internet', 'Switch modes any time'],
  },
  {
    icon: ClipboardList, title: 'Auditor login',
    desc: 'Give your chartered accountant a secure login. They view reports and ledgers and export what they need on their own.',
    points: ['Read-only access', 'Ledgers, P&L and GST reports', 'No password sharing'],
  },
];

const STEPS = [
  { n: '01', title: 'Sign in',            desc: 'One click with your Google account. No lengthy registration.' },
  { n: '02', title: 'Set up your business', desc: 'Add your business details, logo and GSTIN — ready in under two minutes.' },
  { n: '03', title: 'Start billing',      desc: 'Add customers and items, then create your first invoice. That’s it.' },
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

const INDUSTRIES = ['Retail', 'Wholesale', 'Opticals', 'Clinics', 'Tailoring', 'Salons', 'Gyms', 'Service centres', 'Distributors'];

/* ── carousel examples ── */
const EXAMPLES = [
  {
    badge:'OPTICALS SHOP', icon:Eye, color:'#57433e',
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

/* Section that fades up once when scrolled into view. */
const Reveal = ({ children, className = '', delay = 0, ...rest }) => {
  const [ref, inView] = useInView(0.12);
  return (
    <div ref={ref} className={`lp-reveal ${inView ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </div>
  );
};

const Eyebrow = ({ children, light }) => (
  <div className={`lp-eyebrow ${light ? 'light' : ''}`}><span className="lp-eyebrow-rule" />{children}</div>
);

const Brand = ({ size = 34 }) => (
  <span className="lp-brand">
    <BillDhekoLogo size={size} />
    <span className="lp-brand-name">Bill<span>Dheko</span><TM /></span>
  </span>
);

/* ─────────────── component ─────────────── */
export default function LandingPage({ onLoginClick }) {
  const [scrolled, setScrolled]           = useState(false);
  const [activeExample, setActiveExample] = useState(0);
  const [openFaq, setOpenFaq]             = useState(0);
  const [isDark, setIsDark]               = useState(() => localStorage.getItem('tallykraft_landing_dark') === 'true');
  // Live GST setting (Admin → Billing & Tax) so the price line is accurate.
  const [gstNote, setGstNote]             = useState('');
  const carouselId = useRef(null);
  const pausedRef  = useRef(false);

  const [statsRef, statsIn] = useInView(0.4);
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
    getDoc(doc(firestore, 'globalConfig', 'billing'))
      .then(snap => {
        const b = snap.exists() ? snap.data() : null;
        if (!b || b.taxEnabled === false) setGstNote('');
        else setGstNote(b.taxInclusive ? 'incl. GST' : '+ GST');
      })
      .catch(() => {});
  }, []);

  /* Industry showcase auto-advances slowly; pauses while hovered. */
  const startCarousel = useCallback(() => {
    clearInterval(carouselId.current);
    carouselId.current = setInterval(() => {
      if (!pausedRef.current) setActiveExample(i => (i + 1) % EXAMPLES.length);
    }, 6000);
  }, []);
  useEffect(() => { startCarousel(); return () => clearInterval(carouselId.current); }, [startCarousel]);
  const goToExample = (idx) => { setActiveExample(idx); startCarousel(); };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const ex = EXAMPLES[activeExample];
  const ExIcon = ex.icon;

  const FAQS = [
    { q: 'How does the free trial work?',
      a: `Start a ${TRIAL_DAYS}-day free trial for your business with every feature unlocked — no card needed. When it ends, choose ₹${PLAN_PRICE} for 30 days or ₹${YEARLY_PRICE.toLocaleString('en-IN')} for a year to continue.` },
    { q: 'How much does BillDheko cost?',
      a: `₹${PLAN_PRICE} per business for 30 days, or ₹${YEARLY_PRICE.toLocaleString('en-IN')} per business for a full year (save ₹589)${gstNote ? `, ${gstNote}` : ''}. Each business has its own subscription.` },
    { q: 'Does my plan renew automatically?',
      a: 'No. Plans are prepaid with no auto-renewal. Your plan stays active until its period ends; pay again whenever you want to continue. Paying early adds the new period on top of the days you have left.' },
    { q: 'Can I cancel or get a refund?',
      a: `No — both plans are non-cancellable and non-refundable once paid, which is why every business gets a ${TRIAL_DAYS}-day free trial first. The only exceptions are duplicate payments or a payment that was charged but not activated; see our Cancellation & Refund Policy.` },
    { q: 'What happens to my data if I don’t renew?',
      a: 'Nothing is deleted. Your records stay saved, and renewing picks up exactly where you left off.' },
    { q: 'Can my staff and my accountant use it?',
      a: 'Yes. Add staff with fine-grained permissions, and give your CA a separate auditor login to view reports and export what they need.' },
    { q: 'Which devices does it work on?',
      a: 'Any phone, tablet, laptop or desktop with a modern browser. You can also install it like an app — nothing to download from a store.' },
  ];

  const vars = isDark ? {
    '--bg': '#0f0b0a', '--bg-alt': '#151010', '--paper': '#1b1413', '--ink': '#f4ece4',
    '--ink-soft': 'rgba(244,236,228,.78)', '--muted': 'rgba(244,236,228,.56)', '--line': 'rgba(244,236,228,.10)',
    '--line-strong': 'rgba(244,236,228,.18)', '--shadow': '0 30px 80px rgba(0,0,0,.45)', '--accent': '#d9b98a',
    '--chip': 'rgba(244,236,228,.06)', '--nav': 'rgba(15,11,10,.82)',
  } : {
    '--bg': '#fbf8f4', '--bg-alt': '#f4ede5', '--paper': '#ffffff', '--ink': '#24130f',
    '--ink-soft': '#4a3631', '--muted': '#7a6760', '--line': '#e9dfd5', '--line-strong': '#d9cabd',
    '--shadow': '0 30px 80px rgba(63,20,23,.12)', '--accent': P, '--chip': 'rgba(92,31,34,.05)', '--nav': 'rgba(251,248,244,.84)',
  };

  return (
    <div className="lp" style={vars}>
      <style>{`
        .lp { background: var(--bg); color: var(--ink); font-family: 'Inter','Segoe UI',system-ui,sans-serif; overflow-x: hidden;
              -webkit-font-smoothing: antialiased; font-feature-settings: "cv11","ss01"; }
        .lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
        .lp a { color: inherit; }
        .lp .serif { font-family: 'Fraunces', Georgia, 'Times New Roman', serif; font-optical-sizing: auto; letter-spacing: -0.02em; }
        .lp .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
        .lp section { position: relative; }

        /* reveal */
        .lp-reveal { opacity: 0; transform: translateY(22px); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1); }
        .lp-reveal.in { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) { .lp-reveal { opacity: 1; transform: none; transition: none; } .lp-float { animation: none !important; } }

        /* eyebrow */
        .lp-eyebrow { display: inline-flex; align-items: center; gap: 12px; font-size: .72rem; font-weight: 600; letter-spacing: .22em;
                      text-transform: uppercase; color: ${GOLD}; margin-bottom: 22px; }
        .lp-eyebrow.light { color: #d9b98a; }
        .lp-eyebrow-rule { width: 28px; height: 1px; background: currentColor; opacity: .7; }

        /* brand */
        .lp-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
        .lp-brand-name { font-weight: 700; font-size: 1.12rem; letter-spacing: -0.02em; color: var(--ink); line-height: 1; }
        .lp-brand-name > span:first-of-type { color: ${isDark ? '#d9b98a' : P}; font-weight: 800; }

        /* buttons */
        .lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 9px; border: none; cursor: pointer;
                  font: 600 .93rem/1 'Inter',sans-serif; padding: 15px 26px; border-radius: 999px; text-decoration: none;
                  transition: transform .25s ease, box-shadow .25s ease, background .25s ease, color .25s ease; white-space: nowrap; }
        .lp-btn-primary { background: ${isDark ? '#d9b98a' : P}; color: ${isDark ? '#1b1210' : '#fff'};
                          box-shadow: 0 10px 30px ${isDark ? 'rgba(217,185,138,.18)' : 'rgba(92,31,34,.28)'}; }
        .lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 16px 40px ${isDark ? 'rgba(217,185,138,.28)' : 'rgba(92,31,34,.36)'}; }
        .lp-btn-ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1px var(--line-strong); }
        .lp-btn-ghost:hover { box-shadow: inset 0 0 0 1px var(--ink); }
        .lp-btn-light { background: #f6ecdf; color: ${P2}; }
        .lp-btn-light:hover { transform: translateY(-2px); background: #fff; }
        .lp-btn svg { transition: transform .25s ease; }
        .lp-btn:hover svg { transform: translateX(3px); }

        /* nav */
        .lp-nav { position: fixed; inset: 0 0 auto 0; z-index: 999; transition: background .35s ease, box-shadow .35s ease, height .35s ease; }
        .lp-nav.scrolled { background: var(--nav); backdrop-filter: saturate(160%) blur(18px); -webkit-backdrop-filter: saturate(160%) blur(18px);
                           box-shadow: 0 1px 0 var(--line); }
        .lp-nav-inner { height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 20px; transition: height .35s ease; }
        .lp-nav.scrolled .lp-nav-inner { height: 64px; }
        .lp-nav-links { display: flex; gap: 34px; }
        .lp-nav-links a { font-size: .9rem; font-weight: 500; color: var(--ink-soft); text-decoration: none; position: relative; padding: 4px 0; }
        .lp-nav-links a::after { content: ''; position: absolute; left: 0; right: 100%; bottom: -2px; height: 1px; background: ${GOLD}; transition: right .3s ease; }
        .lp-nav-links a:hover { color: var(--ink); }
        .lp-nav-links a:hover::after { right: 0; }
        .lp-nav-actions { display: flex; align-items: center; gap: 18px; }
        .lp-signin { background: none; border: none; cursor: pointer; font: 600 .9rem 'Inter',sans-serif; color: var(--ink); padding: 8px 4px; }
        .lp-nav .lp-btn { padding: 11px 20px; font-size: .86rem; }

        /* hero */
        .lp-hero { padding: 168px 0 110px; overflow: hidden;
                   background:
                     radial-gradient(1100px 600px at 85% -10%, ${isDark ? 'rgba(217,185,138,.08)' : 'rgba(176,141,87,.13)'} 0%, transparent 60%),
                     radial-gradient(900px 600px at -10% 110%, ${isDark ? 'rgba(92,31,34,.35)' : 'rgba(92,31,34,.07)'} 0%, transparent 60%); }
        .lp-hero-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 64px; align-items: center; }
        .lp-h1 { font-size: clamp(2.7rem, 5.6vw, 4.6rem); line-height: 1.02; font-weight: 500; margin: 0 0 26px; color: var(--ink); }
        .lp-h1 em { font-style: italic; font-weight: 400; color: ${isDark ? '#d9b98a' : P}; }
        .lp-lead { font-size: 1.12rem; line-height: 1.75; color: var(--ink-soft); max-width: 540px; margin: 0 0 38px; }
        .lp-cta-row { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 34px; }
        .lp-assure { display: flex; flex-wrap: wrap; gap: 10px 26px; font-size: .86rem; color: var(--muted); }
        .lp-assure span { display: inline-flex; align-items: center; gap: 8px; }
        .lp-assure svg { color: ${GOLD}; }

        /* hero art */
        .lp-art { position: relative; height: 600px; }
        .lp-doc { position: absolute; top: 0; right: 40px; width: 410px; background: var(--paper); border-radius: 18px;
                  box-shadow: var(--shadow), 0 0 0 1px var(--line); padding: 30px 30px 26px; }
        .lp-doc-head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
        .lp-doc-title { font-size: 1.35rem; font-weight: 500; color: var(--ink); }
        .lp-doc-small { font-size: .7rem; color: var(--muted); letter-spacing: .04em; }
        .lp-doc-rows { margin: 16px 0 6px; }
        .lp-doc-row { display: grid; grid-template-columns: 1fr 40px 80px; gap: 10px; font-size: .8rem; padding: 9px 0; border-bottom: 1px dashed var(--line); color: var(--ink-soft); }
        .lp-doc-row.head { font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line); padding-top: 0; }
        .lp-doc-row span:nth-child(2), .lp-doc-row span:nth-child(3) { text-align: right; }
        .lp-doc-tax { display: flex; justify-content: space-between; font-size: .78rem; color: var(--muted); padding: 5px 0; }
        .lp-doc-total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 12px; padding-top: 14px; border-top: 1px solid var(--line-strong); }
        .lp-doc-total b { font-family: 'Fraunces',Georgia,serif; font-size: 1.7rem; font-weight: 500; color: var(--ink); letter-spacing: -0.02em; }
        .lp-stamp { position: absolute; bottom: 24px; left: 44%; transform: rotate(-10deg); border: 2px solid #2f7d4f; color: #2f7d4f;
                    font: 700 .74rem/1 'Inter',sans-serif; letter-spacing: .2em; padding: 7px 12px; border-radius: 6px; opacity: .85; }
        .lp-chip { position: absolute; background: var(--paper); border-radius: 14px; box-shadow: var(--shadow), 0 0 0 1px var(--line);
                   padding: 14px 18px; display: flex; align-items: center; gap: 12px; }
        .lp-chip-ico { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }
        .lp-chip small { display: block; font-size: .66rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; }
        .lp-chip b { font-size: .95rem; color: var(--ink); font-weight: 600; }
        .lp-float { animation: lpFloat 7s ease-in-out infinite; }
        .lp-float.b { animation-duration: 8.5s; animation-delay: -2s; }
        @keyframes lpFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }

        /* stats */
        .lp-stats { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
        .lp-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
        .lp-stat { padding: 40px 28px; text-align: center; }
        .lp-stat + .lp-stat { border-left: 1px solid var(--line); }
        .lp-stat b { display: block; font-family: 'Fraunces',Georgia,serif; font-weight: 500; font-size: 2.6rem; letter-spacing: -0.02em; color: var(--ink); line-height: 1; margin-bottom: 10px; }
        .lp-stat span { font-size: .82rem; color: var(--muted); letter-spacing: .02em; }

        /* industries ribbon */
        .lp-ribbon { padding: 34px 0; text-align: center; }
        .lp-ribbon-label { font-size: .7rem; letter-spacing: .24em; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; }
        .lp-ribbon-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 0; font-family: 'Fraunces',Georgia,serif; font-style: italic; font-size: 1.22rem; color: var(--ink-soft); }
        .lp-ribbon-list span:not(:last-child)::after { content: '·'; color: ${GOLD}; margin: 0 16px; font-style: normal; }

        /* section heads */
        .lp-sec { padding: 130px 0; }
        .lp-sec.alt { background: var(--bg-alt); }
        .lp-h2 { font-size: clamp(2.1rem, 4vw, 3.3rem); line-height: 1.08; font-weight: 500; margin: 0 0 20px; color: var(--ink); }
        .lp-h2 em { font-style: italic; font-weight: 400; color: ${isDark ? '#d9b98a' : P}; }
        .lp-sub { font-size: 1.04rem; line-height: 1.75; color: var(--ink-soft); max-width: 560px; margin: 0; }
        .lp-head { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: end; margin-bottom: 72px; }
        .lp-head.center { display: block; text-align: center; max-width: 720px; margin-left: auto; margin-right: auto; }
        .lp-head.center .lp-sub { margin: 0 auto; }

        /* features */
        .lp-feat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 40px; }
        .lp-feat-col h3 { font-size: .72rem; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: ${GOLD};
                          margin: 0 0 8px; padding-bottom: 18px; border-bottom: 1px solid var(--line-strong); }
        .lp-feat { padding: 24px 0; border-bottom: 1px solid var(--line); }
        .lp-feat-top { display: flex; align-items: center; gap: 12px; margin-bottom: 9px; }
        .lp-feat-ico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
                       border: 1px solid ${isDark ? 'rgba(217,185,138,.35)' : 'rgba(176,141,87,.45)'}; color: ${isDark ? '#d9b98a' : P}; }
        .lp-feat h4 { margin: 0; font-size: 1rem; font-weight: 600; color: var(--ink); }
        .lp-feat p { margin: 0; font-size: .89rem; line-height: 1.65; color: var(--muted); }

        /* industry showcase */
        .lp-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 44px; }
        .lp-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 999px; cursor: pointer;
                  font: 500 .86rem 'Inter',sans-serif; color: var(--ink-soft); background: transparent; border: 1px solid var(--line-strong);
                  transition: all .25s ease; }
        .lp-tab:hover { border-color: var(--ink); color: var(--ink); }
        .lp-tab.on { background: ${isDark ? '#d9b98a' : P}; border-color: transparent; color: ${isDark ? '#1b1210' : '#fff'}; }
        .lp-show { display: grid; grid-template-columns: .9fr 1.1fr; gap: 64px; align-items: center; }
        .lp-show-text h3 { font-size: 2rem; font-weight: 500; line-height: 1.15; margin: 0 0 16px; color: var(--ink); }
        .lp-show-text p { font-size: 1rem; line-height: 1.75; color: var(--ink-soft); margin: 0 0 26px; }
        .lp-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
        .lp-list li { display: flex; gap: 12px; font-size: .93rem; color: var(--ink-soft); line-height: 1.5; }
        .lp-list svg { color: ${GOLD}; flex-shrink: 0; margin-top: 3px; }
        .lp-form { background: var(--paper); border-radius: 18px; box-shadow: var(--shadow), 0 0 0 1px var(--line); overflow: hidden; }
        .lp-form-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line); }
        .lp-form-tabs { display: flex; gap: 22px; padding: 0 22px; border-bottom: 1px solid var(--line); }
        .lp-form-tabs span { font-size: .8rem; padding: 12px 0; color: var(--muted); }
        .lp-form-tabs span.on { color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 ${GOLD}; }
        .lp-form-body { padding: 20px 22px; display: grid; gap: 12px; }
        .lp-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .lp-field { border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; }
        .lp-field small { display: block; font-size: .6rem; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
        .lp-field b { font-size: .88rem; font-weight: 600; color: var(--ink); }
        .lp-field.accent b { color: ${isDark ? '#d9b98a' : P}; }
        .lp-kv { display: flex; justify-content: space-between; font-size: .8rem; padding: 3px 0; color: var(--muted); }
        .lp-kv b { color: var(--ink); font-weight: 600; }
        .lp-recent { border-top: 1px solid var(--line); padding: 14px 22px 18px; }
        .lp-recent-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 10px; padding: 6px 0; font-size: .8rem; }
        .lp-avatar { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: .7rem; font-weight: 700;
                     background: var(--chip); color: var(--ink-soft); }
        .lp-fade { animation: lpFade .6s ease; }
        @keyframes lpFade { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }

        /* dark trust band */
        .lp-band { background: ${isDark ? '#1a0e0d' : P2}; color: #f4ece4; padding: 130px 0; overflow: hidden;
                   background-image: radial-gradient(900px 500px at 100% 0%, rgba(217,185,138,.12), transparent 60%),
                                     radial-gradient(800px 500px at 0% 100%, rgba(255,255,255,.04), transparent 60%); }
        .lp-band .lp-h2 { color: #f6ecdf; }
        .lp-band .lp-h2 em { color: #d9b98a; }
        .lp-band .lp-sub { color: rgba(246,236,223,.72); }
        .lp-trust-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: 1px solid rgba(246,236,223,.14); }
        .lp-trust { padding: 40px 36px 8px 0; }
        .lp-trust + .lp-trust { padding-left: 36px; border-left: 1px solid rgba(246,236,223,.14); }
        .lp-trust-ico { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; border: 1px solid rgba(217,185,138,.45); color: #d9b98a; margin-bottom: 22px; }
        .lp-trust h3 { font-family: 'Fraunces',Georgia,serif; font-weight: 500; font-size: 1.5rem; margin: 0 0 12px; color: #f6ecdf; letter-spacing: -0.01em; }
        .lp-trust p { font-size: .93rem; line-height: 1.7; color: rgba(246,236,223,.7); margin: 0 0 20px; }
        .lp-trust ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
        .lp-trust li { display: flex; gap: 10px; font-size: .88rem; color: rgba(246,236,223,.86); }
        .lp-trust li svg { color: #d9b98a; flex-shrink: 0; margin-top: 2px; }

        /* steps */
        .lp-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
        .lp-step { padding: 8px 40px 0 0; }
        .lp-step + .lp-step { padding-left: 40px; border-left: 1px solid var(--line); }
        .lp-step b { display: block; font-family: 'Fraunces',Georgia,serif; font-weight: 400; font-style: italic; font-size: 3.4rem; line-height: 1; color: ${GOLD}; margin-bottom: 22px; }
        .lp-step h4 { font-size: 1.15rem; font-weight: 600; margin: 0 0 10px; color: var(--ink); }
        .lp-step p { font-size: .93rem; line-height: 1.7; color: var(--muted); margin: 0; }

        /* devices */
        .lp-devices { display: flex; gap: 14px; margin-top: 34px; flex-wrap: wrap; }
        .lp-device { display: inline-flex; align-items: center; gap: 9px; font-size: .85rem; color: var(--ink-soft); padding: 9px 16px; border-radius: 999px; border: 1px solid var(--line-strong); }
        .lp-device svg { color: ${GOLD}; }

        /* pricing */
        .lp-price-grid { display: grid; grid-template-columns: .95fr 1.05fr; gap: 72px; align-items: center; }
        .lp-price-card { position: relative; background: var(--paper); border-radius: 26px; padding: 48px 46px 40px;
                         box-shadow: var(--shadow), 0 0 0 1px var(--line); overflow: hidden; }
        .lp-price-card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg, ${P}, ${GOLD}, ${P}); }
        .lp-price-tag { display: inline-flex; align-items: center; gap: 8px; font-size: .74rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
                        color: ${GOLD}; margin-bottom: 18px; }
        .lp-plan-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .lp-plan-opt { border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; }
        .lp-plan-opt.best { border-color: ${GOLD}; background: ${isDark ? 'rgba(217,185,138,.06)' : 'rgba(176,141,87,.06)'}; }
        .lp-plan-opt-name { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: .78rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
        .lp-plan-opt-name span { font-size: .66rem; letter-spacing: .02em; text-transform: none; color: #2f7d4f; background: rgba(47,125,79,.1); border-radius: 999px; padding: 2px 8px; }
        .lp-price { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .lp-price b { font-family: 'Fraunces',Georgia,serif; font-weight: 500; font-size: 2.6rem; line-height: 1; letter-spacing: -0.03em; color: var(--ink); }
        .lp-price span { font-size: .95rem; color: var(--muted); }
        .lp-price-trial { font-size: .92rem; color: var(--ink-soft); margin: 0 0 28px; }
        .lp-price-trial strong { color: ${isDark ? '#d9b98a' : P}; font-weight: 600; }
        .lp-plan-list { list-style: none; padding: 26px 0 0; margin: 30px 0 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 1fr 1fr; gap: 12px 22px; }
        .lp-plan-list li { display: flex; gap: 10px; font-size: .86rem; color: var(--ink-soft); line-height: 1.45; }
        .lp-plan-list svg { color: ${GOLD}; flex-shrink: 0; margin-top: 2px; }
        .lp-notes { margin-top: 34px; display: grid; gap: 16px; }
        .lp-note { display: flex; gap: 14px; font-size: .92rem; line-height: 1.65; color: var(--ink-soft); }
        .lp-note-ico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--line-strong); color: ${GOLD}; }

        /* faq */
        .lp-faq { max-width: 820px; margin: 0 auto; border-top: 1px solid var(--line-strong); }
        .lp-faq-item { border-bottom: 1px solid var(--line); }
        .lp-faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 26px 0; background: none; border: none; cursor: pointer;
                    text-align: left; font-family: 'Fraunces',Georgia,serif; font-size: 1.28rem; font-weight: 500; color: var(--ink); letter-spacing: -0.01em; }
        .lp-faq-q svg { color: ${GOLD}; flex-shrink: 0; }
        .lp-faq-a { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .35s ease; }
        .lp-faq-a.open { grid-template-rows: 1fr; }
        .lp-faq-a > div { overflow: hidden; }
        .lp-faq-a p { margin: 0 0 26px; font-size: .98rem; line-height: 1.75; color: var(--ink-soft); max-width: 680px; }

        /* final cta */
        .lp-final { padding: 0 0 120px; }
        .lp-final-card { border-radius: 30px; padding: 90px 48px; text-align: center; color: #f6ecdf; position: relative; overflow: hidden;
                         background: ${isDark ? '#1a0e0d' : P2};
                         background-image: radial-gradient(700px 360px at 50% -20%, rgba(217,185,138,.22), transparent 70%); }
        .lp-final-card .lp-h2 { color: #f6ecdf; margin-bottom: 18px; }
        .lp-final-card .lp-h2 em { color: #d9b98a; }
        .lp-final-card p { color: rgba(246,236,223,.72); font-size: 1.04rem; margin: 0 auto 38px; max-width: 520px; line-height: 1.7; }
        .lp-final-fine { margin-top: 22px !important; margin-bottom: 0 !important; font-size: .84rem !important; color: rgba(246,236,223,.55) !important; }

        /* footer */
        .lp-foot { border-top: 1px solid var(--line); padding: 64px 0 34px; }
        .lp-foot-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1.2fr; gap: 40px; margin-bottom: 52px; }
        .lp-foot p { font-size: .9rem; line-height: 1.7; color: var(--muted); max-width: 340px; margin: 18px 0 0; }
        .lp-foot h5 { font-size: .7rem; letter-spacing: .2em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 6px 0 18px; }
        .lp-foot-links { display: grid; gap: 12px; }
        .lp-foot-links a, .lp-foot-links button { font: 500 .9rem 'Inter',sans-serif; color: var(--ink-soft); text-decoration: none; background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
        .lp-foot-links a:hover, .lp-foot-links button:hover { color: var(--ink); }
        .lp-foot-bottom { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 26px; border-top: 1px solid var(--line); font-size: .82rem; color: var(--muted); }
        .lp-foot-bottom span { display: inline-flex; align-items: center; gap: 7px; }

        /* responsive */
        @media (max-width: 1080px) {
          .lp-hero-grid, .lp-show, .lp-price-grid { grid-template-columns: 1fr; gap: 56px; }
          .lp-art { height: 520px; max-width: 520px; width: 100%; margin: 0 auto; }
          .lp-doc { left: 0; right: 0; margin: 0 auto; }
          .lp-feat-grid { grid-template-columns: repeat(2, 1fr); gap: 0 40px; }
          .lp-feat-col { margin-bottom: 40px; }
          .lp-head { grid-template-columns: 1fr; gap: 20px; margin-bottom: 56px; }
        }
        @media (max-width: 860px) {
          .lp-nav-links { display: none; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-stat:nth-child(3) { border-left: none; }
          .lp-stat:nth-child(n+3) { border-top: 1px solid var(--line); }
          .lp-trust-grid, .lp-steps { grid-template-columns: 1fr; }
          .lp-trust, .lp-trust + .lp-trust { padding: 34px 0; border-left: none; }
          .lp-trust + .lp-trust { border-top: 1px solid rgba(246,236,223,.14); }
          .lp-step, .lp-step + .lp-step { padding: 28px 0; border-left: none; }
          .lp-step + .lp-step { border-top: 1px solid var(--line); }
          .lp-foot-grid { grid-template-columns: 1fr 1fr; }
          .lp-foot-grid > div:first-child { grid-column: 1 / -1; }
        }
        @media (max-width: 600px) {
          .lp .wrap { padding: 0 20px; }
          .lp-hero { padding: 128px 0 72px; }
          .lp-sec, .lp-band { padding: 88px 0; }
          .lp-signin { display: none; }
          .lp-feat-grid { grid-template-columns: 1fr; }
          .lp-art { height: 640px; }
          .lp-doc { width: calc(100% - 12px); padding: 24px 22px 22px; top: 0; }
          .lp-chip.c1 { left: 0 !important; bottom: 0 !important; }
          .lp-chip.c2 { right: 0 !important; bottom: 72px !important; }
          .lp-fields { grid-template-columns: 1fr 1fr; }
          .lp-plan-list { grid-template-columns: 1fr; }
          .lp-price-card { padding: 40px 26px 32px; }
          .lp-price b { font-size: 2.2rem; }
          .lp-final-card { padding: 64px 24px; border-radius: 22px; }
          .lp-stat { padding: 30px 12px; }
          .lp-stat b { font-size: 2rem; }
          .lp-cta-row .lp-btn { flex: 1 1 100%; }
        }
      `}</style>

      {/* ══════════════ NAV ══════════════ */}
      <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="wrap lp-nav-inner">
          <a href="#" className="lp-brand-link" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ textDecoration: 'none' }}>
            <Brand size={36} />
          </a>
          <div className="lp-nav-links">
            {[['Features', 'features'], ['Industries', 'industries'], ['Pricing', 'pricing'], ['FAQ', 'faq']].map(([label, id]) => (
              <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); go(id); }}>{label}</a>
            ))}
          </div>
          <div className="lp-nav-actions">
            <button className="lp-signin" onClick={onLoginClick}>Sign in</button>
            <button className="lp-btn lp-btn-primary" onClick={onLoginClick}>Start free trial</button>
          </div>
        </div>
      </nav>

      {/* ══════════════ HERO ══════════════ */}
      <header className="lp-hero">
        <div className="wrap lp-hero-grid">
          <div>
            <Reveal><Eyebrow>GST billing &amp; accounting · Made for India</Eyebrow></Reveal>
            <Reveal delay={80}>
              <h1 className="lp-h1 serif">Billing and books,<br /><em>elegantly</em> simple.</h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="lp-lead">
                BillDheko brings invoicing, inventory, payments, GST reports and staff together in one
                refined workspace — on any device, with nothing to install.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="lp-cta-row">
                <button className="lp-btn lp-btn-primary" onClick={onLoginClick}>
                  Start your {TRIAL_DAYS}-day free trial <ArrowRight size={17} />
                </button>
                <button className="lp-btn lp-btn-ghost" onClick={() => go('features')}>Explore features</button>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="lp-assure">
                <span><Check size={15} /> No credit card</span>
                <span><Check size={15} /> From ₹{PLAN_PRICE} per business</span>
                <span><Check size={15} /> No auto-renewal</span>
              </div>
            </Reveal>
          </div>

          {/* invoice composition */}
          <Reveal delay={200} className="lp-art" aria-hidden="true">
            <div className="lp-doc lp-float">
              <div className="lp-doc-head">
                <div>
                  <div className="lp-doc-title serif">Tax Invoice</div>
                  <div className="lp-doc-small" style={{ marginTop: 4 }}>INV-2026-0142 · 18 Oct 2026</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, fontSize: '.86rem', color: 'var(--ink)' }}>Kumar Traders</div>
                  <div className="lp-doc-small" style={{ marginTop: 4 }}>GSTIN 33ABCDE1234F1Z5</div>
                </div>
              </div>
              <div className="lp-doc-rows">
                <div className="lp-doc-row head"><span>Item</span><span>Qty</span><span>Amount</span></div>
                {[['Basmati Rice · 25 kg', 4, '6,800'], ['Sunflower Oil · 15 L', 6, '12,900'], ['Toor Dal · 30 kg', 3, '9,150'], ['Sugar · 50 kg', 2, '4,200']].map(([n, q, a]) => (
                  <div key={n} className="lp-doc-row"><span>{n}</span><span>{q}</span><span>₹{a}</span></div>
                ))}
              </div>
              <div className="lp-doc-tax"><span>CGST 2.5%</span><span>₹826.25</span></div>
              <div className="lp-doc-tax"><span>SGST 2.5%</span><span>₹826.25</span></div>
              <div className="lp-doc-total"><span className="lp-doc-small" style={{ letterSpacing: '.16em', textTransform: 'uppercase' }}>Total</span><b>₹34,702</b></div>
              <div className="lp-stamp">PAID</div>
            </div>

            <div className="lp-chip c1 lp-float b" style={{ left: 0, bottom: 0 }}>
              <div className="lp-chip-ico" style={{ background: 'rgba(37,140,85,.12)', color: '#2f7d4f' }}><Send size={17} /></div>
              <div><small>Sent on WhatsApp</small><b>Ravi Kumar Enterprises</b></div>
            </div>
            <div className="lp-chip c2 lp-float" style={{ right: 0, bottom: 74 }}>
              <div className="lp-chip-ico" style={{ background: 'rgba(176,141,87,.14)', color: GOLD }}><TrendingUp size={17} /></div>
              <div><small>Today’s sales</small><b>₹48,250 <span style={{ color: '#2f7d4f', fontSize: '.78rem', fontWeight: 600 }}>↑ 12%</span></b></div>
            </div>
          </Reveal>
        </div>
      </header>

      {/* ══════════════ STATS ══════════════ */}
      <section className="lp-stats" ref={statsRef}>
        <div className="wrap lp-stats-grid">
          {[[`${cInvoices.toLocaleString('en-IN')}+`, 'Invoices generated'], [`${cBiz.toLocaleString('en-IN')}+`, 'Businesses onboarded'], ['100%', 'Browser-based, no installs'], ['∞', 'Unlimited records']].map(([v, l]) => (
            <div key={l} className="lp-stat"><b>{v}</b><span>{l}</span></div>
          ))}
        </div>
      </section>

      {/* ══════════════ INDUSTRIES RIBBON ══════════════ */}
      <section className="lp-ribbon">
        <div className="wrap">
          <div className="lp-ribbon-label">Trusted across trades</div>
          <div className="lp-ribbon-list">{INDUSTRIES.map(i => <span key={i}>{i}</span>)}</div>
        </div>
      </section>

      {/* ══════════════ FEATURES ══════════════ */}
      <section id="features" className="lp-sec alt">
        <div className="wrap">
          <Reveal className="lp-head">
            <div>
              <Eyebrow>Everything in one place</Eyebrow>
              <h2 className="lp-h2 serif">One ledger for the<br />whole <em>business</em>.</h2>
            </div>
            <p className="lp-sub">
              No juggling between apps. From the first quotation to the final GST return,
              BillDheko covers your entire workflow from day one.
            </p>
          </Reveal>
          <div className="lp-feat-grid">
            {FEATURE_GROUPS.map((g, gi) => (
              <Reveal key={g.title} className="lp-feat-col" delay={gi * 90}>
                <h3>{g.title}</h3>
                {g.items.map((it) => (
                  <div key={it.title} className="lp-feat">
                    <div className="lp-feat-top"><span className="lp-feat-ico"><it.icon size={16} strokeWidth={1.7} /></span><h4>{it.title}</h4></div>
                    <p>{it.desc}</p>
                  </div>
                ))}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ LIVE DEMOS ══════════════ */}
      <section className="lp-sec">
        <div className="wrap">
          <Reveal className="lp-head center">
            <Eyebrow>See it in action</Eyebrow>
            <h2 className="lp-h2 serif">Designed around <em>real</em> counters.</h2>
            <p className="lp-sub">Every tool is built around a real problem. These live previews are the screens your team will actually use every day.</p>
          </Reveal>
          <Reveal delay={120}>
            <FeatureDemos isDark={isDark} C={{ muted: isDark ? 'rgba(244,236,223,.56)' : '#7a6760' }} />
          </Reveal>
        </div>
      </section>

      {/* ══════════════ INDUSTRY SHOWCASE ══════════════ */}
      <section id="industries" className="lp-sec alt">
        <div className="wrap">
          <Reveal className="lp-head">
            <div>
              <Eyebrow>Custom sections</Eyebrow>
              <h2 className="lp-h2 serif">Shaped to the way<br /><em>your</em> trade works.</h2>
            </div>
            <p className="lp-sub">
              Beyond invoicing, build your own record forms — linked to customers, printable and searchable.
              Here is how a few businesses use them.
            </p>
          </Reveal>

          <Reveal>
            <div className="lp-tabs" role="tablist">
              {EXAMPLES.map((e, i) => {
                const Ic = e.icon;
                return (
                  <button key={e.badge} role="tab" aria-selected={i === activeExample} className={`lp-tab ${i === activeExample ? 'on' : ''}`} onClick={() => goToExample(i)}>
                    <Ic size={14} /> {e.badge.charAt(0) + e.badge.slice(1).toLowerCase()}
                  </button>
                );
              })}
            </div>
          </Reveal>

          <div className="lp-show" onMouseEnter={() => { pausedRef.current = true; }} onMouseLeave={() => { pausedRef.current = false; }}>
            <div key={`t${activeExample}`} className="lp-show-text lp-fade">
              <h3 className="serif">{ex.heading}</h3>
              <p>{ex.desc}</p>
              <ul className="lp-list">
                {['Text, number, date, dropdown and long-text fields', 'Every record linked to a customer in your party list', 'Multiple tabs per section — e.g. ' + ex.tabs.join(' + '), 'Print or share any record as a formatted PDF'].map(t => (
                  <li key={t}><Check size={16} />{t}</li>
                ))}
              </ul>
            </div>

            <div key={`f${activeExample}`} className="lp-form lp-fade" aria-hidden="true">
              <div className="lp-form-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="lp-feat-ico" style={{ width: 34, height: 34 }}><ExIcon size={15} /></span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.92rem', color: 'var(--ink)' }}>{ex.sectionTitle}</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Custom section</div>
                  </div>
                </div>
                <span style={{ fontSize: '.74rem', fontWeight: 600, color: isDark ? '#1b1210' : '#fff', background: isDark ? '#d9b98a' : P, padding: '7px 14px', borderRadius: 999 }}>+ New</span>
              </div>
              <div className="lp-form-tabs">{ex.tabs.map((t, i) => <span key={t} className={i === 0 ? 'on' : ''}>{t}</span>)}</div>
              <div className="lp-form-body">
                <div className="lp-fields">
                  {ex.topFields.map(f => <div key={f.label} className={`lp-field ${f.accent ? 'accent' : ''}`}><small>{f.label}</small><b>{f.value}</b></div>)}
                </div>
                <div className="lp-fields">
                  {[[ex.detailGroup.leftLabel, ex.detailGroup.leftRows], [ex.detailGroup.rightLabel, ex.detailGroup.rightRows]].map(([label, rows]) => (
                    <div key={label} className="lp-field">
                      <small>{label}</small>
                      {rows.map(([k, v]) => <div key={k} className="lp-kv"><span>{k}</span><b>{v}</b></div>)}
                    </div>
                  ))}
                </div>
                <div className="lp-fields">
                  {ex.midFields.map(f => <div key={f.label} className="lp-field"><small>{f.label}</small><b>{f.value}</b></div>)}
                </div>
                <div className="lp-field"><small>Notes</small><b style={{ fontWeight: 500, fontSize: '.84rem', color: 'var(--ink-soft)' }}>{ex.notes}</b></div>
              </div>
              <div className="lp-recent">
                <div className="lp-field" style={{ border: 'none', padding: 0, marginBottom: 6 }}><small>Recent records</small></div>
                {ex.records.map(r => (
                  <div key={r.name} className="lp-recent-row">
                    <span className="lp-avatar">{r.name.charAt(0)}</span>
                    <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {r.meta}</span></span>
                    <span style={{ color: 'var(--muted)' }}>{r.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ TRUST BAND ══════════════ */}
      <section className="lp-band">
        <div className="wrap">
          <Reveal className="lp-head">
            <div>
              <Eyebrow light>Your data, your rules</Eyebrow>
              <h2 className="lp-h2 serif">Private by design.<br /><em>Safe</em> by default.</h2>
            </div>
            <p className="lp-sub">Choose cloud sync for peace of mind, keep everything offline for full privacy, and give your accountant exactly the access they need — nothing more.</p>
          </Reveal>
          <div className="lp-trust-grid">
            {TRUST.map((t, i) => (
              <Reveal key={t.title} className="lp-trust" delay={i * 100}>
                <div className="lp-trust-ico"><t.icon size={19} strokeWidth={1.6} /></div>
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
                <ul>{t.points.map(p => <li key={p}><Check size={15} />{p}</li>)}</ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ HOW IT WORKS ══════════════ */}
      <section className="lp-sec">
        <div className="wrap">
          <Reveal className="lp-head">
            <div>
              <Eyebrow>Simple onboarding</Eyebrow>
              <h2 className="lp-h2 serif">Up and running<br />in <em>minutes</em>.</h2>
            </div>
            <div>
              <p className="lp-sub">No technical expertise, no downloads, no complicated setup. Open it in your browser and start billing.</p>
              <div className="lp-devices">
                {[{ icon: Smartphone, l: 'Phone' }, { icon: Tablet, l: 'Tablet' }, { icon: Monitor, l: 'Desktop' }].map((d) => <span key={d.l} className="lp-device"><d.icon size={15} />{d.l}</span>)}
              </div>
            </div>
          </Reveal>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} className="lp-step" delay={i * 100}>
                <b>{s.n}</b>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ PRICING ══════════════ */}
      <section id="pricing" className="lp-sec alt">
        <div className="wrap lp-price-grid">
          <Reveal>
            <Eyebrow>Simple pricing</Eyebrow>
            <h2 className="lp-h2 serif">Two plans.<br /><em>Every</em> feature.</h2>
            <p className="lp-sub">Transparent per-business pricing — monthly or yearly, every feature included, no add-ons or surprises.</p>
            <div className="lp-notes">
              <div className="lp-note"><span className="lp-note-ico"><Building2 size={15} /></span>
                <span><strong style={{ color: 'var(--ink)' }}>Running more than one business?</strong> Each plan covers one business — subscribe each business separately.</span></div>
              <div className="lp-note"><span className="lp-note-ico"><ShieldCheck size={15} /></span>
                <span><strong style={{ color: 'var(--ink)' }}>Prepaid, no auto-renewal.</strong> Plans can’t be cancelled or refunded once paid — try everything free for {TRIAL_DAYS} days first.</span></div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="lp-price-card">
              <div className="lp-price-tag"><Star size={13} /><span>BillDheko<TM /> plans</span></div>
              <div className="lp-plan-opts">
                {PLANS.map(p => (
                  <div key={p.id} className={`lp-plan-opt ${p.badge ? 'best' : ''}`}>
                    <div className="lp-plan-opt-name">{p.name}{p.badge && <span>{p.badge}</span>}</div>
                    <div className="lp-price"><b>₹{p.price.toLocaleString('en-IN')}</b><span>{p.short}</span></div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '-4px 0 12px' }}>Per business{gstNote ? ` · ${gstNote}` : ''} · non-cancellable, non-refundable</div>
              <p className="lp-price-trial">Begin with a <strong>{TRIAL_DAYS}-day free trial</strong> — no credit card required.</p>
              <button className="lp-btn lp-btn-primary" style={{ width: '100%' }} onClick={onLoginClick}>
                Start free trial <ArrowRight size={17} />
              </button>
              <ul className="lp-plan-list">
                {PLAN_FEATURES.map(f => <li key={f}><Check size={15} />{f}</li>)}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ FAQ ══════════════ */}
      <section id="faq" className="lp-sec">
        <div className="wrap">
          <Reveal className="lp-head center">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="lp-h2 serif">Frequently <em>asked</em>.</h2>
          </Reveal>
          <Reveal className="lp-faq">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className="lp-faq-item">
                  <button className="lp-faq-q" aria-expanded={open} onClick={() => setOpenFaq(open ? -1 : i)}>
                    {f.q}{open ? <Minus size={20} /> : <Plus size={20} />}
                  </button>
                  <div className={`lp-faq-a ${open ? 'open' : ''}`}><div><p>{f.a}</p></div></div>
                </div>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* ══════════════ FINAL CTA ══════════════ */}
      <section className="lp-final">
        <div className="wrap">
          <Reveal className="lp-final-card">
            <Eyebrow light>Begin today</Eyebrow>
            <h2 className="lp-h2 serif">Keep better books,<br /><em>beautifully</em>.</h2>
            <p>Join businesses across India who run their billing, stock and accounts on BillDheko.</p>
            <button className="lp-btn lp-btn-light" onClick={onLoginClick}>Open BillDheko <ArrowUpRight size={17} /></button>
            <p className="lp-final-fine">{TRIAL_DAYS}-day free trial · ₹{PLAN_PRICE} / 30 days or ₹{YEARLY_PRICE.toLocaleString('en-IN')} / year per business · No credit card</p>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="lp-foot">
        <div className="wrap">
          <div className="lp-foot-grid">
            <div>
              <Brand size={34} />
              <p>Premium GST billing and accounting for Indian businesses — invoicing, inventory, payments and reports in one place.</p>
            </div>
            <div>
              <h5>Product</h5>
              <div className="lp-foot-links">
                {[['Features', 'features'], ['Industries', 'industries'], ['Pricing', 'pricing'], ['FAQ', 'faq']].map(([l, id]) => (
                  <button key={id} onClick={() => go(id)}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <h5>Company</h5>
              <div className="lp-foot-links">
                <button onClick={onLoginClick}>Sign in</button>
                <a href="/contact" onClick={linkTo('/contact')}>Contact Us</a>
              </div>
            </div>
            <div>
              <h5>Legal</h5>
              <div className="lp-foot-links">
                {LEGAL_PAGES.filter(p => p.key !== 'contact').map(p => <a key={p.key} href={p.path} onClick={linkTo(p.path)}>{p.title}</a>)}
              </div>
            </div>
          </div>
          <div className="lp-foot-bottom">
            <span style={{ display: 'inline' }}>© {new Date().getFullYear()} BillDheko<TM />. All rights reserved.</span>
            <span><ShieldCheck size={14} /> Secure cloud platform · Payments by Razorpay</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
