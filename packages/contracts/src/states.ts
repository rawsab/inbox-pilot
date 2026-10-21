import { z } from "zod";

export const MessageState = {
  DISCOVERED: "DISCOVERED",
  NORMALIZED: "NORMALIZED",
  EVALUATED: "EVALUATED",
  IGNORED: "IGNORED",
  REVIEW_PENDING: "REVIEW_PENDING",
  ACTION_PENDING: "ACTION_PENDING",
  LABELED: "LABELED",
  RETRY_WAIT: "RETRY_WAIT",
  FAILED: "FAILED",
  HUMAN_RESOLVED: "HUMAN_RESOLVED",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export type MessageState = (typeof MessageState)[keyof typeof MessageState];

export const messageStateSchema = z.nativeEnum(MessageState);

export const ReviewStatus = {
  OPEN: "OPEN",
  APPROVED: "APPROVED",
  CORRECTED: "CORRECTED",
  SKIPPED: "SKIPPED",
  NOT_RECRUITING: "NOT_RECRUITING",
} as const;

export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const reviewStatusSchema = z.nativeEnum(ReviewStatus);

export const ActionIntentStatus = {
  PENDING: "PENDING",
  LEASED: "LEASED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  RECONCILING: "RECONCILING",
  CANCELLED: "CANCELLED",
} as const;

export type ActionIntentStatus = (typeof ActionIntentStatus)[keyof typeof ActionIntentStatus];

export const actionIntentStatusSchema = z.nativeEnum(ActionIntentStatus);

export const ActionKind = {
  ADD_CATEGORY_LABEL: "ADD_CATEGORY_LABEL",
  ADD_REVIEW_LABEL: "ADD_REVIEW_LABEL",
  REPLACE_REVIEW_WITH_CATEGORY: "REPLACE_REVIEW_WITH_CATEGORY",
  REMOVE_REVIEW_LABEL: "REMOVE_REVIEW_LABEL",
  UNDO_COMPENSATING: "UNDO_COMPENSATING",
} as const;

export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

export const actionKindSchema = z.nativeEnum(ActionKind);
