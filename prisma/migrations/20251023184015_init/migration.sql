-- CreateTable
CREATE TABLE "logos" (
    "ticker" VARCHAR(10) NOT NULL,
    "icon_url" TEXT,
    "logo_url" TEXT,
    "company_name" VARCHAR(255) NOT NULL,
    "exchange" VARCHAR(20),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logos_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "earnings" (
    "id" VARCHAR(50) NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(10),
    "date_confirmed" SMALLINT NOT NULL DEFAULT 0,
    "company_name" VARCHAR(255) NOT NULL,
    "exchange" VARCHAR(20),
    "currency" VARCHAR(5),
    "period" VARCHAR(10),
    "period_year" INTEGER,
    "eps_type" VARCHAR(10),
    "eps_estimate" DECIMAL(10,4),
    "eps_actual" DECIMAL(10,4),
    "eps_prior" DECIMAL(10,4),
    "eps_surprise" DECIMAL(10,4),
    "eps_surprise_percent" DECIMAL(10,4),
    "revenue_type" VARCHAR(10),
    "revenue_estimate" BIGINT,
    "revenue_actual" BIGINT,
    "revenue_prior" BIGINT,
    "revenue_surprise" BIGINT,
    "revenue_surprise_percent" DECIMAL(10,4),
    "importance" SMALLINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fundamentals" (
    "ticker" VARCHAR(10) NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "exchange" VARCHAR(20),
    "sector" VARCHAR(100),
    "industry" VARCHAR(100),
    "website" VARCHAR(255),
    "description" TEXT,
    "logo_url" TEXT,
    "market_cap" BIGINT,
    "shares_outstanding" BIGINT,
    "current_price" DECIMAL(12,4),
    "currency" VARCHAR(5),
    "price_to_earnings" DECIMAL(10,4),
    "price_to_book" DECIMAL(10,4),
    "price_to_sales" DECIMAL(10,4),
    "profit_margin" DECIMAL(10,4),
    "operating_margin" DECIMAL(10,4),
    "return_on_assets" DECIMAL(10,4),
    "return_on_equity" DECIMAL(10,4),
    "debt_to_equity" DECIMAL(10,4),
    "current_ratio" DECIMAL(10,4),
    "free_cashflow" BIGINT,
    "dividend_yield" DECIMAL(10,4),
    "dividend_rate" DECIMAL(10,4),
    "employees" INTEGER,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundamentals_pkey" PRIMARY KEY ("ticker")
);

-- CreateIndex
CREATE INDEX "idx_ticker_date" ON "earnings"("ticker", "date");

-- CreateIndex
CREATE INDEX "idx_date_importance" ON "earnings"("date", "importance");

-- CreateIndex
CREATE INDEX "idx_date" ON "earnings"("date");
