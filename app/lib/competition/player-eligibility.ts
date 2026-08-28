export type EligibilityStatus = 'ELIGIBLE' | 'WARNING' | 'INELIGIBLE' | 'REVIEW_REQUIRED';
export type EligibilitySeverity = 'warning' | 'blocking';
export type EligibilityReasonCode = 'NOT_REGISTERED' | 'WRONG_TEAM' | 'DOCUMENTATION_PENDING' | 'DOCUMENTATION_REJECTED' | 'SUSPENDED' | 'DISCIPLINARY_BLOCK' | 'FINE_UNPAID' | 'ADMIN_REVIEW_REQUIRED';

export type EligibilityReason = {
  code: EligibilityReasonCode;
  message: string;
  severity: EligibilitySeverity;
  metadata?: Record<string, string | number | boolean>;
};

export type PlayerEligibilityInput = {
  playerId?: string | null;
  registered?: boolean;
  teamId?: string | null;
  expectedTeamId?: string | null;
  requiredDocuments?: ReadonlyArray<'FACE_PHOTO' | 'IDENTITY_FRONT'>;
  documents?: ReadonlyArray<{ document_type?: string | null; status?: string | null }>;
  suspended?: boolean;
  suspensionMessage?: string | null;
  unpaidFine?: boolean;
  verificationError?: boolean;
};

export type PlayerEligibility = {
  status: EligibilityStatus;
  reasons: EligibilityReason[];
  blockingReasons: EligibilityReason[];
  warnings: EligibilityReason[];
};

/**
 * Pure interpretation of the rules currently enforced by roster/Mesa:
 * missing or rejected files require review, while an active suspension or
 * disciplinary block prevents selection. Missing data fails safe to review.
 */
export function evaluatePlayerEligibility(input: PlayerEligibilityInput): PlayerEligibility {
  const reasons: EligibilityReason[] = [];
  const required = input.requiredDocuments || ['FACE_PHOTO', 'IDENTITY_FRONT'];
  const documents = input.documents || [];
  if (input.verificationError) reasons.push({ code: 'ADMIN_REVIEW_REQUIRED', message: 'No fue posible verificar la habilitación.', severity: 'warning' });
  if (input.registered === false || !input.playerId) reasons.push({ code: 'NOT_REGISTERED', message: 'Jugador no registrado en este torneo.', severity: 'blocking' });
  if (input.expectedTeamId && input.teamId && input.expectedTeamId !== input.teamId) reasons.push({ code: 'WRONG_TEAM', message: 'El jugador no pertenece a este equipo.', severity: 'blocking' });
  if (input.suspended) reasons.push({ code: 'SUSPENDED', message: input.suspensionMessage || 'Suspensión activa.', severity: 'blocking' });
  if (input.unpaidFine) reasons.push({ code: 'FINE_UNPAID', message: 'Multa pendiente según el estado disciplinario actual.', severity: 'blocking' });
  const rejected = required.some((type) => documents.some((doc) => doc.document_type === type && doc.status === 'REJECTED'));
  const missing = required.filter((type) => !documents.some((doc) => doc.document_type === type && doc.status === 'APPROVED'));
  if (rejected) reasons.push({ code: 'DOCUMENTATION_REJECTED', message: 'Documento obligatorio rechazado.', severity: 'warning' });
  else if (missing.length) reasons.push({ code: 'DOCUMENTATION_PENDING', message: 'Documentación obligatoria pendiente.', severity: 'warning', metadata: { missing: missing.join(',') } });
  const blockingReasons = reasons.filter((reason) => reason.severity === 'blocking');
  const warnings = reasons.filter((reason) => reason.severity === 'warning');
  const requiresVerification = Boolean(input.verificationError);
  return { status: blockingReasons.length ? 'INELIGIBLE' : requiresVerification ? 'REVIEW_REQUIRED' : warnings.length ? 'WARNING' : 'ELIGIBLE', reasons, blockingReasons, warnings };
}

export function evaluatePlayersEligibility(inputs: PlayerEligibilityInput[]) {
  return inputs.map((input) => ({ playerId: input.playerId || null, eligibility: evaluatePlayerEligibility(input) }));
}
