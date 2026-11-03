# DownNote API Design

This document describes the real API that the backend team should build for DownNote (the QuickNotes online service). It replaces the JSONPlaceholder practice API that the front end uses today.

## Overview

- **Base URL:** `https://api.downnote.example/v1`
- **Format:** all requests and responses use JSON (`Content-Type: application/json`).
- **Resources:** `users`, `notes` and `tags`. Resource names are plural nouns, and the HTTP method says what to do, so the paths contain no verbs.
- **Versioning:** the version is part of the path (`/v1`), so the API can change later without breaking existing clients.
- **Authentication:** every endpoint except registering and logging in needs the header `Authorization: Bearer <token>`. The token is returned by the login endpoint.
- **Ownership:** each user can only see and change their own notes and tags. The server finds the user from the token, so the client never sends a user id.
- **Dates:** timestamps use ISO 8601 in UTC, for example `2026-11-05T09:30:00Z`.
- **Paging:** lists are paged with `page` and `limit`, so one request never returns thousands of notes.

## Data Shapes

A **note**:

```json
{
  "id": 42,
  "title": "Buy groceries",
  "body": "Milk, bread and eggs",
  "tags": [{ "id": 2, "name": "personal" }],
  "createdAt": "2026-11-05T09:30:00Z",
  "updatedAt": "2026-11-05T09:30:00Z"
}
```

- `title` is required, at most 100 characters.
- `body` is optional.
- `tags` is a list of the user's tags that are attached to the note.

A **tag**:

```json
{ "id": 2, "name": "personal" }
```

## Endpoints

| # | Method | Path | Description | Token needed | Success status |
|---|--------|------|-------------|--------------|----------------|
| 1 | `POST` | `/users` | Register a new account | No | `201 Created` |
| 2 | `POST` | `/auth/login` | Log in and receive an access token | No | `200 OK` |
| 3 | `GET` | `/notes` | List the user's notes (paged, can be filtered) | Yes | `200 OK` |
| 4 | `GET` | `/notes/{id}` | Get one note | Yes | `200 OK` |
| 5 | `POST` | `/notes` | Create a note | Yes | `201 Created` |
| 6 | `PUT` | `/notes/{id}` | Replace a note's title, body and tags | Yes | `200 OK` |
| 7 | `DELETE` | `/notes/{id}` | Delete a note | Yes | `204 No Content` |
| 8 | `GET` | `/tags` | List the user's tags | Yes | `200 OK` |
| 9 | `POST` | `/tags` | Create a tag | Yes | `201 Created` |
| 10 | `PUT` | `/notes/{id}/tags/{tagId}` | Attach a tag to a note | Yes | `204 No Content` |
| 11 | `DELETE` | `/notes/{id}/tags/{tagId}` | Remove a tag from a note | Yes | `204 No Content` |

Notes on the table:

- `{id}` and `{tagId}` are path parameters. They identify one specific note or tag.
- `GET /notes` accepts these **query parameters**, all optional:
  - `page`: the page number, starting at 1 (default 1)
  - `limit`: notes per page (default 20, maximum 100)
  - `tag`: only notes with this tag name
  - `search`: only notes whose title or body contains this text
- Notes are returned newest first.
- `PUT` replaces the whole note, so the request must contain all of its fields. Repeating the same `PUT` or `DELETE` gives the same result.
- A successful `DELETE` returns `204` with no body, because the note no longer exists.

## Request and Response Examples

### Create a note

**Request:** `POST /v1/notes`

```http
POST /v1/notes
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
```

```json
{
  "title": "Buy groceries",
  "body": "Milk, bread and eggs",
  "tagIds": [2]
}
```

**Response:** `201 Created`, with the header `Location: /v1/notes/42`

```json
{
  "id": 42,
  "title": "Buy groceries",
  "body": "Milk, bread and eggs",
  "tags": [{ "id": 2, "name": "personal" }],
  "createdAt": "2026-11-05T09:30:00Z",
  "updatedAt": "2026-11-05T09:30:00Z"
}
```

The server chooses the `id` and the dates, so the client never sends them.

### List notes

