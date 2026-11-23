# 04: Look up and mark a word while reading

**What to build:** Read natural simplified Chinese and act on individual words with a tap or click.

**Blocked by:** 03 Browse the offline Characters and Words Library

**Status:** resolved

**Implementation seam:** Each saved word occurrence resolves to a local dictionary sense. Learner progress distinguishes a lookup from an explicit difficulty mark.

- [x] A single tap or click shows that occurrence’s English meaning and pronunciation, recording a lookup without a score penalty or review timer.
- [x] A double-tap or double-click explicitly marks difficulty once for the action, lowers the whole word’s strength and timestamps the mark. Its characters show the occurrence in their histories and retain their scores.
- [x] Settings controls small pinyin annotations and remembers the preference across devices. Lookups work on saved stories without AI access.
- [x] Verify a multi-character word is one target on both screen sizes, with the desktop dictionary beside the chapter.
