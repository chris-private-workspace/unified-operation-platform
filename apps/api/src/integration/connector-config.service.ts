import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  CONNECTOR_CONFIG,
  type ConnectorKey,
  type EditableField,
} from './connectors';

/** Where a resolved non-secret value came from. */
export type FieldSource = 'db' | 'env' | 'unset';

export interface ResolvedField {
  column: string;
  label: string;
  value: string | null; // non-secret only — a secret value never reaches this type
  source: FieldSource;
}

export interface SecretStatus {
  envKey: string;
  label: string;
  configured: boolean; // env has a value — NEVER the value itself (D2/D5, H4)
}

export interface ConnectorConfigView {
  editable: ResolvedField[];
  secrets: SecretStatus[];
}

/**
 * Connector config resolver + admin read/write model (W34 / ADR-0013, Model C).
 *
 * The contract that keeps H4 intact:
 *  - `resolve` / `describe` only ever touch NON-SECRET columns + env.
 *  - Secret values live in env only; we report `configured` (a boolean), never
 *    the value, not even masked (D2).
 *  - `update` rejects any key that is not an editable field of the connector,
 *    so a secret can never be written into ConnectorConfig through here.
 *
 * DB-then-env precedence (D3): a null/empty column falls back to the env var, so
 * a connector with no override behaves exactly as it did before this feature.
 */
@Injectable()
export class ConnectorConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolve one NON-SECRET field, DB-then-env. Integration services call this at
   * boot (C2, ADR-0013 D4). Returns undefined only when neither DB nor env has a
   * value — callers that require it (e.g. a client id) still decide how to fail.
   */
  async resolve(
    connector: ConnectorKey,
    column: string,
  ): Promise<string | undefined> {
    const row = await this.prisma.connectorConfig.findUnique({
      where: { connector },
    });
    const dbVal = (row as Record<string, unknown> | null)?.[column];
    if (typeof dbVal === 'string' && dbVal !== '') return dbVal;
    return this.config.get<string>(this.fieldFor(connector, column).envKey);
  }

  /** Admin read-model: non-secret values (+ source) and secret configured-status. */
  async describe(connector: ConnectorKey): Promise<ConnectorConfigView> {
    const spec = CONNECTOR_CONFIG[connector];
    const row = await this.prisma.connectorConfig.findUnique({
      where: { connector },
    });
    const rec = (row as Record<string, unknown> | null) ?? null;

    const editable: ResolvedField[] = spec.editable.map((f) => {
      const dbVal = rec?.[f.column];
      if (typeof dbVal === 'string' && dbVal !== '') {
        return { column: f.column, label: f.label, value: dbVal, source: 'db' };
      }
      const envVal = this.config.get<string>(f.envKey);
      return envVal
        ? { column: f.column, label: f.label, value: envVal, source: 'env' }
        : { column: f.column, label: f.label, value: null, source: 'unset' };
    });

    const secrets: SecretStatus[] = spec.secrets.map((s) => ({
      envKey: s.envKey,
      label: s.label,
      // Presence only — the value NEVER leaves the process (D2/D5, H4).
      configured: !!this.config.get<string>(s.envKey),
    }));

    return { editable, secrets };
  }

  /**
   * Update non-secret fields for one connector (validated, upserted). Any key
   * that is not an editable field of THIS connector is rejected — the guarantee
   * that a secret column can never be written through this path. An empty string
   * or null clears the override (falls back to env).
   */
  async update(
    connector: ConnectorKey,
    patch: Record<string, unknown>,
    actorId?: string | null,
  ): Promise<void> {
    const spec = CONNECTOR_CONFIG[connector];
    const data: Record<string, string | null> = {};

    for (const [key, raw] of Object.entries(patch)) {
      const field = spec.editable.find((f) => f.column === key);
      if (!field) {
        throw new BadRequestException(
          `'${key}' is not an editable field of ${connector}`,
        );
      }
      data[key] = this.validate(field, raw);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No editable fields to update');
    }

    // Upsert + audit in one transaction (ADR-0009 Decision 8.1): a config change
    // that isn't recorded is the "done but unrecorded" outcome to avoid. The
    // audit whitelist lists only non-secret columns, so nothing secret is stored.
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.connectorConfig.findUnique({
        where: { connector },
      });
      const after = await tx.connectorConfig.upsert({
        where: { connector },
        create: { connector, ...data },
        update: data,
      });
      await this.audit.logChange(tx, {
        action: AUDIT_ACTIONS.CONNECTOR_CONFIG_UPDATE,
        targetType: 'ConnectorConfig',
        targetId: connector,
        actorId,
        before,
        after,
      });
    });
  }

  private fieldFor(connector: ConnectorKey, column: string): EditableField {
    const field = CONNECTOR_CONFIG[connector].editable.find(
      (f) => f.column === column,
    );
    // A caller asking for a non-editable column is a programmer error, not user
    // input — surface it loudly rather than silently returning env.
    if (!field) {
      throw new Error(
        `No editable field '${column}' on connector ${connector}`,
      );
    }
    return field;
  }

  /** Per-field validation. null / '' clears the override → env fallback. */
  private validate(field: EditableField, raw: unknown): string | null {
    if (raw === null || raw === '') return null;
    if (typeof raw !== 'string') {
      throw new BadRequestException(`${field.label} must be a string`);
    }
    const value = raw.trim();
    if (value === '') return null;

    switch (field.kind) {
      case 'url':
        if (!/^https?:\/\/.+/.test(value)) {
          throw new BadRequestException(
            `${field.label} must be an http(s) URL`,
          );
        }
        break;
      case 'guid':
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
          )
        ) {
          throw new BadRequestException(`${field.label} must be a GUID`);
        }
        break;
      case 'enum':
        if (!field.enumValues?.includes(value)) {
          throw new BadRequestException(
            `${field.label} must be one of: ${field.enumValues?.join(', ')}`,
          );
        }
        break;
      case 'email':
        // Shape only — deliberately not RFC-complete. It exists to catch the
        // realistic mistake (a display name, a URL, a truncated paste), because
        // CH-011's connector has no probe (ADR-0019 D5) and therefore no other
        // feedback before a real send fails.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new BadRequestException(
            `${field.label} must be an email address`,
          );
        }
        break;
      case 'text':
        break;
    }
    return value;
  }
}
