import { z } from 'zod';

export const FEEDBACK_MAX_BODY_LENGTH = 4000;
export const FEEDBACK_THREAD_PAGE_SIZE = 20;
export const FEEDBACK_MESSAGE_PAGE_SIZE = 50;
export const feedbackStatusSchema = z.enum(['open', 'in_progress', 'resolved']);
export const feedbackCategorySchema = z.enum(['bug', 'idea', 'other']);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;
export type FeedbackSenderRole = 'user' | 'admin';

// Feedback is plain text. It must always be rendered as a text node, never HTML.
const feedbackBodySchema = z.string().trim().min(1).max(FEEDBACK_MAX_BODY_LENGTH)
  .refine(value => !value.includes('\0'), 'ข้อความมีอักขระที่ไม่รองรับ');

export const feedbackActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), body: feedbackBodySchema, category: feedbackCategorySchema.optional() }).strict(),
  z.object({ action: z.literal('reply'), threadId: z.uuid(), body: feedbackBodySchema }).strict(),
  z.object({ action: z.literal('status'), threadId: z.uuid(), status: feedbackStatusSchema }).strict(),
]);
export type FeedbackAction = z.infer<typeof feedbackActionSchema>;

export interface FeedbackThread {
  id: string;
  ownerId: string;
  ownerName: string | null;
  ownerPublicId: string | null;
  category: FeedbackCategory | null;
  status: FeedbackStatus;
  preview: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastSenderRole: FeedbackSenderRole;
  messageCount: number;
}

export interface FeedbackMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: FeedbackSenderRole;
  body: string;
  createdAt: string;
}

export interface FeedbackListResponse {
  threads: FeedbackThread[];
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export interface FeedbackDetailResponse {
  thread: FeedbackThread;
  messages: FeedbackMessage[];
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export interface FeedbackMutationResponse { threadId: string }

// Admin inbox (2026-10-20, database/feedback_admin_inbox.sql). Boxes come from who wrote last:
// waiting = the user wrote last and it is not resolved, replied = the team wrote last, resolved.
export const feedbackBoxSchema = z.enum(['waiting', 'replied', 'resolved']);
// "general" covers no category (the chat's ทั่วไป) and the older form's "other".
export const feedbackKindSchema = z.enum(['bug', 'idea', 'general']);
export type FeedbackBox = z.infer<typeof feedbackBoxSchema>;
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;
/** Same rule as the admin accounts list: admin grant, paid until a date, 14-day trial, revoked or none. */
export type FeedbackOwnerPlan = 'admin' | 'paid' | 'trial' | 'revoked' | 'none';

export interface FeedbackAdminThread extends FeedbackThread {
  /** When the user started waiting (their first message after the team's latest one); waiting box only. */
  waitingSince: string | null;
  /** Every thread this account has opened, this one included. */
  ownerThreadCount: number;
  /** Null when the plan could not be looked up; the inbox still works without it. */
  ownerPlan: FeedbackOwnerPlan | null;
}

export interface FeedbackAdminListResponse {
  threads: FeedbackAdminThread[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  counts: Record<FeedbackBox, number>;
  kinds: Record<FeedbackKind, number>;
}
