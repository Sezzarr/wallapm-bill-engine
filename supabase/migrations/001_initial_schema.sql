-- Properties: physical locations associated with utility bills
CREATE TABLE properties (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    address     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bills: parsed and enriched bill records
CREATE TABLE bills (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source                TEXT,
    vendor                TEXT,
    amount                NUMERIC(12, 2),
    billing_period_start  DATE,
    billing_period_end    DATE,
    account_number        TEXT,
    utility_type          TEXT,
    property_id           UUID REFERENCES properties(id) ON DELETE SET NULL,
    status                TEXT NOT NULL DEFAULT 'pending',
    raw_payload           JSONB,
    confidence_score      NUMERIC(4, 3),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bill status log: audit trail for status transitions
-- Ownership is derived through bills — no user_id column needed here
CREATE TABLE bill_status_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id     UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    status      TEXT NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note        TEXT
);

-- Raw uploads: tracks files ingested into the system
CREATE TABLE raw_uploads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    file_type     TEXT NOT NULL,
    storage_path  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_status_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_uploads      ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- properties
-- ------------------------------------------------------------
CREATE POLICY "properties: select own"
    ON properties FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "properties: insert own"
    ON properties FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "properties: update own"
    ON properties FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "properties: delete own"
    ON properties FOR DELETE
    USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- bills
-- ------------------------------------------------------------
CREATE POLICY "bills: select own"
    ON bills FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "bills: insert own"
    ON bills FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "bills: update own"
    ON bills FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "bills: delete own"
    ON bills FOR DELETE
    USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- bill_status_log  (access derived through parent bill)
-- ------------------------------------------------------------
CREATE POLICY "bill_status_log: select own"
    ON bill_status_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bills
            WHERE bills.id = bill_status_log.bill_id
              AND bills.user_id = auth.uid()
        )
    );

CREATE POLICY "bill_status_log: insert own"
    ON bill_status_log FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bills
            WHERE bills.id = bill_status_log.bill_id
              AND bills.user_id = auth.uid()
        )
    );

CREATE POLICY "bill_status_log: update own"
    ON bill_status_log FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bills
            WHERE bills.id = bill_status_log.bill_id
              AND bills.user_id = auth.uid()
        )
    );

CREATE POLICY "bill_status_log: delete own"
    ON bill_status_log FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM bills
            WHERE bills.id = bill_status_log.bill_id
              AND bills.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------
-- raw_uploads
-- ------------------------------------------------------------
CREATE POLICY "raw_uploads: select own"
    ON raw_uploads FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "raw_uploads: insert own"
    ON raw_uploads FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "raw_uploads: update own"
    ON raw_uploads FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "raw_uploads: delete own"
    ON raw_uploads FOR DELETE
    USING (user_id = auth.uid());
