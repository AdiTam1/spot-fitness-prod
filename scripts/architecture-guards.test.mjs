import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walkTsFiles(dirRel) {
  const out = [];
  const rootAbs = path.join(REPO_ROOT, dirRel);
  const walk = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        out.push(path.relative(REPO_ROOT, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(rootAbs);
  return out;
}

describe('Architecture guards: prevent Supabase 57014 full-table scans & egress regressions', () => {
  const hotFilesBannedFromFullDbScan = [
    'src/app/api/auth/session/route.ts',
    'src/app/api/auth/heartbeat/route.ts',
    'src/app/api/food/custom/route.ts',
    'src/app/api/food/search/route.ts',
    'src/app/api/profile/route.ts',
    'src/app/api/steps/sync/route.ts',
    'src/app/api/push/register/route.ts',
    'src/app/api/push/send/route.ts',
    'src/app/api/ai/recommend-meal/route.ts',
    'src/app/api/admin/scrapers/route.ts',
    'src/app/api/admin/apk-release/route.ts',
    'src/lib/coachAlertEngine.ts',
    'src/lib/traineeMealPushNotifier.ts',
  ];

  for (const rel of hotFilesBannedFromFullDbScan) {
    it(`${rel} must never call getServerDbState() or updateServerDbState()`, () => {
      const code = stripComments(readRepoFile(rel));
      assert.equal(
        /\bgetServerDbState\s*\(/.test(code),
        false,
        `${rel} contains forbidden getServerDbState() call`
      );
      assert.equal(
        /\bupdateServerDbState\s*\(/.test(code),
        false,
        `${rel} contains forbidden updateServerDbState() call`
      );
    });
  }

  it('coach-alerts only loads full db state inside save-preferences and never calls updateServerDbState()', () => {
    const code = stripComments(readRepoFile('src/app/api/push/coach-alerts/route.ts'));
    assert.equal(
      /\bupdateServerDbState\s*\(/.test(code),
      false,
      'coach-alerts must use updateServerMetaState() instead of updateServerDbState()'
    );
    const prefIdx = code.indexOf("op === 'save-preferences'");
    const firstFullGetIdx = code.indexOf('getServerDbState(');
    assert.ok(prefIdx > 0, 'expected save-preferences branch in coach-alerts');
    assert.ok(
      firstFullGetIdx === -1 || firstFullGetIdx > prefIdx,
      'getServerDbState() must not run before save-preferences in coach-alerts'
    );
  });

  it("no unbounded supabase.from('trainees').select('*') without .eq() or .in()", () => {
    for (const rel of walkTsFiles('src')) {
      const code = stripComments(readRepoFile(rel));
      const pattern = /\.from\(\s*['"]trainees['"]\s*\)\s*\.select\(\s*['"]\*['"]\s*\)/g;
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const tail = code.slice(match.index, match.index + 200);
        assert.ok(
          /\.(eq|in)\(/.test(tail),
          `Unbounded trainees.select('*') detected in ${rel}: ${tail}`
        );
      }
    }
    const sbCode = stripComments(readRepoFile('src/lib/supabase.ts'));
    assert.ok(
      sbCode.includes('loadAllTraineesRowsBatchedFromSupabase'),
      'expected batched trainee loader in src/lib/supabase.ts'
    );
  });

  it('/api/data preserves windowed logs, conditional ?since=, and atomic trainee paths', () => {
    const code = stripComments(readRepoFile('src/app/api/data/route.ts'));
    assert.ok(code.includes('getTraineeSyncStampOnServer'));
    assert.ok(code.includes('getRosterSyncStampOnServer'));
    assert.ok(code.includes('sanitizeTraineeForRosterList'));
    assert.ok(code.includes('trimTraineeLogsToWindow'));

    // Ensure mergeLogsPreservingPendingAi keeps older server dates missing from partial client payload
    assert.ok(
      /if\s*\(\s*!clientDay\s*\)\s*\{\s*merged\[dateKey\]\s*=\s*serverDay/.test(code),
      'mergeLogsPreservingPendingAi must keep omitted historical server dates intact'
    );

    const coachPostStart = code.indexOf("action === 'coach-complete-onboarding'");
    assert.ok(coachPostStart > 0);
    const beforeCoachPost = code.slice(0, coachPostStart);

    // Inside manage-quick-chips, getServerDbState is allowed ONLY inside scope === 'coach-trainees'
    const firstGetDbBeforeCoach = beforeCoachPost.indexOf('getServerDbState(');
    const coachChipsScopeIdx = beforeCoachPost.indexOf("scope === 'coach-trainees'");
    assert.ok(
      firstGetDbBeforeCoach > 0 && coachChipsScopeIdx > 0,
      'expected bounded getServerDbState check in data route'
    );
    const getTraineeBlock = beforeCoachPost.slice(0, beforeCoachPost.indexOf('async function handleDataPost'));
    const traineeIfIdx = getTraineeBlock.indexOf("session.role === 'trainee'");
    const previewIdx = getTraineeBlock.indexOf('if (requestedTraineeId)');
    const rosterLoadIdx = getTraineeBlock.indexOf('getServerDbState(');
    assert.ok(
      traineeIfIdx < previewIdx && previewIdx < rosterLoadIdx,
      'GET /api/data must handle trainee sync and ?traineeId preview before roster getServerDbState()'
    );
  });

  it('client HomePage keeps single-flight fetch, ?since=, windowDays=14, and 60s coach polling', () => {
    const code = stripComments(readRepoFile('src/app/page.tsx'));
    assert.ok(code.includes('inFlightDataFetchRef'));
    assert.ok(code.includes('lastSyncVersionRef'));
    assert.ok(code.includes('&windowDays=14'));
    assert.ok(code.includes("currentUser?.role === 'trainee' ? 30000 : 60000"));
  });

  it('analyze-meal uses lightweight backgroundJob auth and cancellation checks instead of SELECT *', () => {
    const routeCode = stripComments(readRepoFile('src/app/api/ai/analyze-meal/route.ts'));
    assert.ok(
      routeCode.includes('authorizeTraineeAiTargetOnServer('),
      'analyze-meal must authorize backgroundJob targets via authorizeTraineeAiTargetOnServer()'
    );
    assert.ok(
      routeCode.includes('getTraineePendingAiJobsOnServer('),
      'analyze-meal checkBgJobCancelled must read pending jobs via getTraineePendingAiJobsOnServer()'
    );
    assert.equal(
      /getSingleTraineeFromServer\(\s*backgroundJob\.traineeId\s*\)/.test(routeCode),
      false,
      'analyze-meal backgroundJob auth must not load full SELECT * trainee row'
    );

    const sbCode = stripComments(readRepoFile('src/lib/supabase.ts'));
    assert.ok(
      sbCode.includes('loadTraineeAccessStateFromSupabase'),
      'expected lightweight trainee access loader in src/lib/supabase.ts'
    );
  });
});
