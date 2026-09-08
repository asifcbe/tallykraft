import React from 'react';
import TallyKraftLogo from './TallyKraftLogo';
import { useBilling } from './BillingContext';

// Public, self-contained Privacy Policy + Refund/Cancellation page.
// Reachable without authentication (see App.jsx public-route handling) so it can
// be linked from the landing-page footer and referenced by the payment gateway.
//
// Content is adapted to how TallyKraft actually works:
//  • A single subscription plan (₹299/mo · ₹2999/yr) — every feature plus cloud
//    backup and multi-device sync.
//  • Business data is stored locally (browser IndexedDB) AND backed up to our
//    secure cloud (Google Firebase) so it can sync and restore across devices.
//  • Payments are processed by Razorpay; we never see or store card details.
//  • 3-day free trial → no refunds on subscription payments.

const SITE = 'www.tallykraft.com';
const SUPPORT_EMAIL = 'support@tallykraft.com';
const EFFECTIVE_DATE = 'June 8, 2026';

const Section = ({ n, title, children }) => (
  <section style={{ marginBottom: 28 }}>
    <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ color: '#0e7490' }}>{n}.</span> {title}
    </h2>
    <div style={{ fontSize: '0.92rem', lineHeight: 1.65, color: '#334155' }}>{children}</div>
  </section>
);

const Li = ({ children }) => (
  <li style={{ marginBottom: 6 }}>{children}</li>
);

