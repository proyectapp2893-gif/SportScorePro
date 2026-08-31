import type { FixtureAnalysis } from './intelligence';

export type FixtureWorkflowState = 'NOT_GENERATED' | 'DRAFT' | 'DELEGATE_REVIEW' | 'PUBLISHED';
export type FixtureWorkflowAction = 'GENERATE' | 'RESOLVE_CONFLICTS' | 'REVIEW_WARNINGS' | 'SHARE_DELEGATES' | 'PUBLISH_PUBLIC' | 'OPEN_GAME_DAY' | 'REVIEW_SCHEMA';

export type FixtureWorkflowInput = {
  hasFixture: boolean;
  delegatesVisible: boolean;
  publicVisible: boolean;
  publicFlagAvailable?: boolean;
  analysis?: FixtureAnalysis | null;
};

export type FixtureWorkflow = {
  state: FixtureWorkflowState;
  publicationLabel: 'PRIVADO' | 'REVISIÓN DE DELEGADOS' | 'PUBLICADO' | 'PUBLICACIÓN NO DISPONIBLE';
  nextAction: FixtureWorkflowAction;
  nextActionLabel: string;
  checklist: Array<{ id: string; label: string; status: 'complete' | 'warning' | 'error' }>;
};

/** Derives the workflow from existing fixture data and visibility flags. */
export function getFixtureWorkflowState(input: FixtureWorkflowInput): FixtureWorkflow {
  const analysis = input.analysis;
  const hasErrors = Boolean(analysis?.metrics.errors);
  const hasWarnings = Boolean(analysis?.metrics.warnings);
  const state: FixtureWorkflowState = !input.hasFixture ? 'NOT_GENERATED' : input.publicVisible ? 'PUBLISHED' : input.delegatesVisible ? 'DELEGATE_REVIEW' : 'DRAFT';
  const publicationLabel = !input.publicFlagAvailable && input.publicVisible === false ? 'PUBLICACIÓN NO DISPONIBLE' : input.publicVisible ? 'PUBLICADO' : input.delegatesVisible ? 'REVISIÓN DE DELEGADOS' : 'PRIVADO';
  const nextAction: FixtureWorkflowAction = !input.hasFixture ? 'GENERATE' : !input.publicFlagAvailable ? 'REVIEW_SCHEMA' : hasErrors ? 'RESOLVE_CONFLICTS' : hasWarnings ? 'REVIEW_WARNINGS' : input.publicVisible ? 'OPEN_GAME_DAY' : input.delegatesVisible ? 'PUBLISH_PUBLIC' : 'SHARE_DELEGATES';
  const nextActionLabel = { GENERATE: 'Generar fixture', RESOLVE_CONFLICTS: 'Resolver conflictos', REVIEW_WARNINGS: 'Revisar advertencias', SHARE_DELEGATES: 'Enviar a revisión de delegados', PUBLISH_PUBLIC: 'Publicar competencia', OPEN_GAME_DAY: 'Abrir Game Day', REVIEW_SCHEMA: 'Revisar compatibilidad del esquema' }[nextAction];
  const checklist = [
    { id: 'fixture', label: 'Fixture generado', status: input.hasFixture ? 'complete' : 'error' },
    { id: 'errors', label: 'Sin conflictos críticos', status: hasErrors ? 'error' : 'complete' },
    { id: 'warnings', label: hasWarnings ? 'Advertencias operativas para revisar' : 'Sin advertencias operativas', status: hasWarnings ? 'warning' : 'complete' },
    { id: 'public-flag', label: 'Publicación pública disponible', status: input.publicFlagAvailable === false ? 'warning' : 'complete' },
  ] as Array<{ id: string; label: string; status: 'complete' | 'warning' | 'error' }>;
  return { state, publicationLabel, nextAction, nextActionLabel, checklist };
}
