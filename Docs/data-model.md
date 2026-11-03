# DownNote Data Model

This document describes the database design behind the DownNote API (see `api-design.md`). It uses a relational database. The SQL is written to run in SQLite, and a note at the end of the section on `CREATE TABLE` explains what would change in PostgreSQL.

## Entities

- **users**: the people who have an account.
- **notes**: the notes that users write.
- **tags**: labels that a user creates, such as `work` or `personal`.
- **note_tags**: a join table that records which tags are attached to which notes.

## Tables and Columns

### users

| Column | Type | Key | Rules |
|--------|------|-----|-------|
| `id` | INTEGER | Primary key | Created by the database |
| `email` | TEXT | | Required, **unique** |
| `password_hash` | TEXT | | Required. Only a hash of the password is stored, never the password itself |
| `created_at` | TEXT | | Required, ISO 8601 time in UTC, set automatically |

### notes

| Column | Type | Key | Rules |
|--------|------|-----|-------|
| `id` | INTEGER | Primary key | Created by the database |
| `user_id` | INTEGER | Foreign key to `users(id)` | Required. The owner of the note |
| `title` | TEXT | | Required, 1 to 100 characters |
| `body` | TEXT | | Required, but can be empty (default `''`) |
| `created_at` | TEXT | | Required, set automatically |
| `updated_at` | TEXT | | Required, set automatically and changed on every update |

### tags

| Column | Type | Key | Rules |
|--------|------|-----|-------|
| `id` | INTEGER | Primary key | Created by the database |
| `user_id` | INTEGER | Foreign key to `users(id)` | Required. The user who owns the tag |
| `name` | TEXT | | Required, 1 to 30 characters. Unique for each user |

### note_tags

| Column | Type | Key | Rules |
|--------|------|-----|-------|
| `note_id` | INTEGER | Foreign key to `notes(id)`, part of the primary key | Required |
| `tag_id` | INTEGER | Foreign key to `tags(id)`, part of the primary key | Required |

The primary key of `note_tags` is the **pair** (`note_id`, `tag_id`), so the same tag cannot be attached to the same note twice.

## Relationships

```text
 users ----< notes >----< note_tags >----< tags >---- users
   1    many                 many  many    many   1
```

(`----<` means "one to many". It reads from the "one" side to the "many" side.)

- **users to notes is one-to-many.** One user can write many notes, but each note belongs to exactly one user. The foreign key `notes.user_id` stores this.
- **users to tags is one-to-many.** One user can create many tags, but each tag belongs to one user, so users never see each other's tags. The foreign key `tags.user_id` stores this.
- **notes to tags is many-to-many.** One note can have many tags, and one tag can be attached to many notes.
- **Why a join table is needed.** A table cell can hold only one value, so a note row cannot hold a list of tags and still be searched, counted or checked by a foreign key. The `note_tags` table solves this by holding one row for every note-and-tag pair. It turns the many-to-many relationship into two one-to-many relationships: one note has many `note_tags` rows, and one tag has many `note_tags` rows.
- **Normalisation.** Each fact is stored once. A tag's name lives in one row of `tags`, so renaming a tag changes one row and not every note that uses it.
- **Deleting.** If a user is deleted, their notes and tags are deleted too. If a note or a tag is deleted, its rows in `note_tags` are deleted too, so no orphan rows are left behind (`ON DELETE CASCADE`).

## CREATE TABLE Statements

```sql
PRAGMA foreign_keys = ON;  -- SQLite only enforces foreign keys when this is on

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name    TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
);
```

- `CHECK (length(title) BETWEEN 1 AND 100)` makes the database enforce the same 100-character limit as the API and the client, even if a bug skips the other checks.
- **In PostgreSQL**, the `id` columns would be `BIGINT GENERATED ALWAYS AS IDENTITY`, the dates would be `TIMESTAMPTZ DEFAULT now()`, and the `PRAGMA` line would not be needed, because foreign keys are always enforced.

## Example Queries

