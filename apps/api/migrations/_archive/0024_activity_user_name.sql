-- Migrazione: Aggiunge colonna user_name alla tabella activity_logs
-- Permette di mostrare il nome dell'utente invece dell'email nell'attività recente
ALTER TABLE activity_logs ADD COLUMN user_name TEXT;
