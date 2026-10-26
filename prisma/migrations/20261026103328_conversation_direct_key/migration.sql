-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "direct_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");

