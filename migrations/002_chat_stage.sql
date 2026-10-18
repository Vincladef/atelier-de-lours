-- Keep the exercise context with each exchange, including after moving on.
ALTER TABLE atelier_chat ADD COLUMN phase text CHECK (phase IN ('observe','draw','finish'));
ALTER TABLE atelier_chat ADD COLUMN step integer CHECK (step BETWEEN 0 AND 3);
CREATE INDEX atelier_chat_lesson ON atelier_chat(user_id, lesson_id, id DESC);
