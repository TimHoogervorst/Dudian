# Street Talk

A locally hosted Mandarin reading app for one learner. Start it with `docker compose up --build` and open **http://localhost:3000**. A phone on the same trusted network can open port 3000 on the host’s LAN address. The seeded admin and reading history are shared across devices.

The named Docker volume retains the SQLite database when the app container is rebuilt. The illustrated example story opens without an AI connection. Choose a paragraph with the arrows or by tapping its text to save your place.

For local development, use Node 22.16 or later, run `npm start`, and run `npm test` for the test suite. Set `DATA_DIR` to choose the data directory and `PORT` to change the HTTP port.

