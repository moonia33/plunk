-- Signup forms served to shops through /forms/embed.js. New, empty table.

-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('INLINE', 'POPUP', 'SLIDE_IN', 'BAR', 'PAGE');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FormType" NOT NULL DEFAULT 'INLINE',
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "fields" JSONB,
    "rules" JSONB,
    "style" JSONB,
    "doubleOptIn" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forms_projectId_status_idx" ON "forms"("projectId", "status");

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
