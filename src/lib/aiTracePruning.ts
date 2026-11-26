import type { AiConversationTraceRecord } from '@/types/nutrition';

export const AI_TRACE_HISTORY_CAP = 250;
export const AI_TRACE_CRASHED_CAP = 100;

/**
 * שומר על תקרת התור (250 היסטוריה / 100 קריסות) לפי FIFO:
 * פריטים עם isSaved=true אינם נמחקים לעולם, אך נספרים כחלק מהמכסה הכוללת של התור.
 */
export function pruneQueueInMemory(
  traces: AiConversationTraceRecord[],
  queueType: 'history' | 'crashed'
): AiConversationTraceRecord[] {
  const cap = queueType === 'crashed' ? AI_TRACE_CRASHED_CAP : AI_TRACE_HISTORY_CAP;
  const inQueue = traces
    .filter((t) => t.queueType === queueType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const others = traces.filter((t) => t.queueType !== queueType);

  if (inQueue.length <= cap) return traces;

  let toDrop = inQueue.length - cap;
  const keptReversed: AiConversationTraceRecord[] = [];
  for (let i = inQueue.length - 1; i >= 0; i--) {
    const row = inQueue[i];
    if (toDrop > 0 && !row.isSaved) {
      toDrop--;
      continue;
    }
    keptReversed.push(row);
  }
  return [...others, ...keptReversed.reverse()];
}
