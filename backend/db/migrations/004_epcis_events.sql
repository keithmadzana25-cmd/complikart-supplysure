-- EPCIS 2.0 payloads and minimum two-year traceability retention.
BEGIN;

ALTER TABLE compliance_events
    ADD COLUMN epcis_event_json JSONB,
    ADD COLUMN gtin CHAR(14),
    ADD COLUMN quantity_uom VARCHAR(3),
    ADD COLUMN biz_step TEXT,
    ADD COLUMN retention_until TIMESTAMPTZ;

UPDATE compliance_events
SET retention_until = event_timestamp + INTERVAL '2 years';

CREATE INDEX compliance_events_retention_until_idx ON compliance_events (retention_until);
CREATE INDEX compliance_events_epcis_payload_idx ON compliance_events USING GIN (epcis_event_json);

COMMENT ON COLUMN compliance_events.retention_until IS
  'Earliest date this traceability event may be considered for archival; this value never triggers automatic deletion.';
COMMENT ON COLUMN compliance_events.epcis_event_json IS
  'Immutable EPCIS 2.0 JSON-LD event document captured when this event was recorded.';

COMMIT;
