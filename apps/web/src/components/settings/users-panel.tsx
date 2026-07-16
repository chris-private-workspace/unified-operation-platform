import { useState } from 'react';
import { ShieldAlert, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, LoadError } from '@/components/ui/feedback-states';
import { Toast } from '@/components/ui/toast';
import { useAdminOpcos, useAdminUsers } from '@/hooks/queries';
import {
  useCreateUser,
  useResetPassword,
  useUpdateUser,
} from '@/hooks/mutations';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { validatePassword } from '@/lib/password-policy';
import { cn } from '@/lib/utils';
import type { AdminOpco, AdminUser, Role } from '@/lib/api-types';
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  isLocal,
  providerLabel,
  roleLabel,
  roleTone,
  scopeLabel,
  validateCreateUser,
  type CreateUserForm,
} from '@/lib/user-admin';

type Flash = (message: string, tone: 'ok' | 'danger') => void;

const TH =
  'px-[16px] py-[10px] text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-fg-subtle';
const TD = 'px-[16px] py-[13px] align-middle';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] text-fg-muted">{label}</label>
      {children}
    </div>
  );
}

function OpcoOptions({ opcos }: { opcos: AdminOpco[] }) {
  return (
    <>
      <option value="">Select an OpCo…</option>
      {opcos.map((o) => (
        <option key={o.id} value={o.id}>
          {o.code} — {o.displayName}
        </option>
      ))}
    </>
  );
}

// Add user (local account, admin-set initial password — ADR-0005 §6 / AUTH-4b).
function CreateUserDialog({
  opcos,
  onClose,
  flash,
}: {
  opcos: AdminOpco[];
  onClose: () => void;
  flash: Flash;
}) {
  const create = useCreateUser();
  const [form, setForm] = useState<CreateUserForm>({
    email: '',
    displayName: '',
    role: 'REGIONAL',
    opcoScopeId: '',
    password: '',
  });
  const error = validateCreateUser(form);
  const set = (patch: Partial<CreateUserForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (error) return;
    create.mutate(
      {
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        role: form.role,
        opcoScopeId: form.role === 'OPCO_IT' ? form.opcoScopeId : null,
        initialPassword: form.password,
      },
      {
        onSuccess: () => {
          flash(`Created ${form.displayName.trim()}`, 'ok');
          onClose();
        },
        onError: (e) =>
          flash(
            e instanceof Error ? e.message : 'Could not create user',
            'danger',
          ),
      },
    );
  };

  return (
    <Dialog
      open
      title="Add user"
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={Boolean(error) || create.isPending}
            onClick={submit}
          >
            Create user
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            placeholder="opco.it.rth@rapo.com.hk"
            onChange={(e) => set({ email: e.target.value })}
          />
        </Field>
        <Field label="Display name">
          <Input
            value={form.displayName}
            placeholder="RTH IT"
            onChange={(e) => set({ displayName: e.target.value })}
          />
        </Field>
        <Field label="Role">
          <Select
            value={form.role}
            onChange={(e) => set({ role: e.target.value as Role })}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {form.role === 'OPCO_IT' && (
          <Field label="OpCo scope">
            <Select
              value={form.opcoScopeId}
              onChange={(e) => set({ opcoScopeId: e.target.value })}
            >
              <OpcoOptions opcos={opcos} />
            </Select>
          </Field>
        )}
        <Field label="Initial password">
          <Input
            type="password"
            value={form.password}
            placeholder="At least 12 characters"
            onChange={(e) => set({ password: e.target.value })}
          />
        </Field>
        <p className="text-[11.5px] leading-[1.5] text-fg-subtle">
          At least 12 characters, with 3 of: lowercase, uppercase, number,
          symbol. The user must change it on first sign-in.
        </p>
      </div>
    </Dialog>
  );
}

