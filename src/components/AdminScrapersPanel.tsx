'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import {
  FoodCatalogItem,
  ScraperHealthResult,
  ScraperSourceId,
  ScraperSuiteReport,
} from '@/types/nutrition';

interface AdminScrapersPanelProps {
  report: ScraperSuiteReport | null;
  loading: boolean;
  onReportUpdate: (next: ScraperSuiteReport) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

function formatHeDateTime(iso: string | null | undefined): string {
  if (!iso) return 'טרם בוצע';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function AdminScrapersPanel({
  report,
  loading,
  onReportUpdate,
  onNotify,
}: AdminScrapersPanelProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [testOpenId, setTestOpenId] = useState<ScraperSourceId | null>(null);
  const [testQuery, setTestQuery] = useState<string>("קוטג'");
  const [testResults, setTestResults] = useState<Record<string, FoodCatalogItem[]>>({});
  const [testingId, setTestingId] = useState<ScraperSourceId | null>(null);

  const callScraperApi = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/scrapers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'שגיאה בפעולת הסקרייפרים');
    }
    return data;
  };

  const handleCheckAll = async () => {
    setBusyAction('check_all');
    try {
      const data = await callScraperApi({ action: 'check_all' });
      onReportUpdate(data.report);
      const r: ScraperSuiteReport = data.report;
      const totalSites = r.results.length;
      if (r.totalBroken > 0) {
        onNotify(
          `בדיקה הושלמה: ${r.totalHealthy}/${totalSites} תקינים, אך ${r.totalBroken} אתרים נשברו ודורשים עדכון!`,
          true
        );
      } else {
        onNotify(`בדיקה אוטומטית הצליחה: כל ${r.totalHealthy}/${totalSites} האתרים עובדים ומחלצים מאקרו מלא!`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'בדיקת הסקרייפרים נכשלה', true);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncAll = async () => {
    setBusyAction('sync_catalog');
    try {
      const data = await callScraperApi({ action: 'sync_catalog' });
      onReportUpdate(data.report);
      onNotify(
        `סנכרון הושלם! ${Number(data.totalCount || 0).toLocaleString('he-IL')} מוצרים זמינים כעת במאגר האפליקציה (${Number(data.addedCount || 0)} חדשים נוספו).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'סנכרון המאגר נכשל', true);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCheckOne = async (scraperId: ScraperSourceId) => {
    setBusyAction(`check:${scraperId}`);
    try {
      const data = await callScraperApi({ action: 'check_one', scraperId });
      onReportUpdate(data.report);
      const target = (data.report as ScraperSuiteReport).results.find((x) => x.id === scraperId);
      if (target?.status === 'broken') {
        onNotify(`${target.name} נכשל בבדיקה: ${target.errorDiagnosis || 'דורש עדכון'}`, true);
      } else {
        onNotify(`${target?.name || scraperId} תקין ומחלץ 4 ערכי מאקרו בהצלחה (${target?.latencyMs}ms)`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'הבדיקה נכשלה', true);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncOne = async (scraperId: ScraperSourceId) => {
    setBusyAction(`sync:${scraperId}`);
    try {
      const data = await callScraperApi({ action: 'sync_one', scraperId });
      onReportUpdate(data.report);
      onNotify(`אתר ${scraperId} סונכרן בהצלחה למאגר (${data.totalCount} פריטים במאגר המשולב).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'הסנכרון נכשל', true);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncOpenFoodFacts = async () => {
    setBusyAction('sync_off');
    try {
      const data = await callScraperApi({ action: 'sync_openfoodfacts', pages: 10 });
      onReportUpdate(data.report);
      if (!data.tableReady) {
        onNotify(
          'טבלת food_catalog_items טרם נוצרה ב-Supabase — יש להריץ את supabase/schema.sql ב-SQL Editor.',
          true
        );
      } else {
        onNotify(
          `סונכרנו ${Number(data.savedCount || 0)} מוצרי סופרים וברקוד מ-Open Food Facts ישראל ישירות לטבלת ה-DB!`
        );
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'ייבוא Open Food Facts נכשל', true);
    } finally {
      setBusyAction(null);
    }
  };

  const handleBackfillCatalogMeta = async () => {
    setBusyAction('backfill_meta');
    try {
      const data = await callScraperApi({ action: 'backfill_catalog_meta' });
      if (data.report) onReportUpdate(data.report);
      if (data.ok) {
        onNotify(
          `נסרקו ${Number(data.scanned || 0).toLocaleString('he-IL')} שורות ב-DB: הושלמו ${Number(
            data.updatedBarcodes || 0
          )} ברקודים ו-${Number(data.updatedUnits || 0)} מידות חבילה/אריזה.`
        );
      } else {
        onNotify(data.error || 'עדכון הברקודים נכשל', true);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'השלמת ברקודים נכשלה', true);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunTestSearch = async (scraperId: ScraperSourceId) => {
    setTestingId(scraperId);
    try {
      const data = await callScraperApi({
        action: 'test_search',
        scraperId,
        query: testQuery.trim() || "קוטג'",
      });
      setTestResults((prev) => ({ ...prev, [scraperId]: data.items || [] }));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'שגיאה בבדיקת חיפוש חיה', true);
    } finally {
      setTestingId(null);
    }
  };

  const results: ScraperHealthResult[] = report?.results || [];
  const brokenList = results.filter((r) => r.status === 'broken');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* כותרת ופעולות מהירות */}
      <div
        className="pro-card"
        style={{
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={20} color="var(--accent-volt)" />
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
                סופרים ישראליים, חנויות טבע וניטור אוטומטי ({results.length || 12} מקורות)
              </h2>
            </div>
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                margin: '6px 0 0 0',
                lineHeight: 1.5,
              }}
            >
              כל אחד מ-{results.length || 12} האתרים נבדק אוטומטית בחילוץ אמיתי של קלוריות, פחמימות, חלבונים ושומן —
              ומוצריו מסונכרנים כחלק ממאגר האפליקציה של המתאמנים.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={Boolean(busyAction) || loading}
              onClick={handleCheckAll}
              className="btn-volt"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {busyAction === 'check_all' || loading ? (
                <Loader2 size={15} className="spot-spinner" />
              ) : (
                <Activity size={15} />
              )}
              <span>
                {busyAction === 'check_all'
                  ? `בודק ${results.length || 12} אתרים...`
                  : `בדוק את כל ${results.length || 12} הסקרייפרים עכשיו`}
              </span>
            </button>

            <button
              type="button"
              disabled={Boolean(busyAction) || loading}
              onClick={handleSyncAll}
              className="btn-surface"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 15px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                borderColor: 'rgba(214, 125, 9, 0.35)',
              }}
            >
              {busyAction === 'sync_catalog' ? (
                <Loader2 size={15} className="spot-spinner" />
              ) : (
                <Database size={15} color="var(--accent-volt)" />
              )}
              <span>
                {busyAction === 'sync_catalog'
                  ? 'מסנכרן למאגר...'
                  : 'סנכרן מוצרים למאגר האפליקציה'}
              </span>
            </button>
          </div>
        </div>

        {/* באנר חיווי תקלה או תקינות */}
        {brokenList.length > 0 ? (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(255, 94, 126, 0.12)',
              border: '1px solid rgba(255, 94, 126, 0.45)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <ShieldAlert size={18} color="#ff5e7e" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              <strong style={{ color: '#ff8da3' }}>
                התראת תחזוקה: {brokenList.length} מתוך {results.length} הסקרייפרים נכשלו בבדיקה ודורשים עדכון!
              </strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                אתרים עם תקלה:{' '}
                {brokenList.map((b) => `${b.name} (${b.domain})`).join(' · ')}
              </div>
            </div>
          </div>
        ) : report && report.totalHealthy === results.length && results.length > 0 ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(56, 232, 138, 0.1)',
              border: '1px solid rgba(56, 232, 138, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              color: '#86efac',
            }}
          >
            <CheckCircle2 size={16} />
            <span>
              כל <strong>{report.totalHealthy}/{results.length}</strong> הסקרייפרים עובדים תקין ומחלצים
              קלוריות, חלבונים, פחמימות ושומנים ללא צורך בעדכון קוד.
            </span>
          </div>
        ) : null}

        {/* כרטיסיות KPI עליונות */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
          }}
        >
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>סטטוס סקרייפרים</div>
            <div className="num-mono" style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>
              <span style={{ color: '#4ade80' }}>{report?.totalHealthy ?? 0}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}> / {results.length || 12} תקינים</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              שבורים: {report?.totalBroken ?? 0} · ממתינים/אזהרה: {report?.totalWarning ?? 0}
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>מוצרים שמורים במאגר</div>
            <div
              className="num-mono"
              style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: 'var(--accent-volt)' }}
            >
              {Math.max(
                report?.totalScrapedCatalogItems ?? 0,
                report?.sqlCatalogStats?.totalCount ?? 0
              ).toLocaleString('he-IL')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {report?.sqlCatalogStats?.available
                ? `טבלת SQL מאונדקסת (${report.sqlCatalogStats.totalCount.toLocaleString('he-IL')} שורות) + חיפוש חי`
                : '+ חיפוש חי על 25,000+ פריטים בזמן אמת'}
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>בדיקה אוטומטית אחרונה</div>
            <div className="num-mono" style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>
              {formatHeDateTime(report?.lastCheckedAt)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              טריגר:{' '}
              {report?.trigger === 'auto'
                ? 'אוטומטי בדשבורד'
                : report?.trigger === 'cron'
                  ? 'Cron מתוזמן'
                  : 'ידני'}
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>לוח בדיקה אוטומטית</div>
            <div className="num-mono" style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>
              כל 6 שעות + Cron יומי
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              הבאה החל מ: {formatHeDateTime(report?.nextAutoCheckAt)}
            </div>
          </div>
        </div>
      </div>

      {/* טבלת SQL קבועה למוצרי סופרים (שופרסל + OpenFoodFacts + קאש חיפוש/ברקוד) */}
      <div
        className="pro-card"
        style={{
          padding: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          borderColor: report?.sqlCatalogStats?.available
            ? 'rgba(214, 125, 9, 0.25)'
            : 'rgba(250, 204, 21, 0.35)',
        }}
      >
        <div style={{ minWidth: 260, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Database size={16} color="var(--accent-volt)" />
            <strong style={{ fontSize: 13.5 }}>
              טבלת SQL מאונדקסת (<code dir="ltr">food_catalog_items</code>) — שופרסל, ברקוד ושמירת חיפושים
            </strong>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 999,
                background: report?.sqlCatalogStats?.available
                  ? 'rgba(74, 222, 128, 0.14)'
                  : 'rgba(250, 204, 21, 0.14)',
                color: report?.sqlCatalogStats?.available ? '#4ade80' : '#facc15',
              }}
            >
              {report?.sqlCatalogStats?.available ? 'מחובר ופעיל' : 'ממתין להרצת SQL ב-Supabase'}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.55 }}>
            {report?.sqlCatalogStats?.available ? (
              <>
                סה״כ שמור בטבלת SQL (ללא עומס RAM):{' '}
                <strong className="num-mono" style={{ color: 'var(--text-primary)' }}>
                  {report.sqlCatalogStats.totalCount.toLocaleString('he-IL')}
                </strong>{' '}
                מוצרים · שופרסל:{' '}
                <strong className="num-mono">
                  {(report.sqlCatalogStats.bySource?.shufersal || 0).toLocaleString('he-IL')}
                </strong>{' '}
                · OpenFoodFacts ישראל:{' '}
                <strong className="num-mono">
                  {(report.sqlCatalogStats.bySource?.openfoodfacts || 0).toLocaleString('he-IL')}
                </strong>
                . כל חיפוש חי או סריקת ברקוד של מתאמן נשמר אוטומטית לטבלה!
              </>
            ) : (
              <>
                העתק והרץ את <code dir="ltr">supabase/schema.sql</code> ב-SQL Editor של Supabase כדי להפעיל אחסון
                לאלפי מוצרי שופרסל, OpenFoodFacts וקאש אוטומטי לחיפושים וברקודים.
              </>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            להזנה מלאה של אלפי מוצרים (שופרסל, משרד הבריאות 4,624+, Fuder וברקודים):{' '}
            <code dir="ltr" style={{ color: 'var(--accent-volt)' }}>
              node --use-system-ca scripts/seed-shufersal.mjs --full
            </code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={Boolean(busyAction) || loading}
            onClick={handleBackfillCatalogMeta}
            className="btn-surface"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              borderColor: 'rgba(214, 125, 9, 0.35)',
            }}
          >
            {busyAction === 'backfill_meta' ? (
              <Loader2 size={14} className="spot-spinner" />
            ) : (
              <CheckCircle2 size={14} color="var(--accent-volt)" />
            )}
            <span>
              {busyAction === 'backfill_meta'
                ? 'משלים ברקודים ומידות...'
                : 'השלם ברקודים ומידות אריזה ב-DB'}
            </span>
          </button>

          <button
            type="button"
            disabled={Boolean(busyAction) || loading}
            onClick={handleSyncOpenFoodFacts}
            className="btn-surface"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              borderColor: 'rgba(214, 125, 9, 0.35)',
            }}
          >
            {busyAction === 'sync_off' ? (
              <Loader2 size={14} className="spot-spinner" />
            ) : (
              <Database size={14} color="var(--accent-volt)" />
            )}
            <span>
              {busyAction === 'sync_off'
                ? 'מייבא מ-OpenFoodFacts...'
                : 'ייבא Open Food Facts ישראל (ברקודים)'}
            </span>
          </button>
        </div>
      </div>

      {/* גריד הסקרייפרים */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: 12,
        }}
      >
        {results.map((item, idx) => {
          const isCheckingThis = busyAction === `check:${item.id}`;
          const isSyncingThis = busyAction === `sync:${item.id}`;
          const badgeColor =
            item.status === 'healthy'
              ? { bg: 'rgba(74, 222, 128, 0.14)', fg: '#4ade80', border: 'rgba(74, 222, 128, 0.4)', label: 'תקין' }
              : item.status === 'broken'
                ? { bg: 'rgba(255, 94, 126, 0.14)', fg: '#ff6b8b', border: 'rgba(255, 94, 126, 0.45)', label: 'נשבר — נדרש עדכון' }
                : { bg: 'rgba(250, 204, 21, 0.14)', fg: '#facc15', border: 'rgba(250, 204, 21, 0.4)', label: 'ממתין / אזהרה' };

          return (
            <div
              key={item.id}
              className="pro-card"
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                borderColor:
                  item.status === 'broken' ? 'rgba(255, 94, 126, 0.5)' : undefined,
              }}
            >
              {/* שורה עליונה: שם האתר + סטטוס */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      className="num-mono"
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: 'var(--bg-surface-2)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{item.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <a
                      href={item.targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 11.5,
                        color: 'var(--accent-volt)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <span>{item.domain}</span>
                      <ExternalLink size={11} />
                    </a>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {item.category}</span>
                  </div>
                </div>

                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '4px 9px',
                    borderRadius: 999,
                    background: badgeColor.bg,
                    color: badgeColor.fg,
                    border: `1px solid ${badgeColor.border}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {item.status === 'healthy' ? (
                    <CheckCircle2 size={12} />
                  ) : item.status === 'broken' ? (
                    <AlertTriangle size={12} />
                  ) : (
                    <Clock size={12} />
                  )}
                  <span>{badgeColor.label}</span>
                </span>
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {item.description}
              </div>

              {/* מדדים */}
              <div
                className="num-mono"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 11,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'var(--bg-surface-2)',
                }}
              >
                <span>היקף: <strong>{item.estimatedCatalogSize}</strong></span>
                <span>· במאגר: <strong style={{ color: 'var(--accent-volt)' }}>{item.syncedCatalogCount}</strong></span>
                <span>· HTTP: <strong>{item.httpStatus || '—'}</strong></span>
                <span>· תגובה: <strong>{item.latencyMs ? `${item.latencyMs}ms` : '—'}</strong></span>
                <span>· 4 מאקרו: <strong>{item.schemaValid ? '✔ מלא' : '✖ חסר'}</strong></span>
              </div>

              {/* תצוגת דגימה אמיתית שחולצה */}
              {item.sampleItem ? (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: 'rgba(214, 125, 9, 0.05)',
                    border: '1px solid rgba(214, 125, 9, 0.2)',
                    fontSize: 11.5,
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    דגימה מאומתת מהאתר: {item.sampleItem.name}
                  </div>
                  <div className="num-mono" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                    ל-100 גרם: {item.sampleItem.calories} קק״ל · חלבון {item.sampleItem.protein}ג׳ ·
                    פחמימות {item.sampleItem.carbs}ג׳ · שומן {item.sampleItem.fat}ג׳
                  </div>
                </div>
              ) : null}

              {/* אבחון שגיאה אם נשבר */}
              {item.errorDiagnosis ? (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    background:
                      item.status === 'broken'
                        ? 'rgba(255, 94, 126, 0.1)'
                        : 'rgba(250, 204, 21, 0.08)',
                    border:
                      item.status === 'broken'
                        ? '1px solid rgba(255, 94, 126, 0.35)'
                        : '1px solid rgba(250, 204, 21, 0.3)',
                    fontSize: 11.5,
                    color: item.status === 'broken' ? '#ff9db1' : '#fde047',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'flex-start',
                  }}
                >
                  <Wrench size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{item.errorDiagnosis}</span>
                </div>
              ) : null}

              {/* כפתורי פעולה לכל סקרייפר */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => handleCheckOne(item.id)}
                  className="btn-surface"
                  style={{
                    padding: '6px 10px',
                    fontSize: 11.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                >
                  {isCheckingThis ? (
                    <Loader2 size={12} className="spot-spinner" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  <span>בדוק עכשיו</span>
                </button>

                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => handleSyncOne(item.id)}
                  className="btn-surface"
                  style={{
                    padding: '6px 10px',
                    fontSize: 11.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                >
                  {isSyncingThis ? (
                    <Loader2 size={12} className="spot-spinner" />
                  ) : (
                    <Database size={12} />
                  )}
                  <span>סנכרן אתר זה</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTestOpenId((cur) => (cur === item.id ? null : item.id))
                  }
                  className="btn-surface"
                  style={{
                    padding: '6px 10px',
                    fontSize: 11.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                >
                  <Search size={12} />
                  <span>בדיקת שליפה חיה</span>
                </button>
              </div>

              {/* מיני טסטר חי לסקרייפר */}
              {testOpenId === item.id && (
                <div
                  style={{
                    marginTop: 4,
                    padding: 10,
                    borderRadius: 10,
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={testQuery}
                      onChange={(e) => setTestQuery(e.currentTarget.value)}
                      placeholder="הזן מאכל לבדיקה (למשל קוטג׳, חזה עוף)..."
                      style={{
                        flex: 1,
                        fontSize: 12,
                        padding: '6px 8px',
                        borderRadius: 8,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface-1)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="button"
                      disabled={testingId === item.id}
                      onClick={() => handleRunTestSearch(item.id)}
                      className="btn-volt"
                      style={{ padding: '6px 12px', fontSize: 11.5, cursor: 'pointer' }}
                    >
                      {testingId === item.id ? 'שולף...' : 'הרץ'}
                    </button>
                  </div>
                  {(testResults[item.id] || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                      {testResults[item.id].map((tr) => (
                        <div
                          key={tr.id}
                          style={{
                            fontSize: 11,
                            padding: '5px 8px',
                            borderRadius: 6,
                            background: 'var(--bg-surface-1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{tr.name}</span>
                          <span className="num-mono" style={{ color: 'var(--text-secondary)' }}>
                            {tr.per100g.calories} קק״ל · ח {tr.per100g.protein} · פ {tr.per100g.carbs} · ש {tr.per100g.fat}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ציר זמן בדיקות אחרונות */}
      {report?.history && report.history.length > 0 && (
        <div className="pro-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
            היסטוריית בדיקות אוטומטיות וידניות אחרונות
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {report.history.slice(0, 8).map((h, i) => (
              <div
                key={`${h.checkedAt}-${i}`}
                className="num-mono"
                style={{
                  fontSize: 11,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-surface-2)',
                  border:
                    h.broken > 0
                      ? '1px solid rgba(255, 94, 126, 0.45)'
                      : '1px solid var(--border-subtle)',
                }}
              >
                {formatHeDateTime(h.checkedAt)} ·{' '}
                <strong>
                  {h.trigger === 'auto'
                    ? 'אוטומטי'
                    : h.trigger === 'cron'
                      ? 'Cron'
                      : 'ידני'}
                </strong>{' '}
                ·{' '}
                <span style={{ color: '#4ade80' }}>✔ {h.healthy}</span>{' '}
                {h.broken > 0 && (
                  <span style={{ color: '#ff6b8b' }}>· ✖ {h.broken} שבור</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
