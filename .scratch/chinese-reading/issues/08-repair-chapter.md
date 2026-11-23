# 08: Recover from an invalid generated chapter

**What to build:** Recover automatically when a candidate chapter violates the plan, with a manual retry if correction fails.

**Blocked by:** 07 Generate a first story within a vocabulary budget

**Status:** resolved

**Implementation seam:** The validator reports chapter-specific problems; the generation service owns the story-wide correction budget.

- [x] Use a recorded candidate that introduces an unplanned word in chapter three. Request a targeted revision with the specific failure and retain unaffected chapters.
- [x] Revalidate the entire candidate after each correction, including whole-story budgets and targets. Publish only a complete valid story.
- [x] Stop after two automatic correction attempts across the story, offer a manual retry, and keep failed candidates out of history. Confirm successful and exhausted retries leave learner scores intact.
