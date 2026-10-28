-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageType" ADD VALUE 'LOCATION';
ALTER TYPE "MessageType" ADD VALUE 'FILE';

-- AlterEnum
ALTER TYPE "UploadKind" ADD VALUE 'FILE';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "location_label" VARCHAR(200),
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "uploads" ADD COLUMN     "original_name" TEXT,
ALTER COLUMN "size" SET DATA TYPE BIGINT;

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "total_size" BIGINT NOT NULL,
    "received_size" BIGINT NOT NULL DEFAULT 0,
    "temp_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_sessions_owner_id_idx" ON "upload_sessions"("owner_id");

-- CreateIndex
CREATE INDEX "upload_sessions_updated_at_idx" ON "upload_sessions"("updated_at");

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

