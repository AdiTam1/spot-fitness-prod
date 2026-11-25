import type { AuditCategory } from './types';

interface MappedDataActionAudit {
  category: AuditCategory;
  auditAction: string;
  targetTraineeId?: string;
  metadata?: Record<string, unknown>;
}

const DATA_ACTION_MAP: Record<
  string,
  { category: AuditCategory; auditAction: string }
> = {
  'trainee-self-update': { category: 'meal', auditAction: 'trainee_self_update' },
  'trainee-manage-saved-meals': {
    category: 'meal',
    auditAction: 'saved_meals_updated',
  },
  'manage-custom-tools-and-units': {
    category: 'meal',
    auditAction: 'tools_units_updated',
  },
  'manage-quick-chips': {
    category: 'meal',
    auditAction: 'quick_chips_updated',
  },
  'coach-update-trainee-log': {
    category: 'coach',
    auditAction: 'coach_updated_trainee_log',
  },
  'update-trainee-plan': {
    category: 'coach',
    auditAction: 'trainee_plan_updated',
  },
  'coach-update-ai-notes-and-split': {
    category: 'coach',
    auditAction: 'ai_notes_split_updated',
  },
  'coach-update-activity-targets': {
    category: 'coach',
    auditAction: 'activity_targets_updated',
  },
  'coach-manage-observation-days': {
    category: 'coach',
    auditAction: 'observation_days_updated',
  },
  'coach-reply-saved-meal': {
    category: 'coach',
    auditAction: 'saved_meal_replied',
  },
  'add-coach-feedback': {
    category: 'coach',
    auditAction: 'coach_feedback_added',
  },
  'coach-create-trainee': {
    category: 'coach',
    auditAction: 'trainee_created',
  },
  'update-trainee-sharing': {
    category: 'coach',
    auditAction: 'trainee_sharing_updated',
  },
  'update-trainee-group': {
    category: 'coach',
    auditAction: 'trainee_group_updated',
  },
  'create-group': { category: 'coach', auditAction: 'group_created' },
  'delete-group': { category: 'coach', auditAction: 'group_deleted' },
  'bulk-group-assign-template': {
    category: 'coach',
    auditAction: 'bulk_template_assigned',
  },
  'bulk-group-share-coach': {
    category: 'coach',
    auditAction: 'bulk_coach_shared',
  },
  'update-trainee-status': {
    category: 'coach',
    auditAction: 'trainee_status_changed',
  },
  'force-logout-trainee': {
    category: 'coach',
    auditAction: 'trainee_force_logged_out',
  },
  'coach-reset-trainee-onboarding': {
    category: 'coach',
    auditAction: 'trainee_onboarding_reset',
  },
  'coach-update-credentials': {
    category: 'coach',
    auditAction: 'trainee_credentials_updated',
  },
  'coach-delete-trainee': {
    category: 'coach',
    auditAction: 'trainee_deleted',
  },
  'save-template': { category: 'coach', auditAction: 'template_saved' },
  'delete-template': { category: 'coach', auditAction: 'template_deleted' },
  'coach-complete-onboarding': {
    category: 'coach',
    auditAction: 'coach_onboarding_updated',
  },
  'coach-update-invite-code': {
    category: 'coach',
    auditAction: 'invite_code_updated',
  },
  'admin-create-coach': { category: 'admin', auditAction: 'coach_created' },
  'admin-update-coach-status': {
    category: 'admin',
    auditAction: 'coach_status_changed',
  },
  'admin-force-logout-coach': {
    category: 'admin',
    auditAction: 'coach_force_logged_out',
  },
  'admin-update-app-policy': {
    category: 'apk',
    auditAction: 'app_release_policy_updated',
  },
  'admin-update-coach-credentials': {
    category: 'admin',
    auditAction: 'coach_credentials_updated',
  },
  'admin-delete-coach': { category: 'admin', auditAction: 'coach_deleted' },
};

export function mapDataActionToAudit(
  action: string,
  body: Record<string, unknown>
): MappedDataActionAudit | null {
  if (!action || action === 'ack-ai-jobs') return null;
  const mapping = DATA_ACTION_MAP[action];
  if (!mapping) return null;

  const targetTraineeId =
    typeof body.traineeId === 'string' && body.traineeId
      ? body.traineeId
      : typeof (body.trainee as { id?: unknown } | undefined)?.id === 'string'
      ? String((body.trainee as { id?: string }).id)
      : undefined;

  const metadata: Record<string, unknown> = { dataAction: action };
  if (typeof body.status === 'string') metadata.targetStatus = body.status;
  if (typeof body.date === 'string') metadata.date = body.date;
  if (typeof body.groupId === 'string') metadata.groupId = body.groupId;
  if (typeof body.coachId === 'string') metadata.coachId = body.coachId;
  if (typeof body.op === 'string') metadata.op = body.op;
  if (typeof body.androidLatestVersionName === 'string') {
    metadata.versionName = body.androidLatestVersionName;
  }

  return {
    category: mapping.category,
    auditAction: mapping.auditAction,
    targetTraineeId,
    metadata,
  };
}
