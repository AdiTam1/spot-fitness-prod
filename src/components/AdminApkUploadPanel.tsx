'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NumberInput, Switch, TextInput, Textarea } from '@mantine/core';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UploadCloud,
} from 'lucide-react';
import { AppReleasePolicy } from '@/types/nutrition';
import {
  ParsedApkMetadata,
  parseApkManifestMetadata,
} from '@/lib/apkManifestParser';

interface StorageStatusPayload {
  supabaseConfigured: boolean;
  hasServiceRoleKey: boolean;
  bucketName: string;
  bucketReady: boolean;
  canAutoCreateBucket: boolean;
  bucketMessage?: string;
}

interface AdminApkUploadPanelProps {
  currentBlockedUpToVersionCode: number;
  onPublished: (policy: AppReleasePolicy) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

function uploadApkDirectViaXhr(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      let details = '';
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          message?: string;
          error?: string;
        };
        details = parsed.message || parsed.error || '';
      } catch {
        details = xhr.responseText?.slice(0, 140) || '';
      }
      reject(
        new Error(
          details
            ? `העלאה ל-Storage נכשלה (${xhr.status}): ${details}`
            : `העלאה ל-Storage נכשלה (סטטוס ${xhr.status})`
        )
      );
    };

    xhr.onerror = () => {
      reject(
        new Error('שגיאת רשת בהעלאה הישירה ל-Supabase Storage. בדוק חיבור והרשאות.')
      );
    };

    const formData = new FormData();
    formData.append('cacheControl', '300');
    const typedFile = new File([file], 'spot-fitness-release.apk', {
      type: 'application/vnd.android.package-archive',
    });
    formData.append('', typedFile);
    xhr.send(formData);
  });
}