// Edit role / OpCo scope / active. Applies to both providers; the backend blocks
// removing the last admin and self-deactivation (surfaced via toast).
function EditUserDialog({
  user,
  opcos,
  onClose,
  flash,
}: {
  user: AdminUser;
  opcos: AdminOpco[];
  onClose: () => void;
  flash: Flash;
}) {
  const update = useUpdateUser();
  const reset = useResetPassword();
  const [role, setRole] = useState<Role>(user.role);
  const [opcoScopeId, setOpcoScopeId] = useState(user.opcoScopeId ?? '');
  const [active, setActive] = useState(user.active);
  const [newPw, setNewPw] = useState('');
  const scopeError = role === 'OPCO_IT' && !opcoScopeId;
  const pwError = newPw ? validatePassword(newPw, { email: user.email }) : null;

  const doReset = () => {
    if (pwError || !newPw) return;
    reset.mutate(
      { id: user.id, body: { newPassword: newPw } },
      {
        onSuccess: () => {
          setNewPw('');
          flash(`Password reset for ${user.displayName}`, 'ok');
        },
        onError: (e) =>
          flash(
            e instanceof Error ? e.message : 'Could not reset password',
            'danger',
          ),
      },
    );
  };

  const submit = () => {
    if (scopeError) return;
    update.mutate(
      {
        id: user.id,
        body: {
          role,
          opcoScopeId: role === 'OPCO_IT' ? opcoScopeId : null,
          active,
        },
      },
      {
        onSuccess: () => {
          flash(`Updated ${user.displayName}`, 'ok');
          onClose();
        },
        onError: (e) =>
          flash(
            e instanceof Error ? e.message : 'Could not update user',
            'danger',
          ),
      },
    );
  };

  return (
    <Dialog
      open
      title={`Edit ${user.displayName}`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={scopeError || update.isPending}
            onClick={submit}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[2px]">
          <span className="font-mono text-[12px] text-fg-muted">
            {user.email}
          </span>
          <span className="text-[11.5px] text-fg-subtle">
            {providerLabel(user.authProvider)} account
          </span>
        </div>
        <Field label="Role">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {role === 'OPCO_IT' && (
          <Field label="OpCo scope">
            <Select
              value={opcoScopeId}
              onChange={(e) => setOpcoScopeId(e.target.value)}
            >
              <OpcoOptions opcos={opcos} />
            </Select>
          </Field>
        )}
        <Field label="Status">
          <SegmentedControl
            options={['Active', 'Disabled'] as const}
            value={active ? 'Active' : 'Disabled'}
            onChange={(v) => setActive(v === 'Active')}
          />
        </Field>
        {isLocal(user) && (
          <div className="flex flex-col gap-[6px] border-t border-border pt-[14px]">
            <label className="text-[12px] text-fg-muted">Reset password</label>
            <div className="flex items-start gap-[8px]">
              <div className="flex-1">
                <Input
                  type="password"
                  value={newPw}
                  placeholder="New password"
                  onChange={(e) => setNewPw(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={!newPw || Boolean(pwError) || reset.isPending}
                onClick={doReset}
              >
                Reset
              </Button>
            </div>
            <p
              className={cn(
                'text-[11.5px] leading-[1.5]',
                pwError && newPw ? 'text-danger' : 'text-fg-subtle',
              )}
            >
              {newPw
                ? (pwError ?? 'The user must change it on next sign-in.')
                : 'Set a new password; the user must change it on next sign-in.'}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// Users & roles (AUTH-4b) — the real admin console that replaces the coming-soon
// stub. ADMIN-only at the backend; a non-admin caller 403s and sees a restricted
// state (honest, no fabricated rows — same pattern as Assets Platform mode).
export function UsersPanel() {
  const users = useAdminUsers();
  const opcosQuery = useAdminOpcos();
  const opcos = opcosQuery.data ?? [];
  const [dialog, setDialog] = useState<'create' | { edit: AdminUser } | null>(
    null,
  );
  const [toast, setToast] = useState<{
    message: string;
    tone: 'ok' | 'danger';
  } | null>(null);

  const flash: Flash = (message, tone) => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  if (users.isLoading) {
    return (
      <div className="rounded-[12px] border border-border bg-card">
        <Loading />
      </div>
    );
  }

  if (users.isError) {
    const forbidden =
      users.error instanceof ApiError && users.error.status === 403;
    return (
      <div className="rounded-[12px] border border-border bg-card">
        {forbidden ? (
          <EmptyState
            icon={<ShieldAlert size={18} strokeWidth={2} />}
            title="Admin access required"
            description="Managing users and roles is limited to platform admins."
          />
        ) : (
          <LoadError description="Couldn't load users. Check the API is running, then retry." />
        )}
      </div>
    );
  }

  const rows = users.data ?? [];

  return (
    <div className="flex flex-col gap-[16px]">
      <Card
        padded={false}
        title="Users &amp; roles"
        subtitle="Who can see and act on which OpCos"
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<UserPlus size={15} strokeWidth={2} />}
            onClick={() => setDialog('create')}
          >
            Add user
          </Button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users size={18} strokeWidth={2} />}
            title="No users yet"
            description="Add the first local account to get started."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>User</th>
                  <th className={TH}>Role</th>
                  <th className={TH}>Scope</th>
                  <th className={TH}>Sign-in</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Last sign-in</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className={TD}>
                      <div className="flex flex-col gap-[1px]">
                        <span className="font-medium text-fg">
                          {u.displayName}
                        </span>
                        <span className="font-mono text-[11.5px] text-fg-subtle">
                          {u.email}
                        </span>
                      </div>
                    </td>
                    <td className={TD}>
                      <Badge tone={roleTone(u.role)}>{roleLabel(u.role)}</Badge>
                    </td>
                    <td className={TD}>
                      {u.opcoScope ? (
                        <span className="font-mono text-[12px] text-fg-muted">
                          {scopeLabel(u)}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">{scopeLabel(u)}</span>
                      )}
                    </td>
                    <td className={TD}>
                      <Badge tone={isLocal(u) ? 'neutral' : 'info'}>
                        {providerLabel(u.authProvider)}
                      </Badge>
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col items-start gap-[4px]">
                        <Badge tone={u.active ? 'ok' : 'neutral'} dot>
                          {u.active ? 'Active' : 'Disabled'}
                        </Badge>
                        {u.active && u.mustChangePassword && (
                          <Badge tone="warn">Must change</Badge>
                        )}
                      </div>
                    </td>
                    <td
                      className={cn(
                        TD,
                        'font-mono text-[11.5px] text-fg-subtle',
                      )}
                    >
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                    </td>
                    <td className={cn(TD, 'text-right')}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDialog({ edit: u })}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Role reference (prototype pattern) — the platform's actual 3 roles (H7:
          Admin / Regional / OpCo IT, not the mock's Read-only auditor). */}
      <Card bodyClassName="grid grid-cols-1 gap-[16px] sm:grid-cols-3">
        <div className="flex flex-col gap-[5px]">
          <span className="text-[12.5px] font-semibold text-purple">Admin</span>
          <span className="text-[11.5px] leading-[1.45] text-fg-muted">
            Platform admin. Manages users, roles and every OpCo.
          </span>
        </div>
        <div className="flex flex-col gap-[5px]">
          <span className="text-[12.5px] font-semibold text-info">
            Regional
          </span>
          <span className="text-[11.5px] leading-[1.45] text-fg-muted">
            Full access to all OpCos. Runs fulfilment, assignment and
            reconciliation.
          </span>
        </div>
        <div className="flex flex-col gap-[5px]">
          <span className="text-[12.5px] font-semibold text-fg-muted">
            OpCo IT
          </span>
          <span className="text-[11.5px] leading-[1.45] text-fg-muted">
            Sees and manages only their own OpCo’s licenses and requests.
          </span>
        </div>
      </Card>

      {dialog === 'create' && (
        <CreateUserDialog
          opcos={opcos}
          onClose={() => setDialog(null)}
          flash={flash}
        />
      )}
      {dialog && dialog !== 'create' && (
        <EditUserDialog
          user={dialog.edit}
          opcos={opcos}
          onClose={() => setDialog(null)}
          flash={flash}
        />
      )}

      <Toast message={toast?.message} tone={toast?.tone} />
    </div>
  );
}
