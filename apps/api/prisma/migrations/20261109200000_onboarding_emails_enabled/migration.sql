-- ABA-738: opt-out flag for the activation e-mail. Default true so existing users can be reached once;
-- the signed unsubscribe link in that e-mail sets it to false.
ALTER TABLE "users" ADD COLUMN "onboarding_emails_enabled" BOOLEAN NOT NULL DEFAULT true;
