import { SignIn } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorPrimary: "#f59e0b",
    colorBackground: "#161616",
    colorInputBackground: "#1f1f1f",
    colorInputText: "#f0f0f0",
    colorText: "#f0f0f0",
    colorTextSecondary: "#9ca3af",
    colorNeutral: "#6b7280",
    colorDanger: "#ef4444",
    borderRadius: "8px",
    fontSize: "14px",
  },
  elements: {
    card: {
      backgroundColor: "#161616",
      border: "1px solid #2a2a2a",
      boxShadow: "none",
    },
    headerTitle: { color: "#f0f0f0", fontWeight: "600" },
    headerSubtitle: { color: "#9ca3af" },
    socialButtonsBlockButton: {
      backgroundColor: "#1f1f1f",
      border: "1px solid #2a2a2a",
      color: "#f0f0f0",
    },
    socialButtonsBlockButtonText: { color: "#f0f0f0" },
    dividerLine: { backgroundColor: "#2a2a2a" },
    dividerText: { color: "#6b7280" },
    formFieldLabel: { color: "#9ca3af" },
    formFieldInput: {
      backgroundColor: "#1f1f1f",
      border: "1px solid #2a2a2a",
      color: "#f0f0f0",
    },
    formButtonPrimary: {
      backgroundColor: "#f59e0b",
      color: "#0a0a0a",
      fontWeight: "600",
    },
    footerActionText: { color: "#9ca3af" },
    footerActionLink: { color: "#f59e0b" },
    identityPreviewText: { color: "#f0f0f0" },
    identityPreviewEditButton: { color: "#f59e0b" },
  },
} as const;

export default function Page() {
  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <span className="font-mono text-xl font-bold text-text-primary tracking-tight">
          FOOTNOTE
        </span>
        <p className="text-sm text-text-muted mt-1">SEC Filing Intelligence</p>
      </div>
      <SignIn appearance={clerkAppearance} />
    </div>
  );
}
