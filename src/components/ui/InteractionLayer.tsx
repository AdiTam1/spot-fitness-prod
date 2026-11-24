'use client';

import { useEffect } from 'react';
import { isBackLocked } from '@/lib/backGuard';
import { closeTopDialog, getDialogOverlay, getTopDialog } from '@/lib/sheetDismiss';

const DRAG_ZONE_PX = 44; // top strip of a sheet (grabber + title row) that starts a drag
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.55; // px / ms
const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="tab"], [role="slider"]';

function isPhone() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

/**
 * Mounted once at the root. It adds, app-wide and without touching each screen:
 *  1. drag-down-to-dismiss on every bottom sheet (Mantine Drawer + Modal) via the grabber,
 *     with snap-back when released early (backdrop tap is Mantine's own behaviour);
 *  2. the Android hardware back button: closes the topmost sheet first, then falls back
 *     to history / exit;
 *  3. scrolling a focused input into view above the on-screen keyboard.
 */
export function InteractionLayer() {
  useEffect(() => {
    // ---------- 1. Sheet drag-to-dismiss ----------
    let active: {
      dialog: HTMLElement;
      overlay: HTMLElement | null;
      startY: number;
      lastY: number;
      lastT: number;
      velocity: number;
      pointerId: number;
      height: number;
      moved: boolean;
    } | null = null;

    const onDown = (e: PointerEvent) => {
      if (!isPhone() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const dialog = target.closest<HTMLElement>('section[role="dialog"][aria-modal="true"]');
      if (!dialog || dialog !== getTopDialog()) return;
      if (dialog.hasAttribute('data-full-screen')) return;
      const rect = dialog.getBoundingClientRect();
      const inZone = e.clientY - rect.top <= DRAG_ZONE_PX || !!target.closest('.sheet-grabber');
      if (!inZone) return;
      if (target.closest(INTERACTIVE) && !target.closest('.sheet-grabber')) return;
      active = {
        dialog,
        overlay: getDialogOverlay(dialog),
        startY: e.clientY,
        lastY: e.clientY,
        lastT: e.timeStamp,
        velocity: 0,
        pointerId: e.pointerId,
        height: rect.height,
        moved: false,
      };
      dialog.style.transition = 'none';
    };

    const onMove = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.pointerId) return;
      const dy = e.clientY - active.startY;
      const dt = Math.max(1, e.timeStamp - active.lastT);
      active.velocity = (e.clientY - active.lastY) / dt;
      active.lastY = e.clientY;
      active.lastT = e.timeStamp;
      if (!active.moved && Math.abs(dy) < 4) return;
      active.moved = true;
      // Rubber-band when pulled upwards, 1:1 downwards.
      const shown = dy >= 0 ? dy : dy / 6;
      active.dialog.style.translate = `0 ${shown}px`;
      if (active.overlay) {
        active.overlay.style.opacity = String(Math.max(0.25, 1 - Math.max(0, shown) / (active.height * 1.2)));
      }
      e.preventDefault();
    };

    const finish = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.pointerId) return;
      const { dialog, overlay, startY, velocity, moved } = active;
      active = null;
      if (!moved) {
        dialog.style.transition = '';
        return;
      }
      const dy = e.clientY - startY;
      const reset = () => {
        dialog.style.transition = '';
        dialog.style.translate = '';
        dialog.removeAttribute('data-closing');
        if (overlay) overlay.style.opacity = '';
      };
      if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
        dialog.dataset.closing = 'true';
        dialog.style.transition = 'translate .22s cubic-bezier(.4,0,1,1)';
        dialog.style.translate = '0 110%';
        window.setTimeout(() => {
          closeTopDialogFor(dialog);
          // If the host refused to close (e.g. closeOnClickOutside=false), bring it back.
          window.setTimeout(() => {
            if (document.body.contains(dialog)) reset();
          }, 400);
        }, 180);
      } else {
        dialog.style.transition = 'translate .26s cubic-bezier(.2,.8,.2,1)';
        dialog.style.translate = '0 0';
        if (overlay) overlay.style.opacity = '';
        window.setTimeout(reset, 280);
      }
    };

    function closeTopDialogFor(dialog: HTMLElement) {
      // Always dismisses the dragged (topmost) dialog.
      dialog.removeAttribute('data-closing');
      closeTopDialog();
    }

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', finish, { passive: true });
    document.addEventListener('pointercancel', finish, { passive: true });

    // ---------- 2. Android back button ----------
    let removeNative: (() => void) | null = null;
    const handleBack = (canGoBack: boolean) => {
      if (isBackLocked()) return;
      if (closeTopDialog()) return;
      if (canGoBack) {
        window.history.back();
        return;
      }
      void import('@capacitor/app').then(({ App }) => App.exitApp()).catch(() => {});
    };
    const onSyntheticBack = () => handleBack(false);
    window.addEventListener('spot:android-back', onSyntheticBack);

    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => handleBack(canGoBack));
        removeNative = () => void handle.remove();
      } catch {
        // not running inside Capacitor
      }
    })();

    // ---------- 3. Keep focused inputs above the keyboard ----------
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    };
    document.addEventListener('focusin', onFocusIn);
    const vv = window.visualViewport;
    const onViewport = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    vv?.addEventListener('resize', onViewport);

    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      window.removeEventListener('spot:android-back', onSyntheticBack);
      document.removeEventListener('focusin', onFocusIn);
      vv?.removeEventListener('resize', onViewport);
      removeNative?.();
    };
  }, []);

  return null;
}
