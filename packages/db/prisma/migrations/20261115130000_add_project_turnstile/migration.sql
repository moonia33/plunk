-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "turnstileEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "turnstileSiteKey" TEXT,
ADD COLUMN     "turnstileSecret" TEXT,
ADD COLUMN     "turnstileHostnames" TEXT[] DEFAULT ARRAY[]::TEXT[];
