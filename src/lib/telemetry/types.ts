export type TelemetryPlatform =
  | 'web'
  | 'pwa-ios'
  | 'pwa-android'
  | 'android-apk'
  | 'cron'
  | 'unknown';

export type AuditCategory =
  | 'auth'
  | 'meal'
  | 'ai'
  | 'steps'
  | 'push'
  | 'profile'
  | 'coach'
  | 'admin'
  | 'apk';

export type AuditStatus = 'success' | 'denied' | 'failed';

export interface AuditEventInput {
  requestId?: string;
  actorId: string;
  actorRole: string;
  targetTraineeId?: string;
  category: AuditCategory;
  action: string;
  status?: AuditStatus;
  platform?: TelemetryPlatform;
  appVersionCode?: number;
  ipHash?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiAiUsageMeta {
  model?: string;
  imageCount?: number;
  totalImageKB?: number;
  latencyMs?: number;
  fallbackUsed?: boolean;
  mode?: string;
  outcome?: 'succeeded' | 'fallback' | 'failed' | 'cancelled';
  reasonCode?: string;
  failureReason?: string;
  itemCount?: number;
  rateLimitScope?: string;
  rateLimitWindow?: 'minute' | 'hour' | 'day' | 'role';
  rateLimitRole?: string;
  diag?: Record<string, unknown>;
}

export interface ApiLogInput {
  requestId: string;
  method: string;
  routePattern: string;
  actionName?: string;
  statusCode: number;
  durationMs: number;
  actorId?: string;
  actorRole?: string;
  platform?: TelemetryPlatform;
  appVersionCode?: number;
  errorCode?: string;
  errorMessage?: string;
  aiUsage?: ApiAiUsageMeta;
}

export type ClientTelemetryEventType =
  | 'screen_view'
  | 'ui_action'
  | 'client_error'
  | 'performance';

export interface ClientTelemetryPayloadEvent {
  eventType: ClientTelemetryEventType;
  eventName: string;
  screen?: string;
  details?: Record<string, unknown>;
  clientTs?: number;
}
