# Connect a ChatGPT plan

1. On the PC running Docker, open [Dudian Settings](http://localhost:3000/#/settings) and choose **Continue with ChatGPT**.
2. A new tab opens at `127.0.0.1:14551`. Choose **Continue with ChatGPT** there as well. This local page starts the handoff to OpenAI.
3. On OpenAI’s page, sign in with the ChatGPT account you want to use and approve Dudian’s plan permission. Keep using the same browser until the local tab confirms that Dudian is connected.
4. Return to Settings and choose **Try a short passage**. Chinese text verifies that the connection can generate content. Your phone can now use the same backend.

Sign-in uses a separate loopback-published listener on port 14551. Docker Compose maps this listener to the host’s 127.0.0.1. Keep the callback path and loopback binding when changing the main app’s LAN settings. Native development uses 127.0.0.1 by default.

Dudian persists its host identity and renewable credentials in the app data directory. Treat that directory and its backups as private. Sign in again from Settings if plan permission expires. Review or revoke Dudian’s grant in [ChatGPT usage settings](https://chatgpt.com/settings/usage).

The service registers its own public OAuth client and uses the account’s advertised models to stream completed Responses API results. Account eligibility and plan usage limits apply. [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) · [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)

## Story illustrations

Open a new story’s cover and expand **Cover artwork**. Use **Copy illustration prompt** and **Download 包包 reference** in ChatGPT Images, then use **Import cover** to attach the finished PNG, JPEG, or WebP. The import updates that story’s thumbnail. Replace the shared portrait under **Settings → Story artwork**.

**ChatGPT subscription (Codex)** is the default artwork provider. The local cover worker uses the host’s Codex CLI, signed in with ChatGPT, to illustrate scenes with the saved portrait. Covers consume included Codex usage. The reader and the worker exchange files through `.work/cover-jobs`. The Docker container has no need for the host’s Codex credentials.

On Windows, run `powershell -NoProfile -File scripts/start-cover-worker.ps1` from the project after signing in with `codex login`. On other hosts run `node scripts/cover-worker.mjs` with the native Codex executable on PATH (or set `DUDIAN_CODEX_BIN` to its path). Run the worker at login if the reader is used across host restarts. **Settings → Story artwork** shows the worker’s connection status. **Generate cover** and **Retry illustration** use the selected provider. The automatic checkbox also starts a cover whenever a new story finishes generating.

Separately billed images require explicitly selecting **OpenAI API** and supplying a key. A subscription failure stays on the subscription path, and the cover can be retried when the worker or usage allowance is available. [Codex image generation](https://learn.chatgpt.com/docs/image-generation) · [OpenAI image API](https://developers.openai.com/api/docs/guides/image-generation)

## Verification

Automated tests exercise a signed test registration, restart, ordered word boundaries, and a completed or interrupted response. This fresh installation requires interactive owner consent before a live passage can verify the account’s eligibility.
