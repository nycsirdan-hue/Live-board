-- REVIEW ONLY: do not apply until the Studio125 LiveBoard bridge is approved.
-- Nullable columns preserve every manually-created LiveBoard entry.
ALTER TABLE public.board_entries
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_event_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS source_card_id TEXT,
  ADD COLUMN IF NOT EXISTS source_revision INTEGER,
  ADD COLUMN IF NOT EXISTS source_enabled BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_entries_source_card
ON public.board_entries(source_system, source_card_id);

CREATE INDEX IF NOT EXISTS idx_board_entries_source_event
ON public.board_entries(source_system, source_event_instance_id, source_enabled);
