import { z } from "zod";

export const MAX_CHANNEL_DESCRIPTION = 255;
export const MAX_CHANNEL_ADD_PER_REQUEST = 200;

export const channelTitleSchema = z
  .string({ error: "Enter a channel name" })
  .trim()
  .min(1, "Enter a channel name")
  .max(50, "Channel name can be at most 50 characters");

export const channelDescriptionSchema = z
  .string()
  .trim()
  .max(MAX_CHANNEL_DESCRIPTION, `Description can be at most ${MAX_CHANNEL_DESCRIPTION} characters`)
  .nullish()
  .transform((value) => value || null);

const subscriberIds = z
  .array(z.uuid({ error: "Invalid user" }), { error: "Select subscribers" })
  .max(MAX_CHANNEL_ADD_PER_REQUEST, `You can add up to ${MAX_CHANNEL_ADD_PER_REQUEST} people at once`);
const dedupe = (ids: string[]) => [...new Set(ids)];
const subscriberIdsSchema = subscriberIds.transform(dedupe);

export const createChannelSchema = z.object({
  title: channelTitleSchema,
  description: channelDescriptionSchema,
  // An AVATAR upload of mine, already uploaded in step 1.
  avatarUploadId: z.uuid().nullish(),
  memberIds: subscriberIdsSchema,
});

export const addSubscribersSchema = subscriberIds.min(1, "Select at least one person").transform(dedupe);

export const updateChannelSchema = z.object({
  title: channelTitleSchema.optional(),
  description: channelDescriptionSchema.optional(),
  signMessages: z.boolean().optional(),
});

export const transferOwnershipSchema = z.object({
  newOwnerId: z.uuid({ error: "Invalid user" }),
  password: z.string().min(1, "Enter your password").max(200),
});
