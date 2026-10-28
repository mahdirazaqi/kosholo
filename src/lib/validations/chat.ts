import { z } from "zod";
import { MAX_LOCATION_LABEL, MAX_MESSAGE_LENGTH } from "@/lib/chat/limits";
import { MAX_CAPTION_LENGTH } from "@/lib/media/limits";
import { MAX_DELETE_MESSAGES } from "@/lib/chat/permissions";

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90).transform(round6),
  longitude: z.number().min(-180).max(180).transform(round6),
  label: z
    .string()
    .trim()
    .max(MAX_LOCATION_LABEL, "Place name is too long")
    .nullish()
    .transform((value) => value || null),
});

// Text messages need content; media messages (uploadId) take an optional
// caption; location messages may have no content.
export const sendMessageSchema = z
  .object({
    conversationId: z.uuid({ error: "Chat not found" }),
    content: z
      .string()
      .trim()
      .max(MAX_MESSAGE_LENGTH, "Message is too long")
      .nullish()
      .transform((value) => value || null),
    uploadId: z.uuid().nullish(),
    location: locationSchema.nullish(),
    replyToId: z.uuid().nullish(),
    // The sender's optimistic id, echoed back in message:new for merging.
    tempId: z.string().max(64).nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.uploadId && data.location) {
      ctx.addIssue({ code: "custom", path: ["location"], message: "Invalid message" });
    }
    if (!data.uploadId && !data.location && !data.content) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Message is empty" });
    }
    if ((data.uploadId || data.location) && (data.content?.length ?? 0) > MAX_CAPTION_LENGTH) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Caption is too long" });
    }
  });

export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const deleteMessagesSchema = z.object({
  conversationId: z.uuid({ error: "Chat not found" }),
  messageIds: z
    .array(z.uuid({ error: "Invalid message" }))
    .min(1, "No messages selected")
    .max(MAX_DELETE_MESSAGES, `You can delete up to ${MAX_DELETE_MESSAGES} messages at once`)
    .transform((ids) => [...new Set(ids)]),
  forEveryone: z.boolean(),
});

export const conversationDeleteSchema = z.object({
  conversationId: z.uuid({ error: "Chat not found" }),
  forEveryone: z.boolean(),
});
