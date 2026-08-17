import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/current-user.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AgentKillSwitchController } from './kill-switch.controller';
import { AgentKillSwitchService } from './kill-switch.service';

/**
 * 期二 G3 — the controller layer, written alongside the feature rather than
 * added later (F10-2e's lesson: BUG-011 lived in the one layer with no spec).
 */
describe('AgentKillSwitchController (G3)', () => {
  const user = { id: 'u-admin' } as unknown as AuthUser;

  const build = () => {
    const killSwitch = {
      status: jest.fn().mockResolvedValue({ enabled: true }),
      set: jest.fn().mockResolvedValue({ enabled: false }),
    };
    const controller = new AgentKillSwitchController(
      killSwitch as unknown as AgentKillSwitchService,
    );
    return { controller, killSwitch };
  };

  /**
   * 🔴 Narrower than the run and approval surfaces, and asserted so that
   * widening it is a decision somebody makes rather than a line somebody edits.
   * Those two decide what happens to one request; this decides whether the
   * capability exists at all.
   */
  it('is ADMIN only — narrower than starting a run or approving one', () => {
    const roles = new Reflector().get<Role[]>(
      ROLES_KEY,
      AgentKillSwitchController,
    );

    expect(roles).toEqual([Role.ADMIN]);
    expect(roles).not.toContain(Role.REGIONAL);
  });

  it('passes the flag and the reason through, with the caller as the actor', async () => {
    const { controller, killSwitch } = build();

    await controller.set({ enabled: false, reason: 'Runaway run' }, user);

    // 🔴 Three separate arguments, not the DTO. Handing `dto` through would
    // compile and work today, and would silently start forwarding whatever the
    // DTO grew next — and this is the endpoint where "whatever the body said"
    // reaches a write.
    expect(killSwitch.set).toHaveBeenCalledWith(false, user, 'Runaway run');
  });

  it('omits an absent reason rather than inventing one', async () => {
    const { controller, killSwitch } = build();

    await controller.set({ enabled: true }, user);

    expect(killSwitch.set).toHaveBeenCalledWith(true, user, undefined);
  });

  it('reads the status with no arguments at all', async () => {
    const { controller, killSwitch } = build();

    await expect(controller.status()).resolves.toEqual({ enabled: true });
    expect(killSwitch.status).toHaveBeenCalledWith();
  });
});
