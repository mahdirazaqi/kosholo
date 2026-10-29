// npm run backfill:waveforms [-- --all]
// Recomputes the waveform of every VOICE upload from its stored file, in
// batches of 50 ordered by id. Idempotent: uploads that already have the
// current 64-bar waveform are skipped unless --all is given. Safe on a live
// server (one small UPDATE per upload; ffmpeg runs at most 2 jobs at a time).
import "../src/server/env";
import { stat } from "node:fs/promises";
import { db } from "../src/lib/db";
import { WAVEFORM_BARS } from "../src/lib/media/limits";
import { absolutePath } from "../src/lib/media/storage";
import { computeWaveform } from "../src/lib/media/waveform";

const BATCH = 50;
const all = process.argv.includes("--all");

async function main() {
  const total = await db.upload.count({ where: { kind: "VOICE" } });
  console.log(`${total} voice uploads${all ? " (recomputing all)" : ""}`);
  let cursor: string | undefined;
  let seen = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  for (;;) {
    const batch = await db.upload.findMany({
      where: { kind: "VOICE" },
      select: { id: true, path: true, waveform: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    for (const upload of batch) {
      seen++;
      const current = upload.waveform;
      if (!all && Array.isArray(current) && current.length === WAVEFORM_BARS) {
        skipped++;
        continue;
      }
      try {
        const file = absolutePath(upload.path);
        await stat(file);
        const waveform = await computeWaveform(file);
        await db.upload.update({ where: { id: upload.id }, data: { waveform } });
        updated++;
      } catch (error) {
        failed++;
        console.error(`  ${upload.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
    cursor = batch[batch.length - 1].id;
    console.log(`  ${seen}/${total} (updated ${updated}, skipped ${skipped}, failed ${failed})`);
  }
  console.log(`Done: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
