-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('IMAGE', 'VIDEO', 'VOICE', 'AVATAR');

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "duration",
DROP COLUMN "media_url",
ADD COLUMN     "upload_id" UUID;

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "path" TEXT NOT NULL,
    "thumb_path" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "placeholder" TEXT,
    "waveform" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploads_created_at_idx" ON "uploads"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_upload_id_key" ON "messages"("upload_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

