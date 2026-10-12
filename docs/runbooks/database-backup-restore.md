# Database backups and restore

## How backups work

`scripts/backup.sh` (copied to the droplet by the deploy workflow) runs nightly from the deploy user's crontab on the droplet. It dumps the `local_music` database in Postgres custom format, checks the dump is a plausible size and readable by `pg_restore`, copies it to a private R2 bucket, then deletes local dumps older than 7 days. Any failed step posts to Slack. The daily scraper-health digest also checks `/backups` and posts if the newest dump is missing, older than 26 hours, or suspiciously small, so a backup job that stops running entirely still gets noticed.

Local dumps live in `/opt/local-music/backups/` (mounted into the db container at `/backups`). Off-box copies live in the bucket named by `BACKUP_R2_BUCKET`. That bucket must be private: dumps contain user emails and password hashes.

## One-time setup

1. In Cloudflare, create a private R2 bucket (no public access, no custom domain), for example `aroundhere-backups`, and add a lifecycle rule deleting objects after 30 days.
2. Create an R2 API token with Object Read & Write scoped to that bucket only.
3. Add to `/opt/local-music/.env` on the droplet:

   ```
   BACKUP_R2_ACCOUNT_ID=<cloudflare account id>
   BACKUP_R2_ACCESS_KEY_ID=<token access key id>
   BACKUP_R2_SECRET_ACCESS_KEY=<token secret>
   BACKUP_R2_BUCKET=aroundhere-backups
   ```

4. Run it once by hand and confirm it ends with "Backup completed":

   ```
   ssh deploy@138.197.34.3 "bash /opt/local-music/scripts/backup.sh"
   ```

5. Install the schedule (`crontab -e` as deploy):

   ```
   15 2 * * * bash /opt/local-music/scripts/backup.sh >> /opt/local-music/backups/backup.log 2>&1
   ```

## Test a restore (do this after setup, then every few months)

Restore into a scratch database next to the real one, check row counts, and drop it. This never touches `local_music`.

```
ssh deploy@138.197.34.3
LATEST=$(ls -t /opt/local-music/backups/local_music_*.dump | head -1 | xargs basename)
docker exec aroundhere-db createdb -U postgres restore_test
docker exec aroundhere-db pg_restore -U postgres -d restore_test --no-owner "/backups/$LATEST"
docker exec aroundhere-db psql -U postgres -d restore_test -c "SELECT (SELECT count(*) FROM venues) venues, (SELECT count(*) FROM events) events, (SELECT count(*) FROM users) users;"
docker exec aroundhere-db psql -U postgres -d local_music -c "SELECT (SELECT count(*) FROM venues) venues, (SELECT count(*) FROM events) events, (SELECT count(*) FROM users) users;"
docker exec aroundhere-db dropdb -U postgres restore_test
```

The counts should match, give or take events scraped since the dump.

## Restore for real

Only after deciding the live database is lost or corrupted. Take a dump of the current state first if the database is reachable at all.

1. Stop writers: `docker compose -f /opt/local-music/docker-compose.prod.yml stop app cron`
2. If the local dump is gone, fetch the newest off-box copy:

   ```
   docker run --rm -e AWS_ACCESS_KEY_ID=<key> -e AWS_SECRET_ACCESS_KEY=<secret> -e AWS_DEFAULT_REGION=auto \
     -v /opt/local-music/backups:/b amazon/aws-cli \
     s3 cp s3://aroundhere-backups/<file>.dump /b/ --endpoint-url https://<account>.r2.cloudflarestorage.com
   ```

3. Recreate and restore:

   ```
   docker exec aroundhere-db dropdb -U postgres local_music
   docker exec aroundhere-db createdb -U postgres local_music
   docker exec aroundhere-db pg_restore -U postgres -d local_music --no-owner /backups/<file>.dump
   ```

4. Start writers again: `docker compose -f /opt/local-music/docker-compose.prod.yml start app cron`
