import 'server-only';

import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';

export type AuditActorType = 'master' | 'client' | 'delegate' | 'scorekeeper' | 'system';

type AuditEvent = {
  action: string;
  actorType: AuditActorType;
  actorId?: string | null;
  clientId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAuditEvent(event: AuditEvent) {
  try {
    const supabase = createServerSupabaseAdminClient();
    await supabase.from('audit_logs').insert({
      action: event.action,
      actor_type: event.actorType,
      actor_id: event.actorId ?? null,
      client_id: event.clientId ?? null,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      metadata: event.metadata ?? {},
    });
  } catch {
    // Audit logging must never block the user-facing action.
  }
}
