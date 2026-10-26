-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'SYSTEM';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "meta" JSONB;

