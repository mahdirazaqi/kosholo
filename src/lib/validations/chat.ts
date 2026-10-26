import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 4000;

export const sendMessageSchema = z.object({
  conversationId: z.uuid({ error: "گفتگو پیدا نشد" }),
  content: z
    .string({ error: "پیام خالی است" })
    .trim()
    .min(1, "پیام خالی است")
    .max(MAX_MESSAGE_LENGTH, "پیام بیش از حد طولانی است"),
  replyToId: z.uuid().nullish(),
  // The sender's optimistic id, echoed back in message:new for merging.
  tempId: z.string().max(64).nullish(),
});

export type SendMessageInput = z.input<typeof sendMessageSchema>;
