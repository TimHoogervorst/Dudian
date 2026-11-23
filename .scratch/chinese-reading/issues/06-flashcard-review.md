# 06: Practice character and word flashcards

**What to build:** Start a short Library session, recall pronunciation and meaning, reveal the answer, and grade recall.

**Blocked by:** 03 Browse the offline Characters and Words Library

**Status:** ready-for-agent

**Implementation seam:** Flashcard review updates the selected word or character identity through learner progress; it can also accept an explicit set of words for a session.

- [ ] Offer separate decks of up to ten cards. A fresh learner can practice. With history, favor weak items and mix in familiar ones.
- [ ] Support Incorrect, Almost, and Got it buttons, plus left, down, and right swipes respectively. Almost covers partial recall.
- [ ] Explicit grades carry more weight than unaided chapter encounters. First success is yellow, a first miss can be red, and recall on another day carries extra weight toward green.
- [ ] Verify a missed compound brings back the word card and preserves component scores. A miss on an established card preserves earlier evidence.
