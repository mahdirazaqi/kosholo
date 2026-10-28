-- AlterEnum
ALTER TYPE "ConversationType" ADD VALUE 'CHANNEL';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "description" VARCHAR(255),
ADD COLUMN     "invite_token" TEXT,
ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "sign_messages" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_invite_token_key" ON "conversations"("invite_token");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

