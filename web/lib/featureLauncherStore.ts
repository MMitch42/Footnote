// Module-level store for FeatureLauncher open state and view.
// Lets nav buttons and contact links open/close the panel and jump to
// a specific view (menu | feedback) without prop-drilling.

export type FeatureLauncherView = "menu" | "feedback";

let _open = false;
let _view: FeatureLauncherView = "menu";
const listeners = new Set<(open: boolean, view: FeatureLauncherView) => void>();

function _notify() {
  listeners.forEach((fn) => fn(_open, _view));
}

export function getFeatureLauncherOpen(): boolean {
  return _open;
}

export function setFeatureLauncherOpen(value: boolean): void {
  _open = value;
  if (!value) _view = "menu"; // reset to menu view on close
  _notify();
}

export function toggleFeatureLauncher(): void {
  setFeatureLauncherOpen(!_open);
}

/** Open the panel directly to the feedback form. */
export function openFeatureLauncherFeedback(): void {
  _open = true;
  _view = "feedback";
  _notify();
}

export function subscribeFeatureLauncher(
  fn: (open: boolean, view: FeatureLauncherView) => void
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
