-- Aggiunge colonna draft_data per supportare la feature "bozza in attesa".
-- Nullable: NULL = nessuna bozza pendente, TEXT = JSON con Botanical IDs (stesso formato di data).
ALTER TABLE content_entries ADD COLUMN draft_data TEXT;
