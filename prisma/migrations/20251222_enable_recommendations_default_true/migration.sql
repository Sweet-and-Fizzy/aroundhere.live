-- Change enableRecommendations default to true for new users
ALTER TABLE "users" ALTER COLUMN "enableRecommendations" SET DEFAULT true;
