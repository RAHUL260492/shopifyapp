import { describe, it, expect } from "vitest";

import { assertApproved, ApprovalRequiredError } from "./gate";

// QA-3: enrichment must NEVER write to the store without explicit approval.
describe("assertApproved (write-back gate)", () => {
  it("allows an APPROVED draft through", () => {
    expect(() => assertApproved("APPROVED")).not.toThrow();
  });

  it("blocks a DRAFT (the bypass attempt)", () => {
    expect(() => assertApproved("DRAFT")).toThrow(ApprovalRequiredError);
  });

  it("blocks APPLIED and REJECTED too", () => {
    expect(() => assertApproved("APPLIED")).toThrow(ApprovalRequiredError);
    expect(() => assertApproved("REJECTED")).toThrow(ApprovalRequiredError);
  });
});
