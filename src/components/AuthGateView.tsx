'use client';

import React, { useState } from 'react';
import { TextInput, PasswordInput } from '@mantine/core';
import {
  Lock,
  UserPlus,
  LogIn,
  Clock,
  ShieldAlert,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { AuthRejectionCode, AuthSessionUser } from '@/types/nutrition';

interface AuthGateViewProps {
  onLoginSuccess: (user: AuthSessionUser) => void;
  sessionNotice?: { code: AuthRejectionCode; message: string } | null;
  onClearSessionNotice?: () => void;
}

export function AuthGateView({
  onLoginSuccess,
  sessionNotice,
  onClearSessionNotice,
}: AuthGateViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regStep, setRegStep] = useState<1 | 2>(1);

  // שדות התחברות
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const submittingRef = React.useRef(false);

  // שדות הרשמת מתאמן
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGoal, setRegGoal] = useState('חיטוב וירידה באחוזי שומן');
  const [regInviteCode, setRegInviteCode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    setPendingNotice(null);
    onClearSessionNotice?.();

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setError('נא להזין אימייל וסיסמה');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          email: cleanEmail,
          password: cleanPass,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.isPending) {
          setPendingNotice(data.error);
        } else {
          setError(data.error || 'שגיאה בהתחברות');
        }
        return;
      }

      if (data.user) {
        onLoginSuccess(data.user);
      }
    } catch {
      setError('שגיאת תקשורת, נסה שוב');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleNextRegStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('נא למלא שם מלא, אימייל וסיסמה');
      return;
    }
    if (!regEmail.includes('@')) {
      setError('נא להזין כתובת אימייל תקינה');
      return;
    }
    if (regPassword.trim().length < 4) {
      setError('הסיסמה חייבת להכיל לפחות 4 תווים');
      return;
    }
    setRegStep(2);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    setPendingNotice(null);
    onClearSessionNotice?.();

    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('נא למלא שם מלא, אימייל וסיסמה');
      setRegStep(1);
      return;
    }

    if (regPassword.trim().length < 4) {
      setError('הסיסמה חייבת להכיל לפחות 4 תווים');
      setRegStep(1);
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          name: regName.trim(),
          email: regEmail.trim().toLowerCase(),
          password: regPassword.trim(),
          phone: regPhone.trim(),
          goal: regGoal.trim(),
          inviteCode: regInviteCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'שגיאה בהרשמה');
        return;
      }

      if (data.isPending) {
        setPendingNotice(
          `נרשמת בהצלחה ${data.user.name}! החשבון שלך ממתין לאישור מאמן.`
        );
        setMode('login');
        setRegStep(1);
        setEmail(data.user.email);
        setPassword(regPassword.trim());
      } else if (data.user) {
        onLoginSuccess(data.user);
      }
    } catch {
      setError('שגיאת תקשורת, נסה שוב');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'calc(56px + env(safe-area-inset-top, 0px)) 24px 32px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            marginBottom: 26,
          }}
        >
          <img
            src="/app-logo.png"
            alt=""
            style={{
              width: 76,
              height: 76,
              borderRadius: 24,
              objectFit: 'cover',
              border: '1px solid var(--line-2)',
            }}
          />
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '0.04em' }}>SPOT</h1>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
            תזונה, מדדים וליווי מאמן במקום אחד
          </span>
        </div>

        <div
          role="tablist"
          aria-label="סוג כניסה"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            background: 'var(--card)',
            padding: 4,
            borderRadius: 999,
            border: '1px solid var(--border-subtle)',
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            disabled={loading}
            onClick={() => {
              setMode('login');
              setRegStep(1);
              setError(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 42,
              padding: '0 8px',
              borderRadius: 999,
              border: 'none',
              fontFamily: 'inherit',
              background:
                mode === 'login' ? 'var(--sel-bg)' : 'transparent',
              color: mode === 'login' ? 'var(--sel-text)' : 'var(--text-secondary)',
              fontSize: 15,
              fontWeight: mode === 'login' ? 700 : 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading && mode !== 'login' ? 0.5 : 1,
            }}
          >
            <LogIn size={14} />
            <span>התחברות</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            disabled={loading}
            onClick={() => {
              setMode('register');
              setRegStep(1);
              setError(null);
              setPendingNotice(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 42,
              padding: '0 8px',
              borderRadius: 999,
              border: 'none',
              fontFamily: 'inherit',
              background:
                mode === 'register' ? 'var(--sel-bg)' : 'transparent',
              color: mode === 'register' ? 'var(--sel-text)' : 'var(--text-secondary)',
              fontSize: 15,
              fontWeight: mode === 'register' ? 700 : 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading && mode !== 'register' ? 0.5 : 1,
            }}
          >
            <UserPlus size={14} />
            <span>הרשמת מתאמן</span>
          </button>
        </div>

        {sessionNotice && !error && !pendingNotice && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 10,
              background:
                sessionNotice.code === 'ACCOUNT_BLOCKED'
                  ? 'rgba(239, 68, 68, 0.14)'
                  : 'rgba(245, 158, 11, 0.14)',
              border:
                sessionNotice.code === 'ACCOUNT_BLOCKED'
                  ? '1px solid rgba(239, 68, 68, 0.4)'
                  : '1px solid rgba(245, 158, 11, 0.4)',
              color:
                sessionNotice.code === 'ACCOUNT_BLOCKED' ? 'var(--danger-text)' : 'var(--warn-text)',
              fontSize: 12.5,
              fontWeight: 700,
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{sessionNotice.message}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: 'var(--danger-text)',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            <ShieldAlert size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {pendingNotice && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: 'var(--warn-text)',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 12,
              lineHeight: 1.45,
            }}
          >
            <Clock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{pendingNotice}</span>
          </div>
        )}

        {mode === 'login' ? (
          <form
            onSubmit={handleLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <TextInput
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              label="כתובת אימייל"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <PasswordInput
              autoComplete="current-password"
              dir="ltr"
              label="סיסמה"
              placeholder="הזן סיסמה"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              disabled={loading}
              required
            />

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-volt"
              style={{
                marginTop: 4,
                height: 56,
                fontSize: 16,
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              {loading ? (
                <Loader2 size={16} className="spot-spinner" />
              ) : (
                <Lock size={15} />
              )}
              <span>{loading ? 'מתחבר...' : 'כניסה'}</span>
            </button>
          </form>
        ) : regStep === 1 ? (
          <form
            onSubmit={handleNextRegStep}
            style={{ display: 'flex', flexDirection: 'column', gap: 11 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              <span>פרטי חשבון</span>
              <span className="num-mono" style={{ color: 'var(--accent-volt)' }}>
                1 / 2
              </span>
            </div>

            <TextInput
              autoComplete="name"
              label="שם מלא"
              placeholder="למשל: דניאל כהן"
              value={regName}
              onChange={(e) => setRegName(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <TextInput
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              label="אימייל לכניסה"
              placeholder="daniel@gmail.com"
              value={regEmail}
              onChange={(e) => setRegEmail(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <PasswordInput
              autoComplete="new-password"
              dir="ltr"
              label="בחירת סיסמה"
              placeholder="לפחות 4 תווים"
              value={regPassword}
              onChange={(e) => setRegPassword(e.currentTarget.value)}
              disabled={loading}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="btn-volt"
              style={{
                marginTop: 4,
                height: 56,
                fontSize: 16,
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <span>המשך</span>
              <ChevronLeft size={16} />
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleRegister}
            style={{ display: 'flex', flexDirection: 'column', gap: 11 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              <span>פרטי הצטרפות</span>
              <span className="num-mono" style={{ color: 'var(--accent-volt)' }}>
                2 / 2
              </span>
            </div>

            <TextInput
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              label="טלפון"
              placeholder="054-0000000"
              value={regPhone}
              onChange={(e) => setRegPhone(e.currentTarget.value)}
              disabled={loading}
            />

            <TextInput
              label="מטרת האימון והתזונה"
              value={regGoal}
              onChange={(e) => setRegGoal(e.currentTarget.value)}
              disabled={loading}
            />

            <div
              style={{
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              <TextInput
                dir="ltr"
                label="קוד מאמן (אופציונלי)"
                description="ללא קוד — ההרשמה תמתין לאישור מאמן"
                placeholder="קוד אישי מהמאמן"
                value={regInviteCode}
                onChange={(e) => setRegInviteCode(e.currentTarget.value)}
                disabled={loading}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setError(null);
                  setRegStep(1);
                }}
                className="btn-surface"
                style={{
                  padding: '11px 14px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={15} />
                <span>חזרה</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '11px',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                {loading ? (
                  <Loader2 size={16} className="spot-spinner" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>{loading ? 'שומר...' : 'השלמת הרשמה'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
