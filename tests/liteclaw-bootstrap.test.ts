import { describe, expect, test } from 'vitest';

import {
  isLiteClawBootstrapTurn,
  isLiteClawOwnerProfileRuntimeStructurallyEligible,
} from '../src/liteclaw-bootstrap.js';

describe('LiteClaw first-wake eligibility', () => {
  test('allows only a real interactive Home turn of the built-in profile', () => {
    expect(
      isLiteClawBootstrapTurn({
        turnId: 'owner-turn',
        isHome: true,
        isDefaultProfile: true,
      }),
    ).toBe(true);
    expect(
      isLiteClawBootstrapTurn({
        isHome: true,
        isDefaultProfile: true,
      }),
    ).toBe(false);
    expect(
      isLiteClawBootstrapTurn({
        turnId: 'scheduled-turn',
        isHome: true,
        isDefaultProfile: true,
        isScheduledTask: true,
      }),
    ).toBe(false);
    expect(
      isLiteClawBootstrapTurn({
        turnId: 'custom-turn',
        isHome: true,
        isDefaultProfile: false,
      }),
    ).toBe(false);
    expect(
      isLiteClawBootstrapTurn({
        turnId: 'project-turn',
        isHome: false,
        isDefaultProfile: true,
      }),
    ).toBe(false);
  });
});

describe('LiteClaw Owner Profile structural runtime eligibility', () => {
  test('keeps capability across terminal warmup but denies unsafe runtime kinds', () => {
    const warmup = {
      isHome: true,
      isDefaultProfile: true,
    };
    expect(isLiteClawOwnerProfileRuntimeStructurallyEligible(warmup)).toBe(
      true,
    );
    expect(
      isLiteClawOwnerProfileRuntimeStructurallyEligible({
        ...warmup,
        runtimeAgentId: 'conversation-1',
        runtimeAgentKind: 'conversation',
      }),
    ).toBe(true);
    expect(
      isLiteClawOwnerProfileRuntimeStructurallyEligible({
        ...warmup,
        isScheduledTask: true,
      }),
    ).toBe(false);
    for (const runtimeAgentKind of ['task', 'spawn'] as const) {
      expect(
        isLiteClawOwnerProfileRuntimeStructurallyEligible({
          ...warmup,
          runtimeAgentId: `${runtimeAgentKind}-1`,
          runtimeAgentKind,
        }),
      ).toBe(false);
    }
    expect(
      isLiteClawOwnerProfileRuntimeStructurallyEligible({
        ...warmup,
        isHome: false,
      }),
    ).toBe(false);
    expect(
      isLiteClawOwnerProfileRuntimeStructurallyEligible({
        ...warmup,
        isDefaultProfile: false,
      }),
    ).toBe(false);
  });
});
