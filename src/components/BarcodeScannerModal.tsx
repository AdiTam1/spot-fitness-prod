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
  Paper,
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
        onProductFound(data.item);
        onClose();
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
      <Stack gap="md">
        <Paper
          p="md"
          radius="md"
          style={{
            background: 'rgba(214, 125, 9, 0.08)',
            border: '1px dashed rgba(214, 125, 9, 0.38)',
            textAlign: 'center',
          }}
        >
          {!cameraActive ? (
            <Stack align="center" gap="xs">
              <Camera size={34} color="currentColor" />
              <Text size="sm" c="dimmed">
                כוון את מצלמת הטלפון לברקוד שעל אריזת המוצר לטעינה אוטומטית של הקלוריות והמאקרו
              </Text>
              <Button
                variant="light"
                color="orange"
                radius="md"
                leftSection={<Camera size={16} />}
                onClick={startCamera}
              >
                הפעל מצלמה לסריקת ברקוד
              </Button>
            </Stack>
          ) : (
            <Stack gap="xs">
              <div
                id="spot-barcode-reader"
                style={{ width: '100%', minHeight: 200, borderRadius: 12, overflow: 'hidden' }}
              />
              <Button variant="subtle" color="gray" size="xs" onClick={stopCamera}>
                סגור מצלמה
              </Button>
            </Stack>
          )}
        </Paper>

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
            color="orange"
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
                  loading ? <Loader size={12} /> : <Check size={12} color="var(--accent-volt)" />
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
                <Badge size="xs" variant="dot" color="orange">
                  {b.code}
                </Badge>
              </Button>
            ))}
          </SimpleGrid>
        </Stack>
      </Stack>
    </Modal>
  );
}
