ALTER TABLE atelier_users ADD COLUMN training_run uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE atelier_users ADD COLUMN training_started_at timestamptz;
UPDATE atelier_users SET training_started_at=created_at;
ALTER TABLE atelier_users ALTER COLUMN training_started_at SET DEFAULT now();
ALTER TABLE atelier_users ALTER COLUMN training_started_at SET NOT NULL;
ALTER TABLE atelier_email_queue ADD COLUMN training_run uuid;
UPDATE atelier_email_queue q SET training_run=u.training_run FROM atelier_users u WHERE u.id=q.user_id;
ALTER TABLE atelier_email_queue ALTER COLUMN training_run SET NOT NULL;
CREATE INDEX atelier_email_cycle ON atelier_email_queue(user_id,training_run,kind);
UPDATE atelier_email_queue SET dedup_key=dedup_key || ':' || training_run::text;
CREATE UNIQUE INDEX atelier_one_invitation_per_cycle ON atelier_email_queue(user_id,training_run) WHERE kind='welcome';
CREATE TABLE atelier_mail_lock (
  key text PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
