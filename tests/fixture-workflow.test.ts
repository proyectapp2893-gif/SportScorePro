import { describe, expect, it } from 'vitest';
import { getFixtureWorkflowState } from '../app/lib/fixture/workflow';
import type { FixtureAnalysis } from '../app/lib/fixture/intelligence';

const analysis = (errors = 0, warnings = 0): FixtureAnalysis => ({ status: errors ? 'ERROR' : warnings ? 'WARNING' : 'READY', score: null, issues: [], metrics: { matches: 1, teams: 2, matchdays: 1, errors, warnings, byes: 0, minimumRestMinutes: null }, teamMetrics: [], venueMetrics: {} });

describe('fixture workflow', () => {
  it('derives not generated state', () => expect(getFixtureWorkflowState({ hasFixture: false, delegatesVisible: false, publicVisible: false, publicFlagAvailable: true }).state).toBe('NOT_GENERATED'));
  it('derives private draft and recommends delegates', () => { const result = getFixtureWorkflowState({ hasFixture: true, delegatesVisible: false, publicVisible: false, publicFlagAvailable: true, analysis: analysis() }); expect(result.state).toBe('DRAFT'); expect(result.nextAction).toBe('SHARE_DELEGATES'); });
  it('derives delegate review independently from public visibility', () => expect(getFixtureWorkflowState({ hasFixture: true, delegatesVisible: true, publicVisible: false, publicFlagAvailable: true, analysis: analysis() }).state).toBe('DELEGATE_REVIEW'));
  it('supports public on while delegates are off', () => { const result = getFixtureWorkflowState({ hasFixture: true, delegatesVisible: false, publicVisible: true, publicFlagAvailable: true, analysis: analysis() }); expect(result.state).toBe('PUBLISHED'); expect(result.nextAction).toBe('OPEN_GAME_DAY'); });
  it('prioritizes conflicts then warnings', () => { expect(getFixtureWorkflowState({ hasFixture: true, delegatesVisible: false, publicVisible: false, publicFlagAvailable: true, analysis: analysis(1, 2) }).nextAction).toBe('RESOLVE_CONFLICTS'); expect(getFixtureWorkflowState({ hasFixture: true, delegatesVisible: false, publicVisible: false, publicFlagAvailable: true, analysis: analysis(0, 1) }).nextAction).toBe('REVIEW_WARNINGS'); });
  it('exposes legacy schema compatibility as a controlled state', () => expect(getFixtureWorkflowState({ hasFixture: true, delegatesVisible: false, publicVisible: false, publicFlagAvailable: false }).nextAction).toBe('REVIEW_SCHEMA'));
});
