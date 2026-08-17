import { useState } from 'react';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ShieldAlert,
} from 'lucide-react';
import { useAgentProfiles, useAgentRuns } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import {
  RUN_STATUS_OPTIONS,
  runStatusLabel,
  runStatusTone,
} from '@/lib/agent-registry';
import { formatDateTime } from '@/lib/format';
import type { AgentProfile, AgentRunSummary } from '@/lib/api-types';
import { ProfileDialog } from '@/components/agent/profile-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError, Loading } from '@/components/ui/feedback-states';
import { IconButton } from '@/components/ui/icon-button';
import { Select } from '@/components/ui/select';

const PAGE_SIZE = 25;

const TH =
  'px-[18px] py-[11px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[18px] py-[11px] align-middle';
const NUM = 'font-mono text-[12px]'; // DS-5 — every identifier and figure is mono

/**
 * Agent registry (W47 / Tier 2 `T2-a`) — `OQ-B` put it on its own route rather
 * than a Settings tab, because the run list does not fit in a tab.
 *
 * 🔴 **One primary action on the whole view** (DS-3): "New profile". The run list
 * below carries none — it is a record of what happened, and the two things a
 * person can do to a run (approve its proposal, stop it) both live on the
 * request the run belongs to, where the context to decide is.
 *
 * ADMIN-only, the same way `/audit` is: the sidebar hides the entry
 * (`canManageAgentProfiles`) and opening the URL directly degrades to a
 * restricted state. The server's 403 is the real authority.
 *
 * ⚠️ What this screen deliberately CANNOT do: change what the agent is allowed
 * to do, or what it can see. The tool allow-list is one list in the server's
 * code (ADR-0036 D1) and a run's scope comes from whoever started it (`OQ-2`).
 * A profile is a model and a prompt — nothing here widens either boundary.
 */
