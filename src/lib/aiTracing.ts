import fs from 'fs';
import path from 'path';
import {
  AiClarificationAnswer,
  AiClarificationQuestion,
  AiConversationTraceRecord,
  AiTraceStepItem,
  LoggedFoodItem,
  PhotoAngleKind,
  UserRole,
} from '@/types/nutrition';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  AI_TRACE_CRASHED_CAP,
  AI_TRACE_HISTORY_CAP,
  pruneQueueInMemory,
} from '@/lib/aiTracePruning';

const HISTORY_CAP = AI_TRACE_HISTORY_CAP;
const CRASHED_CAP = AI_TRACE_CRASHED_CAP;

const LOCAL_TRACES_FILE = path.join(process.cwd(), '.data', 'spot-ai-traces.json');

interface LocalTraceStore {
  traces: AiConversationTraceRecord[];
}

function readLocalTraces(): LocalTraceStore {
  try {
    if (!fs.existsSync(LOCAL_TRACES_FILE)) return { traces: [] };
    const raw = fs.readFileSync(LOCAL_TRACES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as LocalTraceStore;
    return Array.isArray(parsed?.traces) ? parsed : { traces: [] };
  } catch {
    return { traces: [] };
  }
}

function writeLocalTraces(store: LocalTraceStore): void {
  try {
    const dir = path.dirname(LOCAL_TRACES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_TRACES_FILE, JSON.stringify(store), 'utf-8');
  } catch {
    // ignore dev fs failure
  }
}

function isMissingTraceSchema(message?: string): boolean {
  if (!message) return false;
  return /does not exist|could not find|schema cache|42P01|PGRST205|PGRST202/i.test(
    message
  );
}

export interface RecordAiTraceParams {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  mealSlotId?: string;
  mealSlotName?: string;
  mealDate?: string;
  mode: string;
  queueType: 'history' | 'crashed';
  crashStage?: AiConversationTraceRecord['crashStage'];
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number;
  model?: string;
  imageCount?: number;
  totalImageKB?: number;
  isSandboxReplay?: boolean;
  promptText?: string;
  activeChips?: string[];
  clarificationQuestions?: AiClarificationQuestion[];
  clarificationAnswers?: AiClarificationAnswer[];
  parsedItems?: LoggedFoodItem[];
  stepsTimeline: AiTraceStepItem[];
  rawResponseSummary?: string;
  thumbnails?: {
    hash: string;
    angle: PhotoAngleKind;
    labelProductName?: string;
    dataUrl: string;
  }[];
}

export async function recordAiConversationTrace(
  params: RecordAiTraceParams
): Promise<{ ok: boolean; setupRequired?: boolean }> {
  const createdAt = new Date().toISOString();
  const payloadObj = {
    promptText: params.promptText,
    activeChips: params.activeChips,
    clarificationQuestions: params.clarificationQuestions,
    clarificationAnswers: params.clarificationAnswers,
    parsedItems: params.parsedItems,
    stepsTimeline: params.stepsTimeline,
    rawResponseSummary: params.rawResponseSummary,
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { error: rpcError } = await supabase.rpc('insert_ai_trace_with_prune', {
        p_trace: {
          id: params.id,
          createdAt,
          userId: params.userId,
          userName: params.userName,
          userRole: params.userRole,
          mealSlotId: params.mealSlotId,
          mealSlotName: params.mealSlotName,
          mealDate: params.mealDate,
          mode: params.mode,
          queueType: params.queueType,
          isSaved: false,
          reviewStatus: 'new',
          crashStage: params.crashStage || null,
          errorCode: params.errorCode || null,
          errorMessage: params.errorMessage || null,
          durationMs: params.durationMs ?? null,
          model: params.model || null,
          imageCount: params.imageCount ?? 0,
          totalImageKB: params.totalImageKB ?? 0,
          isSandboxReplay: Boolean(params.isSandboxReplay),
          payload: payloadObj,
        },
        p_media: (params.thumbnails || []).slice(0, 8),
      });

      if (!rpcError) return { ok: true };
      if (isMissingTraceSchema(rpcError.message)) {
        return { ok: false, setupRequired: true };
      }

      // Direct table insert fallback
      const { error: insertErr } = await supabase
        .from('ai_trace_conversations')
        .upsert(
          {
            id: params.id,
            created_at: createdAt,
            user_id: params.userId,
            user_name: params.userName,
            user_role: params.userRole,
            meal_slot_id: params.mealSlotId || null,
            meal_slot_name: params.mealSlotName || null,
            meal_date: params.mealDate || null,
            mode: params.mode,
            queue_type: params.queueType,
            is_saved: false,
            review_status: 'new',
            crash_stage: params.crashStage || null,
            error_code: params.errorCode || null,
            error_message: params.errorMessage || null,
            duration_ms: params.durationMs ?? null,
            model: params.model || null,
            image_count: params.imageCount ?? 0,
            total_image_kb: params.totalImageKB ?? 0,
            is_sandbox_replay: Boolean(params.isSandboxReplay),
            payload: payloadObj,
          },
          { onConflict: 'id' }
        );
      if (insertErr) {
        return { ok: false, setupRequired: isMissingTraceSchema(insertErr.message) };
      }
      if (params.thumbnails && params.thumbnails.length > 0) {
        await supabase
          .from('ai_trace_media')
          .insert(
            params.thumbnails.slice(0, 8).map((th) => ({
              trace_id: params.id,
              media_hash: th.hash,
              angle: th.angle,
              label_product_name: th.labelProductName || null,
              thumbnail_data_url: th.dataUrl,
            }))
          );
      }
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  // Local dev JSON fallback
  const store = readLocalTraces();
  const record: AiConversationTraceRecord = {
    id: params.id,
    createdAt,
    userId: params.userId,
    userName: params.userName,
    userRole: params.userRole,
    mealSlotId: params.mealSlotId,
    mealSlotName: params.mealSlotName,
    mealDate: params.mealDate,
    mode: params.mode,
    queueType: params.queueType,
    isSaved: false,
    reviewStatus: 'new',
    crashStage: params.crashStage || null,
    errorCode: params.errorCode || null,
    errorMessage: params.errorMessage || null,
    durationMs: params.durationMs,
    model: params.model,
    imageCount: params.imageCount,
    totalImageKB: params.totalImageKB,
    isSandboxReplay: params.isSandboxReplay,
    ...payloadObj,
    thumbnails: params.thumbnails,
  };
  const next = pruneQueueInMemory(
    [record, ...store.traces.filter((t) => t.id !== params.id)],
    params.queueType
  );
  writeLocalTraces({ traces: next });
  return { ok: true };
}

export async function listAdminAiTraces(params: {
  queueType: 'history' | 'crashed';
  userId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  setupRequired?: boolean;
  traces: AiConversationTraceRecord[];
  totalCount: number;
  savedCount: number;
  cap: number;
}> {
  const cap = params.queueType === 'crashed' ? CRASHED_CAP : HISTORY_CAP;
  const limit = Math.min(100, Math.max(10, params.limit || 50));
  const offset = Math.max(0, params.offset || 0);

  if (isSupabaseConfigured && supabase) {
    let q = supabase
      .from('ai_trace_conversations')
      .select('*', { count: 'exact' })
      .eq('queue_type', params.queueType)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.userId) {
      q = q.eq('user_id', params.userId);
    }
    if (params.search) {
      const clean = params.search.replace(/[%_,()]/g, '').trim();
      if (clean) {
        q = q.or(
          `user_name.ilike.%${clean}%,meal_slot_name.ilike.%${clean}%,error_message.ilike.%${clean}%`
        );
      }
    }

    const [rowsRes, savedRes] = await Promise.all([
      q,
      supabase
        .from('ai_trace_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('queue_type', params.queueType)
        .eq('is_saved', true),
    ]);

    if (rowsRes.error && isMissingTraceSchema(rowsRes.error.message)) {
      return {
        setupRequired: true,
        traces: [],
        totalCount: 0,
        savedCount: 0,
        cap,
      };
    }

    const traces: AiConversationTraceRecord[] = (rowsRes.data || []).map((r) => {
      const payload = (r.payload || {}) as Record<string, unknown>;
      return {
        id: String(r.id),
        createdAt: String(r.created_at),
        userId: String(r.user_id),
        userName: String(r.user_name || 'משתמש'),
        userRole: (r.user_role as UserRole) || 'trainee',
        mealSlotId: r.meal_slot_id ? String(r.meal_slot_id) : undefined,
        mealSlotName: r.meal_slot_name ? String(r.meal_slot_name) : undefined,
        mealDate: r.meal_date ? String(r.meal_date) : undefined,
        mode: String(r.mode || 'analyze'),
        queueType: r.queue_type === 'crashed' ? 'crashed' : 'history',
        isSaved: Boolean(r.is_saved),
        reviewStatus: r.review_status === 'resolved' ? 'resolved' : 'new',
        crashStage: r.crash_stage as AiConversationTraceRecord['crashStage'],
        errorCode: r.error_code ? String(r.error_code) : null,
        errorMessage: r.error_message ? String(r.error_message) : null,
        durationMs: typeof r.duration_ms === 'number' ? r.duration_ms : undefined,
        model: r.model ? String(r.model) : undefined,
        imageCount: typeof r.image_count === 'number' ? r.image_count : 0,
        totalImageKB: typeof r.total_image_kb === 'number' ? r.total_image_kb : 0,
        isSandboxReplay: Boolean(r.is_sandbox_replay),
        promptText: typeof payload.promptText === 'string' ? payload.promptText : undefined,
        activeChips: Array.isArray(payload.activeChips)
          ? (payload.activeChips as string[])
          : undefined,
        clarificationQuestions: Array.isArray(payload.clarificationQuestions)
          ? (payload.clarificationQuestions as AiClarificationQuestion[])
          : undefined,
        clarificationAnswers: Array.isArray(payload.clarificationAnswers)
          ? (payload.clarificationAnswers as AiClarificationAnswer[])
          : undefined,
        parsedItems: Array.isArray(payload.parsedItems)
          ? (payload.parsedItems as LoggedFoodItem[])
          : undefined,
        stepsTimeline: Array.isArray(payload.stepsTimeline)
          ? (payload.stepsTimeline as AiTraceStepItem[])
          : [],
        rawResponseSummary:
          typeof payload.rawResponseSummary === 'string'
            ? payload.rawResponseSummary
            : undefined,
      };
    });

    return {
      traces,
      totalCount: rowsRes.count ?? traces.length,
      savedCount: savedRes.count ?? 0,
      cap,
    };
  }

  const store = readLocalTraces();
  let matching = store.traces.filter((t) => t.queueType === params.queueType);
  if (params.userId) matching = matching.filter((t) => t.userId === params.userId);
  if (params.search) {
    const sl = params.search.toLowerCase();
    matching = matching.filter(
      (t) =>
        t.userName.toLowerCase().includes(sl) ||
        (t.mealSlotName || '').toLowerCase().includes(sl) ||
        (t.promptText || '').toLowerCase().includes(sl) ||
        (t.errorMessage || '').toLowerCase().includes(sl)
    );
  }
  matching.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const savedCount = store.traces.filter(
    (t) => t.queueType === params.queueType && t.isSaved
  ).length;
  return {
    traces: matching
      .slice(offset, offset + limit)
      .map((t) => ({ ...t, thumbnails: undefined })),
    totalCount: matching.length,
    savedCount,
    cap,
  };
}

export async function getAdminAiTraceDetail(
  traceId: string
): Promise<{
  trace?: AiConversationTraceRecord;
  thumbnails: {
    hash: string;
    angle: PhotoAngleKind;
    labelProductName?: string;
    dataUrl: string;
  }[];
}> {
  if (isSupabaseConfigured && supabase) {
    const [rowRes, mediaRes] = await Promise.all([
      supabase
        .from('ai_trace_conversations')
        .select('*')
        .eq('id', traceId)
        .maybeSingle(),
      supabase
        .from('ai_trace_media')
        .select('media_hash, angle, label_product_name, thumbnail_data_url')
        .eq('trace_id', traceId),
    ]);

    const r = rowRes.data;
    const thumbnails = (mediaRes.data || []).map((m) => ({
      hash: String(m.media_hash || ''),
      angle: (m.angle as PhotoAngleKind) || 'unset',
      labelProductName: m.label_product_name
        ? String(m.label_product_name)
        : undefined,
      dataUrl: String(m.thumbnail_data_url || ''),
    }));

    if (!r) return { thumbnails };
    const payload = (r.payload || {}) as Record<string, unknown>;
    return {
      trace: {
        id: String(r.id),
        createdAt: String(r.created_at),
        userId: String(r.user_id),
        userName: String(r.user_name || 'משתמש'),
        userRole: (r.user_role as UserRole) || 'trainee',
        mealSlotId: r.meal_slot_id ? String(r.meal_slot_id) : undefined,
        mealSlotName: r.meal_slot_name ? String(r.meal_slot_name) : undefined,
        mealDate: r.meal_date ? String(r.meal_date) : undefined,
        mode: String(r.mode || 'analyze'),
        queueType: r.queue_type === 'crashed' ? 'crashed' : 'history',
        isSaved: Boolean(r.is_saved),
        reviewStatus: r.review_status === 'resolved' ? 'resolved' : 'new',
        crashStage: r.crash_stage as AiConversationTraceRecord['crashStage'],
        errorCode: r.error_code ? String(r.error_code) : null,
        errorMessage: r.error_message ? String(r.error_message) : null,
        durationMs: typeof r.duration_ms === 'number' ? r.duration_ms : undefined,
        model: r.model ? String(r.model) : undefined,
        imageCount: typeof r.image_count === 'number' ? r.image_count : 0,
        totalImageKB: typeof r.total_image_kb === 'number' ? r.total_image_kb : 0,
        isSandboxReplay: Boolean(r.is_sandbox_replay),
        promptText: typeof payload.promptText === 'string' ? payload.promptText : undefined,
        activeChips: Array.isArray(payload.activeChips)
          ? (payload.activeChips as string[])
          : undefined,
        clarificationQuestions: Array.isArray(payload.clarificationQuestions)
          ? (payload.clarificationQuestions as AiClarificationQuestion[])
          : undefined,
        clarificationAnswers: Array.isArray(payload.clarificationAnswers)
          ? (payload.clarificationAnswers as AiClarificationAnswer[])
          : undefined,
        parsedItems: Array.isArray(payload.parsedItems)
          ? (payload.parsedItems as LoggedFoodItem[])
          : undefined,
        stepsTimeline: Array.isArray(payload.stepsTimeline)
          ? (payload.stepsTimeline as AiTraceStepItem[])
          : [],
        rawResponseSummary:
          typeof payload.rawResponseSummary === 'string'
            ? payload.rawResponseSummary
            : undefined,
        thumbnails,
      },
      thumbnails,
    };
  }

  const store = readLocalTraces();
  const match = store.traces.find((t) => t.id === traceId);
  return {
    trace: match,
    thumbnails: match?.thumbnails || [],
  };
}

export async function updateAdminAiTraceFlags(params: {
  traceId: string;
  isSaved?: boolean;
  reviewStatus?: 'new' | 'resolved';
}): Promise<{ ok: boolean }> {
  if (isSupabaseConfigured && supabase) {
    const patch: Record<string, unknown> = {};
    if (typeof params.isSaved === 'boolean') patch.is_saved = params.isSaved;
    if (params.reviewStatus) patch.review_status = params.reviewStatus;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase
      .from('ai_trace_conversations')
      .update(patch)
      .eq('id', params.traceId);
    return { ok: !error };
  }

  const store = readLocalTraces();
  const next = store.traces.map((t) =>
    t.id !== params.traceId
      ? t
      : {
          ...t,
          ...(typeof params.isSaved === 'boolean' ? { isSaved: params.isSaved } : {}),
          ...(params.reviewStatus ? { reviewStatus: params.reviewStatus } : {}),
        }
  );
  writeLocalTraces({ traces: next });
  return { ok: true };
}
