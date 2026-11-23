# 05: Finish a chapter and see reading progress

**What to build:** Explicitly finish a chapter and see the resulting word and character strengths in the Library.

**Blocked by:** 04 Look up and mark a word while reading

**Status:** ready-for-agent

**Implementation seam:** Learner progress applies chapter completion once per learner and chapter, independently of saved position.

- [ ] Award one small gain per distinct word read unaided. Exclude words looked up or marked during that chapter, including repeated occurrences.
- [ ] Record component-character encounters. A first compound encounter moves an unseen component to yellow. Standalone character reading can build independent strength.
- [ ] Repeated unaided reading across chapters can bring a word to green. Opening, scrolling, reopening, or concurrent completion on two devices cannot duplicate completion credit.
- [ ] Finishing the last chapter of a fully read story records story completion once. Later rereading still allows explicit difficulty marks.
