# DownNote Architecture

This document describes the system design for taking DownNote from a browser-only app to an online service for 1 million users. It builds on the API in `api-design.md` and the database in `data-model.md`.

## Requirements

### Functional requirements

What the system must do:

- A user can register and log in.
- A user can create, view, edit and delete their own notes.
- A user can create tags and attach them to notes.
- A user can list notes one page at a time, filter them by tag and search them by text.
- Each user can see only their own notes and tags.
- The front end works on phones and computers.

### Non-functional requirements

How well the system must do it:

- **Availability:** 99.9% uptime, which allows about 8.8 hours of downtime per year (0.1% of 8,760 hours). No single failure should take the service down.
- **Performance:** 95% of API requests answered in under 300 ms, and the notes list shown quickly.
- **Scalability:** supports 1 million users now, and can grow by adding servers and not by rewriting the system.
- **Durability:** a saved note is never lost, which means backups and a second copy of the data.
- **Consistency:** a user sees a note they just created straight away.
- **Security:** HTTPS everywhere, hashed passwords, token authentication, input validation and rate limiting.
- **Observability:** logs, metrics and alerts, so problems are found before users report them.

## Load Estimate for 1 Million Users

### Assumptions

- Registered users: 1,000,000
- Active each day: 10%
- Each active user per day: opens or refreshes their notes 50 times (reads), creates 3 notes, edits 2 and deletes 1 (6 writes)
- Average note: 1 KB of data (title, body and details)
- One day = 86,400 seconds
- Peak traffic = 5 × average
- Units are decimal: 1 GB = 1,000 MB, 1 MB = 1,000 KB

### Calculations

- **Daily active users** = 1,000,000 × 10% = **100,000**
- **Reads per second**
  - Reads per day = 100,000 × 50 = 5,000,000
  - Average = 5,000,000 ÷ 86,400 ≈ **58 reads/s**
  - Peak = 5 × 57.9 ≈ **290 reads/s**
- **Writes per second**
  - Writes per day = 100,000 × 6 = 600,000
  - Average = 600,000 ÷ 86,400 ≈ **7 writes/s**
  - Peak = 5 × 6.9 ≈ **35 writes/s**
- **Storage per year**
  - New notes per day = 100,000 × 3 = 300,000
  - New notes per year = 300,000 × 365 ≈ 110 million
  - Note data = 110,000,000 × 1 KB ≈ **110 GB per year** (deletes are ignored, which makes this a safe upper estimate)
  - Indexes and overhead roughly double it, so about 220 GB per year for each copy of the database. The read replica holds a second copy.

### What the numbers tell us

- **The system is read-heavy:** about 8 reads for every write (58 ÷ 7 ≈ 8).
- **The load is modest.** 290 reads per second at peak is within what one well-tuned server can handle, and 5 years of data is about 1.1 TB per copy, which fits on one database server.
- **So the design is driven by availability more than raw capacity.** We use several servers so that no single failure stops the service, and we add a cache and a read replica because the system is read-heavy. If the user count grew ten times, the same design would grow by adding app servers and replicas.

## Architecture Diagram

```text
                          [ Client (browser) ]
                                    |
          +-------------------------+-------------------------+
          | 1. name lookup          | 2. web page files       | 3. API calls
          v                         v                         v
       [ DNS ]                   [ CDN ]              [ Load balancer ]
                                                              |
                                                    +---------+---------+
                                                    v                   v
                                            [ App server 1 ]    [ App server 2 ]
                                                    |                   |
            +---------------------+-----------------+---+---------------+
            | check cache         | writes              | cache miss    | jobs
            v                     v                     v               v
        [ Cache ]          [ Primary DB ] -->   [ Read replica ]    [ Queue ]
                            (replicates to the replica) ^               |
                                                        | reads data    v
                                                        +----------> [ Worker ]
                                                                emails, exports
```

- **1. name lookup:** the client asks DNS for the address of `api.downnote.example`.
- **2. web page files:** the HTML, CSS and JavaScript of the front end come from the CDN.
- **3. API calls:** requests for notes go to the load balancer, then to one of the app servers.
- **Check cache, writes, cache miss, jobs:** each app server reads from the cache first, writes to the primary database, reads from the read replica when the cache has no answer, and puts background jobs on the queue.
- **Replication:** the primary database copies every change to the read replica.
- **Worker:** takes jobs from the queue and, when it needs data, reads it from the read replica.

## What Each Component Does

