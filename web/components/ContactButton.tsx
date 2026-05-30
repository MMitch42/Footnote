"use client";

import { openFeatureLauncherFeedback } from "@/lib/featureLauncherStore";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export function ContactButton({ className, children }: Props) {
  return (
    <button onClick={openFeatureLauncherFeedback} className={className}>
      {children ?? "Contact"}
    </button>
  );
}
