'use client';

import React, { useState, useEffect } from 'react';
import { NumberInput } from '@mantine/core';
import { motion } from 'framer-motion';
import { Ruler, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { BodyMeasurementEntry } from '@/types/nutrition';

interface BodyMeasurementGuideProps {
  initialValues?: Partial<BodyMeasurementEntry>;
  onChange?: (values: {
    chestCm?: number;
    waistNavelCm?: number;
    armCm?: number;
    thighCm?: number;
  }) => void;
  onSave?: (values: {
    chestCm?: number;
    waistNavelCm?: number;
    armCm?: number;
    thighCm?: number;
  }) => void | Promise<void>;
  onSkip?: () => void;
  showSaveButtons?: boolean;
  compact?: boolean;
}

type MeasurementZone = 'chest' | 'waistNavel' | 'arm' | 'thigh';

const ZONE_CONFIG: Record<
  MeasurementZone,
  {
    title: string;
    shortLabel: string;
    placeholder: string;
    instructions: string[];
    tip: string;
  }
> = {
  chest: {
    title: 'מדידת היקף חזה (Chest)',
    shortLabel: 'חזה',
    placeholder: 'למשל: 98',
    instructions: [
      'עמוד זקוף כשהידיים משוחררות לצדי הגוף.',
      'העבר את סרט המדידה מתחת לבתי השחי ובקו ישר על שיא החזה (קו הפטמות).',
      'וודא שהסרט מקביל לרצפה גם בגב ולא רפוי מדי.',
    ],
    tip: 'מדוד בסיום הוצאת אוויר רגילה – אל תנפח את החזה בזמן המדידה.',
  },
  waistNavel: {
    title: 'מדידת היקף בטן – קו פופיק (Waist)',
    shortLabel: 'בטן (פופיק)',
    placeholder: 'למשל: 84',
    instructions: [
      'עמוד ישר מול מראה על בטן ריקה (מומלץ בבוקר אחרי שירותים).',
      'הנח את סרט המדידה אופקית בדיוק על גובה הטבור (הפופיק).',
      'הצמד את הסרט לעור בלי למעוך או לחפור בבשר.',
    ],
    tip: 'הוצא אוויר בנחת והשאר את הבטן משוחררת לגמרי – אל תכניס בטן!',
  },
  arm: {
    title: 'מדידת היקף זרוע (Bicep Peak)',
    shortLabel: 'זרוע',
    placeholder: 'למשל: 36',
    instructions: [
      'הרם את היד הדומיננטית הצידה וכופף את המרפק בזווית של 90 מעלות.',
      'כווץ את שריר היד הקדמית (Bicep) בשיא הכוח.',
      'מדוד סביב הנקודה העבה והגבוהה ביותר במרכז הזרוע.',
    ],
    tip: 'מדוד תמיד את אותה היד (למשל יד ימין) כדי שהמעקב יהיה אחיד.',
  },
  thigh: {
    title: 'מדידת היקף ירך (Upper Thigh)',
    shortLabel: 'ירך',
    placeholder: 'למשל: 56',
    instructions: [
      'עמוד זקוף בפיסוק קל ברוחב האגן, עם משקל גוף שווה על שתי הרגליים.',
      'השאר את שריר הירך רפוי (ללא כיווץ).',
      'מדוד בחלק הרחב ביותר של הירך העליונה (כ-5 ס״מ מתחת לקפל הישבן).',
    ],
    tip: 'שמור על סרט המדידה מאוזן ואופקי לחלוטין מסביב לכל הירך.',
  },
};

export function BodyMeasurementGuide({
  initialValues,
  onChange,
  onSave,
  onSkip,
  showSaveButtons = false,
  compact = false,
}: BodyMeasurementGuideProps) {
  const [activeZone, setActiveZone] = useState<MeasurementZone>('chest');
  const [chestCm, setChestCm] = useState<number | undefined>(
    initialValues?.chestCm
  );
  const [waistNavelCm, setWaistNavelCm] = useState<number | undefined>(
    initialValues?.waistNavelCm
  );
  const [armCm, setArmCm] = useState<number | undefined>(initialValues?.armCm);
  const [thighCm, setThighCm] = useState<number | undefined>(
    initialValues?.thighCm
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setChestCm(initialValues?.chestCm);
    setWaistNavelCm(initialValues?.waistNavelCm);
    setArmCm(initialValues?.armCm);
    setThighCm(initialValues?.thighCm);
  }, [
    initialValues?.chestCm,
    initialValues?.waistNavelCm,
    initialValues?.armCm,
    initialValues?.thighCm,
  ]);

  const emitChange = (next: {
    chestCm?: number;
    waistNavelCm?: number;
    armCm?: number;
    thighCm?: number;
  }) => {
    onChange?.(next);
  };

  const zoneInfo = ZONE_CONFIG[activeZone];
  const svgW = compact ? 92 : 130;
  const svgH = compact ? 132 : 190;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14 }}>
      {/* בורר 4 אזורי המדידה */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 5,
          background: 'var(--bg-surface-2)',
          padding: 4,
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
        }}
      >
        {(['chest', 'waistNavel', 'arm', 'thigh'] as MeasurementZone[]).map(
          (z) => {
            const active = activeZone === z;
            const hasVal =
              (z === 'chest' && chestCm) ||
              (z === 'waistNavel' && waistNavelCm) ||
              (z === 'arm' && armCm) ||
              (z === 'thigh' && thighCm);

            return (
              <button
                key={z}
                type="button"
                onClick={() => setActiveZone(z)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: compact ? '7px 4px' : '9px 6px',
                  borderRadius: 9,
                  border: 'none',
                  background: active ? 'var(--sel-bg)' : 'transparent',
                  color: active ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: compact ? 11 : 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{ZONE_CONFIG[z].shortLabel}</span>
                {hasVal && (
                  <CheckCircle2
                    size={12}
                    color={active ? '#ffffff' : 'var(--accent-volt)'}
                  />
                )}
              </button>
            );
          }
        )}
      </div>

      {/* תצוגת הנפשת SVG אנטומית + הוראות מדויקות לאזור הנבחר */}
      <div
        className="pro-card"
        style={{
          padding: compact ? 10 : 16,
          display: 'grid',
          gridTemplateColumns: compact
            ? '98px 1fr'
            : 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: compact ? 10 : 16,
          alignItems: 'center',
          background: 'var(--fill-1)',
        }}
      >
        {/* איור גוף וקטורי עם הנפשת סרט מדידה חי */}
        <div
          style={{
            width: compact ? 98 : 145,
            height: compact ? 138 : 200,
            margin: '0 auto',
            borderRadius: 14,
            background: 'var(--surface-2)',
            border: '1px solid var(--line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {activeZone === 'chest' && (
            <svg width={svgW} height={svgH} viewBox="0 0 130 190">
              {/* מתאר פלג גוף עליון אנטומי */}
              <circle
                cx="65"
                cy="24"
                r="13"
                fill="none"
                stroke="#4b5563"
                strokeWidth="2"
              />
              <path
                d="M32 52 C40 44, 90 44, 98 52 L106 95 L92 95 L88 68 L86 155 L44 155 L42 68 L38 95 L24 95 Z"
                fill="var(--fill-1)"
                stroke="#64748b"
                strokeWidth="2"
              />
              {/* קו חזה פנימי */}
              <path
                d="M44 78 Q55 83 65 78 Q75 83 86 78"
                fill="none"
                stroke="#475569"
                strokeWidth="1.5"
              />
              {/* סרט מדידה מונפש על החזה */}
              <motion.ellipse
                cx="65"
                cy="75"
                rx="26"
                ry="7"
                fill="none"
                stroke="#d67d09"
                strokeWidth="3.5"
                strokeDasharray="6 4"
                animate={{
                  strokeDashoffset: [0, -20],
                  scaleX: [1, 1.04, 1],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
              {/* חצי כיוון מדידה */}
              <motion.circle
                cx="39"
                cy="75"
                r="4"
                fill="#d67d09"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <motion.circle
                cx="91"
                cy="75"
                r="4"
                fill="#d67d09"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <text
                x="65"
                y="178"
                textAnchor="middle"
                fill="#d67d09"
                fontSize="11"
                fontWeight="bold"
              >
                קו שיא החזה
              </text>
            </svg>
          )}

          {activeZone === 'waistNavel' && (
            <svg width={svgW} height={svgH} viewBox="0 0 130 190">
              <circle
                cx="65"
                cy="22"
                r="12"
                fill="none"
                stroke="#4b5563"
                strokeWidth="2"
              />
              <path
                d="M34 50 C42 44, 88 44, 96 50 L88 158 L42 158 Z"
                fill="var(--fill-1)"
                stroke="#64748b"
                strokeWidth="2"
              />
              {/* סימון הטבור (פופיק) */}
              <circle cx="65" cy="112" r="2.8" fill="#d67d09" />
              {/* סרט מדידה מונפש על הפופיק */}
              <motion.ellipse
                cx="65"
                cy="112"
                rx="24"
                ry="6"
                fill="none"
                stroke="#d67d09"
                strokeWidth="3.5"
                strokeDasharray="6 4"
                animate={{
                  strokeDashoffset: [0, -20],
                  scaleX: [1, 1.05, 1],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
              <motion.circle
                cx="65"
                cy="112"
                r="8"
                fill="none"
                stroke="#d67d09"
                strokeWidth="1.5"
                animate={{ scale: [0.8, 1.4], opacity: [0.9, 0] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              <text
                x="65"
                y="178"
                textAnchor="middle"
                fill="#d67d09"
                fontSize="11"
                fontWeight="bold"
              >
                בדיוק על הפופיק
              </text>
            </svg>
          )}

          {activeZone === 'arm' && (
            <svg width={svgW} height={svgH} viewBox="0 0 130 190">
              {/* כתף וזרוע מכופפת ב-90 מעלות עם כיווץ דו-ראשי */}
              <path
                d="M25 135 L25 90 C25 75, 42 75, 52 84 C64 70, 82 70, 92 84 L96 42 L110 42 L110 104 L46 104 L46 135 Z"
                fill="var(--fill-1)"
                stroke="#64748b"
                strokeWidth="2"
              />
              {/* סרט מדידה אנכי סביב שיא שריר הזרוע */}
              <motion.ellipse
                cx="72"
                cy="89"
                rx="7"
                ry="19"
                fill="none"
                stroke="#d67d09"
                strokeWidth="3.5"
                strokeDasharray="5 3"
                animate={{
                  strokeDashoffset: [0, -16],
                  scaleY: [1, 1.07, 1],
                }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
              <text
                x="65"
                y="165"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
              >
                זווית 90° וכיווץ שיא
              </text>
              <text
                x="65"
                y="180"
                textAnchor="middle"
                fill="#d67d09"
                fontSize="11"
                fontWeight="bold"
              >
                מרכז הזרוע (שיא השריר)
              </text>
            </svg>
          )}

          {activeZone === 'thigh' && (
            <svg width={svgW} height={svgH} viewBox="0 0 130 190">
              {/* מתאר אגן ורגליים */}
              <path
                d="M36 28 L94 28 L98 62 L86 156 L72 156 L68 78 L62 78 L58 156 L44 156 L32 62 Z"
                fill="var(--fill-1)"
                stroke="#64748b"
                strokeWidth="2"
              />
              {/* סרט מדידה מונפש על הירך העליונה */}
              <motion.ellipse
                cx="82"
                cy="88"
                rx="15"
                ry="5"
                fill="none"
                stroke="#d67d09"
                strokeWidth="3.5"
                strokeDasharray="5 3"
                animate={{
                  strokeDashoffset: [0, -16],
                  scaleX: [1, 1.06, 1],
                }}
                transition={{
                  duration: 1.7,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
              <text
                x="65"
                y="178"
                textAnchor="middle"
                fill="#d67d09"
                fontSize="11"
                fontWeight="bold"
              >
                החלק הרחב בירך העליונה
              </text>
            </svg>
          )}
        </div>

        {/* הוראות מדידה שלב-אחר-שלב */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 5 : 8 }}>
          <div
            style={{
              fontSize: compact ? 13 : 15,
              fontWeight: 800,
              color: 'var(--accent-volt)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Ruler size={compact ? 14 : 16} />
            <span>{zoneInfo.title}</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: compact ? 3 : 5,
              fontSize: compact ? 11 : 12,
              color: 'var(--text-primary)',
              lineHeight: compact ? 1.35 : 1.45,
            }}
          >
            {zoneInfo.instructions.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 5 }}>
                <span
                  className="num-mono"
                  style={{ color: 'var(--accent-volt)', fontWeight: 800 }}
                >
                  {i + 1}.
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>

          {!compact && (
            <div
              style={{
                marginTop: 4,
                padding: '7px 10px',
                borderRadius: 10,
                background: 'var(--fill-1)',
                border: '1px solid var(--line-2)',
                fontSize: 11,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Info
                size={14}
                color="currentColor"
                style={{ flexShrink: 0 }}
              />
              <span>{zoneInfo.tip}</span>
            </div>
          )}
        </div>
      </div>

      {/* שדות הזנת 4 ההיקפים בס"מ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: compact ? 8 : 10,
        }}
      >
        <div onClick={() => setActiveZone('chest')}>
          <NumberInput
            label="היקף חזה (ס״מ)"
            placeholder="למשל: 98"
            value={chestCm ?? ''}
            min={40}
            max={200}
            step={0.5}
            decimalScale={1}
            onChange={(val) => {
              const num = val === '' ? undefined : Number(val);
              setChestCm(num);
              emitChange({ chestCm: num, waistNavelCm, armCm, thighCm });
            }}
          />
        </div>

        <div onClick={() => setActiveZone('waistNavel')}>
          <NumberInput
            label="היקף בטן – פופיק (ס״מ)"
            placeholder="למשל: 84"
            value={waistNavelCm ?? ''}
            min={40}
            max={200}
            step={0.5}
            decimalScale={1}
            onChange={(val) => {
              const num = val === '' ? undefined : Number(val);
              setWaistNavelCm(num);
              emitChange({ chestCm, waistNavelCm: num, armCm, thighCm });
            }}
          />
        </div>

        <div onClick={() => setActiveZone('arm')}>
          <NumberInput
            label="היקף זרוע בכיווץ (ס״מ)"
            placeholder="למשל: 36"
            value={armCm ?? ''}
            min={15}
            max={80}
            step={0.5}
            decimalScale={1}
            onChange={(val) => {
              const num = val === '' ? undefined : Number(val);
              setArmCm(num);
              emitChange({ chestCm, waistNavelCm, armCm: num, thighCm });
            }}
          />
        </div>

        <div onClick={() => setActiveZone('thigh')}>
          <NumberInput
            label="היקף ירך עליונה (ס״מ)"
            placeholder="למשל: 56"
            value={thighCm ?? ''}
            min={25}
            max={120}
            step={0.5}
            decimalScale={1}
            onChange={(val) => {
              const num = val === '' ? undefined : Number(val);
              setThighCm(num);
              emitChange({ chestCm, waistNavelCm, armCm, thighCm: num });
            }}
          />
        </div>
      </div>

      {showSaveButtons && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: 6,
          }}
        >
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="btn-surface"
              style={{
                padding: '10px 16px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              דלג ואשלים אחר כך
            </button>
          )}
          {onSave && (
            <button
              type="button"
              disabled={isSaving}
              onClick={async () => {
                if (isSaving) return;
                setIsSaving(true);
                try {
                  await onSave({ chestCm, waistNavelCm, armCm, thighCm });
                } finally {
                  setIsSaving(false);
                }
              }}
              className="btn-volt"
              style={{
                flex: 1,
                padding: '10px 18px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {isSaving && <Loader2 size={14} className="spot-spinner" />}
              <span>{isSaving ? 'שומר מדידות...' : 'שמור מדידת היקפים'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
