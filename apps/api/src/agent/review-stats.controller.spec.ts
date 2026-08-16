import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AgentReviewStatsController } from './review-stats.controller';
import {
  AgentReviewStatsService,
  DEFAULT_WINDOW_DAYS,
} from './review-stats.service';

/**
 * 期二 G7 — the controller layer, written alongside the feature (F10-2e's
 * lesson: BUG-011 lived in the one layer that had no spec).
 */
describe('AgentReviewStatsController (G7)', () => {
  const build = () => {
    const stats = { summarise: jest.fn().mockResolvedValue({ decided: 0 }) };
    const controller = new AgentReviewStatsController(
      stats as unknown as AgentReviewStatsService,
    );
    return { controller, stats };
  };

  /**
   * 🔴 ADMIN only. This describes named individuals' reviewing behaviour — it
   * is management information about colleagues, and ADR-0009 Decision 7 makes
   * ADMIN-only read access a standing obligation rather than a default.
   */
  it('is ADMIN only, like the audit trail and for the same reason', () => {
    const roles = new Reflector().get<Role[]>(
      ROLES_KEY,
      AgentReviewStatsController,
    );

    expect(roles).toEqual([Role.ADMIN]);
    expect(roles).not.toContain(Role.REGIONAL);
  });

  it('applies the default window when none is asked for', async () => {
    const { controller, stats } = build();

    await controller.summary({});

    // Not `undefined` passed through: the default belongs to one place, and
    // this asserts which place that is.
    expect(stats.summarise).toHaveBeenCalledWith(DEFAULT_WINDOW_DAYS);
  });

  it('passes a requested window through', async () => {
    const { controller, stats } = build();

    await controller.summary({ days: 7 });

    expect(stats.summarise).toHaveBeenCalledWith(7);
  });
});
