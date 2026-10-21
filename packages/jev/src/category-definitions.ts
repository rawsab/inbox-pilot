import { PrimaryCategory } from "@inbox-pilot/contracts";

/** Fixed category definitions sent with every classifyAndVerify call. */
export const CATEGORY_DEFINITIONS: Record<string, string> = {
  [PrimaryCategory.APPLICATION_CONFIRMATION]:
    "Explicit receipt of a submitted application. An invitation to apply is not confirmation.",
  [PrimaryCategory.REJECTION]:
    "Explicit decision not to proceed for a role or application. Generic advice about rejection is excluded.",
  [PrimaryCategory.INTERVIEW]:
    "Interview request, assessment, scheduling, or substantive interview logistics.",
  [PrimaryCategory.OFFER]:
    "An explicit employment or internship offer. Discounts and vague opportunities are excluded.",
  [PrimaryCategory.UPDATE]:
    "Recruiting process update or individual outreach that is not confirmation, rejection, interview, or offer.",
  [PrimaryCategory.NEWSLETTER]:
    "General career or recruiting newsletter, including job-alert digests. No job aggregation.",
  [PrimaryCategory.NOT_RECRUITING]:
    "Personal, commercial, or unrelated email that is not recruiting.",
  [PrimaryCategory.UNKNOWN]:
    "Insufficient evidence, unsupported language, multiple conflicting events, or malformed content.",
};
