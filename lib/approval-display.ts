// Approval display-vs-state rules (single source of truth for the
// approval tab + CoSignTile). Every ring fill, note style, and action
// button derives from live approval state — never from a stale local.
// No contract changes: inputs are the id/signatures/status triple the
// tile and room already hold.

export type ApprovalView = {
  id: string | null;
  signatures: string;
  status: string;
};

export type ApprovalNote = { ok: boolean; text: string };

/** Terminal success: the staged action ran at 2/2 quorum. */
export function isExecuted(view: ApprovalView): boolean {
  return view.status === "executed";
}

/** Terminal states where no sign action is valid anymore. */
export function isTerminal(view: ApprovalView): boolean {
  return view.status === "executed" || view.status === "expired" || view.status === "escalated";
}

// Template ring behavior (docs/reference/front.html renderApproval): the
// row's own label says SIGNED for the local signer once an approval is
// open, and for the peer at 2/2 — the `.on` fill must match that label,
// so a SIGNED row is never hollow.
export function meRingOn(view: ApprovalView): boolean {
  if (view.id === null) return false;
  if (view.status === "expired") return false;
  return true;
}

export function peerRingOn(view: ApprovalView): boolean {
  if (view.status === "executed" || view.status === "ratified") return true;
  return view.signatures === "2/2";
}

/** A sign action on an executed approval is meaningless: hide it. */
export function signActionVisible(view: ApprovalView): boolean {
  if (view.id === null) return false;
  return !isExecuted(view);
}

/** Server conflicts that merely report a terminal success state (409
 * "approval is executed, not pending") must render in the success style —
 * a success state never uses error styling. Real failures stay red. */
export function terminalNote(errorText: string, view: ApprovalView): ApprovalNote {
  if (/is\s+executed/i.test(errorText) || isExecuted(view)) {
    return { ok: true, text: "executed: 2/2" };
  }
  return { ok: false, text: errorText };
}

/** Tabs that did not click execute hold no note, yet at 2/2 executed both
 * tabs must show green/neutral executed text — reuse the apDone.good style. */
export function executedFallbackNote(view: ApprovalView): ApprovalNote | null {
  if (!isExecuted(view)) return null;
  return { ok: true, text: "executed: 2/2" };
}
