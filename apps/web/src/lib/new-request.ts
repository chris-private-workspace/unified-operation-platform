// Client-side form model + validation for the outbound "New request" screen
// (Phase 乙). Kept pure (no React) so it unit-tests directly. Mirrors the backend
// CreateRequestDto (apps/api/src/fulfilment/dto/create-request.dto.ts) so submit
// can be blocked early — the server remains the source of truth.

export interface NewRequestLine {
  skuId: string; // '' = not chosen
  quantity: number;
}

export interface NewRequestForm {
  targetUpn: string;
  targetDisplayName: string;
  opcoCode: string; // '' = not chosen
  requesterEmail: string;
  remark: string;
  lineItems: NewRequestLine[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A blank form with one empty line. `opcoCode` may be pre-filled (OPCO_IT lock). */
export function emptyNewRequest(opcoCode = ''): NewRequestForm {
  return {
    targetUpn: '',
    targetDisplayName: '',
    opcoCode,
    requesterEmail: '',
    remark: '',
    lineItems: [{ skuId: '', quantity: 1 }],
  };
}

/**
 * First validation error, or null when valid. Mirrors CreateRequestDto:
 * targetUpn + opcoCode required; ≥1 line; each line needs a SKU + quantity ≥ 1
 * (integer); requesterEmail, if given, must look like an email.
 */
export function validateNewRequest(form: NewRequestForm): string | null {
  if (!form.targetUpn.trim()) return 'Target user (UPN) is required.';
  if (!form.opcoCode) return 'Select an OpCo.';
  if (
    form.requesterEmail.trim() &&
    !EMAIL_RE.test(form.requesterEmail.trim())
  ) {
    return 'Enter a valid requester email.';
  }
  if (form.lineItems.length === 0) return 'Add at least one license line.';
  for (const [i, line] of form.lineItems.entries()) {
    if (!line.skuId) return `Line ${i + 1}: select a SKU.`;
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return `Line ${i + 1}: quantity must be a whole number ≥ 1.`;
    }
  }
  return null;
}
