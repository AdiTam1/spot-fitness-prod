/**
 * Tiny module-level flag so the global Android back handler can stand down while the
 * forced-update gate is blocking the hardware back button.
 */
let locked = false;

export function setBackLocked(next: boolean) {
  locked = next;
}

export function isBackLocked() {
  return locked;
}
