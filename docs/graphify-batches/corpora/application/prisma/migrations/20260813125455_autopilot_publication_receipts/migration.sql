-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "destination" TEXT,
ADD COLUMN     "mediaChecksum" TEXT,
ADD COLUMN     "metadataHash" TEXT,
ADD COLUMN     "version" TEXT;
