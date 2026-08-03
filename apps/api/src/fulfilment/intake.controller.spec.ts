import { BadRequestException } from '@nestjs/common';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { IntakeAdapterService } from './intake-adapter.service';

/**
 * CH-020 / ADR-0024 D2 — `POST /requests/intake` now carries two contracts, and
 * this file is the thing that stops the second one from eating the first.
 *
 * The risk is entirely one-directional. n8n's flat payload is new and nobody
 * depends on it yet; the canonical contract is LOCKED (ADR-0008 D6) and its
 * guarantees — `serviceNowSysId` required, unknown fields stripped — are what
 * every caller's duplicate protection rests on. So the assertions below are
 * weighted accordingly: most of them are about the canonical side NOT moving.
 */
describe('IntakeController — intake dispatch (CH-020)', () => {
  let intake: { intake: jest.Mock };
  let adapter: { intakeFlat: jest.Mock; intakeNative: jest.Mock };
  let controller: IntakeController;

  const canonicalBody = () => ({
    targetUpn: 'jane.doe@rhk.com',
    opcoCode: 'RHK',
    serviceNowSysId: 'req-sys-1',
    serviceNowNumber: 'REQ0044038',
    lineItems: [{ skuId: 'guid-e5', quantity: 1 }],
  });

  const flatBody = () => ({
    mode: 1,
    targetUpn: 'jane.doe@rhk.com',
    opcoCode: 'RHK',
    requestId: 'REQ0044038',
    serviceNowTaskSysId: 'task-sys-1',
    serviceNowTaskNumber: 'SCTASK0071802',
    source: '1001-immediate',
  });

  beforeEach(() => {
    intake = { intake: jest.fn().mockResolvedValue({ id: 'r1' }) };
    adapter = {
      intakeFlat: jest.fn().mockResolvedValue({ id: 'r2' }),
      intakeNative: jest.fn(),
    };
    controller = new IntakeController(
      intake as unknown as IntakeService,
      adapter as unknown as IntakeAdapterService,
    );
  });

  describe('the canonical contract is untouched', () => {
    it('routes a body with no mode to IntakeService', async () => {
      await controller.push(canonicalBody());

      expect(intake.intake).toHaveBeenCalledTimes(1);
      expect(adapter.intakeFlat).not.toHaveBeenCalled();
      expect(intake.intake.mock.calls[0][0]).toMatchObject({
        targetUpn: 'jane.doe@rhk.com',
        serviceNowSysId: 'req-sys-1',
      });
    });

    /**
     * 🔴 The alternative this change rejected was making `serviceNowSysId`
     * optional so 1001's payload would validate. It is the `@unique` idempotency
     * key — this test is what proves that did not happen by accident.
     */
    it('still rejects a canonical body without serviceNowSysId', async () => {
      const body = canonicalBody();
      delete (body as Record<string, unknown>).serviceNowSysId;

      await expect(controller.push(body)).rejects.toThrow(BadRequestException);
      expect(intake.intake).not.toHaveBeenCalled();
    });

    it('still rejects a canonical body with no line items', async () => {
      await expect(
        controller.push({ ...canonicalBody(), lineItems: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(intake.intake).not.toHaveBeenCalled();
    });

    /**
     * `whitelist: true` is inherited by construction (the controller reuses a
     * ValidationPipe with main.ts's options rather than re-stating the rules),
     * but "by construction" is a claim, so it is asserted.
     */
    it('still strips fields the canonical contract does not declare', async () => {
      await controller.push({ ...canonicalBody(), sneaky: 'value' });

      expect(intake.intake.mock.calls[0][0]).not.toHaveProperty('sneaky');
    });

    it('passes no task ref on this path — only the flat route may set one', async () => {
      await controller.push({
        ...canonicalBody(),
        serviceNowTaskSysId: 'task-sys-1',
      });

      // Stripped by whitelist, and the second parameter stays undefined: a
      // canonical caller must not be able to reach the by-task close route,
      // which bypasses ADR-0018 D3's "exactly one active task" protection.
      expect(intake.intake.mock.calls[0][0]).not.toHaveProperty(
        'serviceNowTaskSysId',
      );
      expect(intake.intake.mock.calls[0][1]).toBeUndefined();
    });
  });

  describe('the flat contract', () => {
    it('routes mode 1 to the adapter, never to IntakeService', async () => {
      await controller.push(flatBody());

      expect(adapter.intakeFlat).toHaveBeenCalledTimes(1);
      expect(intake.intake).not.toHaveBeenCalled();
      expect(adapter.intakeFlat.mock.calls[0][0]).toMatchObject({
        mode: 1,
        requestId: 'REQ0044038',
        serviceNowTaskSysId: 'task-sys-1',
      });
    });

    it('rejects a flat body missing requestId', async () => {
      const body = flatBody();
      delete (body as Record<string, unknown>).requestId;

      await expect(controller.push(body)).rejects.toThrow(BadRequestException);
      expect(adapter.intakeFlat).not.toHaveBeenCalled();
    });
  });

  /**
   * 🔴 Fail closed on the discriminator itself.
   *
   * The trap is that `mode: 2` looks harmless — but if presence of the key did
   * not decide the route, it would fall through to the canonical contract, get
   * `mode` stripped by whitelist, and then fail on unrelated missing fields. The
   * caller would be told its REQ number was missing rather than that its mode is
   * unsupported.
   */
  describe('an unrecognised mode is refused, not guessed', () => {
    it.each([[2], [0], ['1'], [null], [true]])(
      'rejects mode %p without writing anything',
      async (mode) => {
        await expect(controller.push({ ...flatBody(), mode })).rejects.toThrow(
          BadRequestException,
        );

        expect(adapter.intakeFlat).not.toHaveBeenCalled();
        expect(intake.intake).not.toHaveBeenCalled();
      },
    );
  });
});
