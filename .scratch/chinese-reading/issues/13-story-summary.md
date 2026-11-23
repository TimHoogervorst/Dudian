# 13: Review and rate a finished story

**What to build:** Review progress and difficult words after finishing, then optionally practice the words or rate the story.

**Blocked by:** 05 Finish a chapter and see reading progress, 06 Practice character and word flashcards

**Status:** resolved

**Implementation seam:** The summary reads completion and difficulty marks in context. Explicit word selection feeds flashcards; a story rating is stored separately from reading strength.

- [x] Show completed progress and each explicitly marked word alongside its marked sentence or sentences. Single-tap definition checks alone do not populate this list.
- [x] Offer Practice these words when marks exist. The learner can immediately start a word session drawn from those marks even within the 24-hour story review delay.
- [x] Persist an optional thumbs-up or thumbs-down rating to the backend. Verify rating a difficult story positively leaves vocabulary scores unchanged.
- [x] Verify the completion view also works when no words were marked.
