-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "cleared_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "reply_to_deleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "message_hides" (
    "user_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_hides_pkey" PRIMARY KEY ("user_id","message_id")
);

-- CreateIndex
CREATE INDEX "message_hides_message_id_idx" ON "message_hides"("message_id");

-- AddForeignKey
ALTER TABLE "message_hides" ADD CONSTRAINT "message_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_hides" ADD CONSTRAINT "message_hides_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

