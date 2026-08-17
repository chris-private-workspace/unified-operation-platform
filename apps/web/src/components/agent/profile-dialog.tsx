import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateAgentProfile,
  useUpdateAgentProfile,
} from '@/hooks/mutations';
import {
  PROMPT_MAX_LENGTH,
  validateProfileForm,
  type ProfileForm,
} from '@/lib/agent-registry';
import type { AgentProfile } from '@/lib/api-types';

/**
 * W47 F5 — create or edit an agent profile.
 *
 * 🔴 There is no delete, and the dialog says so by only offering "Retired": a
 * historical run points at its profile to record what it ran on, and that answer
 * has to survive somebody tidying the list.
 *
 * 🔴 The system prompt IS editable here (Chris approved the `Textarea`
 * primitive, 2026-08-17 · design-system §2), and it is the one field on this
 * screen that changes what the agent DOES rather than which model it does it
 * on — RISK `R26`. Three things carry that, and none of them is this dialog:
 * every write is audited before/after, the tool allow-list stays in the
 * server's code, and the length is capped. What this dialog owes them is
 * honesty about the cap and about what "empty" means.
 */
/**
 * ⚠️ The `<label>` WRAPS the control rather than sitting beside it.
 *
 * The version copied from `users-panel` has them as siblings with no `htmlFor`,
 * which means the two are not associated: clicking the label does not focus the
 * field, and a screen reader announces an unlabelled box. Wrapping is the
 * smallest fix that needs no id plumbing — and the defect was found by a test
 * failing to locate a field by its label, not by review.
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
      {/*
        ⚠️ The hint sits OUTSIDE the label on purpose. Everything inside a
        wrapping label becomes part of the control's accessible name, so a hint
        in here would have a screen reader announce the field as
        "System prompt 0 of 8000 characters. Replaces the built-in…" — and the
        character count changes on every keystroke.
      */}
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] text-fg-muted">{label}</span>
        {children}
      </label>
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

    /**
     * 🔴 An empty box means "use the built-in instructions", and the only way
     * to say that is `null`.
     *
     * Sending `''` would store an empty prompt, and the server treats a blank
     * prompt as unset anyway — so the row would say one thing while behaving as
     * another, and the list here would show "Custom" for a profile running the
     * built-in instructions. Trimmed at the ends only: whitespace INSIDE a
     * prompt is the author's paragraphing, not noise.
     */
    const prompt = form.prompt.trim() ? form.prompt.trim() : null;

    if (profile) {
      update.mutate(
        {
          id: profile.id,
          body: {
            name: form.name.trim(),
            model: form.model.trim(),
            prompt,
            active,
          },
        },
        { onSuccess: onClose, onError },
      );
      return;
    }
    create.mutate(
      { name: form.name.trim(), model: form.model.trim(), prompt },
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

        <Field
          label="System prompt"
          hint={
            form.prompt.trim()
              ? `${form.prompt.length} of ${PROMPT_MAX_LENGTH} characters. Replaces the built-in instructions entirely.`
              : 'Leave empty to use the built-in instructions.'
          }
        >
          {/*
            🔴 The hint says REPLACES, not "adds to", because that is what the
            server does. Appending would be the safer-sounding design and is the
            wrong one: two sets of instructions that disagree produce behaviour
            neither author predicted, and an admin reading their own prompt here
            would have no way to know what else sits in front of it.
          */}
          <Textarea
            aria-label="System prompt"
            value={form.prompt}
            placeholder="Leave empty to use the built-in instructions."
            maxLength={PROMPT_MAX_LENGTH}
            onChange={(e) => set({ prompt: e.target.value })}
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
