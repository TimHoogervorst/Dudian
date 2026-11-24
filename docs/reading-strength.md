# How Dudian measures reading strength

## Practice scoring

The planner selects up to two focus cards on Easy, three on Medium and six on Hard. The story cover presents one Character focus list, ordered by priority. Each character or whole word uses its highest applicable tier.

| Story tier | Easy | Medium | Hard |
|---|---:|---:|---:|
| Strong — eligible selected target | +1.5 | +2 | +2.5 |
| Medium — unaided correct Word Review | +0.75 | +1 | +1.25 |
| Soft — character in the prompt or correct answer of an unaided correct comprehension question, or its tested vocabulary | +0.5 | +0.5 | +0.5 |
| Other — eligible unaided passage appearance | +0.25 | +0.25 | +0.25 |

Each item can earn one positive award per chapter. Incorrect direct tests of strong and medium items cost 1 point. An incorrect soft question earns zero, including when the item appeared in the passage. An explicit difficulty mark costs 3 points. Lookups suppress appearance credit for the affected vocabulary.

Answers and difficulty marks are saved immediately. Chapter completion records eligible passage credit. The final chapter settles all pending points together, including cover difficulty marks. First answers from comprehension checks and Word Review determine the multiplier.

| Incorrect answers | Positive-point multiplier |
|---|---:|
| 0, with at least one graded question | 1.2× |
| 1, or a story with no graded questions | 1× |
| 2 | 0.7× |
| 3–4 | 0.4× |
| 5 or more | 0.2× |

For each item, multiply total gains, subtract its full penalties, and apply the result within the Library score limits. The summary records the actual net points awarded. Completing or reopening a story again preserves the original award. For stories in progress during an upgrade, earlier posted points remain in the Library and only pending points receive the final multiplier.

Characters and whole words earn Perfect independently. Existing scores and historical activity carry forward. The HSK bar continues to award full credit at 6 and the activity charts include future gains above 12. [Decision on HSK credit](adr/0001-extend-reading-strength-beyond-hsk-credit.md)

Strong starts at 6 and reaches Perfect at 36. Each item has its own last-seen time. Reading 东西 in a completed chapter updates that time for 东西, 东, and 西. A Word Review for 东西 tests recall of the whole word. A character needs its own recall check to settle an overdue review.

After seven days away, an item becomes due. Further incidental encounters update last seen and earn zero points until the review is settled. When eligible items are overdue, reserve one existing review slot in Character Focus, Library practice, or Word Review for the longest-overdue eligible item. Perfect items leave the automatic review rotation and remain available for explicitly selected practice.

| Overdue outcome | Score change | Review state |
|---|---|---|
| Unaided correct answer | 0 | Settled |
| Incorrect Library flashcard or explicit difficulty mark | −6, bounded by the score floor | Settled |
| Incorrect direct test of a strong or medium item | −2, bounded by the score floor | Settled |
| Almost, correct after revealing English, or skipped | 0 | Still due |

For example, if a Hard question asks who bought water, an eligible background 水 appearing in its prompt earns +0.5 on an unaided correct response. An overdue 水 earns zero and stays due when the question tests only the buyer's identity. If the question explicitly tests 水, an unaided correct answer settles its overdue review. An incorrect soft-focus answer earns zero.

On upgrade, use the latest reliable encounter from completed chapters, recorded word actions, and graded practice. A scored item without dated evidence gets seven days from the upgrade. An unseen item starts its clock on its first encounter.

## Library bands

| Status | Reading strength |
|---|---|
| Unseen | No score |
| Struggling | −6 up to 0, exclusive |
| Learning | 0 up to 6, exclusive |
| Strong | 6 up to 36, exclusive |
| Perfect | 36 |

The Library keeps the same band widths as scores extend into Strong. The marker reaches the right edge at Perfect. Manual status changes can clear a score or set Struggling (−3), Learning (1), Strong (6), or Perfect (36).

An ordinary correct flashcard earns 3 points on the first review, 4 on a later local date, and 2 for another review on the same date. An incorrect flashcard costs 3 points. A correct answer after showing English earns zero points.