export function Agent() {
  const [dialog, setDialog] = useState<
    'create' | { edit: AgentProfile } | null
  >(null);
  const [status, setStatus] = useState('');
  const [profileId, setProfileId] = useState('');
  // A stack, so "Newer" walks back through the cursors already visited — the
  // API is cursor-paged, which can only move forward on its own.
  const [cursors, setCursors] = useState<string[]>([]);

  const profiles = useAgentProfiles();
  const runs = useAgentRuns({
    ...(status && { status }),
    ...(profileId && { profileId }),
    limit: PAGE_SIZE,
    ...(cursors.length > 0 && { cursor: cursors[cursors.length - 1] }),
  });

  const forbidden =
    (profiles.error instanceof ApiError && profiles.error.status === 403) ||
    (runs.error instanceof ApiError && runs.error.status === 403);

  // Any filter change restarts from the first page: a cursor from the previous
  // filter set points into a result list that no longer exists.
  const applyFilter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setCursors([]);
  };

  if (forbidden) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<ShieldAlert size={18} strokeWidth={2} />}
          title="Access required"
          description="The agent registry decides which model every future run uses, so it is limited to platform admins."
        />
      </Card>
    );
  }

  const rows = profiles.data ?? [];
  const page = runs.data;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* header — the view's single primary action */}
      <Card className="flex flex-wrap items-center justify-between gap-[14px] p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[15px] font-semibold tracking-[-.02em]">Agent</h1>
          <p className="text-[12.5px] text-fg-muted">
            Which model AI-Assist runs on, and what it has been doing.
          </p>
        </div>
        <Button variant="primary" onClick={() => setDialog('create')}>
          New profile
        </Button>
      </Card>

      {/* ── profiles ── */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-[18px] py-[13px]">
          <h2 className="text-[13px] font-semibold">Profiles</h2>
        </div>

        {profiles.isLoading && <Loading label="Loading profiles…" />}
        {profiles.isError && <LoadError />}
        {!profiles.isLoading && !profiles.isError && rows.length === 0 && (
          <EmptyState
            icon={<Bot size={18} strokeWidth={2} />}
            title="No profiles yet"
            description="A profile is a model AI-Assist can run on. Without one, runs cannot start."
          />
        )}

        {rows.length > 0 && (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-panel">
                <th className={TH}>Name</th>
                <th className={TH}>Model</th>
                <th className={TH}>Prompt</th>
                <th className={TH}>Status</th>
                <th className={TH} aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {rows.map((profile) => (
                <tr
                  key={profile.id}
                  className="border-b border-border last:border-0 hover:bg-hover"
                >
                  <td className={TD}>
                    <span className="text-[12.5px]">{profile.name}</span>
                  </td>
                  <td className={`${TD} ${NUM} text-fg-muted`}>
                    {profile.model}
                  </td>
                  <td className={TD}>
                    {/*
                      🔴 Shown even though it cannot be edited here yet. A
                      profile that quietly carries custom instructions, on a
                      screen that never mentions them, is the version of this
                      table that misleads.
                    */}
                    {profile.prompt ? (
                      <Badge tone="purple">Custom</Badge>
                    ) : (
                      <span className="text-[12.5px] text-fg-subtle">
                        Built-in
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    <Badge tone={profile.active ? 'ok' : 'neutral'}>
                      {profile.active ? 'Active' : 'Retired'}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <IconButton
                      aria-label={`Edit ${profile.name}`}
                      onClick={() => setDialog({ edit: profile })}
                    >
                      <Pencil size={14} strokeWidth={2} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── runs ── */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-[10px] border-b border-border px-[18px] py-[11px]">
          <h2 className="text-[13px] font-semibold">Runs</h2>
          <div className="flex items-center gap-[8px]">
            <div className="w-[170px]">
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(e) => applyFilter(setStatus)(e.target.value)}
              >
                <option value="">All statuses</option>
                {RUN_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {runStatusLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-[190px]">
              <Select
                aria-label="Filter by profile"
                value={profileId}
                onChange={(e) => applyFilter(setProfileId)(e.target.value)}
              >
                <option value="">All profiles</option>
                {rows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {runs.isLoading && <Loading label="Loading runs…" />}
        {runs.isError && <LoadError />}
        {!runs.isLoading && !runs.isError && page?.items.length === 0 && (
          <EmptyState
            icon={<Bot size={18} strokeWidth={2} />}
            title="No runs"
            description={
              status || profileId
                ? 'Nothing matches the current filters.'
                : 'Runs started from a request will appear here.'
            }
          />
        )}

        {page && page.items.length > 0 && (
          <>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-panel">
                  <th className={TH}>Started</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Profile</th>
                  <th className={TH}>Request</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-border px-[18px] py-[10px]">
              <span className="font-mono text-[11.5px] text-fg-subtle">
                Page {cursors.length + 1}
              </span>
              <div className="flex items-center gap-[6px]">
                <Button
                  variant="secondary"
                  disabled={cursors.length === 0}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  <ChevronLeft size={14} />
                  Newer
                </Button>
                <Button
                  variant="secondary"
                  disabled={!page.nextCursor}
                  onClick={() =>
                    setCursors((c) =>
                      page.nextCursor ? [...c, page.nextCursor] : c,
                    )
                  }
                >
                  Older
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {dialog && (
        <ProfileDialog
          profile={dialog === 'create' ? undefined : dialog.edit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function RunRow({ run }: { run: AgentRunSummary }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-hover">
      <td className={`${TD} ${NUM} text-fg-muted`}>
        {formatDateTime(run.startedAt)}
      </td>
      <td className={TD}>
        <Badge tone={runStatusTone(run.status)}>
          {runStatusLabel(run.status)}
        </Badge>
      </td>
      <td className={TD}>
        {run.profile ? (
          <div className="flex flex-col gap-[1px]">
            <span className="text-[12.5px]">{run.profile.name}</span>
            <span className="font-mono text-[11px] text-fg-subtle">
              {run.profile.model}
            </span>
          </div>
        ) : (
          /*
            🔴 `OQ-D` — shown, not hidden. Hiding runs that predate the registry
            would turn "how many runs came before it" into a question nobody can
            answer, and that is precisely the number a brand-new list is easiest
            to be quietly wrong about.
          */
          <span className="text-[12.5px] text-fg-subtle">Before W47</span>
        )}
      </td>
      <td className={`${TD} ${NUM} text-fg-subtle`}>{run.requestId ?? '—'}</td>
    </tr>
  );
}
