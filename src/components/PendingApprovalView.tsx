'use client';

import { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';

interface PendingApprovalViewProps {
  name: string;
  /** `paused` accounts see different copy than accounts still waiting for approval. */
  paused: boolean;
  loggingOut: boolean;
  onRecheck: () => Promise<void> | void;
  onLogout: () => void;
}

/** Full-screen "waiting for coach approval" state (design: AuthPending). */
export function PendingApprovalView({ name, paused, loggingOut, onRecheck, onLogout }: PendingApprovalViewProps) {
  const [checking, setChecking] = useState(false);
  const firstName = name.trim().split(/\s+/)[0] || '';

  const recheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await onRecheck();
    } finally {
      setChecking(false);
    }
  };

  return (
    <main
      style={{
        boxSizing: 'border-box',
        minHeight: '100dvh',
        padding: 'calc(120px + var(--sa-top)) 28px calc(32px + var(--sa-bottom))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 16,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 84,
          height: 84,
          borderRadius: 28,
          background: 'var(--card)',
          border: '1px solid var(--line-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
        }}
      >
        <Clock size={40} strokeWidth={2} />
      </span>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>
        {paused ? 'החשבון הושהה' : `נרשמת בהצלחה${firstName ? `, ${firstName}` : ''}`}
      </h1>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--text-2)', lineHeight: 1.55 }}>
        {paused
          ? 'אנא פנה למאמן שלך להפעלת החשבון במערכת.'
          : 'החשבון שלך ממתין לאישור מאמן. נעדכן אותך ברגע שתקבל גישה.'}
      </p>
      <div style={{ marginTop: 'auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          className="glass"
          onClick={recheck}
          disabled={checking}
          style={{
            height: 52,
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {checking && <Loader2 size={16} className="spot-spinner" />}
          בדוק שוב
        </button>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          style={{
            minHeight: 44,
            background: 'none',
            border: 'none',
            fontFamily: 'inherit',
            fontSize: 14,
            color: 'var(--text-2)',
            cursor: 'pointer',
          }}
        >
          {loggingOut ? 'מתנתק...' : 'התנתק'}
        </button>
      </div>
    </main>
  );
}
