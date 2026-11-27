export type VoiceCaptureState = 'idle' | 'listening' | 'transcribing';

export interface VoiceCaptureController {
  stop: () => void;
  cancel: () => void;
}

interface StartVoiceCaptureOptions {
  customApiKey?: string;
  onStateChange: (state: VoiceCaptureState) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (message: string, info?: { micBlocked?: boolean }) => void;
}

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript?: string }> & { isFinal?: boolean }>;
  }) => void;
  onend: () => void;
  onerror: (e: { error?: string }) => void;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

function getSpeechRecognitionCtor():
  | (new () => BrowserSpeechRecognition)
  | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition;
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore unsupported check
    }
  }
  return '';
}

function startMediaRecorderFlow(opts: StartVoiceCaptureOptions): VoiceCaptureController {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function' ||
    typeof MediaRecorder === 'undefined'
  ) {
    opts.onStateChange('idle');
    opts.onError(
      'הקלטת מיקרופון אינה נתמכת בדפדפן זה. ניתן להקיש על שורת הטקסט ולהשתמש במיקרופון 🎙️ במקלדת הטלפון.',
      { micBlocked: true }
    );
    return { stop: () => {}, cancel: () => {} };
  }

  let cancelled = false;
  let activeRecorder: MediaRecorder | null = null;
  let activeStream: MediaStream | null = null;
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  let transcribeAbortCtrl: AbortController | null = null;

  const cleanupStream = () => {
    if (autoStopTimer) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }
    if (activeStream) {
      for (const track of activeStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      activeStream = null;
    }
  };

  opts.onStateChange('listening');

  // קריאה מיידית בתוך מחוות המשתמש לשמירת הרשאת iOS Safari / Standalone PWA
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      if (cancelled) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      activeStream = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      activeRecorder = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onerror = () => {
        cleanupStream();
        opts.onStateChange('idle');
        opts.onError('שגיאה בהפעלת ההקלטה במכשיר. נסה שנית.');
      };

      recorder.onstop = async () => {
        cleanupStream();
        if (cancelled) {
          opts.onStateChange('idle');
          return;
        }
        const resolvedMime =
          (recorder.mimeType || mimeType || 'audio/mp4').split(';')[0] || 'audio/mp4';
        const blob = new Blob(chunks, { type: resolvedMime });
        if (blob.size < 400) {
          opts.onStateChange('idle');
          opts.onError('ההקלטה הייתה קצרה מדי או שקטה — נסה לדבר קרוב למיקרופון.');
          return;
        }

        opts.onStateChange('transcribing');
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('שגיאה בקריאת הקלטה'));
            reader.readAsDataURL(blob);
          });
          if (cancelled) return;

          transcribeAbortCtrl = new AbortController();
          const res = await fetch('/api/ai/analyze-meal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: transcribeAbortCtrl.signal,
            body: JSON.stringify({
              mode: 'transcribe-audio',
              audioDataUrl: dataUrl,
              customApiKey: opts.customApiKey,
            }),
          });
          if (cancelled) return;
          if (res.status === 401 || res.status === 403) {
            const { handlePossibleAuthRejection } = await import(
              '@/lib/webVersionGuard'
            );
            if (await handlePossibleAuthRejection(res)) return;
          }
          const data = (await res.json().catch(() => ({}))) as {
            transcript?: string;
            error?: string;
          };
          if (cancelled) return;

          if (!res.ok) {
            opts.onError(data.error || 'שגיאה בתמלול ההקלטה');
            return;
          }
          const cleanTranscript = String(data.transcript || '').trim();
          if (!cleanTranscript) {
            opts.onError('לא זוהה דיבור ברור בהקלטה — נסה שוב.');
            return;
          }
          opts.onTranscript(cleanTranscript, true);
        } catch {
          if (!cancelled) {
            opts.onError('שגיאה בשליחת ההקלטה לתמלול.');
          }
        } finally {
          transcribeAbortCtrl = null;
          opts.onStateChange('idle');
        }
      };

      recorder.start();
      autoStopTimer = setTimeout(() => {
        try {
          if (recorder.state === 'recording') recorder.stop();
        } catch {
          // ignore
        }
      }, 22000);
    })
    .catch((err: unknown) => {
      cleanupStream();
      opts.onStateChange('idle');
      const errName =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name || '')
          : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        opts.onError(
          'אין הרשאת מיקרופון באייפון/דפדפן. אשר גישה בהגדרות הדפדפן או השתמש במיקרופון 🎙️ שבמקלדת.',
          { micBlocked: true }
        );
      } else {
        opts.onError(
          'לא ניתן לפתוח מיקרופון במכשיר זה — אפשר גם להקליד או להשתמש בהכתבה 🎙️ שבמקלדת.',
          { micBlocked: true }
        );
      }
    });

  return {
    stop: () => {
      if (activeRecorder && activeRecorder.state === 'recording') {
        try {
          activeRecorder.stop();
        } catch {
          cleanupStream();
          opts.onStateChange('idle');
        }
      } else {
        cancelled = true;
        cleanupStream();
        opts.onStateChange('idle');
      }
    },
    cancel: () => {
      cancelled = true;
      if (transcribeAbortCtrl) {
        try {
          transcribeAbortCtrl.abort();
        } catch {
          // ignore
        }
        transcribeAbortCtrl = null;
      }
      if (activeRecorder && activeRecorder.state === 'recording') {
        try {
          activeRecorder.stop();
        } catch {
          // ignore
        }
      }
      cleanupStream();
      opts.onStateChange('idle');
    },
  };
}

