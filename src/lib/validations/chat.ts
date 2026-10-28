import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/limits";
import { MAX_CAPTION_LENGTH } from "@/lib/media/limits";

// Text messages need content; media messages (uploadId) take an optional caption.
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
    replyToId: z.uuid().nullish(),
    // The sender's optimistic id, echoed back in message:new for merging.
    tempId: z.string().max(64).nullish(),
  })
  .superRefine((data, ctx) => {
    if (!data.uploadId && !data.content) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Message is empty" });
    }
    if (data.uploadId && (data.content?.length ?? 0) > MAX_CAPTION_LENGTH) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Caption is too long" });
    }
  });

export type SendMessageInput = z.input<typeof sendMessageSchema>;
