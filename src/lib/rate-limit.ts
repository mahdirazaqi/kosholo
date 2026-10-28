import "server-only";

// Fixed-window, in-memory rate limiter. Fine for a single long-running
// server process; must move to a shared store if we ever run multiple.

type Bucket = { count: number; resetAt: number };

const globalForLimiter = globalThis as unknown as {
  __rateLimitBuckets?: Map<string, Bucket>;
};
const buckets = (globalForLimiter.__rateLimitBuckets ??= new Map());

export const RATE_LIMIT_ERROR =
  "Too many attempts, please try again later";

export const LIMITS = {
  loginFailures: { max: 5, windowMs: 15 * 60 * 1000 },
  registrations: { max: 5, windowMs: 60 * 60 * 1000 },
  userLookups: { max: 30, windowMs: 10 * 60 * 1000 },
  messages: { max: 60, windowMs: 60 * 1000 },
  edits: { max: 60, windowMs: 10 * 60 * 1000 },
  // Channel invite links: every join attempt, and every unknown token seen.
  channelJoins: { max: 20, windowMs: 10 * 60 * 1000 },
  badInviteLinks: { max: 10, windowMs: 10 * 60 * 1000 },
  // Wrong passwords when transferring channel ownership.
  passwordFailures: { max: 5, windowMs: 15 * 60 * 1000 },
} as const;

type Limit = { max: number; windowMs: number };

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function getBucket(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key);
  if (bucket && bucket.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }
  return bucket;
}

export function isRateLimited(key: string, limit: Limit) {
  const bucket = getBucket(key, Date.now());
  return bucket !== undefined && bucket.count >= limit.max;
}

export function recordHit(key: string, limit: Limit) {
  const now = Date.now();
  if (buckets.size > 10_000) sweep(now);
  const bucket = getBucket(key, now);
  if (bucket) bucket.count += 1;
  else buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
}

export function resetHits(key: string) {
  buckets.delete(key);
}