export function AdminApkUploadPanel({
  currentBlockedUpToVersionCode,
  onPublished,
  onNotify,
}: AdminApkUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [storage, setStorage] = useState<StorageStatusPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedMeta, setParsedMeta] = useState<ParsedApkMetadata | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState<string>('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [forceBlockOlder, setForceBlockOlder] = useState(false);
  const [customBlockedUpTo, setCustomBlockedUpTo] = useState<number>(
    currentBlockedUpToVersionCode
  );

  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    'idle' | 'preparing' | 'uploading' | 'publishing'
  >('idle');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/admin/apk-release?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { storage?: StorageStatusPayload };
      if (data.storage) setStorage(data.storage);
    } catch {
      // ignore transient errors
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!forceBlockOlder) {
      setCustomBlockedUpTo(currentBlockedUpToVersionCode);
    }
  }, [currentBlockedUpToVersionCode, forceBlockOlder]);

  const handlePickedFile = async (file: File | null) => {
    setErrorMsg(null);
    if (!file) return;

    if (!/\.apk$/i.test(file.name)) {
      setErrorMsg('נא לבחור קובץ התקנה בסיומת .apk בלבד.');
      return;
    }
    if (file.size > 52_428_800) {
      setErrorMsg('הקובץ גדול מ-50 MB (מגבלת Supabase Storage בחבילה הסטנדרטית).');
      return;
    }

    setParsing(true);
    setSelectedFile(file);
    try {
      const meta = await parseApkManifestMetadata(file);
      if (!meta.validZipApk) {
        setSelectedFile(null);
        setParsedMeta(null);
        setErrorMsg('הקובץ אינו נראה כמו חבילת APK תקינה.');
        return;
      }
      setParsedMeta(meta);
      if (meta.versionName) setVersionName(meta.versionName);
      if (meta.versionCode) {
        setVersionCode(String(meta.versionCode));
        if (forceBlockOlder && meta.versionCode > 1) {
          setCustomBlockedUpTo(meta.versionCode - 1);
        }
      }
    } catch {
      setParsedMeta({ validZipApk: true });
    } finally {
      setParsing(false);
    }
  };

  const handlePublishUpload = async () => {
    if (!selectedFile || uploading) return;
    setErrorMsg(null);
    setUploading(true);
    setUploadPercent(0);
    setUploadStage('preparing');

    try {
      const cleanName = versionName.trim();
      const parsedCodeNum = versionCode.trim()
        ? Math.max(1, Math.round(Number(versionCode) || 0))
        : undefined;

      const prepRes = await fetch('/api/admin/apk-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare_upload',
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          versionName: cleanName || 'release',
        }),
      });
      const prepData = (await prepRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        signedUrl?: string;
        objectPath?: string;
      };

      if (!prepRes.ok || !prepData.signedUrl || !prepData.objectPath) {
        throw new Error(prepData.error || 'לא ניתן להתחיל העלאה ל-Supabase Storage');
      }

      setUploadStage('uploading');
      await uploadApkDirectViaXhr(prepData.signedUrl, selectedFile, (pct) => {
        setUploadPercent(pct);
      });

      setUploadStage('publishing');
      const blockedToSave =
        forceBlockOlder && parsedCodeNum && parsedCodeNum > 1
          ? Math.min(parsedCodeNum - 1, Math.max(0, customBlockedUpTo))
          : currentBlockedUpToVersionCode;

      const pubRes = await fetch('/api/admin/apk-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish_release',
          objectPath: prepData.objectPath,
          fileSize: selectedFile.size,
          latestVersionCode: parsedCodeNum,
          latestVersionName: cleanName || undefined,
          blockedUpToVersionCode: blockedToSave,
          releaseNotes: releaseNotes.trim() || undefined,
        }),
      });
      const pubData = (await pubRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        appReleasePolicy?: AppReleasePolicy;
      };

      if (!pubRes.ok || !pubData.appReleasePolicy) {
        throw new Error(pubData.error || 'הקובץ הועלה אך פרסום המדיניות נכשל');
      }

      onPublished(pubData.appReleasePolicy);
      onNotify(
        `גרסת APK${cleanName ? ` v${cleanName}` : ''} הועלתה ופורסמה מיד לכל המשתמשים!`
      );
      setSelectedFile(null);
      setParsedMeta(null);
      setReleaseNotes('');
      setForceBlockOlder(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void refreshStatus();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'אירעה שגיאה בהעלאת קובץ ה-APK';
      setErrorMsg(msg);
      onNotify(msg, true);
    } finally {
      setUploading(false);
      setUploadStage('idle');
    }
  };

  const isStorageReady = Boolean(
    storage?.supabaseConfigured &&
      (storage.hasServiceRoleKey || storage.bucketReady)
  );

  return (
    <div
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 18,
        padding: 14,
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UploadCloud size={18} color="var(--accent)" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>
              העלאת קובץ APK חדש בלחיצה (ללא גיט / דיפלוי)
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              הקובץ עולה ישירות ל-Supabase Storage ומעדכן מיד את{' '}
              <bdi dir="ltr">/download</bdi>, מסכי הכניסה/פרופיל ואת עדכון האפליקציה.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={loadingStatus || uploading}
          className="btn-surface"
          style={{
            padding: '5px 10px',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} className={loadingStatus ? 'spot-spinner' : undefined} />
          <span>בדוק מוכנות Storage</span>
        </button>
      </div>

      {storage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            fontSize: 12.5,
            padding: '8px 12px',
            borderRadius: 12,
            background: 'var(--surface-2)',
            border: isStorageReady
              ? '1px solid rgba(34, 197, 94, 0.35)'
              : '1px solid rgba(245, 158, 11, 0.4)',
            color: isStorageReady ? 'var(--ok-text)' : 'var(--warn-text)',
          }}
        >
          {isStorageReady ? (
            <ShieldCheck size={15} style={{ flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          )}
          <span>
            {!storage.supabaseConfigured
              ? 'Supabase אינו מחובר בשרת.'
              : storage.hasServiceRoleKey
              ? storage.bucketReady
                ? `מוכן להעלאה (Bucket "${storage.bucketName}" + Service Role מוגדרים).`
                : `Service Role Key מוגדר — ה-Bucket "${storage.bucketName}" ייווצר אוטומטית בהעלאה הראשונה.`
              : storage.bucketMessage || 'נדרש SUPABASE_SERVICE_ROLE_KEY ב-Vercel.'}
          </span>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (uploading) return;
          const file = e.dataTransfer.files?.[0] || null;
          void handlePickedFile(file);
        }}
        style={{
          border: dragActive
            ? '2px dashed var(--accent)'
            : '1.5px dashed var(--line-2)',
          borderRadius: 16,
          padding: '16px 14px',
          background: dragActive ? 'var(--surface-3)' : 'var(--card)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          textAlign: 'center',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          hidden
          disabled={uploading}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0] || null;
            void handlePickedFile(file);
          }}
        />
        <Smartphone size={22} color="var(--text-secondary)" />
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>
          {selectedFile
            ? `${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`
            : 'גרור לכאן קובץ spot-fitness-release.apk או בחר מהמחשב'}
        </div>
        {parsing ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            מפענח פרטי גרסה מתוך ה-APK...
          </div>
        ) : parsedMeta?.versionName || parsedMeta?.versionCode ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--ok-text)',
              fontWeight: 700,
            }}
          >
            <CheckCircle2 size={13} />
            <span>
              זוהה אוטומטית מה-APK: <bdi dir="ltr">{parsedMeta.packageId || 'APK'}</bdi> ·{' '}
              <bdi dir="ltr">v{parsedMeta.versionName || '?'}</bdi> (versionCode:{' '}
              <bdi dir="ltr">{parsedMeta.versionCode || '?'}</bdi>)
            </span>
          </div>
        ) : null}

        {parsedMeta?.packageId &&
          parsedMeta.packageId !== 'app.spotfitness.mobile' && (
            <div style={{ fontSize: 12, color: 'var(--warn-text)', fontWeight: 700 }}>
              שים לב: מזהה החבילה ב-APK הוא {parsedMeta.packageId} ולא app.spotfitness.mobile.
            </div>
          )}

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="btn-surface"
          style={{
            padding: '7px 14px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {selectedFile ? 'החלף קובץ APK' : 'בחר קובץ .apk'}
        </button>
      </div>

      {selectedFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 10,
            }}
          >
            <TextInput
              dir="ltr"
              label="גרסת תצוגה (versionName)"
              placeholder="למשל 1.0.10"
              disabled={uploading}
              value={versionName}
              onChange={(e) => setVersionName(e.currentTarget.value)}
            />
            <TextInput
              dir="ltr"
              label="מספר גרסה פנימי (versionCode)"
              placeholder="למשל 10010"
              disabled={uploading}
              value={versionCode}
              onChange={(e) =>
                setVersionCode(e.currentTarget.value.replace(/[^0-9]/g, ''))
              }
            />
          </div>

          <Textarea
            label="מה חדש בעדכון (אופציונלי)"
            placeholder="שיפורי ביצועים ותיקוני באגים..."
            minRows={2}
            disabled={uploading}
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.currentTarget.value)}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              padding: '8px 12px',
              borderRadius: 12,
              background: 'var(--card)',
              border: '1px solid var(--line)',
            }}
          >
            <Switch
              color="orange"
              disabled={uploading}
              checked={forceBlockOlder}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setForceBlockOlder(checked);
                const code = Number(versionCode) || 0;
                if (checked && code > 1) {
                  setCustomBlockedUpTo(code - 1);
                }
              }}
              label="חייב עדכון חובה לכל הגרסאות הישנות יותר"
            />
            {forceBlockOlder && (
              <NumberInput
                size="xs"
                min={0}
                max={99999999}
                disabled={uploading}
                label={<>חסום עד וכולל (<bdi dir="ltr">versionCode ≤</bdi>)</>}
                value={customBlockedUpTo}
                onChange={(v) =>
                  setCustomBlockedUpTo(Math.max(0, Number(v) || 0))
                }
                style={{ width: 170 }}
              />
            )}
          </div>

          {uploading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <span>
                  {uploadStage === 'preparing'
                    ? 'מכין כתובת העלאה...'
                    : uploadStage === 'uploading'
                    ? 'מעלה APK ל-Supabase Storage...'
                    : 'מפרסם גרסה ומעדכן קישורים...'}
                </span>
                <span className="num-mono">{uploadPercent}%</span>
              </div>
              <div
                style={{
                  height: 7,
                  borderRadius: 999,
                  background: 'var(--surface-3)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${uploadStage === 'publishing' ? 100 : Math.max(6, uploadPercent)}%`,
                    background: 'var(--accent)',
                    transition: 'width 0.15s ease',
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              disabled={uploading}
              onClick={() => void handlePublishUpload()}
              className="btn-volt"
              style={{
                padding: '10px 18px',
                fontSize: 13.5,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: uploading ? 'wait' : 'pointer',
              }}
            >
              {uploading ? (
                <Loader2 size={14} className="spot-spinner" />
              ) : (
                <UploadCloud size={15} />
              )}
              <span>
                {uploading ? 'מעלה ומפרסם...' : 'העלה ופרסם APK לכל המשתמשים'}
              </span>
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: 'var(--danger-text)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 12,
            padding: '8px 12px',
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
