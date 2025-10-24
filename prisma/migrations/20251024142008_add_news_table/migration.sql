-- CreateTable
CREATE TABLE "news" (
    "id" VARCHAR(100) NOT NULL,
    "ticker" VARCHAR(10),
    "title" TEXT NOT NULL,
    "author" VARCHAR(255),
    "published_utc" TIMESTAMP(6) NOT NULL,
    "article_url" TEXT NOT NULL,
    "image_url" TEXT,
    "description" TEXT,
    "publisher_name" VARCHAR(255) NOT NULL,
    "publisher_url" TEXT,
    "publisher_logo" TEXT,
    "tickers" VARCHAR(10)[],
    "keywords" VARCHAR(100)[],
    "sentiment" VARCHAR(20),
    "sentiment_score" DECIMAL(5, 4),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ticker_published" ON "news"("ticker", "published_utc");

-- CreateIndex
CREATE INDEX "idx_published" ON "news"("published_utc");

