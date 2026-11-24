/**
 * Helpers shared by the sheet drag gesture and the Android back button.
 * Mantine registers an Escape handler per opened overlay, so Escape would close
 * every stacked sheet at once. We instead trigger the *topmost* dialog's own
 * close control (or its backdrop), which closes exactly one layer.
 */

const DIALOG_SELECTOR = 'section[role="dialog"][aria-modal="true"]';

export function getTopDialog(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)).filter(
    (el) => !el.closest('[aria-hidden="true"]') && el.dataset.closing !== 'true'
  );
  return all.length ? all[all.length - 1] : null;
}

/** Closes the topmost Mantine Drawer/Modal. Returns true when something was closed. */
export function closeTopDialog(): boolean {
  const dialog = getTopDialog();
  if (!dialog) return false;
  const root = dialog.closest<HTMLElement>('.mantine-Modal-root, .mantine-Drawer-root');
  const closeBtn =
    dialog.querySelector<HTMLElement>('.mantine-Modal-close, .mantine-Drawer-close') ||
    dialog.querySelector<HTMLElement>('[aria-label="סגירה"]');
  if (closeBtn) {
    closeBtn.click();
    return true;
  }
  const overlay = root?.querySelector<HTMLElement>('.mantine-Modal-overlay, .mantine-Drawer-overlay');
  if (overlay) {
    overlay.click();
    return true;
  }
  return false;
}

export function getDialogOverlay(dialog: HTMLElement): HTMLElement | null {
  const root = dialog.closest<HTMLElement>('.mantine-Modal-root, .mantine-Drawer-root');
  return root?.querySelector<HTMLElement>('.mantine-Modal-overlay, .mantine-Drawer-overlay') ?? null;
}
