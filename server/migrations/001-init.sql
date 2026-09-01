CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  auth_hash text NOT NULL,
  rec_auth_hash text NOT NULL,
  kdf_json jsonb NOT NULL,
  wrapped_by_password text NOT NULL,
  wrapped_by_recovery text NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  comped boolean NOT NULL DEFAULT false,
  stripe_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE devices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text NOT NULL,
  family text NOT NULL CHECK (family IN ('desktop', 'ios')),
  token_hash text NOT NULL UNIQUE,
  apns_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE vaults (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vault_history (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version integer NOT NULL,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, version)
);

CREATE TABLE watches (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, email_address)
);

CREATE TABLE allowed_emails (
  email text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE config (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO config (key, value) VALUES ('allowlist_enforced', 'true');

CREATE TABLE subscriptions (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL,
  plan text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  past_due_since timestamptz
);

CREATE TABLE stripe_events (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX watches_email_live_idx ON watches (email_address, expires_at);
CREATE INDEX devices_user_live_idx ON devices (user_id, revoked_at);
CREATE INDEX vault_history_user_version_idx ON vault_history (user_id, version DESC);
