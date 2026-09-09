export type DomainErrorData =
  | {
      code: "INSUFFICIENT_BUDGET";
      requiredCents: number;
      availableCents: number;
    }
  | { code: "DUPLICATE_SUBMISSION" }
  | { code: "SUBMISSION_ALREADY_REVIEWED" }
  | { code: "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS" }
  | { code: "INVALID_STATUS_TRANSITION" }
  | { code: "CAMPAIGN_TERMS_LOCKED" }
  | { code: "PLATFORM_NOT_ALLOWED" }
  | { code: "STALE_CAMPAIGN" }
  | { code: "NOT_FOUND" };

const messages: Record<DomainErrorData["code"], string> = {
  INSUFFICIENT_BUDGET:
    "The remaining campaign budget cannot cover this approval.",
  DUPLICATE_SUBMISSION:
    "This post has already been submitted to this campaign.",
  SUBMISSION_ALREADY_REVIEWED:
    "This submission has already been reviewed. Refresh the queue.",
  CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS:
    "This campaign is not currently accepting submissions or approvals.",
  INVALID_STATUS_TRANSITION: "This campaign status change is not allowed.",
  CAMPAIGN_TERMS_LOCKED:
    "Campaign terms are fixed after the first submission. You can edit the title or increase the budget.",
  PLATFORM_NOT_ALLOWED:
    "This post's platform is not supported by the campaign. Choose one of the listed platforms.",
  STALE_CAMPAIGN: "This campaign has changed. Refresh before editing it again.",
  NOT_FOUND: "The requested record was not found.",
};

export class DomainError extends Error {
  constructor(public readonly data: DomainErrorData) {
    super(messages[data.code]);
    this.name = "DomainError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return (
    "cause" in error && error.cause !== error && isUniqueViolation(error.cause)
  );
}
