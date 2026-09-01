UPDATE subscriptions
   SET status = CASE
     WHEN status IN ('active', 'trialing', 'past_due') THEN status
     ELSE 'ended'
   END;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'trialing', 'past_due', 'ended'));
