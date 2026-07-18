# ⌨ TypeBattle — Multiplayer Typing Speed Game

A real-time multiplayer typing game inspired by MonkeyType.

## Features

- **Student login** — search by name or student ID, pick your profile, default password `nimet` (changeable later)
- **Personal room codes** — each player gets a unique 3-digit room ID to share
- **Find match**, **solo practice**, or **join a friend's room** by code
- Up to **20 players** per room
- **Customizable races** — time, word count, words vs quotes, English/Khmer
- **Community quotes** — logged-in users can add quotes to the database
- Global leaderboard and persistent stats (PostgreSQL)

## Setup

### With Docker (recommended)

From the project root:

```bash
cp .env.example .env   # configure POSTGRES_PASSWORD (optional)
docker compose up -d

# After Postgres starts, export DATABASE_URL and start the server:
export DATABASE_URL=postgres://tb_user:tb_pass@localhost:5432/typebattle
npm install
node server.js
```

Open http://localhost:3000

### Standalone (requires PostgreSQL)

```bash
cd typebattle
npm install
DATABASE_URL=postgresql://app:password@localhost:5432/school_platform \
STUDENTS_JSON_PATH=../students.json \
PHOTOS_DIR=../photos \
node server.js
```

Without `DATABASE_URL`, the game runs in **guest-only mode** (profile search works, but login and leaderboard need the database).

## Auth API

| Method | Path | Body |
|--------|------|------|
| GET | `/api/profiles/search?q=` | Search students by name or ID |
| POST | `/api/auth/profile-login` | `{ studentId, password? }` — default password `nimet` |
| POST | `/api/auth/change-password` | `{ oldPassword, newPassword }` + Bearer token |
| POST | `/api/auth/logout` | Header: `Authorization: Bearer <token>` |
| GET | `/api/auth/me` | Header: `Authorization: Bearer <token>` |
| GET | `/api/leaderboard` | — |
| GET | `/api/quotes?lang=en` | List quotes |
| POST | `/api/quotes` | `{ text, author?, lang? }` + Bearer token |

## How to Play

1. **Guest** — enter a nickname, or **Student Login** — search your name/ID and log in with `nimet`
2. In the lobby, share your **3-digit room code** or join someone else's
3. Customize time, words/quotes, and language (host controls settings)
4. **Find Match** for auto matchmaking, **Solo Practice** to race alone, or **Start Race** when your room is ready
5. Type the displayed text as fast and accurately as possible

## Port

Default: `3000`. Change with `PORT=8080 node server.js`