export default function PrivacyPolicy({ onBack }) {
  // Pull the legally-registered seller details from Admin → Billing so the
  // contact block always shows the GST-registered name / address / GSTIN.
  const { billing } = useBilling() || {};
  const legalName = billing?.legalName?.trim() || 'TallyKraft';
  const gstAddress = billing?.address?.trim() || '';
  const gstin = billing?.gstin?.trim() || '';
  const sellerState = billing?.sellerState?.trim() || '';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '0 0 64px' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f2733 0%, #0e7490 100%)', color: '#fff', padding: '28px 20px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TallyKraftLogo size={40} />
            <span style={{ fontWeight: 800, letterSpacing: '0.04em' }}>TALLYKRAFT</span>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              ← Back
            </button>
          )}
        </div>
        <div style={{ maxWidth: 820, margin: '18px auto 0' }}>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, margin: 0 }}>Privacy Policy</h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', opacity: 0.85 }}>
            Effective Date: {EFFECTIVE_DATE} · Last Updated: {EFFECTIVE_DATE}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px', background: '#fff', borderRadius: 0 }}>
        <p style={{ fontSize: '0.92rem', lineHeight: 1.65, color: '#334155', marginTop: 0 }}>
          TallyKraft ("we", "our", or "us") is committed to protecting the privacy of our users. This
          Privacy Policy explains how we collect, use, store, and protect your information when you use
          our web-based billing and accounting software available at {SITE} (the "Service").
        </p>

        <Section n={1} title="Information We Collect">
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <Li><strong>Account Information:</strong> Name, email address, and business name you provide when you sign in or register.</Li>
            <Li><strong>Business Data:</strong> Invoices, billing records, stock/items, party (customer &amp; vendor) details, expenses, and other financial data you enter. See section 3 for where this is stored.</Li>
            <Li><strong>Payment Information:</strong> Subscription payments are processed securely through our payment gateway, <strong>Razorpay</strong>. We do <strong>not</strong> collect or store your card, UPI, or bank details — these are handled entirely by Razorpay.</Li>
            <Li><strong>Usage Data:</strong> Basic technical information such as features used, browser type, device type, and IP address.</Li>
            <Li><strong>Communication Data:</strong> Messages you send to our support team via email or WhatsApp.</Li>
          </ul>
        </Section>

        <Section n={2} title="How We Use Your Information">
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <Li>To provide, operate, and maintain the TallyKraft service.</Li>
            <Li>To process your subscription payments and issue GST tax invoices/receipts.</Li>
            <Li>To send important service updates, security notices, and support messages.</Li>
            <Li>To improve the software based on how it is used.</Li>
            <Li>To comply with legal obligations under Indian law (GST, IT Act 2000, etc.).</Li>
            <Li>To respond to your support requests.</Li>
          </ul>
        </Section>

        <Section n={3} title="Data Storage and Security">
          <p style={{ margin: '0 0 8px' }}>
            TallyKraft is a <strong>local-first</strong> application:
          </p>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <Li><strong>On your device:</strong> Your business data is written to your browser's local storage first, so the app stays fast and keeps working offline.</Li>
            <Li><strong>Cloud backup:</strong> While your subscription is active, that data is also backed up to our secure cloud (hosted on Google Firebase) so you can sync and restore across devices. This cloud copy is tied to your account.</Li>
          </ul>
          <p style={{ margin: '8px 0 0' }}>
            We use industry-standard encryption (HTTPS/SSL) to protect data in transit, and rely on
            trusted infrastructure providers for cloud storage. However, no system is 100% secure. Please
            use a strong password and do not share your account credentials.
          </p>
        </Section>

        <Section n={4} title="Sharing of Information">
          <p style={{ margin: '0 0 6px' }}>We do <strong>not</strong> sell your personal data to any third party. We share information only with:</p>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <Li><strong>Payment Processor:</strong> Razorpay, solely to process your subscription payments.</Li>
            <Li><strong>Infrastructure Providers:</strong> Vercel (application hosting) and Google Firebase (authentication and cloud backup).</Li>
            <Li><strong>Legal Authorities:</strong> If required by law, court order, or a government authority in India.</Li>
          </ul>
        </Section>

        <Section n={5} title="Payments, Subscriptions &amp; Refunds">
          <p style={{ margin: '0 0 8px' }}>
            All subscription payments are processed through Razorpay. By subscribing, you also agree to
            Razorpay's applicable terms.
          </p>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', margin: '8px 0' }}>
            <strong style={{ color: '#b91c1c' }}>No-Refund Policy.</strong>
            <p style={{ margin: '4px 0 0', color: '#7f1d1d' }}>
              We offer a <strong>3-day free trial</strong> with full access to all features so you can
              evaluate the Service before paying. Because of this, all subscription payments are
              <strong> final and non-refundable</strong>. We do not provide refunds for partially used
              periods, accidental purchases, or change of mind.
            </p>
          </div>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <Li><strong>No auto-renewal:</strong> Subscriptions do not renew automatically. Your plan stays active until the paid period ends; you simply pay again whenever you choose to continue.</Li>
            <Li><strong>Cancellation:</strong> You may stop using the Service at any time. Since there is no auto-renewal, no cancellation step is required and no further charges occur.</Li>
            <Li>If you were charged due to a genuine technical error (e.g. a duplicate charge for the same period), contact us at {SUPPORT_EMAIL} and we will investigate.</Li>
          </ul>
        </Section>

        <Section n={6} title="Cookies">
          <p style={{ margin: 0 }}>
            TallyKraft uses cookies and similar technologies to keep you signed in, remember your
            preferences, and understand how the Service is used. You can disable cookies in your browser
            settings, but some features may not work correctly.
          </p>
        </Section>

        <Section n={7} title="Data Retention">
          <p style={{ margin: 0 }}>
            Data on your device is retained until you clear it. We retain your cloud backup for as long as
            your account is active. If your subscription lapses, the local copy on your device remains
            available to you; you may request deletion of your account and any cloud data at any time by
            contacting us.
          </p>
        </Section>

        <Section n={8} title="Your Rights">
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <Li>Access the personal data we hold about you.</Li>
            <Li>Request correction of inaccurate data.</Li>
            <Li>Request deletion of your account and any cloud-stored data.</Li>
            <Li>Withdraw consent for non-essential communications at any time.</Li>
          </ul>
          <p style={{ margin: '6px 0 0' }}>To exercise any of these rights, contact us at {SUPPORT_EMAIL}.</p>
        </Section>

        <Section n={9} title="Third-Party Links">
          <p style={{ margin: 0 }}>
            The Service may contain links to third-party websites. We are not responsible for their
            privacy practices and encourage you to read their policies.
          </p>
        </Section>

        <Section n={10} title="Children's Privacy">
          <p style={{ margin: 0 }}>
            TallyKraft is not intended for anyone under the age of 18. We do not knowingly collect
            personal information from minors.
          </p>
        </Section>

        <Section n={11} title="Changes to This Policy">
          <p style={{ margin: 0 }}>
            We may update this Privacy Policy from time to time. When we do, we will update the "Last
            Updated" date above. Continued use of the Service after changes are posted means you accept
            the updated policy.
          </p>
        </Section>

        <Section n={12} title="Contact Us">
          <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{legalName}</div>
            <div>Email: {SUPPORT_EMAIL}</div>
            <div>Website: {SITE}</div>
            {gstin && <div>GSTIN: {gstin}</div>}
            {(gstAddress || sellerState) && (
              <div>Registered Address: {[gstAddress, sellerState].filter(Boolean).join(', ')}, India</div>
            )}
          </div>
        </Section>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', marginTop: 32 }}>
          © {new Date().getFullYear()} TallyKraft. All rights reserved. · {SITE}
        </p>
      </div>
    </div>
  );
}
