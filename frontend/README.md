# Task Management — Frontend

React + Vite single-page application for the Task Management Web App.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

The development server starts at `http://localhost:5173`.

## Build

```bash
npm run build    # production build → dist/
npm run preview  # preview the production build locally
```

## API Integration

The frontend communicates with the backend Express server at `http://localhost:4000` via a Vite dev proxy. All requests use relative paths prefixed with `/api`, and the proxy forwards them to the backend. No CORS configuration is needed in development.

| Environment | URL                  | Purpose             |
| ----------- | -------------------- | ------------------- |
| Frontend    | `http://localhost:5173` | SPA client (Vite)  |
| Backend     | `http://localhost:4000` | REST API (Express) |

### Authentication

- After login or registration, the JWT is stored in `localStorage` under the key `taskmgmt_token`.
- Every request to protected endpoints includes `Authorization: Bearer <token>` automatically.
- On receiving a `401` response, the token is cleared and the user is redirected to `/login`.

### API Endpoints Used

| Method   | Path                        | Auth Required |
| -------- | --------------------------- | ------------- |
| POST     | `/api/auth/register`        | No            |
| POST     | `/api/auth/login`           | No            |
| GET      | `/api/tasks?status=`        | Yes           |
| POST     | `/api/tasks`                | Yes           |
| GET      | `/api/tasks/:id`            | Yes           |
| PUT      | `/api/tasks/:id`            | Yes           |
| PATCH    | `/api/tasks/:id/status`     | Yes           |
| DELETE   | `/api/tasks/:id`            | Yes           |

All task fields use **camelCase** (`userId`, `createdAt`, `dueDate`) as per the API contract.

### Error Handling

All non-2xx responses are parsed from `{ error: { code, message } }` format and displayed to the user in an error banner. Common scenarios:

- `VALIDATION_ERROR` (400) — shows field-level validation feedback
- `UNAUTHORIZED` (401) — clears token, redirects to login
- `CONFLICT` (409) — shown on duplicate email during registration
