# Flashcards

A mobile web app for studying flashcards. Cards are displayed as a physical stack — tap to flip, then mark each card right or wrong to move it through the deck.

## Usage

```bash
npm start
```

Open `http://localhost:3000` in a browser (or point your phone to your machine's LAN IP on the same port).

## How it works

- **Tap a card** to flip it and reveal the answer.
- **✔** — you knew it: the card moves to the bottom of the stack.
- **✘** — you didn't: the card goes back in at position 5 so you'll see it again soon.

## Adding your own cards

Edit [`public/cards.json`](public/cards.json). Each entry needs an `id` (unique integer), a `front` (question), and a `back` (answer):

```json
[
  { "id": 1, "front": "What is X?", "back": "X is …" },
  { "id": 2, "front": "What is Y?", "back": "Y is …" }
]
```

The `id` field must be unique across all cards. Order in the file determines the initial stack order (first entry = top card).

## Project structure

```
flashcards/
├── server.js          # Node.js static file server (no dependencies)
├── package.json
└── public/
    ├── index.html
    ├── style.css
    ├── app.js
    └── cards.json     # Flashcard data
```

## Configuration

Set the `PORT` environment variable to use a port other than 3000:

```bash
PORT=8080 npm start
```