/**
 * מנהל הקלטה קולית חוצה פלטפורמות:
 * - ב-iPhone / iPad (כולל Safari וגם אפליקציית מסך הבית PWA) משתמש ישירות ב-MediaRecorder + תמלול AI ב-Gemini,
 *   כיוון ש-webkitSpeechRecognition חסום או כבוי לעיתים קרובות ב-iOS Standalone.
 * - ב-Android / Chrome Desktop משתמש בזיהוי הדפדפן המיידי עם דיווח שגיאות גלוי.
 */
export function startUnifiedVoiceCapture(
  opts: StartVoiceCaptureOptions
): VoiceCaptureController {
  if (typeof window === 'undefined') {
    return { stop: () => {}, cancel: () => {} };
  }

  const SpeechRec = getSpeechRecognitionCtor();
  const useMediaRecorderFirst =
    !SpeechRec ||
    (isAppleTouchDevice() &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined');

  if (useMediaRecorderFirst) {
    return startMediaRecorderFlow(opts);
  }

  try {
    const recognition = new SpeechRec();
    recognition.lang = 'he-IL';
    recognition.interimResults = true;
    let stoppedManually = false;
    let wasCancelled = false;
    let gotFinal = false;

    opts.onStateChange('listening');

    recognition.onresult = (event) => {
      if (wasCancelled) return;
      let combined = '';
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        const seg = res?.[0]?.transcript || '';
        if (seg) combined += (combined ? ' ' : '') + seg;
        if (res?.isFinal) isFinal = true;
      }
      if (combined.trim()) {
        if (isFinal) gotFinal = true;
        opts.onTranscript(combined.trim(), isFinal);
      }
    };

    recognition.onerror = (ev) => {
      opts.onStateChange('idle');
      if (wasCancelled) return;
      const code = ev?.error || '';
      if (code === 'aborted' && stoppedManually) return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        opts.onError(
          'זיהוי הדיבור חסום בהרשאות הדפדפן — אשר מיקרופון או השתמש בהכתבה במקלדת.',
          { micBlocked: true }
        );
      } else if (code === 'no-speech') {
        if (!gotFinal) opts.onError('לא נקלט דיבור — נסה לדבר שוב קרוב למיקרופון.');
      } else {
        opts.onError('לא ניתן להפעיל זיהוי קול כעת. אפשר להקליד או לנסות שנית.');
      }
    };

    recognition.onend = () => {
      opts.onStateChange('idle');
    };

    recognition.start();

    return {
      stop: () => {
        stoppedManually = true;
        try {
          recognition.stop();
        } catch {
          opts.onStateChange('idle');
        }
      },
      cancel: () => {
        stoppedManually = true;
        wasCancelled = true;
        try {
          recognition.abort ? recognition.abort() : recognition.stop();
        } catch {
          // ignore
        }
        opts.onStateChange('idle');
      },
    };
  } catch {
    return startMediaRecorderFlow(opts);
  }
}
