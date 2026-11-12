-- Product catalog: products pushed by the shop through /catalog/products and read at
-- render time through the `catalog` template variable. New, empty table, so building
-- its indexes inside the migration costs nothing.

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "parentId" TEXT,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "images" JSONB,
    "price" DECIMAL(12,2),
    "salePrice" DECIMAL(12,2),
    "currency" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "quantity" INTEGER,
    "brand" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "translations" JSONB,
    "data" JSONB,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_projectId_externalId_key" ON "products"("projectId", "externalId");

-- CreateIndex
CREATE INDEX "products_projectId_name_idx" ON "products"("projectId", "name");

-- CreateIndex
CREATE INDEX "products_projectId_sku_idx" ON "products"("projectId", "sku");

-- CreateIndex
CREATE INDEX "products_projectId_parentId_idx" ON "products"("projectId", "parentId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
