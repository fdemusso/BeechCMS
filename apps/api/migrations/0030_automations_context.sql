-- Sprint 6: add optional context-load declarations to automations
ALTER TABLE automations ADD COLUMN context TEXT NULL;
