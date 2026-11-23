# 09: Personalize the next story from learner history

**What to build:** Generate a story whose preview reflects the learner’s reading experience and flashcard reviews.

**Blocked by:** 05 Finish a chapter and see reading progress, 06 Practice character and word flashcards, 07 Generate a first story within a vocabulary budget

**Status:** resolved

**Implementation seam:** The planner consumes strength, encounter history, timestamps, and an explicit current time. Its plan can be verified without a live model.

- [x] Prioritize eligible difficulties and weaker items, then material with little or infrequent practice. A review-focused story can introduce zero new characters at any difficulty.
- [x] A marked word is ineligible as a deliberate story review target until 24 hours after the mark. Test immediately before and at the boundary; natural occurrences and learner-initiated Library reviews stay available.
- [x] Favor unseen HSK 1 material first. With comfortable recent reading and few unresolved difficulties, occasionally select an HSK 2 target even while some HSK 1 entries are gray.
- [x] Show chosen review items under Practice again and reuse them in different sentences. Verify the actual story respects its preview and the configured budgets.