**1. List a user's newest notes, one page at a time** (serves `GET /notes`)

```sql
SELECT id, title, body, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

`LIMIT` and `OFFSET` give the paging: page 2 would use `OFFSET 20`.

**2. List a user's notes that have a given tag** (serves `GET /notes?tag=personal`). This query uses a `JOIN`.

```sql
SELECT notes.id, notes.title, tags.name AS tag
FROM notes
JOIN note_tags ON note_tags.note_id = notes.id
JOIN tags      ON tags.id = note_tags.tag_id
WHERE notes.user_id = 1
  AND tags.name = 'personal'
ORDER BY notes.created_at DESC;
```

The query goes from `notes` through the join table `note_tags` to `tags`.

**3. Count how many notes each of a user's tags has** (serves a tag list with counts)

```sql
SELECT tags.name, COUNT(note_tags.note_id) AS note_count
FROM tags
LEFT JOIN note_tags ON note_tags.tag_id = tags.id
WHERE tags.user_id = 1
GROUP BY tags.id, tags.name
ORDER BY note_count DESC, tags.name;
```

`LEFT JOIN` keeps tags that have no notes yet, which show a count of 0.

**4. Check who owns a note** (decides between `404` and `403` for `GET /notes/{id}`)

```sql
SELECT user_id FROM notes WHERE id = 42;
```

- No row means the note does not exist, so the API answers `404 Not Found`.
- A row whose `user_id` is not the caller means the answer is `403 Forbidden`.
- A row whose `user_id` is the caller means the note is returned.

**5. Create a note and attach a tag** (serves `POST /notes`)

```sql
INSERT INTO notes (user_id, title, body)
VALUES (1, 'Buy groceries', 'Milk, bread and eggs');

INSERT INTO note_tags (note_id, tag_id)
VALUES (last_insert_rowid(), 2);
```

Both inserts should run in one **transaction**, so either the note and its tag are both saved or neither is.

## Indexes

An index is a sorted lookup structure kept by the database. Without one, finding rows means reading the whole table. The primary keys and `UNIQUE` rules already create indexes automatically. These two are added on top:

```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id   ON note_tags (tag_id);
```

**`idx_notes_user_created` on `notes (user_id, created_at DESC)`**

- **Reason:** `GET /notes` is the most frequent request in the system, because the app is read-heavy. It filters by `user_id` and sorts by `created_at`, newest first (query 1). With a million users, `notes` could hold hundreds of millions of rows. Without this index, the database would read all of them and sort the result. With it, the database jumps straight to the caller's notes, which are already in the right order, and stops after the first 20.
- **Why two columns:** the index is sorted by `user_id` first and then by `created_at`, so one lookup both filters and sorts.
- **Trade-off:** the index takes extra storage, and every new note must also update it, so writes are slightly slower. That is a good trade here, because reads are far more frequent than writes.

**`idx_note_tags_tag_id` on `note_tags (tag_id)`**

- **Reason:** the primary key of `note_tags` is sorted by `note_id` first, so it helps when looking up a note's tags but not when looking up a tag's notes. Without this index, counting the notes of each tag (query 3) or finding which notes carry one tag means reading every row of `note_tags` (a `SCAN`). With it, the database goes straight to the rows of that tag.

## SQL or NoSQL?

I would choose SQL (a relational database) for DownNote. The data is structured and every note has the same fields. Its relationships are exactly what a relational database models well: users own notes, and notes and tags are linked many-to-many, which queries 2 and 3 answer with joins. Rules such as unique emails, a 100-character title, no duplicate tags on a note and no orphan rows are enforced by the database itself, and creating a note with its tags is a transaction that either fully happens or does not happen at all. A document database could store each note with its tags inside it, which makes a single read simple, but renaming a tag would mean updating every note that uses it, and nothing would stop a note from pointing at a user who no longer exists. A relational database handles one million users comfortably: with the indexes above, a primary database and read replicas (see `architecture.md`) can serve it, and the data could be split across servers by `user_id` if it ever outgrows one primary.