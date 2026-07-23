import { ConfigService } from '@nestjs/config';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { requestSubmissionProviderFactory } from './fulfilment.module';
import { DirectServiceNowProvider } from './direct-servicenow.provider';
import { N8nWorkflowProvider } from './n8n-workflow.provider';

// Fork 3 (config 單選): the factory picks the outbound provider. The selection is
// now resolved DB-then-env (ADR-0013) instead of read straight from env — unset
// still means Direct, so existing behaviour never changes.
describe('requestSubmissionProviderFactory', () => {
  const snow = {} as ServiceNowService;

  // The webhook KEY is the only value the factory/provider still reads from env.
  const config = {
    getOrThrow: (k: string) => {
      if (k === 'N8N_OUTBOUND_WEBHOOK_KEY') return 'secret';
      throw new Error(`missing ${k}`);
    },
  } as unknown as ConfigService;

  // Drive the factory's branch by what the resolver returns for each column.
  const cc = (values: Record<string, string | undefined>) =>
    ({
      resolve: (_c: string, column: string) => values[column],
    }) as unknown as ConnectorConfigService;

  it('returns DirectServiceNowProvider when the provider is unset (default)', async () => {
    const provider = await requestSubmissionProviderFactory(
      config,
      snow,
      cc({}),
    );
    expect(provider).toBeInstanceOf(DirectServiceNowProvider);
  });

  it("returns DirectServiceNowProvider when set to 'direct'", async () => {
    const provider = await requestSubmissionProviderFactory(
      config,
      snow,
      cc({ requestSubmissionProvider: 'direct' }),
    );
    expect(provider).toBeInstanceOf(DirectServiceNowProvider);
  });

  it("returns N8nWorkflowProvider when set to 'n8n'", async () => {
    const provider = await requestSubmissionProviderFactory(
      config,
      snow,
      cc({
        requestSubmissionProvider: 'n8n',
        n8nOutboundWebhookUrl: 'https://n8n.example.com/webhook/x',
      }),
    );
    expect(provider).toBeInstanceOf(N8nWorkflowProvider);
  });

  it('fails fast when n8n is selected but its webhook URL is unresolved', async () => {
    await expect(
      requestSubmissionProviderFactory(
        config,
        snow,
        cc({ requestSubmissionProvider: 'n8n' }),
      ),
    ).rejects.toThrow(/webhook URL is not configured/);
  });
});
