# 01: Generate one passage with ChatGPT sign-in

**What to build:** Connect the locally hosted TypeScript app to the learner’s ChatGPT plan and display a short generated passage.

**Blocked by:** None (can start immediately)

**Status:** implemented (awaiting live account verification)

**Implementation seam:** The backend owns account authorization and the request for a candidate passage. Its response boundary accepts ordered word and punctuation entries.

- [x] A learner can start the app in Docker, authorize plan usage from the host browser, and request a passage.
- [ ] Verify the actual account grant with one live text request. Record the result, including the reason if eligibility or access prevents success.
- [x] Render the returned entries in order as Chinese text and verify their individual boundaries. Missing authorization and malformed responses produce actionable feedback.

**Verification:** The running Docker app exposes host-only sign-in. The passage endpoint requested a ChatGPT connection when tested on this installation. Signed grant and inference fixtures pass. A live response requires the learner to approve the plan grant in Settings.
