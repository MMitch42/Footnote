/**
 * Module-level store for the diff currently on screen.
 * DiffPageClient writes here when data loads; ChatWidget reads from it.
 * No React context needed — both live in the same browser tab.
 */

export type DiffPassage = {
  old: string;
  new: string;
  score: number | null;
  direction: "escalating" | "reassuring" | "neutral" | null;
  explanation: string | null;
  section?: string;
};

export type DiffContextData = {
  ticker: string;
  companyName?: string;
  filingType: string;
  dateNew: string;
  dateOld: string;
  synthesis?: {
    executive_summary?: string;
    management_sentiment?: string;
    concerns?: Array<{ topic: string; section: string; severity: string; implication: string }>;
    reassurances?: Array<{ topic: string; section: string; severity: string; implication: string }>;
    performance_implications?: string;
  } | null;
  // Top passages sorted by score — truncated for payload size
  topPassages: DiffPassage[];
};

let _current: DiffContextData | null = null;
const _subs = new Set<() => void>();

export function setDiffContext(data: DiffContextData | null): void {
  _current = data;
  _subs.forEach((fn) => fn());
}

export function getDiffContext(): DiffContextData | null {
  return _current;
}

export function subscribeDiffContext(fn: () => void): () => void {
  _subs.add(fn);
  return () => { _subs.delete(fn); };
}
