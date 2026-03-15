ALTER TABLE enrichment_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrichment_queue ADD COLUMN last_error TEXT;
CREATE INDEX idx_enrichment_queue_status ON enrichment_queue (status);