- **Client:** the DownNote page in the user's browser, which shows the notes and sends requests to the API.
- **DNS:** turns the name `api.downnote.example` into an address, which solves users having to remember numbers and lets us move servers without changing the name.
- **CDN:** serves the static front-end files from servers near the user, which solves slow page loads and takes that traffic away from our own servers.
- **Load balancer:** spreads incoming API requests across the app servers and stops sending requests to a server that is down, which solves overload and one server failing.
- **App servers (two or more):** run the API code, including login checks and validation, and because they keep no user data in memory any of them can answer any request, which solves running out of capacity and survives a server failing.
- **Cache:** keeps recently used results in memory, such as a user's first page of notes, which solves the database answering the same read again and again.
- **Primary database:** stores all users, notes and tags and accepts every write, which solves the need for one reliable, consistent source of truth.
- **Read replica:** a live copy of the primary database that only answers reads, which solves read traffic overloading the primary and gives us a ready copy if the primary fails.
- **Queue:** holds background jobs, such as sending a welcome email, until a worker is free, which solves making the user wait for slow work and smooths out sudden bursts.
- **Worker:** takes jobs from the queue and does them, such as sending emails and building data exports, which solves slow work slowing down the app servers.

## Request Flows

### GET /notes (list the user's notes)

1. The client sends `GET /v1/notes` with the user's token. It finds the address through **DNS**, and the request arrives at the **load balancer**.
2. The load balancer chooses a healthy **app server** and passes the request on.
3. The app server checks the token. If it is missing or expired, it answers `401`.
4. The app server looks in the **cache** for this user's page of notes.
5. **Cache hit:** the cached notes are returned straight away (go to step 8).
6. **Cache miss:** the app server reads the notes from the **read replica**, newest first (query 1 in `data-model.md`).
7. The app server saves the result in the cache for 60 seconds, so the next request is fast.
8. The app server sends `200 OK` with the JSON back through the load balancer to the client.

### POST /notes (create a note)

1. The client sends `POST /v1/notes` with the token and the note in JSON. It reaches the **load balancer** through **DNS**, and the load balancer passes it to an **app server**.
2. The app server checks the token (`401` if it is bad) and validates the body: a title is required and has at most 100 characters (`400` if not).
3. The app server writes the note, and any tag links, to the **primary database** in one transaction. Writes always go to the primary, never to the replica.
4. The app server deletes this user's cached lists from the **cache**, so the next `GET /notes` shows the new note.
5. The app server sends `201 Created` with the new note and a `Location` header back through the load balancer to the client.

### Registration (the flow that uses the queue)

1. The client sends `POST /v1/users`. The app server checks the details and saves the new user in the **primary database**.
2. The app server puts a "send welcome email" job on the **queue** and immediately answers `201 Created`. The user does not wait for the email.
3. A **worker** takes the job from the queue and sends the email. If it fails, the job is tried again.

## Trade-offs

1. **Cache: speed against fresh data.**
   - The cache makes the list fast and protects the database, but it can show old data, and it must be cleared when a note changes.
   - We keep results for a short 60 seconds and clear a user's cached lists whenever they write. A list that is slightly behind is acceptable, and a slow list is not.

2. **Read replica: less load on the primary against replication lag.**
   - The replica takes the read traffic, but it receives changes a moment after the primary, so a user might briefly not see a note they just created.
   - Clearing the cache on every write helps, and if lag becomes a problem we can read a user's list from the primary for a few seconds after they write.

3. **Several app servers: availability against complexity and cost.**
   - Two or more servers behind a load balancer keep the service running when one fails, and let us release new versions without downtime.
   - The price is that the servers must be stateless (the login token carries the user's identity, so no server keeps session data), and that we pay for more machines and have to manage them.

4. **One primary database: simple and consistent against a write limit.**
   - Sending all writes to one primary keeps the data consistent and the design simple, and at about 35 writes per second at peak it has plenty of room.
   - If writes ever outgrow one primary, we would split the data across several databases by `user_id`, which is more complex.

## Avoiding Single Points of Failure

A single point of failure is a part whose failure stops the whole service. For each component:

| Component | How a single point of failure is avoided |
|-----------|------------------------------------------|
| DNS | A managed DNS service that runs on many servers around the world |
| CDN | Many edge servers, and if one fails the request goes to another |
| Load balancer | A managed load balancer that runs in more than one data centre, so the balancer itself is not a single point of failure |
| App servers | Two or more, in different data centres, with the load balancer checking their health and skipping a failed one |
| Cache | If it fails, the app servers read from the database instead, which is slower but still works. The cache itself can be run as a small cluster |
| Primary database | The read replica can be promoted to primary if the primary fails, and there are daily backups with the ability to restore to a point in time |
| Read replica | If it fails, reads go to the primary until a new replica is built |
| Queue | A managed queue that stores jobs in more than one place, so jobs are not lost, and while it is down only background work such as emails is delayed |
| Worker | Several workers, and a job that fails is tried again by another |

## Keeping the System Healthy and Safe

- **Monitoring:** watch the request rate, error rate, response time, database load, replication lag and queue length.
- **Logging:** record every request with a `requestId`, so that when a user reports a `500` error, the team can find exactly what happened.
- **Alerts:** notify the team when, for example, more than 2% of requests fail for 5 minutes, or the replica falls more than 30 seconds behind.
- **Protection:** HTTPS for all traffic, hashed passwords, token authentication, validation of every input, and rate limiting that answers `429` when a client sends too many requests.