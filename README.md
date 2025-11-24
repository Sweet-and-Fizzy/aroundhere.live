# Local Music Listings

A service to aggregate local music events from multiple sources, making it easy to discover live shows in Western Massachusetts.

## Tech Stack

- **Frontend**: Nuxt 3 (Vue 3 + SSR)
- **Backend**: Nuxt server routes
- **Database**: PostgreSQL + PostGIS
- **ORM**: Prisma
- **Deployment**: Docker + DigitalOcean VPS

## Local Development

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- npm

### Quick Start (with Docker)

1. Clone the repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd local-music
   npm install
   ```

2. Start the database services:
   ```bash
   docker compose up -d
   ```

3. Set up the database:
   ```bash
   npm run db:push
   npm run db:generate
   npm run db:seed
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

Visit http://localhost:3000 to see the app.

### Alternative: Local PostgreSQL

If you prefer running PostgreSQL locally:

1. Create a PostgreSQL database with PostGIS:
   ```sql
   CREATE DATABASE local_music;
   \c local_music
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

2. Update `.env` with your connection string:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/local_music?schema=public"
   ```

3. Follow steps 3-4 from Quick Start above.

## Scripts

### Development
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Database
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes to database
- `npm run db:seed` - Seed database with sample data
- `npm run db:studio` - Open Prisma Studio

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking

## Production Deployment

### Initial Server Setup

1. Create a DigitalOcean Droplet (Ubuntu 24.04, 2GB RAM minimum)

2. SSH into the server and run the setup script:
   ```bash
   curl -sSL https://raw.githubusercontent.com/<your-repo>/main/scripts/setup-server.sh | bash
   ```

3. Configure environment variables:
   ```bash
   nano /opt/local-music/.env
   ```

   Required variables:
   ```
   POSTGRES_PASSWORD=your-secure-password
   DOMAIN=your-domain.com
   GITHUB_REPOSITORY=your-username/local-music
   ```

4. Copy production files to the server:
   ```bash
   scp docker-compose.prod.yml Caddyfile root@your-server:/opt/local-music/
   ```

5. Update Caddyfile with your domain:
   ```bash
   nano /opt/local-music/Caddyfile
   # Replace {$DOMAIN:localhost} with your domain
   ```

6. Start the services:
   ```bash
   cd /opt/local-music
   docker compose -f docker-compose.prod.yml up -d
   ```

### GitHub Actions Deployment

Add these secrets to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `SERVER_HOST` | Your server's IP address |
| `SERVER_USER` | SSH user (e.g., `root`) |
| `SERVER_SSH_KEY` | Private SSH key for deployment |

Once configured, pushing to `main` will automatically deploy.

### Backup & Restore

Backups run automatically at 2am daily. Manual commands:

```bash
# Create backup
./scripts/backup.sh

# Restore from backup
./scripts/restore.sh backups/local_music_20240101_020000.sql.gz
```

## Project Structure

```
/local-music
├── app/
│   ├── components/     # Vue components
│   ├── composables/    # Vue composables
│   └── pages/          # Nuxt pages
├── server/
│   ├── api/            # API routes
│   ├── scrapers/       # Scraper implementations (coming soon)
│   └── utils/          # Server utilities
├── prisma/
│   ├── schema.prisma   # Database schema
│   └── seed.ts         # Seed script
├── scripts/            # Deployment and maintenance scripts
├── .github/workflows/  # CI/CD pipelines
├── docker-compose.yml  # Local development services
├── docker-compose.prod.yml  # Production services
├── Dockerfile          # App container
├── Caddyfile           # Reverse proxy config
└── PLANNING.md         # Architecture docs
```

## Documentation

See [PLANNING.md](./PLANNING.md) for architecture decisions, MVP phases, and roadmap.

## License

MIT
