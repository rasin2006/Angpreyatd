# Deployment Guide — Path A (Combined Platform)

This project runs as a **combined school platform**:

- **NFC Attendance** (Flask) — student check-in, admin dashboard, reports
- **TypeBattle** (Node.js) — multiplayer typing game with shared PostgreSQL accounts
- **PostgreSQL** — TypeBattle users, sessions, match history
- **Caddy** — HTTPS reverse proxy for both apps

## Prerequisites

- Docker and Docker Compose
- A server (Oracle Cloud Always Free VM recommended) or local machine for testing

## Quick start (local)

```bash
# 1. Configure secrets
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and ADMIN_PIN at minimum

# 2. Start all services
docker compose up -d --build

# 3. Open in browser
# Attendance:  http://localhost:8080  (or http://attendance.localhost via Caddy)
# TypeBattle:   http://localhost:3000  (or http://type.localhost via Caddy)
```

## Production deployment

For a public deployment, copy the production environment example and configure your real hosts and secrets:

```bash
cp .env.production.example .env
```

Then edit `.env` and set at least:

- `POSTGRES_PASSWORD`
- `ADMIN_PIN`
- `SESSION_SECRET`
- `ATTENDANCE_HOST=attendance.example.com`
- `TYPEBATTLE_HOST=typebattle.example.com`
- `PUBLIC_SERVER_URL=https://attendance.example.com`
- `ESP32_API_KEY`

Ensure your DNS records point the chosen domains to the server IP and open ports `80` and `443` for Caddy to provision HTTPS.

If you are only testing locally, keep `ATTENDANCE_HOST=attendance.localhost` and `TYPEBATTLE_HOST=type.localhost` and add those names to your `/etc/hosts` file.

Add to `/etc/hosts` for Caddy host routing:

```
127.0.0.1 attendance.localhost type.localhost
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 (internal) | Shared database |
| `attendance-system` | 8080 | Flask + Gunicorn |
| `typebattle` | 3000 | Node.js + WebSockets |
| `caddy` | 80, 443 | Reverse proxy |

## Production checklist

- [ ] Set strong `POSTGRES_PASSWORD` and `ADMIN_PIN` in `.env`
- [ ] Set `PUBLIC_SERVER_URL` for ESP32 cloud mode
- [ ] Point DNS `ATTENDANCE_HOST` and `TYPEBATTLE_HOST` to your server IP
- [ ] Caddy auto-provisions HTTPS when using real domain names
- [ ] Keep `students.json` and `photos/` backed up (volume mounts in compose)
- [ ] Do **not** commit `.env` or real student data to git

## Oracle Cloud (free VPS)

1. Create an **Always Free** ARM VM (Ubuntu 22.04, 4 OCPU / 24 GB RAM).
2. Open firewall ports **80**, **443**, and optionally **8080** / **3000** for direct access.
3. Install Docker: `curl -fsSL https://get.docker.com | sh`
4. Clone this repo, configure `.env`, run `docker compose up -d --build`.
5. Set DNS A records for your domains to the VM public IP.

## Fly.io (managed Docker)

Deploy each service separately or use Fly Machines with a Postgres cluster. Mount a Fly volume for attendance JSON/CSV/photos if hosting Flask there.

## TypeBattle accounts

- **Register** at `http://type.localhost` (or port 3000)
- Optional `student_id` links a game account to an attendance student ID
- Match results persist to PostgreSQL automatically after each race
- Global leaderboard: `GET /api/leaderboard`

## ESP32 / NFC hardware

See [esp32/README.md](./esp32/README.md) for cloud URL configuration.

For on-site-only NFC, keep `SERVER_URL` as local IP — no cloud changes needed.

## Health checks

```bash
curl http://localhost:8080/api/health
curl http://localhost:3000/api/health
```

## Stopping

```bash
docker compose down
# Add -v to remove postgres volume (deletes TypeBattle accounts!)
```
