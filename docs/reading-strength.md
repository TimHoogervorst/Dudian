# How Dudian measures reading strength

Dudian stores up to 19 integer scores per scale, from −6 to 12. Each vocabulary item has one current score or is Unseen. The card places its marker according to the score within the corresponding color band. [Score storage and thresholds](../src/strength.ts) · [Library meter](../public/features/library.js)

| Status | Stored score | Manual setting when changing status |
|---|---|---|
| Unseen | No score | Clear the score |
| Struggling | −6 to −1 | −3 |
| Learning | 0 to 5 | 1 |
| Strong | 6 to 12 | 6 |

For example, a first correct flashcard earns 3 points. Another correct review on a later day earns 4, bringing an initially unseen item to 7 (Strong). An incorrect flashcard subtracts 3, bringing it back to 4 (Learning). Chapter checks give a targeted item +1 for an unaided correct answer, −1 for an incorrect answer, and no gain for a correct answer after showing English. [Flashcard grading](../src/flashcards.ts) · [Chapter checks](../src/chapter-check.ts)

A 0–100 reading-strength display could reserve 0 for Unseen, map −6 to 1, and map 12 to 100. Displaying the existing score would preserve review priorities and existing progress. It would still represent 19 distinct scored positions. Giving all 100 positive integers distinct meanings would require new rules for how much each learning event counts. [Score adjustments](../src/strength.ts) · [Review priorities](../src/vocabulary-plan.ts)

Anki’s FSRS distinguishes current recall probability from the stability of a memory over time. Dudian counts learning events and applies limits to the total. For the library, the recommended wording is **Reading strength** with a value such as **70/100**. A percentage chance of recall would require a time-sensitive model and validation against actual recall. [Anki manual on stability and retrievability](https://docs.ankiweb.net/manual/stats#card-retrievability) · [Dudian strength calculation](../src/strength.ts)