**Request:** `GET /v1/notes?page=1&limit=2&tag=personal`

```http
GET /v1/notes?page=1&limit=2&tag=personal
Authorization: Bearer eyJhbGciOi...
```

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": 42,
      "title": "Buy groceries",
      "body": "Milk, bread and eggs",
      "tags": [{ "id": 2, "name": "personal" }],
      "createdAt": "2026-11-05T09:30:00Z",
      "updatedAt": "2026-11-05T09:30:00Z"
    },
    {
      "id": 40,
      "title": "Call Mum",
      "body": "",
      "tags": [{ "id": 2, "name": "personal" }],
      "createdAt": "2026-11-04T18:05:00Z",
      "updatedAt": "2026-11-04T18:05:00Z"
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 7
}
```

The list is wrapped in an object so it can carry the paging information (`page`, `limit` and `total`) next to the notes.

### Log in

**Request:** `POST /v1/auth/login`

```json
{
  "email": "wanjiru@example.com",
  "password": "a-long-secret-password"
}
```

**Response:** `200 OK`

```json
{
  "token": "eyJhbGciOi...",
  "expiresIn": 3600
}
```

## Error Codes

Every error uses the same body, so the client can always read it the same way:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The title must be 100 characters or fewer.",
    "details": [{ "field": "title", "issue": "too_long", "maxLength": 100 }]
  }
}
```

| Status | Meaning | When it happens |
|--------|---------|-----------------|
| `400 Bad Request` | The request is invalid | A `POST /notes` has no `title`, or the title is longer than 100 characters, or the JSON is broken |
| `401 Unauthorized` | The caller is not logged in | The `Authorization` header is missing, or the token is invalid or expired |
| `403 Forbidden` | Logged in, but not allowed | A user asks for `GET /notes/42` and note 42 belongs to someone else |
| `404 Not Found` | The thing does not exist | `GET /notes/9999` when no note has that id |
| `409 Conflict` | The request clashes with existing data | `POST /users` with an email address that is already registered |
| `429 Too Many Requests` | Too many requests too fast | A client sends hundreds of login attempts in a minute (rate limiting) |
| `500 Internal Server Error` | Something broke on the server | An unexpected failure, such as the database being unreachable |

Example error bodies:

**400 Bad Request**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A title is required.",
    "details": [{ "field": "title", "issue": "required" }]
  }
}
```

**401 Unauthorized**

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "The access token is missing or has expired. Please log in again."
  }
}
```

**403 Forbidden**

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this note."
  }
}
```

**404 Not Found**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No note with id 9999 exists."
  }
}
```

**409 Conflict**

```json
{
  "error": {
    "code": "EMAIL_ALREADY_REGISTERED",
    "message": "An account with this email address already exists."
  }
}
```

**429 Too Many Requests** (with the header `Retry-After: 60`)

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please wait a minute and try again."
  }
}
```

**500 Internal Server Error**

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong on our side. Please try again later.",
    "requestId": "req_8f2c1a"
  }
}
```

- The 500 body never shows internal details such as database errors, because they could help an attacker. The `requestId` lets the team find the problem in the logs.
- The 401 and 403 are different on purpose: 401 means the server does not know who you are, and 403 means it knows who you are and the answer is no.

## How the Current Client Maps to This API

The client in this repository talks to JSONPlaceholder today. It would move to the real API like this:

| Client action | JSONPlaceholder call (today) | Real API call (after the move) |
|---|---|---|
| Load notes | `GET /posts?_limit=10` | `GET /notes?limit=10` |
| Create a note | `POST /posts` with `{ title, body, userId: 1 }` | `POST /notes` with `{ title, body }` |
| Delete a note | `DELETE /posts/{id}` | `DELETE /notes/{id}` |

What changes:

- **No `userId` in the body.** The real server finds the user from the token, so the client cannot pretend to be someone else.
- **A login step.** The client must send the token with every request.
- **Notes are really stored.** JSONPlaceholder only pretends to save a note and always answers with id `101`. The real API stores it and returns its own id, so the special handling for created notes is no longer needed.
- **The error body is richer.** The client can show the `message` from the server, for example when the title is too long.