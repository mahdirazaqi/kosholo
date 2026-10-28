-- AlterTable
ALTER TABLE "uploads" ADD COLUMN     "medium_path" TEXT;

-- CreateTable
CREATE TABLE "profile_photos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "sort_key" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_photos_upload_id_key" ON "profile_photos"("upload_id");

-- CreateIndex
CREATE INDEX "profile_photos_user_id_sort_key_idx" ON "profile_photos"("user_id", "sort_key" DESC);

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data migration (idempotent, runs with `prisma migrate deploy`): every user who
-- already has an avatar gets it as their first ProfilePhoto, so nothing is lost.
-- Re-running is safe: upload_id is unique and conflicts are skipped.
INSERT INTO "profile_photos" ("id", "user_id", "upload_id", "sort_key", "created_at")
SELECT gen_random_uuid(), u."id", up."id", up."created_at", now()
FROM "users" u
JOIN "uploads" up
  ON up."id"::text = substring(u."avatar_url" from '^/api/media/([0-9a-f-]{36})$')
WHERE u."avatar_url" IS NOT NULL AND up."kind" = 'AVATAR' AND up."owner_id" = u."id"
ON CONFLICT ("upload_id") DO NOTHING;
