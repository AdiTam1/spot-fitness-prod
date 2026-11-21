'use client';

import React, { useState } from 'react';
import { TextInput, PasswordInput, NumberInput } from '@mantine/core';
import {
  Lock,
  UserPlus,
  LogIn,
  Clock,
  ShieldAlert,
  KeyRound,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { AuthSessionUser } from '@/types/nutrition';

interface AuthGateViewProps {
  onLoginSuccess: (user: AuthSessionUser) => void;
}

export function AuthGateView({ onLoginSuccess }: AuthGateViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // שדות התחברות
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const submittingRef = React.useRef(false);

  // שדות הרשמת מתאמן (מאומתים בצד השרת בלבד - ללא חשיפת מתאמנים או קוד מאמן לדפדפן)
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGoal, setRegGoal] = useState('חיטוב וירידה באחוזי שומן');
  const [regWeight, setRegWeight] = useState<number>(75);
  const [regInviteCode, setRegInviteCode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    setPendingNotice(null);

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
      setError('שגיאת תקשורת מול שרת האימות');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    setPendingNotice(null);

    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('נא למלא שם מלא, אימייל וסיסמה');
      return;
    }

    if (regPassword.trim().length < 4) {
      setError('הסיסמה חייבת להכיל לפחות 4 תווים');
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
          currentWeight: regWeight,
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
          `נרשמת בהצלחה ${data.user.name}! מכיוון שלא הוזן קוד מאמן תקף, החשבון שלך ממתין לאישור המאמן בדשבורד.`
        );
        setMode('login');
        setEmail(data.user.email);
        setPassword(regPassword.trim());
      } else if (data.user) {
        onLoginSuccess(data.user);
      }
    } catch {
      setError('שגיאת תקשורת מול שרת ההרשמה');
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        className="pro-card-elevated"
        style={{
          width: '100%',
          maxWidth: 430,
          padding: '28px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 240,
            height: 150,
            background:
              'radial-gradient(circle, rgba(210, 255, 40, 0.14) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--accent-volt)',
              color: '#08090c',
              fontWeight: 900,
              fontSize: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
              boxShadow: '0 8px 24px rgba(210, 255, 40, 0.25)',
            }}
          >
            S
          </div>
          <div
            className="num-mono"
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}
          >
            SPOT NUTRITION OS
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginTop: 2,
            }}
          >
            כניסה מאובטחת (HttpOnly HMAC-SHA256)
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            background: 'var(--bg-surface-2)',
            padding: 4,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '9px',
              borderRadius: 9,
              border: 'none',
              background:
                mode === 'login' ? 'var(--accent-volt)' : 'transparent',
              color: mode === 'login' ? '#08090c' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading && mode !== 'login' ? 0.5 : 1,
            }}
          >
            <LogIn size={14} />
            <span>התחברות</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode('register');
              setError(null);
              setPendingNotice(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '9px',
              borderRadius: 9,
              border: 'none',
              background:
                mode === 'register' ? 'var(--accent-volt)' : 'transparent',
              color: mode === 'register' ? '#08090c' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading && mode !== 'register' ? 0.5 : 1,
            }}
          >
            <UserPlus size={14} />
            <span>הרשמת מתאמן</span>
          </button>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {pendingNotice && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fbbf24',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            <Clock size={17} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{pendingNotice}</span>
          </div>
        )}

        {mode === 'login' ? (
          <form
            onSubmit={handleLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
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
                marginTop: 6,
                padding: '12px',
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
                <Lock size={15} />
              )}
              <span>{loading ? 'מאמת מול השרת...' : 'כניסה למערכת'}</span>
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleRegister}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
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

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 0.8fr',
                gap: 10,
              }}
            >
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
              <NumberInput
                label="משקל נוכחי (ק״ג)"
                value={regWeight}
                onChange={(val) => setRegWeight(Number(val) || 75)}
                min={35}
                max={220}
                step={0.5}
                disabled={loading}
              />
            </div>

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
                label="קוד מאמן להפעלה מיידית (אופציונלי)"
                description="אם קיבלת קוד אישי מהמאמן הזן אותו לכניסה מיידית. ללא קוד, ההרשמה תמתין לאישור המאמן."
                placeholder="הזן קוד מאמן או השאר ריק"
                leftSection={<KeyRound size={14} />}
                value={regInviteCode}
                onChange={(e) => setRegInviteCode(e.currentTarget.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-volt"
              style={{
                marginTop: 4,
                padding: '12px',
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
              <span>{loading ? 'רושם חשבון...' : 'השלמת הרשמה'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
