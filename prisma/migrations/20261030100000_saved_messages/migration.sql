-- AlterEnum
ALTER TYPE "ConversationType" ADD VALUE 'SAVED';

-- DropIndex
DROP INDEX "messages_upload_id_key";

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "forward_from_conversation_id" UUID,
ADD COLUMN     "forward_from_message_id" UUID,
ADD COLUMN     "forward_from_name" TEXT,
ADD COLUMN     "forward_original_date" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "messages_upload_id_idx" ON "messages"("upload_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_forward_from_conversation_id_fkey" FOREIGN KEY ("forward_from_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_forward_from_message_id_fkey" FOREIGN KEY ("forward_from_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

