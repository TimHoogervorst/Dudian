# 02: Open and resume a saved chapter

**What to build:** Read a seeded, segmented story on desktop and resume at the same paragraph from a phone.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Implementation seam:** Store immutable story content separately from the seeded admin learner’s position in SQLite.

- [ ] The TypeScript app starts in Docker with one learner, an example story, and a persistent SQLite volume. Rebuilding with the same volume retains the reading position.
- [ ] Practice opens Reading plus disabled Speaking and Listening choices. Practice, Library, and Settings are reachable at the bottom on mobile and the top on desktop.
- [ ] Open the example chapter, advance to another paragraph, and resume from a second browser. Verify the text and paragraph match.
- [ ] Use the spec’s desktop and mobile reader references for the chapter layout, warm paper palette, and deep red controls.
