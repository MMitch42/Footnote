import Link from "next/link";
import { ContactButton } from "@/components/ContactButton";

export const metadata = { title: "Privacy Policy | Footnote" };

export default function PrivacyPage() {
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
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors mb-8">
          ← Back
        </Link>
        <h1 className="font-mono text-2xl font-bold text-text-primary mb-2">Privacy Policy</h1>
        <p className="text-sm text-text-muted mb-10">Last updated: May 26, 2026</p>

        <div className="space-y-8 text-sm text-text-secondary leading-relaxed">

          <section>
            <h2 className="font-semibold text-text-primary mb-2">1. Overview</h2>
            <p>
              This Privacy Policy describes how Mitchell Magid (&ldquo;we,&rdquo; &ldquo;us,&rdquo;
              or &ldquo;our&rdquo;) collects, uses, and protects information when you use Footnote
              (&ldquo;Service&rdquo;). We collect only what is necessary to operate the Service.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-text-primary">Account information:</strong> Your email address
                and authentication method (email/password or Google OAuth), collected via Clerk.
              </li>
              <li>
                <strong className="text-text-primary">Watchlist data:</strong> The ticker symbols you
                add to your watchlist and your alert threshold settings.
              </li>
              <li>
                <strong className="text-text-primary">Payment information:</strong> Billing is handled
                entirely by Stripe. We store only your Stripe customer ID and subscription status.
                We never see or store your card details.
              </li>
              <li>
                <strong className="text-text-primary">Usage data:</strong> Standard server logs
                (IP address, browser type, pages visited) for security and debugging purposes.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide and operate the Service</li>
              <li>To send you filing alert emails based on your watchlist and threshold settings</li>
              <li>To process payments and manage your subscription</li>
              <li>To respond to support requests</li>
              <li>To detect and prevent fraud or abuse</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information. We do not use your data for advertising.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">4. Third-Party Services</h2>
            <p className="mb-3">
              We use the following third-party services to operate Footnote. Each has its own
              privacy policy governing how they handle your data:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-text-primary">Clerk</strong>: authentication and user
                management.{" "}
                <a href="https://clerk.com/privacy" className="text-accent hover:text-accent-bright transition-colors" target="_blank" rel="noopener noreferrer">Privacy policy →</a>
              </li>
              <li>
                <strong className="text-text-primary">Stripe</strong>: payment processing.{" "}
                <a href="https://stripe.com/privacy" className="text-accent hover:text-accent-bright transition-colors" target="_blank" rel="noopener noreferrer">Privacy policy →</a>
              </li>
              <li>
                <strong className="text-text-primary">Resend</strong>: transactional email delivery.{" "}
                <a href="https://resend.com/privacy" className="text-accent hover:text-accent-bright transition-colors" target="_blank" rel="noopener noreferrer">Privacy policy →</a>
              </li>
              <li>
                <strong className="text-text-primary">Supabase</strong>: database storage.{" "}
                <a href="https://supabase.com/privacy" className="text-accent hover:text-accent-bright transition-colors" target="_blank" rel="noopener noreferrer">Privacy policy →</a>
              </li>
              <li>
                <strong className="text-text-primary">Vercel</strong>: hosting and infrastructure.{" "}
                <a href="https://vercel.com/legal/privacy-policy" className="text-accent hover:text-accent-bright transition-colors" target="_blank" rel="noopener noreferrer">Privacy policy →</a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">5. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. If you delete
              your account, we will delete your personal data within 30 days, except where
              retention is required by law (e.g., payment records).
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">6. Your Rights</h2>
            <p className="mb-3">You may at any time:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction or deletion of your data</li>
              <li>Cancel your subscription and close your account</li>
              <li>Opt out of email alerts by removing tickers from your watchlist</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights,{" "}
              <ContactButton className="text-accent hover:text-accent-bright transition-colors underline">
                contact us
              </ContactButton>.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">7. Security</h2>
            <p>
              We use industry-standard security practices including HTTPS encryption, secure
              authentication via Clerk, and access-controlled database storage via Supabase.
              No method of transmission over the internet is 100% secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              communicated by email. Continued use of the Service after changes constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-text-primary mb-2">9. Contact</h2>
            <p>
              Privacy questions or data requests:{" "}
              <ContactButton className="text-accent hover:text-accent-bright transition-colors underline">
                send us a message
              </ContactButton>.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-bg-border">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors">
            ← Back to Footnote
          </Link>
        </div>
      </div>
    </div>
  );
}
