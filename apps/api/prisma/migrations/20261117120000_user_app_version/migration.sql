-- ABA-813: the app build and platform that last made an authenticated request, for the admin users table.
ALTER TABLE "users" ADD COLUMN "app_version" TEXT;
ALTER TABLE "users" ADD COLUMN "app_platform" TEXT;
