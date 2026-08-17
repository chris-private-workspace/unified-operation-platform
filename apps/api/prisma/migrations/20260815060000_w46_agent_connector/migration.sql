-- W46 F3 / ADR-0036 D10 — the agent runtime seam's non-secret config.
--
-- Two nullable columns, no default. Null means "fall back to env"
-- (ConnectorConfigService resolves DB-then-env), which is how every other
-- connector column here already behaves.
--
-- 🔴 `agentModel` has NO default here AND none in code. An unset model makes a
-- run fail with a 503 rather than quietly picking one, because which model runs
-- decides cost, capability and which third party receives a real person's
-- request text (plan OQ-1 / OQ-7).
--
-- Both API keys (OPENAI_API_KEY / ANTHROPIC_API_KEY) stay in env and never
-- become columns — same rule as every other credential on this table (H4).

-- AlterTable
ALTER TABLE "ConnectorConfig" ADD COLUMN     "agentRuntime" TEXT,
ADD COLUMN     "agentModel" TEXT;
