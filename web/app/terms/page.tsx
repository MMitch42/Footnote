import Link from "next/link";

export const metadata = { title: "Terms of Service | Footnote" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <nav className="border-b border-bg-border">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center">
          <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors">
            FOOTNOTE
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="font-mono text-2xl font-bold text-text-primary mb-2">Terms of Service</h1>
        <p className="text-sm text-text-muted mb-10">Last updated: May 26, 2026</p>

        <div className="space-y-8 text-sm text-text-secondary leading-relaxed">

          <section>
            <h2 className="font-semibold text-text-primary mb-2">1. Agreement</h2>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Footnote (&ldquo;Service&rdquo;),
              operated by Mitchell Magid (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
              By accessing or using the Service, you agree to be bound by these Terms.
              If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">2. Description of Service</h2>
            <p>
              Footnote is a software tool that retrieves publicly available SEC filings, compares
              consecutive filings for language changes, and delivers alerts to subscribers. The Service
              is provided for informational purposes only.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">3. Not Financial Advice</h2>
            <p>
              Nothing on Footnote constitutes financial, investment, legal, or tax advice. The Service
              surfaces changes in public SEC disclosures. It does not recommend buying or selling any
              security. You are solely responsible for any investment decisions you make. Past signal
              performance documented in academic research does not guarantee future results.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">4. Subscriptions and Billing</h2>
            <p className="mb-3">
              Footnote Pro is billed monthly at the rate displayed at checkout. Your subscription
              renews automatically each billing period unless cancelled.
            </p>
            <p className="mb-3">
              <strong className="text-text-primary">Cancellation:</strong> You may cancel at any time
              through your account settings. Cancellation takes effect at the end of your current
              billing period. You retain access to Pro features until that date.
            </p>
            <p>
              <strong className="text-text-primary">Refunds:</strong> All payments are non-refundable.
              We do not issue partial refunds for unused portions of a billing period.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">5. Acceptable Use</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to reverse-engineer, scrape, or systematically extract data from the Service</li>
              <li>Share account credentials with others</li>
              <li>Use the Service in any way that could damage, disable, or impair it</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">6. Intellectual Property</h2>
            <p>
              The Footnote application code and user interface are owned by Mitchell Magid.
              SEC filings retrieved through the Service are public domain documents published by
              the U.S. Securities and Exchange Commission. You may not copy or distribute the
              application code or interface design without permission.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">7. Disclaimers and Limitation of Liability</h2>
            <p className="mb-3">
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. We do not
              warrant that the Service will be uninterrupted, error-free, or that filing data will be
              complete or accurate.
            </p>
            <p>
              To the maximum extent permitted by law, Mitchell Magid shall not be liable for any
              indirect, incidental, special, or consequential damages arising from your use of the
              Service, including but not limited to investment losses.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">8. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the Service after changes
              constitutes acceptance of the updated Terms. Material changes will be communicated
              by email.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">9. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Illinois, United States,
              without regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">10. Contact</h2>
            <p>
              Questions about these Terms:{" "}
              <a href="mailto:mitchell.magid@gmail.com" className="text-accent hover:text-accent-bright transition-colors">
                mitchell.magid@gmail.com
              </a>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
