# Street Talk

A locally hosted Mandarin reading app for one learner. Start it with `docker compose up --build` and open **http://localhost:3000**. A phone on the same trusted network can open port 3000 on the host’s LAN address. The seeded admin and reading history are shared across devices.

The named Docker volume retains the SQLite database when the app container is rebuilt. The illustrated example story opens without an AI connection. Choose a paragraph with the arrows or by tapping its text to save your place.

## Reading and review

Choose **Practice → Reading** to generate a story. Pick a duration and difficulty, then preview the characters and words the story will practice. On the host PC, connect the app to your subscription in **Settings → Continue with ChatGPT**. You can use the saved example, dictionary, and flashcards before connecting. [ChatGPT connection guide](docs/chatgpt-connection.md)

Tap a word once for its meaning in the sentence. Double-tap it to mark difficulty. **Finish chapter** records reading credit once. The Library has separate Characters and Words decks for HSK levels 1–6. Show or hide pinyin and adjust difficulty ceilings in Settings.

## Development

Use Node 22.16 or later. Run `npm ci` to install the development tools, `npm run typecheck` to check TypeScript, `npm test` to run the tests, and `npm start` to serve the app. Set `DATA_DIR` to choose the data directory and `PORT` to change the HTTP port for native development.

The original application code is MIT licensed. The bundled dictionary and curriculum retain their own licenses. [Application license](LICENSE) · [Product specification and UI references](docs/reading-app.md)

