# Connect a ChatGPT plan

Open Street Talk’s Settings in a browser on the Docker host. Choose **Continue with ChatGPT**, approve the plan permission in the browser, then return to Settings and choose **Try a short passage**. The app displays the words and punctuation returned by a live request. Your phone can use the same backend after setup.

Sign-in uses a separate loopback-published listener on port 14551. Docker Compose maps this listener to the host’s 127.0.0.1. Keep the callback path and loopback binding when changing the main app’s LAN settings. Native development uses 127.0.0.1 by default.

Street Talk persists its host identity and renewable credentials in the app data directory. Treat that directory and its backups as private. Sign in again from Settings if plan permission expires. Review or revoke Street Talk’s grant in [ChatGPT usage settings](https://chatgpt.com/settings/usage).

The service registers its own public OAuth client and uses the account’s advertised models to stream completed Responses API results. Account eligibility and plan usage limits apply. [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) · [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)

## Verification

Automated tests exercise a signed test registration, restart, ordered word boundaries, and a completed or interrupted response. This fresh installation requires interactive owner consent before a live passage can verify the account’s eligibility.
