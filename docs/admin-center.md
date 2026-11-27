# Private admin center and shared story generation

**Status** — Implemented

## Purpose

Give the administrator enough evidence to decide which story to add next. The public reader serves the shared story catalog and records personal reading and practice progress. The private admin center shows learning trends across the platform, identifies gaps in the catalog, and lets the administrator generate a story to fill one.

## Deployment and access

- Ship a second app in this repository, with its own frontend, server entry point, and Docker service. Both services use the existing PostgreSQL database and can share domain code.
- Expose the reader over the public HTTPS route. Bind the admin service to host loopback and reach it remotely through an SSH tunnel. Both admin pages and admin API operations belong to the private service.
- Require a separate login after opening the tunnel. Provision one administrator through deployment configuration, with the credential supplied outside version control. Learner registration and reader sessions grant access only to the reader.
- Move the story-generation action and its API off the reader. Preserve access to existing stories, bookmarks, personal progress, practice, on-demand translations, and milestone tests. The reader retains its AI connection for those learning features.

## Admin pages

Use the reader’s logo, masthead, icons, typography, and paper-and-red color palette. Keep Overview, Users, Characters, and Stories in the top navigation on desktop and mobile. Settings and sign-out sit in the account menu.

| Page | What the administrator can see or do |
| --- | --- |
| Overview | See registered accounts, learners active in the last 30 days, average learning progress, and a chart of the observed HSK level distribution. The charts default to active learners and offer an all-learners view. Group learners by the HSK milestone they are working toward, with a separate group for those who passed the final supported level. |
| Users | Browse a username directory. Learning scores, HSK levels, and reading histories appear only in aggregate insights. Email and account-management actions are future work. |
| Characters | Browse and search using the reader dictionary’s interaction pattern. Open a character to see its average recorded reading strength across all learners and the number with a score out of the total. An unscored learner contributes to the total population only. If nobody has a score, show “No recorded scores.” |
| Stories | Inspect verified character focus coverage by HSK band and Easy, Medium, or Hard difficulty. Show which characters have multiple practice stories, which have none, and where active learners still need a suitable unfinished story. Open manual generation from a ranked suggestion or choose a custom focus. |

Use existing learner records to calculate aggregate insights. The user directory needs no duplicate learning profile. Label each metric with its population so an all-learner character average and a 30-day recommendation count can be interpreted together.

## How suggestions work

1. Include learners who read or practiced within the last 30 days. Registration or sign-in alone does not qualify.
2. Identify characters each active learner needs to review and unseen characters appropriate for that learner’s next learning goals. Associate each candidate with a target HSK band and a story difficulty. The HSK band describes accessible vocabulary. Difficulty describes the reading task.
3. Check coverage per learner. A learner has coverage when at least one unfinished catalog story explicitly practices the character at a suitable difficulty with accessible surrounding vocabulary. An incidental appearance contributes no coverage.
4. Rank suggestions by the number of distinct active learners who need the character and lack coverage. Count each learner once per suggestion. Show the review and first-encounter counts separately.

For example, nine active learners might need an HSK 1 Easy story focused on 火. If six need review and three are ready to encounter it for the first time, show both counts. An advanced story focused on 火 does not fill their gap. A suitable story already finished by five of them can still provide coverage for the other four.

## Manual generation and publication

The builder preselects a set of character cards. One chapter starts with two cards on Easy, three on Medium, or six on Hard. Each extra chapter adds two slots up to twelve. Each slot can be rerolled independently, and the administrator can deselect cards to request a smaller focus, including a single character.

Fill slots from ranked suggestions for the selected audience and difficulty first. When those run out, use unmet need across the audience’s other difficulties, then curriculum characters with the least catalog coverage. Publication credits the verified focus of the finished story.

1. Present the highest-ranked suggestion and alternatives. Let the administrator select any suggestion or enter a character and difficulty. Show the target HSK band, expected audience, and existing coverage before generation. Custom generation remains available when the ranking is empty.
2. Use the selected character as a writing target. Validate the finished text and derive the credited focus from the practice it actually provides. Allow supporting words and their chapter placement to differ from the original plan.
3. Keep dictionary checks, readable chapter structure, the existing unfamiliar-character ceiling, and the focus budget for the selected difficulty and length. Repair a story with no credible focus. Apply relaxed focus validation only to catalog stories.
4. Publish automatically after successful validation. Show the requested focus, verified focus, and finished story in the admin result. A failed attempt must leave the shared catalog and its coverage counts intact.
5. Use the published focus for subsequent rankings. If a request for 火 produces verified practice for 灯 alone, credit 灯. The request itself earns no coverage for 火.

## Acceptance checks

- A signed-in learner can read and practice through the public service. The public service offers no route to generate a catalog story or retrieve admin insights. An admin request through the tunnel still requires admin authentication.
- A learner who only registers appears in the directory and registered count. A learner who practices within the window also appears in the active count. Neither has a personal learning dashboard in the admin center.
- A character with recorded scores of 2 and 6 among five learners shows an average of 4 and a denominator of 2 scored out of 5. An empty population shows an empty state.
- The distribution counts each learner in the selected population once. A learner awaiting the HSK 1 milestone stays in the “Working toward HSK 1” group until passing.
- Given nine uncovered learners for one suggestion and four for another, the first ranks higher. Adding a suitable unfinished story changes the recommendation according to its verified focus.
- The administrator can accept, switch, or override a suggestion. Successful generation makes the story available to readers. Relaxed catalog validation leaves milestone-test validation intact.

## First-release selection rules

- Count reading intervals, position advances, vocabulary actions, completions, graded reviews, automatic score changes, and answered milestone questions within the rolling 30-day window.
- Average the reader’s milestone-capped HSK progress across the selected population. A character’s mean uses its recorded character scores across all accounts.
- Hidden and finished stories cannot cover that learner. Require matching difficulty and an accessible vocabulary band. For older stories, use the highest known HSK band in the chapter text. Unclassified vocabulary or missing difficulty prevents automatic coverage credit.
- Use a learner’s saved difficulty preference where available. Otherwise split progress through their current HSK band into thirds for Easy, Medium, and Hard. For first encounters, start with the five reader starter characters, then consider the next twelve unseen characters in curriculum order for the current band. Weak characters and overdue non-perfect items are eligible for review.
- Break ranking ties by review count, HSK band, character, then difficulty. The administrator can override the audience, reading type, and chapter count.
- Verified characters must occur in distinct sentences and appear independently or in multiple distinct words. Prefer the requested character, then characters in the target band, then frequency. Apply the existing difficulty and length focus budget.
- The private admin service manages artwork and the shared AI installation. Refresh-token rotation is coordinated between services. Jobs and catalog publication are persisted in PostgreSQL.

## Deferred work

Evaluate manual suggestions before adding a scheduler. A future nightly run would use the same ranking, refresh it after each publication, and stop when it reaches its configured maximum or no uncovered need remains. Account management and moving all AI work out of the reader are separate follow-ups.

See the [architecture decision](adr/0007-manage-the-catalog-from-a-private-admin-center.md) and [project glossary](../GLOSSARY.md).
