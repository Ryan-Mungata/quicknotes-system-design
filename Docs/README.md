# DownNote: System Design and API Client

*Capture your notes once. Find them anywhere.*

## Description

DownNote (the QuickNotes online service) is moving from a browser-only app to a real online service for 1 million users. This project has two halves. The first half is an **API client**: a small web page, written in plain HTML, CSS and JavaScript, that proves the front end can talk to an API by loading, creating and deleting notes with `fetch`. It uses the JSONPlaceholder practice API. The second half is a set of **design documents** that the backend team can build from: the API, the database and the overall system architecture.

## The API Client

The client shows all four states a real page needs: **loading**, **success**, **error** and **empty**.

- **Load notes (GET):** requests `https://jsonplaceholder.typicode.com/posts?_limit=10` and shows each note's title and body, with "Loading notes..." while it waits and "Loaded 10 notes from the server." when it is done
- **Create a note (POST):** a form with a required title (at most 100 characters) and an optional body. The new note appears at the top of the list with a message such as "Note created (status 201, id 101)."
- **Delete a note (DELETE):** every note has a Delete button that sends `DELETE /posts/{id}` and removes the note from the list
- **Error handling:** every request is wrapped in `try` / `catch` / `finally`, and the user sees a friendly message if anything fails
- **Validation:** an empty or over-long title is rejected with a clear message before any request is sent
- **Disabled buttons:** every button is disabled while a request is running, so nothing can be sent twice
- **Safe text:** all text from the server or the user is added with `textContent`, never `innerHTML`
- **Reusable request function:** one `request()` function sends every call, checks `response.ok` and throws on errors
- **Responsive design:** works on phones and computers, and follows the device's light or dark setting

### About the practice API

JSONPlaceholder is a fake API made for practice, and it behaves differently from a real one:

- It sends Latin placeholder text for every note. The client keeps the real request, ids and count, but shows readable sample notes in place of the Latin text. The comment in `api.js` explains this, and removing `.map(makeReadable)` shows the server's own text.
- It does not really store the notes you create. It answers `201` with the id `101` and keeps nothing, so a created note disappears when you click Load notes again. The comment in `api.js` explains how deleting a created note is handled.

## How to Run the API Client

You do not need to install anything, but you do need an internet connection, because the client calls an online API.

1. Clone the repository:
   ```bash
   git clone https://github.com/Ryan-Mungata/quicknotes-system-design.git
   ```
2. Open the `quicknotes-system-design` folder in VS Code.
3. Right-click `index.html` and choose **Open with Live Server**. You can also double-click `index.html` to open it in your browser.
4. Click **Load notes** to load 10 notes, create a note with the form, and use the Delete buttons to remove notes.

## Design Documents

- [API design](docs/api-design.md): the REST API the backend team should build, with 11 endpoints, request and response examples, and the error codes
- [Data model](docs/data-model.md): the `users`, `notes`, `tags` and `note_tags` tables with their relationships, `CREATE TABLE` statements, example queries, indexes, and the choice of SQL
- [Architecture](docs/architecture.md): the requirements, a load estimate for 1 million users, the architecture diagram, how each component works, the request flows, trade-offs, and how single points of failure are avoided

## Project Structure

```
quicknotes-system-design/
├── index.html        # the page
├── style.css         # styling, including the loading, success and error messages
├── api.js            # request(), GET, POST, DELETE, validation and the page logic
├── README.md         # this file
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## What I Learned

- **How `fetch` and `async`/`await` work together.** I learned to send a request, wait for the answer, and handle what comes back. `fetch` only fails when the network fails, so a 404 or 500 still counts as an answer. That is why `request()` checks `response.ok` and throws an error, and why every call is wrapped in `try`, `catch` and `finally`.
- **Why a page needs four states.** Loading, success, error and empty all need their own message, and buttons must be disabled while a request is running. Without them, users do not know what is happening and can send the same request twice.
- **Why a reusable function matters.** Writing `request()` once meant GET, POST and DELETE only had to pass different options. It also gave me one place to read the response safely, including replies with no body.
- **How a practice API differs from a real one.** JSONPlaceholder only pretends to save notes, so I had to decide how to handle deleting a note it never stored, and explain my choice in a comment. A wrong choice, such as treating every 404 as success, could hide real errors.
- **How to design an API.** Resources are plural nouns, and the HTTP method says the action. Status codes carry meaning, such as 401 for "I do not know who you are" and 403 for "you are not allowed". The server, not the client, should decide the user and the ids.
- **How tables relate.** One-to-many relationships use a foreign key on the "many" side, and a many-to-many relationship, such as notes and tags, needs a join table. An index on the columns a query filters and sorts by makes the most common request fast.
- **How to estimate before designing.** A back-of-the-envelope estimate showed that 1 million users is a modest load of about 290 reads per second at peak. So the design is driven by availability, meaning no single point of failure, more than by raw capacity.
- **How to claim only what I have checked.** When I tested my first idea for an index, the database's plan showed it helped a different query than I had said, so I corrected the document.

## Author

Developed by Konoha Technologies.g