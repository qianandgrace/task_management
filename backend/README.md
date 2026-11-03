# Task Management Backend

Express + SQLite REST API for the Task Management Web App.

## Quick Start

```bash
cd backend
npm install
npm start
```

Or in development mode (auto-restart on file change):

```bash
npm run dev
```

The server starts on **port 4000** by default.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Listening port | `4000` |
| `JWT_SECRET` | Secret for signing JWT tokens | `dev-secret-change-me` |

Copy `.env.example` to `.env` and set your values.

## Database

- SQLite database stored at `backend/data/tasks.db` (auto-created on first run).
- Directory and file are gitignored — not committed to repo.
- Schema initialization runs automatically via `CREATE TABLE IF NOT EXISTS`.

## Endpoints

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/auth/register` | No | 201 | Register new user |
| POST | `/api/auth/login` | No | 200 | Login and get JWT |
| GET | `/api/tasks?status=` | Yes | 200 | List tasks (filter by status) |
| POST | `/api/tasks` | Yes | 201 | Create task |
| GET | `/api/tasks/:id` | Yes | 200 | Get task detail |
| PUT | `/api/tasks/:id` | Yes | 200 | Update task fully |
| PATCH | `/api/tasks/:id/status` | Yes | 200 | Update task status only |
| DELETE | `/api/tasks/:id` | Yes | 204 | Delete task |

### Example: Register

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123","name":"Alice"}'
```

### Example: Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}'
```

### Example: Create Task (authenticated)

```bash
curl -X POST http://localhost:4000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title":"Build backend API"}'
```

### Example: List Tasks

```bash
curl http://localhost:4000/api/tasks \
  -H "Authorization: Bearer <token>"
```

## Error Format

All non-2xx responses return:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable description" } }
```

Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`.
