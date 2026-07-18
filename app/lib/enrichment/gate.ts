// The non-negotiable product rule (brief §2.4): NEVER write to a merchant's
// store without an explicit approval action. This pure guard is the single
// chokepoint every write-back path must pass through, so the rule is testable
// in isolation (QA-3: "write an explicit test attempting to bypass").

export type DraftStatus = "DRAFT" | "APPROVED" | "APPLIED" | "REJECTED";

export class ApprovalRequiredError extends Error {
  constructor(status: DraftStatus) {
    super(
      `Refusing to write to the store: draft is "${status}", not "APPROVED". ` +
        "Enrichment requires explicit approval before write-back.",
    );
    this.name = "ApprovalRequiredError";
  }
}

/** Throws unless the draft has been explicitly approved. */
export function assertApproved(status: DraftStatus): void {
  if (status !== "APPROVED") {
    throw new ApprovalRequiredError(status);
  }
}
