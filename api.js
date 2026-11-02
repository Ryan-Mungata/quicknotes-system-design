// ==========================================================
// DownNote - api.js  (STAGE: Task 2, Step 3 = POST)
// Talks to the JSONPlaceholder practice API.
// ==========================================================

// ----- 1. SELECT ELEMENTS -----
const loadBtn = document.querySelector("#load-btn");
const statusText = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");

// ----- 2. CONSTANTS -----
const API_URL = "https://jsonplaceholder.typicode.com/posts";
const MAX_TITLE_LENGTH = 100;

// ----- 3. STATE -----
// The notes currently shown on the page.
let notes = [];

// ----- 3b. READABLE DEMO TEXT -----
// JSONPlaceholder is a practice API: every note it sends has Latin filler
// text ("sunt aut facere..."). The request, the note ids and the count are
// all real, but for a readable demo we SHOW the sample note below that
// matches each id. To see the server's own text, delete ".map(makeReadable)"
// in loadNotes().
const DEMO_NOTES = [
  { title: "Revise JavaScript async/await", body: "Practise fetch with try/catch/finally.\nRe-read the Day 5 notes before Friday." },
  { title: "Buy groceries", body: "Milk, bread, eggs and tomatoes.\nPass by the market after class." },
  { title: "Team meeting at 10am", body: "Agenda: project progress and next steps.\nBring the laptop and the draft report." },
  { title: "Call Mum", body: "Ask about the weekend plans.\nSend her the photos from Sunday." },
  { title: "Push code to GitHub", body: "Commit the day's work with a clear message.\nCheck that all files appear in the repo." },
  { title: "Pay the electricity bill", body: "Due on Friday.\nKeep the payment confirmation message." },
  { title: "Plan the Day 8 presentation", body: "Show the demo, then explain the design docs.\nPractise it twice out loud." },
  { title: "Book a dentist appointment", body: "Call the clinic on Monday morning.\nAsk about available times after 4pm." },
  { title: "Read system design notes", body: "Review load balancers, caching and queues.\nWrite a short summary in my own words." },
  { title: "Dinner with friends", body: "Saturday evening, 7pm.\nConfirm the venue and send the location." },
];

// Keeps everything the server sent (id, userId) and swaps only title and body.
function makeReadable(note) {
  const index = Number(note.id) - 1;
  if (!Number.isInteger(index) || index < 0) {
    return note; // no usable id, so show the server's text as it is
  }
  const demo = DEMO_NOTES[index % DEMO_NOTES.length];
  return { ...note, title: demo.title, body: demo.body };
}

// ----- 4. STATUS HELPER -----
// type is "loading", "success" or "error"; the CSS colours each one.
function setStatus(message, type) {
  statusText.textContent = message;
  statusText.className = type || "";
}

// Disables (or enables) the buttons while a request is running.
function setBusy(isBusy) {
  loadBtn.disabled = isBusy;
  submitBtn.disabled = isBusy;
}

// ----- 5. request() -----
// ONE reusable function for every call to the server (GET, POST, DELETE).
// It sends the request, checks response.ok and throws on errors, so the
// code that calls it only needs a try / catch.
async function request(url, options = {}) {
  const response = await fetch(url, options);

  // fetch does NOT fail on 404 or 500, so we check ourselves
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  // Read the body as text first: some successful replies (such as
  // 204 No Content) have no body, and response.json() would crash on them.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return { status: response.status, data: data };
}

// ----- 6. BUILD AND SHOW THE NOTES -----
// Text from the server is added with textContent only, never innerHTML.
function createNoteCard(note) {
  const card = document.createElement("li");
  card.className = "note-card";

  const title = document.createElement("h3");
  title.className = "note-title";
  title.textContent = note.title;
  card.appendChild(title);

  // The body is optional, so only add it when there is one
  if (note.body) {
    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = note.body;
    card.appendChild(body);
  }

  return card;
}

function renderNotes() {
  notesList.textContent = ""; // empty the list first

  // Empty state
  if (notes.length === 0) {
    const message = document.createElement("li");
    message.className = "empty-message";
    message.textContent = "No notes to show yet. Click Load notes to get started.";
    notesList.appendChild(message);
    return;
  }

  for (const note of notes) {
    notesList.appendChild(createNoteCard(note));
  }
}

// ----- 7. GET: LOAD NOTES -----
async function loadNotes() {
  // Before the request: tell the user and block extra clicks
  setStatus("Loading notes...", "loading");
  setBusy(true);

  try {
    const result = await request(`${API_URL}?_limit=10`);

    // Make sure we really got a list before using it
    if (!Array.isArray(result.data)) {
      throw new Error("The server did not send a list of notes");
    }

    notes = result.data.map(makeReadable);
    renderNotes();
    setStatus(`Loaded ${notes.length} notes from the server.`, "success");
  } catch (error) {
    setStatus("Could not load notes. Please check your connection and try again.", "error");
    console.error(error);
  } finally {
    // Runs whether it worked or failed
    setBusy(false);
  }
}

// ----- 8. VALIDATION -----  [TASK 2]
// Returns a message describing the problem, or "" when the title is fine.
function validateTitle(title) {
  if (title === "") {
    return "Please enter a title for your note.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  return "";
}

// ----- 9. CREATE A NOTE (POST) -----  [TASK 2]
async function createNote(title, body) {
  // Before the request: tell the user and block extra clicks
  setStatus("Creating note...", "loading");
  setBusy(true);

  try {
    const result = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title, body: body, userId: 1 }),
    });

    // The server should send back the note it created, with an id
    if (!result.data || result.data.id === undefined) {
      throw new Error("The server did not send back the new note");
    }

    // Add the returned note to the TOP of the list
    notes.unshift(result.data);
    renderNotes();

    setStatus(`Note created (status ${result.status}, id ${result.data.id}).`, "success");

    // Clear the form (only after success, so a failed try keeps the text)
    titleInput.value = "";
    bodyInput.value = "";
  } catch (error) {
    setStatus("Could not create the note. Please try again.", "error");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

// ----- 10. FORM SUBMIT -----  [TASK 2]
async function handleSubmit(event) {
  // Stop the browser from reloading the page
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    setStatus(problem, "error");
    titleInput.focus();
    return;
  }

  await createNote(title, body);
}

// ----- 11. EVENT LISTENERS AND START -----
loadBtn.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", handleSubmit);

// Show the empty state when the page first opens
renderNotes();