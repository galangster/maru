-- Comped addresses are a standing list, not a flag on users that exist
-- today: an address on the list is comped when it signs up, whenever that is.
CREATE TABLE IF NOT EXISTS comped_emails (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
