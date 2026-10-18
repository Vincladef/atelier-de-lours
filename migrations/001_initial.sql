CREATE TABLE IF NOT EXISTS atelier_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('owner', 'learner')),
  notifications boolean NOT NULL DEFAULT false,
  reminders boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS atelier_settings (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO atelier_settings(key, enabled) VALUES ('gift_activated', false) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS atelier_magic_links (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES atelier_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS atelier_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES atelier_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atelier_sessions_expiry ON atelier_sessions(expires_at);
CREATE TABLE IF NOT EXISTS atelier_lessons (
  user_id uuid NOT NULL REFERENCES atelier_users(id) ON DELETE CASCADE,
  lesson_id integer NOT NULL CHECK (lesson_id BETWEEN 1 AND 16),
  phase text NOT NULL DEFAULT 'observe' CHECK (phase IN ('observe','draw','finish')),
  step integer NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 3),
  checked_steps integer[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  quiz_answer integer CHECK (quiz_answer BETWEEN 0 AND 2),
  ease text NOT NULL DEFAULT '',
  joy text NOT NULL DEFAULT '',
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS atelier_lessons_activity ON atelier_lessons(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS atelier_weekly_reviews (
  user_id uuid NOT NULL REFERENCES atelier_users(id) ON DELETE CASCADE,
  week integer NOT NULL CHECK (week BETWEEN 1 AND 8),
  easy text NOT NULL DEFAULT '',
  difficult text NOT NULL DEFAULT '',
  repeat text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week)
);
CREATE TABLE IF NOT EXISTS atelier_artworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES atelier_users(id) ON DELETE CASCADE,
  lesson_id integer CHECK (lesson_id BETWEEN 1 AND 16),
  title text NOT NULL,
  drawn_on date NOT NULL,
  note text NOT NULL DEFAULT '',
  blob_key text NOT NULL UNIQUE,
  width integer NOT NULL,
  height integer NOT NULL,
  byte_length integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS atelier_artworks_owner ON atelier_artworks(user_id, drawn_on DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS atelier_chat (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES atelier_users(id) ON DELETE CASCADE,
  lesson_id integer NOT NULL CHECK (lesson_id BETWEEN 1 AND 16),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  has_image boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atelier_chat_owner ON atelier_chat(user_id, id DESC);
CREATE TABLE IF NOT EXISTS atelier_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 1,
  resets_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS atelier_limits_expiry ON atelier_limits(resets_at);
CREATE TABLE IF NOT EXISTS atelier_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES atelier_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('welcome','weekly','congratulations','reminder')),
  week integer CHECK (week BETWEEN 1 AND 8),
  dedup_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atelier_email_pending ON atelier_email_queue(due_at) WHERE status IN ('pending','failed');
CREATE TABLE IF NOT EXISTS atelier_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES atelier_users(id),
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
