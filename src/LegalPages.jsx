import React from 'react';
import BillDhekoLogo, { TM } from './BillDhekoLogo';
import { useBilling } from './BillingContext';
import { TRIAL_DAYS, PLANS } from './planTiers';
import { LEGAL_PAGES, linkTo } from './legalPagesConfig';

// Public legal / policy pages — reachable without signing in (see App.jsx) and
// linked from the landing-page footer, the plan screen and the checkout. These
// are the pages Razorpay asks for when verifying a website: Privacy Policy,
// Terms & Conditions, Cancellation & Refund Policy, Shipping & Delivery Policy
// and Contact Us. Seller details (legal name, address, phone, email, GSTIN)
// come from Admin → Billing & Tax (globalConfig/billing).


const SITE = 'www.billdheko.com';
const DEFAULT_EMAIL = 'support@billdheko.com';
const LAST_UPDATED = '18 October 2026';

const C = { ink: '#24130f', soft: '#4a3631', muted: '#7a6760', line: '#e9dfd5', ox: '#5c1f22', oxDeep: '#3f1417', gold: '#b08d57', bg: '#fbf8f4' };
const serif = "'Fraunces', Georgia, 'Times New Roman', serif";

const H2 = ({ n, children }) => (
  <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: '1.3rem', color: C.ink, margin: '34px 0 10px', letterSpacing: '-0.01em' }}>
    {n != null && <span style={{ color: C.gold, marginRight: 8 }}>{n}.</span>}{children}
  </h2>
);
const P = ({ children }) => <p style={{ margin: '0 0 12px' }}>{children}</p>;
const UL = ({ children }) => <ul style={{ paddingLeft: 20, margin: '4px 0 12px' }}>{children}</ul>;
const LI = ({ children }) => <li style={{ marginBottom: 7 }}>{children}</li>;
const Callout = ({ children }) => (
  <div style={{ border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.ox}`, background: '#fff', borderRadius: 10, padding: '14px 16px', margin: '12px 0 16px' }}>{children}</div>
);

const planLine = () => PLANS.map(p => `₹${p.price.toLocaleString('en-IN')} for ${p.period}`).join(' or ');

const useSeller = () => {
  const { billing } = useBilling() || {};
  const b = billing || {};
  const name = (b.legalName || '').trim() || 'BillDheko';
  const email = (b.email || '').trim() || DEFAULT_EMAIL;
  const phone = (b.phone || '').trim();
  const address = [(b.address || '').trim(), (b.sellerState || '').trim()].filter(Boolean).join(', ');
  return { name, email, phone, address, gstin: (b.gstin || '').trim(), state: (b.sellerState || '').trim() };
};

const ContactBlock = ({ s }) => (
  <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', lineHeight: 1.8 }}>
    <div style={{ fontWeight: 700, color: C.ink }}>{s.name}</div>
    {s.address && <div>Registered address: {s.address}, India</div>}
    <div>Email: <a href={`mailto:${s.email}`} style={{ color: C.ox }}>{s.email}</a></div>
    {s.phone && <div>Phone: <a href={`tel:${s.phone.replace(/\s/g, '')}`} style={{ color: C.ox }}>{s.phone}</a></div>}
    {s.gstin && <div>GSTIN: {s.gstin}</div>}
    <div>Website: {SITE}</div>
  </div>
);

// ── Page bodies ─────────────────────────────────────────────────────────────

const Terms = ({ s }) => (
  <>
    <P>These Terms &amp; Conditions ("Terms") govern your use of BillDheko, the web-based billing and accounting software at {SITE} (the "Service"), operated by {s.name} ("we", "us", "our"). By creating an account, starting a trial or paying for a plan you agree to these Terms.</P>
    <H2 n={1}>The Service</H2>
    <P>BillDheko lets businesses create GST invoices, manage stock, parties, payments, expenses, staff and reports, with local storage on your device and cloud backup/sync. Features may be added, changed or removed over time.</P>
    <H2 n={2}>Accounts</H2>
    <UL>
      <LI>You must be at least 18 years old and provide accurate information.</LI>
      <LI>You are responsible for everything done through your account, including by staff you add, and for keeping your login and business code / passwords secure.</LI>
      <LI>One subscription covers one business. Each additional business needs its own subscription.</LI>
    </UL>
    <H2 n={3}>Free trial</H2>
    <P>Each business can start one {TRIAL_DAYS}-day free trial with every feature unlocked. No payment details are needed for the trial. When it ends, a paid plan is required to keep creating and editing records.</P>
    <H2 n={4}>Plans, pricing and payment</H2>
    <UL>
      <LI>Plans: {planLine()} per business. GST is charged as applicable and shown before you pay.</LI>
      <LI>Plans are <strong>prepaid</strong> for the stated period and <strong>do not renew automatically</strong>. Paying again before a period ends adds the new period on top of the time remaining.</LI>
      <LI>Payments are processed by Razorpay. We do not see or store your card, UPI or bank details.</LI>
      <LI>A GST tax invoice for every payment is available in Settings → Billing &amp; Payments.</LI>
      <LI>Prices may change in future; a change never affects a period you have already paid for.</LI>
    </UL>
    <H2 n={5}>No cancellation, no refunds</H2>
    <Callout>
      <strong style={{ color: C.ox }}>Both plans are non-cancellable and non-refundable.</strong> Once a payment succeeds the plan cannot be cancelled, and no refund (full or partial) is given for unused time, change of mind, accidental purchase, or not using the Service. Please use the free trial to evaluate BillDheko before paying. See the Cancellation &amp; Refund Policy for the only exceptions (duplicate or failed-but-charged payments).
    </Callout>
    <H2 n={6}>When a plan ends</H2>
    <P>If you don't renew, the business is locked for editing until you pay again. Your data is not deleted because a plan ended; renewing restores full access.</P>
    <H2 n={7}>Your data</H2>
    <UL>
      <LI>You own the data you enter. You grant us only the rights needed to store, back up, sync and display it to you and the people you authorise.</LI>
      <LI>You are responsible for the accuracy of your invoices, tax calculations and filings. BillDheko is a tool and does not provide legal, tax or accounting advice.</LI>
      <LI>You can export your data at any time (Backup and Excel export features).</LI>
    </UL>
    <H2 n={8}>Acceptable use</H2>
    <P>You must not misuse the Service: no unlawful activity, fraud, issuing fake invoices, attempting to break security, reverse-engineering, overloading the system, or reselling the Service without written permission. We may suspend accounts that do.</P>
    <H2 n={9}>Availability</H2>
    <P>We aim for the Service to be available at all times but do not guarantee uninterrupted or error-free operation. Planned maintenance, internet issues or third-party outages (hosting, Google/Firebase, Razorpay) may affect access. The app keeps working offline on your device where possible.</P>
    <H2 n={10}>Limitation of liability</H2>
    <P>To the extent permitted by law, we are not liable for indirect or consequential losses (including lost profits or data), and our total liability for any claim is limited to the amount you paid us for the affected business in the 12 months before the claim.</P>
    <H2 n={11}>Suspension and termination</H2>
    <P>You may stop using the Service at any time (no refund applies, see section 5). We may suspend or close an account that breaches these Terms; where possible we will give notice and a chance to export your data.</P>
    <H2 n={12}>Changes to these Terms</H2>
    <P>We may update these Terms. The "Last updated" date shows the latest version. Continuing to use the Service after a change means you accept the updated Terms.</P>
    <H2 n={13}>Governing law</H2>
    <P>These Terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of the courts {s.state ? `in ${s.state}` : 'where our registered office is located'}, India.</P>
    <H2 n={14}>Contact</H2>
    <ContactBlock s={s} />
  </>
);

const Refund = ({ s }) => (
  <>
    <Callout>
      <strong style={{ color: C.ox }}>All BillDheko plans are non-cancellable and non-refundable.</strong>
      <div style={{ marginTop: 6 }}>Plans: {planLine()} per business. A {TRIAL_DAYS}-day free trial (no payment needed) is available so you can try every feature before paying.</div>
    </Callout>
    <H2 n={1}>Cancellation</H2>
    <UL>
      <LI>Once a payment succeeds, the plan cannot be cancelled for the rest of its period (30 days for the monthly plan, 1 year for the yearly plan).</LI>
      <LI>Plans do <strong>not</strong> renew automatically, so there is nothing to cancel to avoid future charges — you are only charged when you choose to pay again.</LI>
      <LI>You can stop using the Service at any time; this does not entitle you to a refund.</LI>
    </UL>
    <H2 n={2}>Refunds</H2>
    <P>We do not give full or partial refunds for unused time, change of mind, accidental purchase of the wrong plan, buying for the wrong business, or not using the Service.</P>
    <H2 n={3}>The only exceptions</H2>
    <UL>
      <LI><strong>Duplicate payment</strong> — you were charged twice for the same business and period.</LI>
      <LI><strong>Charged but not activated</strong> — money was debited but the plan was not activated and we cannot activate it.</LI>
    </UL>
    <P>Write to <a href={`mailto:${s.email}`} style={{ color: C.ox }}>{s.email}</a> within 7 days of the payment with your account email and the Razorpay payment ID. Approved refunds are made to the original payment method within 5–7 working days of approval (your bank may take longer to show it).</P>
    <H2 n={4}>Contact</H2>
    <ContactBlock s={s} />
  </>
);

const Shipping = ({ s }) => (
  <>
    <P>BillDheko is a software-as-a-service product. <strong>No physical goods are shipped.</strong></P>
    <H2 n={1}>Delivery of the Service</H2>
    <UL>
      <LI>Access is delivered online, instantly. Your free trial starts as soon as you start it.</LI>
      <LI>A paid plan is activated automatically within a few minutes of a successful payment (usually immediately). You get access in the same account at {SITE}.</LI>
      <LI>Your GST tax invoice is available straight away in Settings → Billing &amp; Payments.</LI>
    </UL>
    <H2 n={2}>If activation is delayed</H2>
    <P>If your plan isn't active within 30 minutes of a successful payment, contact <a href={`mailto:${s.email}`} style={{ color: C.ox }}>{s.email}</a> with your account email and Razorpay payment ID and we'll activate it.</P>
    <H2 n={3}>Contact</H2>
    <ContactBlock s={s} />
  </>
);

const Privacy = ({ s }) => (
  <>
    <P>{s.name} ("we", "our", "us") respects your privacy. This policy explains how BillDheko at {SITE} (the "Service") collects, uses, stores and protects your information.</P>
    <H2 n={1}>Information we collect</H2>
    <UL>
      <LI><strong>Account information:</strong> name, email address and business details you provide when you sign in or set up a business.</LI>
      <LI><strong>Business data:</strong> invoices, items, customers and vendors, payments, expenses, staff and other records you enter.</LI>
      <LI><strong>Payment information:</strong> payments are processed by Razorpay. We do <strong>not</strong> collect or store card, UPI or bank details; we keep the payment reference, amount, plan and GST details for your invoice.</LI>
      <LI><strong>Usage data:</strong> basic technical information such as browser, device type, IP address and features used.</LI>
      <LI><strong>Communications:</strong> messages you send to our support.</LI>
    </UL>
    <H2 n={2}>How we use it</H2>
    <UL>
      <LI>To provide, operate and improve the Service.</LI>
      <LI>To process payments and issue GST tax invoices.</LI>
      <LI>To send service, security and support messages.</LI>
      <LI>To meet legal obligations under Indian law (including GST and the IT Act, 2000).</LI>
    </UL>
    <H2 n={3}>Storage and security</H2>
    <P>BillDheko is local-first: your business data is stored in your browser on your device and, while your plan is active, backed up to our secure cloud (Google Firebase) so it can sync across devices. Data in transit is encrypted (HTTPS). No system is 100% secure — keep your login and passwords private.</P>
    <H2 n={4}>Sharing</H2>
    <P>We do <strong>not</strong> sell your data. We share it only with Razorpay (payments), our infrastructure providers (Google Firebase, hosting) to run the Service, and authorities when required by law.</P>
    <H2 n={5}>Cookies</H2>
    <P>We use cookies and local storage to keep you signed in and remember preferences. Disabling them may stop some features working.</P>
    <H2 n={6}>Retention</H2>
    <P>Data on your device stays until you clear it. Cloud data is kept while your account exists. You can ask us to delete your account and cloud data at any time.</P>
    <H2 n={7}>Your rights</H2>
    <P>You can ask to access, correct or delete your personal data, and opt out of non-essential messages, by writing to <a href={`mailto:${s.email}`} style={{ color: C.ox }}>{s.email}</a>.</P>
    <H2 n={8}>Children</H2>
    <P>The Service is not intended for anyone under 18.</P>
    <H2 n={9}>Changes</H2>
    <P>We may update this policy; the "Last updated" date shows the current version.</P>
    <H2 n={10}>Contact</H2>
    <ContactBlock s={s} />
  </>
);

const Contact = ({ s }) => (
  <>
    <P>We're happy to help with questions about your account, plans, payments or invoices.</P>
    <ContactBlock s={s} />
    <H2>Support hours</H2>
    <P>Monday to Saturday, 10:00 am – 6:00 pm IST (excluding public holidays). We usually reply to email within one working day.</P>
    <H2>Payment queries</H2>
    <P>For anything about a payment, please include your account email and the Razorpay payment ID so we can find it quickly.</P>
  </>
);

const BODIES = { terms: Terms, privacy: Privacy, refund: Refund, shipping: Shipping, contact: Contact };

export default function LegalPages({ page = 'terms', onBack }) {
  const s = useSeller();
  const meta = LEGAL_PAGES.find(p => p.key === page) || LEGAL_PAGES[0];
  const Body = BODIES[meta.key];
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.soft, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <header style={{ background: `linear-gradient(150deg, ${C.ox} 0%, ${C.oxDeep} 100%)`, color: '#f6ecdf', padding: '22px 20px 0' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <a href="/" onClick={linkTo('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none' }}>
              <span style={{ background: '#fff', borderRadius: 8, padding: 3, display: 'flex' }}><BillDhekoLogo size={30} /></span>
              <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>BillDheko<TM /></span>
            </a>
            {onBack && (
              <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999, padding: '7px 16px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                ← Back
              </button>
            )}
          </div>
          <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', margin: '26px 0 6px', letterSpacing: '-0.02em', color: '#fff' }}>{meta.title}</h1>
          <div style={{ fontSize: '0.82rem', color: 'rgba(246,236,223,0.7)', marginBottom: 18 }}>Last updated: {LAST_UPDATED}</div>
          <nav style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {LEGAL_PAGES.map(p => (
              <a key={p.key} href={p.path} onClick={linkTo(p.path)} style={{
                whiteSpace: 'nowrap', padding: '10px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none',
                color: p.key === meta.key ? '#fff' : 'rgba(246,236,223,0.65)',
                borderBottom: p.key === meta.key ? '2px solid #d9b98a' : '2px solid transparent',
              }}>{p.title}</a>
            ))}
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 72px', fontSize: '0.95rem', lineHeight: 1.75 }}>
        <Body s={s} />
        <p style={{ marginTop: 44, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: '0.8rem', color: C.muted }}>
          © {new Date().getFullYear()} {s.name} · BillDheko<TM /> · {SITE}
        </p>
      </main>
    </div>
  );
}
