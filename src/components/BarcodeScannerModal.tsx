'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  TextInput,
  Badge,
  Alert,
  Loader,
  SimpleGrid,
} from '@mantine/core';
import { Barcode, Camera, Check, Search, Sparkles, AlertCircle } from 'lucide-react';
import { FoodCatalogItem } from '@/types/nutrition';

interface BarcodeScannerModalProps {
  opened: boolean;
  onClose: () => void;
  onProductFound: (item: FoodCatalogItem) => void;
}

const QUICK_ISRAELI_BARCODES = [
  { label: 'קרמבו שטראוס', code: '7290000066318' },
  { label: "קוטג' תנובה 5%", code: '7290004127329' },
  { label: 'יוגורט דנונה PRO 20g', code: '7290107645058' },
  { label: 'במבה אסם', code: '7290000068787' },
  { label: 'טחינה גולמית בארכה', code: '7290000181509' },
  { label: 'טונה סטארקיסט במים', code: '7290000120836' },
];

export function BarcodeScannerModal({
  opened,
  onClose,
  onProductFound,
}: BarcodeScannerModalProps) {
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef<unknown>(null);
  const lookingUpRef = useRef(false);
  // Scan result stage (design: Barcode): the product is shown before it is added to the meal.
  const [found, setFound] = useState<FoodCatalogItem | null>(null);

  const lookupBarcode = async (code: string) => {
    const clean = code.trim();
    if (!clean || lookingUpRef.current) return;
    lookingUpRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/food/barcode?code=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok || !data.item) {
        setError(data.error || 'המוצר לא נמצא לפי הברקוד שהוזן');
      } else {
        await stopCamera();
        setFound(data.item as FoodCatalogItem);
      }
    } catch {
      setError('שגיאה בחיפוש הברקוד');
    } finally {
      lookingUpRef.current = false;
      setLoading(false);
    }
  };

  const startCamera = async () => {
    setError(null);
    setCameraActive(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      setTimeout(async () => {
        const el = document.getElementById('spot-barcode-reader');
        if (!el) return;
        const scanner = new Html5Qrcode('spot-barcode-reader');
        scannerRef.current = scanner;
        try {
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 120 } },
            (decodedText: string) => {
              lookupBarcode(decodedText);
            },
            () => {}
          );
        } catch {
          setCameraActive(false);
          setError('לא ניתן לגשת למצלמה בדפדפן זה. ניתן להקליד או לבחור ברקוד לדוגמה למטה.');
        }
      }, 150);
    } catch {
      setCameraActive(false);
    }
  };

  const stopCamera = async () => {
    const scanner = scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
    if (scanner && scanner.stop) {
      try {
        await scanner.stop();
        scanner.clear?.();
      } catch {
        // ignore if not started
      }
    }
    scannerRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => {
    if (!opened) {
      setFound(null);
      stopCamera();
      setError(null);
      setManualCode('');
    }
    return () => {
      stopCamera();
    };
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      zIndex={250}
      overlayProps={{ backgroundOpacity: 0.82, blur: 6 }}
      title={
        <Group gap="xs">
          <Barcode size={20} color="currentColor" />
          <Text fw={700}>סריקת ברקוד מוצר (OpenFoodFacts + מאגר ישראלי)</Text>
        </Group>
      }
      centered
      radius="lg"
      size="md"
    >
      {found ? (
        <FoundProduct
          item={found}
          onAdd={() => {
            onProductFound(found);
            setFound(null);
            onClose();
          }}
          onRescan={() => setFound(null)}
        />
      ) : (
      <Stack gap="md">
        <div
          style={{
            position: 'relative',
            borderRadius: 24,
            background: 'radial-gradient(circle at 50% 45%, #2b2b2b, #0b0b0b 75%)',
            overflow: 'hidden',
            minHeight: 210,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 20,
            textAlign: 'center',
          }}
        >
          {!cameraActive ? (
            <>
              {/* Viewfinder: corner brackets + a single orange scan line (active indicator). */}
              <div aria-hidden style={{ position: 'relative', width: 220, height: 96 }}>
                {(['top', 'bottom'] as const).flatMap((v) =>
                  (['insetInlineStart', 'insetInlineEnd'] as const).map((h) => (
                    <span
                      key={`${v}-${h}`}
                      style={{
                        position: 'absolute',
                        [v]: 0,
                        [h]: 0,
                        width: 28,
                        height: 28,
                        [v === 'top' ? 'borderTop' : 'borderBottom']: '3px solid #fff',
                        [h === 'insetInlineStart' ? 'borderInlineStart' : 'borderInlineEnd']: '3px solid #fff',
                        borderRadius:
                          v === 'top'
                            ? h === 'insetInlineStart'
                              ? '14px 0 0 0'
                              : '0 14px 0 0'
                            : h === 'insetInlineStart'
                              ? '0 0 0 14px'
                              : '0 0 14px 0',
                      }}
                    />
                  ))
                )}
                <span
                  style={{
                    position: 'absolute',
                    insetInline: 14,
                    top: '50%',
                    height: 2,
                    background: 'var(--accent)',
                    boxShadow: '0 0 12px var(--accent)',
                  }}
                />
                <Camera size={30} color="#fff" style={{ position: 'absolute', inset: 0, margin: 'auto', opacity: 0.35 }} />
              </div>
              <Text size="sm" style={{ color: 'rgba(255,255,255,.8)' }}>
                כוון את מצלמת הטלפון לברקוד שעל אריזת המוצר לטעינה אוטומטית של הקלוריות והמאקרו
              </Text>
              <Button
                className="btn-volt"
                radius="xl"
                size="md"
                leftSection={<Camera size={16} />}
                onClick={startCamera}
                style={{ minHeight: 44 }}
              >
                הפעל מצלמה לסריקת ברקוד
              </Button>
            </>
          ) : (
            <Stack gap="xs" style={{ width: '100%' }}>
              <div
                id="spot-barcode-reader"
                style={{ width: '100%', minHeight: 200, borderRadius: 16, overflow: 'hidden' }}
              />
              <Button variant="subtle" color="gray" size="sm" onClick={stopCamera} style={{ minHeight: 44 }}>
                סגור מצלמה
              </Button>
            </Stack>
          )}
        </div>

        <Group align="flex-end" gap="xs">
          <TextInput
            style={{ flex: 1 }}
            dir="ltr"
            inputMode="numeric"
            label="או הזן מספר ברקוד ידנית"
            placeholder="למשל: 7290000066318"
            value={manualCode}
            disabled={loading}
            onChange={(e) => setManualCode(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                lookupBarcode(manualCode);
              }
            }}
          />
          <Button
            className="btn-volt"
            style={{ minHeight: 44 }}
            disabled={loading || !manualCode.trim()}
            onClick={() => lookupBarcode(manualCode)}
            loading={loading}
            leftSection={<Search size={16} />}
          >
            {loading ? 'מחפש...' : 'חפש'}
          </Button>
        </Group>

        {error && (
          <Alert color="red" radius="md" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        )}

        <Stack gap={6}>
          <Group gap={6}>
            <Sparkles size={14} color="var(--accent-orange-bright)" />
            <Text size="xs" fw={600} c="dimmed">
              בדיקה מהירה – לחץ על ברקוד של מוצר ישראלי מוכר:
            </Text>
          </Group>
          <SimpleGrid cols={2} spacing="xs">
            {QUICK_ISRAELI_BARCODES.map((b) => (
              <Button
                key={b.code}
                variant="default"
                size="xs"
                radius="md"
                justify="space-between"
                disabled={loading}
                rightSection={
                  loading ? <Loader size={12} /> : <Check size={12} color="var(--text-3)" />
                }
                onClick={() => lookupBarcode(b.code)}
                styles={{
                  root: { height: 'auto', padding: '8px 10px' },
                  label: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
                }}
              >
                <Text size="xs" fw={600}>
                  {b.label}
                </Text>
                <Badge size="xs" variant="outline" color="gray" styles={{ label: { direction: 'ltr', unicodeBidi: 'isolate' } }}>
                  {b.code}
                </Badge>
              </Button>
            ))}
          </SimpleGrid>
        </Stack>
      </Stack>
      )}
    </Modal>
  );
}

