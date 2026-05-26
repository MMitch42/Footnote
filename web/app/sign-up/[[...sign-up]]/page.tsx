import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <span className="font-mono text-xl font-bold text-text-primary tracking-tight">
          FOOTNOTE
        </span>
        <p className="text-sm text-text-muted mt-1">SEC Filing Intelligence</p>
      </div>
      <SignUp
        appearance={{
          variables: {
            colorPrimary: "#f59e0b",
            colorBackground: "#111111",
            colorInputBackground: "#1a1a1a",
            colorInputText: "#f0f0f0",
            colorText: "#f0f0f0",
            colorTextSecondary: "#9ca3af",
            colorNeutral: "#374151",
            borderRadius: "4px",
            fontFamily: "var(--font-geist-sans)",
            fontSize: "14px",
          },
          elements: {
            card: "bg-bg-surface border border-bg-border shadow-none",
            headerTitle: "text-text-primary font-semibold",
            headerSubtitle: "text-text-muted",
            socialButtonsBlockButton:
              "border-bg-border bg-bg-raised hover:bg-bg-raised/80 text-text-primary",
            formFieldInput:
              "bg-bg-raised border-bg-border text-text-primary focus:border-accent",
            formButtonPrimary:
              "bg-accent hover:bg-accent-bright text-bg-base font-semibold",
            footerActionLink: "text-accent hover:text-accent-bright",
            dividerLine: "bg-bg-border",
            dividerText: "text-text-muted",
          },
        }}
      />
    </div>
  );
}
