# Reading types and progression

The learner chooses Book, Article, or Dialogue. The app uses their dashboard HSK progress to select a subtype behind the scenes. Each threshold applies as soon as the score reaches it. Easy, Medium, and Hard control the vocabulary challenge and comprehension checks within the selected subtype.

| Reading type | Entry point | As HSK progress grows | Later candidates |
| --- | --- | --- | --- |
| Book | Below 0.2, a baby book with one short sentence per page and a repeated pattern. | At 0.2, move to the Bāobāo children’s book. At 2.0, move to a chapter book with a plot that carries across scenes. | Young-adult fiction and longer novels. |
| Article | A notice with one actionable fact, such as a shop’s opening time. | Letters replace notices at 0.5. Add recipes at 1.0 and short news reports at 2.0. | Science explainers and specialist articles. |
| Dialogue | A two-person exchange. | Allow up to three people at 1.0, four at 2.0, and five at 3.0. The count includes the learner’s character. Two-person chats stay eligible throughout. Group chats can include delayed replies to earlier messages. | — |

## Progression tab

Add **Progression** to the main navigation. Show the learner’s current dashboard HSK score and the number of milestones reached out of 11. Explain that building reading strength in HSK characters and words raises the score. Place the score on a full 0–HSK 6 scale. Show progress within the current interval beside the next unlock, including every format tied at that score. Each whole HSK marker filters the grid to formats that unlock at that exact score. Open on the learner’s next whole HSK level, capped at 6. Offer fractional unlock scores and an all-formats view alongside the grid. Order matching cards by unlock score and wrap them onto additional rows.

| Group | Cards and unlock scores |
| --- | --- |
| Book | Baby books (0.0), Children’s books (0.2), Chapter books (2.0) |
| Article | Notices (0.0), Letters (0.5), Recipes (1.0), Short news reports (2.0) |
| Dialogue | Two-person chats (0.0), Three-person chats (1.0), Four-person chats (2.0), Five-person chats (3.0) |

Use the same current score and inclusive thresholds as the reading generator. Give reached cards a checkmark and the word “Unlocked”. Mark the Book stage the generator uses now as “Current stage”. Earlier Book stages still count toward the overview. Dim locked cards, keep their text legible, and state the requirement directly, for example “Locked · Reach HSK progress 2.0 to unlock chapter books.” The three starting cards are unlocked on the learner’s first visit.

## Create a story

For testing, show one small, muted, readable line directly underneath each type name inside its existing selection button. The whole button selects the reading type.

| Button | Secondary line |
| --- | --- |
| Book | The stage selected for this session: “Baby book”, “Children’s book”, or “Chapter book”. |
| Article | “Various” at every score, including when only notices are eligible. |
| Dialogue | The planned number of distinct speakers, such as “3 people”. Count the learner’s character. |

Choose the Dialogue group size during preview from the sizes eligible at the learner’s score. Carry that choice into generation so the displayed count matches the chat the learner opens.

## Introduction and chapter structure

Every session opens on an **Introduction** with a cover illustration, teaser, chapter list, vocabulary preview, and Start reading. Generate the illustration from the accepted reading. Bāobāo stars in the children’s book and can appear in baby books. For chapter books, articles, and chats, choose people, objects, or settings from the reading itself. This also applies to the illustration prompt and the image shown while artwork is pending.

Keep the existing 10-, 20-, and 30-minute choices with one, two, and five chapters respectively. Each chapter ends with its own comprehension check.

- **Book chapters** share one narrative. In baby books the page is the unit of presentation, so several one-sentence pages can form a chapter.
- **Article chapters** each contain a complete, independently readable document. Favor a mix of eligible subtypes. Honor an explicitly chosen subject across the session. With an open subject, each document can cover a different topic. At 1.0, for example, one chapter can be a recipe and the next a letter. Each check draws only on its own document.
- **Dialogue chapters** share a theme and can resume the chat at a later moment. Use six messages per Easy chapter, ten per Medium chapter, and fourteen per Hard chapter. Count every bubble, including the learner’s. One participant represents the learner and their messages appear on the right. Other participants’ bubbles appear on the left with stable speaker names. Keep word lookup, pinyin, and difficulty marking available in messages on both sides.

Render Article in the Book reader’s single column with the same type size, spacing, chapter navigation, and word interactions. Within the column, preserve the structure someone would use to read the document, such as a letter’s greeting and signature or a recipe’s ingredients and numbered steps.

## Illustration themes

Generate one Introduction image per session. Use the same visual direction for automatic artwork and the copyable illustration prompt.

| Type | Art direction | Example |
| --- | --- | --- |
| Book | Warm ink-and-gouache storybook illustrations. Use a single clear action and simple shapes for baby books, and richer scenes for chapter books. Attach Bāobāo’s reference portrait only for the children’s book stage. Baby and chapter books use the passage alone. | Bāobāo peers under the kitchen table for the missing cup. |
| Article | Natural-light editorial photography with a clear subject. For a mixed session, illustrate the first document. | A recipe opens with a close view of scallions, noodles, and a pot on a kitchen counter. |
| Dialogue | Candid slice-of-life illustrations in colored pencil, framed from the learner’s point of view. Show the place or object the participants are talking about. | For a family chat about dinner, the learner is in the shop looking down at the last bunch of scallions. |

## What the learner reads

These examples propose how the reader and comprehension checks could work together.

- **Book.** In a baby book, Bāobāo looks for a cup. Each page changes one detail. A check after several pages asks where he finally finds it. In a chapter book, the missing cup could set up a misunderstanding that resolves in a later scene.
- **Article.** A notice has a heading and a brief message. Each letter has a greeting and signature around one body paragraph on Easy, two on Medium, or three on Hard. It shows who wrote it, who received it, and what the recipient needs to do. A recipe has an ingredient list and ordered steps. A short report opens with a headline and tells what happened. Each check draws on the document’s purpose, such as choosing what to add after the water boils.
- **Dialogue.** Show messages in the order sent with stable speaker names. Use short turns, familiar forms of address, and details speakers can leave implicit in context. In a family chat, one person asks who is bringing dinner, another changes the meeting time, and a third responds to the dinner question. A check could ask who agreed to bring dinner. The text or a visible reply reference should give the learner enough evidence to answer.

## Word interactions

Across all three types, hovering previews a word’s contextual meaning without recording a lookup. Clicking or tapping records a lookup. Preserve keyboard access, pinyin preferences, and explicit difficulty marking.

## First-release scope

Include all three Book stages, notices, letters, recipes, short news reports, and two- through five-person chats with delayed replies. Defer young-adult fiction, longer novels, science explainers, and specialist articles.
