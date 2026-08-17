import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/current-user.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AgentApprovalController } from './agent-approval.controller';
import { AgentApprovalService } from './agent-approval.service';

/**
 * W46 F10-2e — the second controller that had no spec (see BUG-011, and the
 * sibling file `agent/agent-run.controller.spec.ts`).
 *
 * This one matters more than a delegation test usually would: these two routes
 * are the ONLY place in the platform where a person authorises something an
 * agent asked for. Whose id reaches the service is not bookkeeping — it is the
 * whole reason Tier 1 exists (ADR-0036 D3), it is what lands in `AuditLog`, and
 * it is what `AgentProposal.approvedById` is for.
 */
describe('AgentApprovalController (F10-2e)', () => {
  const approver = { id: 'u-admin' } as unknown as AuthUser;

  const build = () => {
    const approvals = {
      approve: jest.fn().mockResolvedValue({ id: 'p1', status: 'executed' }),
      reject: jest.fn().mockResolvedValue({ id: 'p1', status: 'rejected' }),
    };
    const controller = new AgentApprovalController(
      approvals as unknown as AgentApprovalService,
    );
    return { controller, approvals };
  };

  it('runs under ADMIN + REGIONAL, on the class', () => {
    const roles = new Reflector().get<Role[]>(
      ROLES_KEY,
      AgentApprovalController,
    );

    // Same width as starting a run (plan OQ-2). If these two ever drift apart,
    // someone can start a run they are not allowed to decide — or the reverse.
    expect(roles).toEqual([Role.ADMIN, Role.REGIONAL]);
  });

  it('approves with the proposal id AND the person doing it', async () => {
    const { controller, approvals } = build();

    await controller.approve('p1', approver);

    // 🔴 `approve(id, user)` — and the user is not optional context. It becomes
    // AgentProposal.approvedById and the audit actor. A call that lost the
    // second argument would still create the line items, and the record would
    // then say a proposal was approved by nobody.
    expect(approvals.approve).toHaveBeenCalledWith('p1', approver);
  });

  it('rejects with the reason out of the body, not the body itself', async () => {
    const { controller, approvals } = build();

    await controller.reject('p1', { reason: 'Add-ons only' }, approver);

    // The reason has two readers (it is stored on the proposal AND sent back to
    // the agent so it can try something else), so handing the service a whole
    // DTO instead of the string would break both at once.
    expect(approvals.reject).toHaveBeenCalledWith(
      'p1',
      'Add-ons only',
      approver,
    );
  });

  it('does not swap the two decisions', async () => {
    const { controller, approvals } = build();

    await controller.approve('p1', approver);

    // Cheap, and the failure it guards against is not: `reject` and `approve`
    // take a compatible-enough shape that a wired-up mistake type-checks.
    expect(approvals.reject).not.toHaveBeenCalled();
  });
});
