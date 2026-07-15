import { ConfigService } from '@nestjs/config';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { requestSubmissionProviderFactory } from './fulfilment.module';
import { DirectServiceNowProvider } from './direct-servicenow.provider';
import { N8nWorkflowProvider } from './n8n-workflow.provider';

// Fork 3 (config 單選): the factory picks the outbound provider by env. Default /
// anything-but-n8n → Direct (never changes existing behaviour); n8n → webhook.
describe('requestSubmissionProviderFactory', () => {
  const snow = {} as ServiceNowService;

  const configWith = (env: Record<string, string>) =>
    ({
      get: (k: string) => env[k],
      getOrThrow: (k: string) => {
        if (env[k] === undefined) throw new Error(`missing ${k}`);
        return env[k];
      },
    }) as unknown as ConfigService;

  it('returns DirectServiceNowProvider when REQUEST_SUBMISSION_PROVIDER is unset (default)', () => {
    const provider = requestSubmissionProviderFactory(configWith({}), snow);
    expect(provider).toBeInstanceOf(DirectServiceNowProvider);
  });

  it("returns DirectServiceNowProvider when set to 'direct'", () => {
    const provider = requestSubmissionProviderFactory(
      configWith({ REQUEST_SUBMISSION_PROVIDER: 'direct' }),
      snow,
    );
    expect(provider).toBeInstanceOf(DirectServiceNowProvider);
  });

  it("returns N8nWorkflowProvider when set to 'n8n'", () => {
    const provider = requestSubmissionProviderFactory(
      configWith({
        REQUEST_SUBMISSION_PROVIDER: 'n8n',
        N8N_OUTBOUND_WEBHOOK_URL: 'https://n8n.example.com/webhook/x',
        N8N_OUTBOUND_WEBHOOK_KEY: 'secret',
      }),
      snow,
    );
    expect(provider).toBeInstanceOf(N8nWorkflowProvider);
  });

  it('fails fast when n8n is selected but its webhook env is unset', () => {
    expect(() =>
      requestSubmissionProviderFactory(
        configWith({ REQUEST_SUBMISSION_PROVIDER: 'n8n' }),
        snow,
      ),
    ).toThrow(/missing N8N_OUTBOUND_WEBHOOK_URL/);
  });
});
