# 07: Generate a first story within a vocabulary budget

**What to build:** Choose Reading, select length and difficulty, preview the vocabulary goals, and open a validated, saved story.

**Blocked by:** 01 Generate one passage with ChatGPT sign-in, 03 Browse the offline Characters and Words Library

**Status:** ready-for-agent

**Implementation seam:** The backend planner produces the allowed vocabulary and explicit targets; the generator returns a candidate and the validator decides whether it can be saved.

- [ ] Offer provisional 10- and 30-minute sessions, with resumable chapters for long stories. Persist editable Easy, Medium, and Hard ceilings (initially 2, 3, and 5) and a default difficulty; support a session override.
- [ ] Use HSK 1 background vocabulary from day one. Enforce distinct new-character ceilings across the story and permit at most one additional unfamiliar compound made entirely of familiar characters.
- [ ] Require ordered words and punctuation per sentence, preserving paragraph and chapter boundaries. Check every written form, entry and sense, target coverage, and vocabulary budget across the complete story.
- [ ] Only after validation, save the story and show New this story with pinyin, meaning, and example words, plus Practice again when applicable. Generation and preview confer no credit.
- [ ] Verify invalid candidates never appear as ready to read and valid saved stories retain the same annotations on reopening.
