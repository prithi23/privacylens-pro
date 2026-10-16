-- Additive integrity constraints: no rows are reset, deleted, or rewritten.
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "Session" ADD CONSTRAINT "Session_token_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
