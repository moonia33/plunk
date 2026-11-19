-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "smartSendingHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weeklyEmailCap" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quietHoursStart" INTEGER,
ADD COLUMN     "quietHoursEnd" INTEGER,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Vilnius';

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exitEvents" TEXT[] DEFAULT ARRAY[]::TEXT[];
