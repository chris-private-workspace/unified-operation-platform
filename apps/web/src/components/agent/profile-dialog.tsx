import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  useCreateAgentProfile,
  useUpdateAgentProfile,
} from '@/hooks/mutations';
import { validateProfileForm, type ProfileForm } from '@/lib/agent-registry';
import type { AgentProfile } from '@/lib/api-types';

/**
 * W47 F5 — create or edit an agent profile.
 *
 * 🔴 There is no delete, and the dialog says so by only offering "Retired": a
 * historical run points at its profile to record what it ran on, and that answer
 * has to survive somebody tidying the list.
 *
 * ⚠️ **The system prompt is deliberately not editable here yet.** It needs a
 * multi-line field, and neither `design_handoff_licenseops` nor `components/ui`
 * has one — adding a primitive is an H6 decision for the design owner, not
 * something to slip into a feature. Until then a profile is a MODEL choice, and
 * the list shows whether a prompt is set so its absence is visible rather than
 * silently assumed.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] text-fg-muted">{label}</label>
      {children}
      {hint && <span className="text-[11.5px] text-fg-subtle">{hint}</span>}
    </div>
  );
}

export function ProfileDialog({
  profile,
  onClose,
}: {
  /** `undefined` = create. */
  profile?: AgentProfile;
  onClose: () => void;
}) {
  const editing = Boolean(profile);
  const create = useCreateAgentProfile();
  const update = useUpdateAgentProfile();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState<ProfileForm>({
    name: profile?.name ?? '',
    model: profile?.model ?? '',
    // Carried through untouched on edit — the field is not offered, and sending
    // it back unchanged is what keeps an edit from silently clearing it.
    prompt: profile?.prompt ?? '',
  });
  const [active, setActive] = useState(profile?.active ?? true);
  const [failed, setFailed] = useState<string | null>(null);

  const invalid = validateProfileForm(form);
  const set = (patch: Partial<ProfileForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (invalid) return;
    setFailed(null);
    const onError = (e: unknown) =>
      setFailed(e instanceof Error ? e.message : 'Could not save the profile');

    if (profile) {
      update.mutate(
        {
          id: profile.id,
          body: { name: form.name.trim(), model: form.model.trim(), active },
        },
        { onSuccess: onClose, onError },
      );
      return;
    }
    create.mutate(
      { name: form.name.trim(), model: form.model.trim() },
      { onSuccess: onClose, onError },
    );
  };

  return (
    <Dialog
      open
      title={editing ? 'Edit profile' : 'New profile'}
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={Boolean(invalid) || pending}
            onClick={submit}
          >
            {editing ? 'Save changes' : 'Create profile'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <Field label="Name" hint="How this profile is named on screen.">
          <Input
            value={form.name}
            placeholder="gpt-5.6-luna"
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>

        <Field
          label="Model"
          hint="The Azure deployment name, not a model family."
        >
          <Input
            value={form.model}
            placeholder="gpt-5.6-luna"
            onChange={(e) => set({ model: e.target.value })}
          />
        </Field>

        {editing && (
          <Field
            label="Status"
            hint="Retiring stops new runs. Runs already under way finish on it."
          >
            <Select
              aria-label="Profile status"
              value={active ? 'active' : 'retired'}
              onChange={(e) => setActive(e.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="retired">Retired</option>
            </Select>
          </Field>
        )}

        {/* Live validation, not a post-submit error — the button is disabled
            while this is showing, so the two can never disagree. */}
        {invalid && (
          <span className="text-[11.5px] text-danger">{invalid}</span>
        )}

        {/* The server's own message. Kept in the dialog rather than a toast so
            it sits next to the field that has to change. */}
        {failed && <span className="text-[11.5px] text-danger">{failed}</span>}
      </div>
    </Dialog>
  );
}
