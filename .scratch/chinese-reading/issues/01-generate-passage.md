# 01: Generate one passage with ChatGPT sign-in

**What to build:** Connect the locally hosted TypeScript app to the learner’s ChatGPT plan and display a short generated passage.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Implementation seam:** The backend owns account authorization and the request for a candidate passage. Its response boundary accepts ordered word and punctuation entries.

- [ ] A learner can start the app in Docker, authorize plan usage from the host browser, and request a passage.
- [ ] Verify the actual account grant with one live text request. Record the result, including the reason if eligibility or access prevents success.
- [ ] Render the returned entries in order as Chinese text and verify their individual boundaries. Missing authorization and malformed responses produce actionable feedback.
