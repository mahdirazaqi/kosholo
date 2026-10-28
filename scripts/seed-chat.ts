// Development only: npm run db:seed:chat -- <emailOrUsernameA> <emailOrUsernameB>
// Fills the direct conversation between two existing test users with 5,000
// messages spread over ~6 months (short/long text in Persian and English,
// emoji-only, replies to older messages, images that share ONE existing
// upload), to test pagination and the virtualized list.
import "../src/server/env";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";

const TOTAL = 5000;
const MONTHS = 6;

// Never against a production database: refuse unless it is a local one.
function assertDevelopment() {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // handled below
  }
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    console.error("Refusing to seed: this script only runs in development against a local database.");
    process.exit(1);
  }
}

const SHORT = ["ok", "👍", "hmm", "thanks!", "see you", "lol", "سلام", "باشه", "ممنون", "خداحافظ", "yes", "no", "later", "on my way", "nice"];
const LONG = [
  "I was thinking about what we discussed yesterday, and I believe the best approach is to split the work into smaller pieces so each of us can ship something every couple of days.",
  "امروز صبح جلسه‌ی خیلی طولانی‌ای داشتیم و در نهایت قرار شد همه‌ی موارد را تا آخر هفته مرور کنیم و نتیجه را برای بقیه‌ی تیم بفرستیم تا بتوانیم زودتر شروع کنیم.",
  "https://example.com/a/very/long/path/that/keeps/going/and/going/with-a-long-slug-and-query?utm_source=chat&utm_medium=test&id=1234567890",
  "Remember to bring the documents, the signed forms, and the printed copies. Also check the schedule again, because the room might change at the last minute.",
  "این یک پیام آزمایشی بلند است که برای تست شکستن خط و جابه‌جایی لیست پیام‌ها نوشته شده و عمداً چند خط طول دارد.\nخط دوم پیام.\nخط سوم پیام.",
];
const EMOJI = ["😀", "🎉", "❤️", "😂😂", "🔥", "👏", "🙏", "🤝"];

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

async function main() {
  assertDevelopment();
  const [a, b] = process.argv.slice(2).map((value) => value.toLowerCase().replace(/^@/, ""));
  if (!a || !b || a === b) {
    console.error("Usage: npm run db:seed:chat -- <emailOrUsernameA> <emailOrUsernameB>");
    process.exit(1);
  }
  const find = (key: string) =>
    db.user.findFirst({ where: { OR: [{ email: key }, { username: key }] }, select: { id: true, name: true } });
  const [userA, userB] = await Promise.all([find(a), find(b)]);
  if (!userA || !userB) {
    console.error(`User not found: ${!userA ? a : b}`);
    process.exit(1);
  }

  const directKey = [userA.id, userB.id].sort().join(":");
  const conversation = await db.conversation.upsert({
    where: { directKey },
    create: { type: "DIRECT", directKey, createdById: userA.id },
    update: {},
    select: { id: true },
  });
  await db.conversationMember.createMany({
    data: [userA.id, userB.id].map((userId) => ({ conversationId: conversation.id, userId })),
    skipDuplicates: true,
  });

  // One existing image upload is shared by every image message (no files are written).
  const image = await db.upload.findFirst({
    where: { kind: "IMAGE", ownerId: { in: [userA.id, userB.id] } },
    select: { id: true },
  });
  if (!image) console.warn("No image upload found for these users: skipping image messages (send one photo first).");

  const end = Date.now();
  const start = end - MONTHS * 30 * 24 * 3600 * 1000;
  const ids: string[] = [];
  const rows = [];
  let time = start;
  const step = (end - start) / TOTAL;
  for (let i = 0; i < TOTAL; i++) {
    time += step * (0.4 + Math.random() * 1.2);
    const id = randomUUID();
    const roll = Math.random();
    const isImage = image && roll < 0.04;
    const type = isImage ? "IMAGE" : "TEXT";
    const content = isImage
      ? Math.random() < 0.3 ? pick(SHORT) : null
      : roll < 0.12 ? pick(EMOJI) : roll < 0.7 ? pick(SHORT) : pick(LONG);
    rows.push({
      id,
      conversationId: conversation.id,
      senderId: Math.random() < 0.5 ? userA.id : userB.id,
      type: type as "TEXT" | "IMAGE",
      content,
      uploadId: isImage ? image.id : null,
      // ~8% reply to an earlier message (sometimes a very old one).
      replyToId: ids.length > 50 && Math.random() < 0.08 ? pick(ids) : null,
      createdAt: new Date(Math.min(time, end - (TOTAL - i))),
    });
    ids.push(id);
  }

  // Parents before replies: rows are in time order and replies point backwards.
  for (let i = 0; i < rows.length; i += 500) {
    await db.message.createMany({ data: rows.slice(i, i + 500) });
    process.stdout.write(`\r${Math.min(i + 500, rows.length)} / ${rows.length}`);
  }
  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date(end) } });
  console.log(`\nSeeded ${TOTAL} messages in the chat between ${userA.name} and ${userB.name} (${conversation.id}).`);
  await db.$disconnect();
}

void main();
