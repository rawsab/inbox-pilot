import { z } from "zod";

/** Primary message category. Describes this message, never application state. */
export const PrimaryCategory = {
  APPLICATION_CONFIRMATION: "application_confirmation",
  REJECTION: "rejection",
  INTERVIEW: "interview",
  OFFER: "offer",
  UPDATE: "update",
  NEWSLETTER: "newsletter",
  NOT_RECRUITING: "not_recruiting",
  UNKNOWN: "unknown",
} as const;

export type PrimaryCategory = (typeof PrimaryCategory)[keyof typeof PrimaryCategory];

export const primaryCategorySchema = z.enum([
  PrimaryCategory.APPLICATION_CONFIRMATION,
  PrimaryCategory.REJECTION,
  PrimaryCategory.INTERVIEW,
  PrimaryCategory.OFFER,
  PrimaryCategory.UPDATE,
  PrimaryCategory.NEWSLETTER,
  PrimaryCategory.NOT_RECRUITING,
  PrimaryCategory.UNKNOWN,
]);

export const InterviewSubtype = {
  REQUEST: "request",
  ASSESSMENT: "assessment",
  SCHEDULING: "scheduling",
  LOGISTICS: "logistics",
} as const;

export type InterviewSubtype = (typeof InterviewSubtype)[keyof typeof InterviewSubtype];

export const interviewSubtypeSchema = z.enum([
  InterviewSubtype.REQUEST,
  InterviewSubtype.ASSESSMENT,
  InterviewSubtype.SCHEDULING,
  InterviewSubtype.LOGISTICS,
]);

/** Categories that always require human approval in MVP. */
export const SENSITIVE_CATEGORIES: ReadonlySet<PrimaryCategory> = new Set([
  PrimaryCategory.INTERVIEW,
  PrimaryCategory.OFFER,
  PrimaryCategory.REJECTION,
]);

/** Categories eligible for automatic labeling after evidence gates (Stage 5). */
export const AUTO_ELIGIBLE_CATEGORIES: ReadonlySet<PrimaryCategory> = new Set([
  PrimaryCategory.APPLICATION_CONFIRMATION,
  PrimaryCategory.NEWSLETTER,
  PrimaryCategory.UPDATE,
]);

/** Gmail label name under the app namespace for each primary category. */
export const CATEGORY_LABEL_NAME: Readonly<
  Record<Exclude<PrimaryCategory, "not_recruiting" | "unknown">, string>
> = {
  [PrimaryCategory.APPLICATION_CONFIRMATION]: "Application",
  [PrimaryCategory.REJECTION]: "Rejection",
  [PrimaryCategory.INTERVIEW]: "Interview",
  [PrimaryCategory.OFFER]: "Offer",
  [PrimaryCategory.UPDATE]: "Update",
  [PrimaryCategory.NEWSLETTER]: "Newsletter",
};

export const REVIEW_LABEL_NAME = "Review" as const;