function FoundProduct({
  item,
  onAdd,
  onRescan,
}: {
  item: FoodCatalogItem;
  onAdd: () => void;
  onRescan: () => void;
}) {
  const unit = item.units[0] || { label: '100 גרם', grams: 100 };
  const k = unit.grams / 100;
  const kcal = Math.round(item.per100g.calories * k);
  const macro = (v: number) => Math.round(v * k * 10) / 10;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Barcode size={22} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            נמצא במאגר
            {item.barcode ? (
              <>
                {' · '}
                <bdi dir="ltr" className="ltr-num">{item.barcode}</bdi>
              </>
            ) : null}
          </span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{item.name}</span>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span>
          <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 32, fontWeight: 700 }}>
            {kcal}
          </bdi>{' '}
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>קק״ל</span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          <span style={{ color: 'var(--macro-protein)' }}>ח׳ <bdi dir="ltr" className="ltr-num">{macro(item.per100g.protein)}</bdi></span>
          {' · '}
          <span style={{ color: 'var(--macro-carbs)' }}>פ׳ <bdi dir="ltr" className="ltr-num">{macro(item.per100g.carbs)}</bdi></span>
          {' · '}
          <span style={{ color: 'var(--macro-fat)' }}>ש׳ <bdi dir="ltr" className="ltr-num">{macro(item.per100g.fat)}</bdi></span>
          {' · '}
          {unit.label}
        </span>
      </div>
      <Button className="btn-volt" radius="xl" style={{ height: 56, fontSize: 16 }} leftSection={<Check size={18} />} onClick={onAdd}>
        הוסף לארוחה
      </Button>
      <Button className="glass" radius="xl" variant="default" style={{ height: 52, fontSize: 15 }} onClick={onRescan}>
        סרוק מוצר אחר
      </Button>
    </div>
  );
}
