import { useSettings } from '../stores/settings';

/**
 * Text replacements from Keyboard settings ("omw" → "On my way!").
 * Call from an input handler after a space or punctuation is typed.
 */
export function replaceInTextarea(el: HTMLTextAreaElement | HTMLInputElement): boolean {
  const reps = useSettings.getState().keyboard.textReplacements;
  if (!reps.length) return false;
  const pos = el.selectionStart ?? 0;
  const before = el.value.slice(0, pos);
  const m = before.match(/(\S+)([\s.,!?;:])$/);
  if (!m) return false;
  const rep = reps.find((r) => r.from === m[1]);
  if (!rep) return false;
  const start = pos - m[0].length;
  el.setRangeText(rep.to + m[2], start, pos, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function replaceInEditable(): boolean {
  const reps = useSettings.getState().keyboard.textReplacements;
  if (!reps.length) return false;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.textContent ?? '';
  const pos = sel.anchorOffset;
  const before = text.slice(0, pos);
  const m = before.match(/(\S+)([\s .,!?;:])$/);
  if (!m) return false;
  const rep = reps.find((r) => r.from === m[1]);
  if (!rep) return false;
  const start = pos - m[0].length;
  node.textContent = text.slice(0, start) + rep.to + m[2] + text.slice(pos);
  const r = document.createRange();
  r.setStart(node, start + rep.to.length + m[2].length);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  return true;
}
