# Manage the story catalog from a private admin center

The public reader serves learners, while a separate admin service in the same repository handles catalog generation and cross-learner insights. Docker exposes the admin service on host loopback for access through a tunnel, and the administrator signs in with one separately provisioned account.

This revises the focus selection in [ADR 0005](0005-share-stories-generated-for-individual-learners.md) while preserving the shared catalog and individual progress. Generation in the first release is manual so the administrator can evaluate the suggestions against actual catalog needs. The administrator can accept the top suggestion, choose another, or enter a character and difficulty and see existing coverage before generating.

Nightly automation is deferred to a separate PR. The intended behavior is to use the same ranking, refresh it after each new story, and stop at the configured maximum or when no uncovered need remains.

The admin user directory lists account identities. Learning insights are presented as platform-wide aggregates, and suggestions use the needs of learners who read or practiced in the past 30 days. Measuring coverage takes each learner’s difficulty and unfinished stories into account.

Rank each character and target difficulty by the number of distinct active learners who need that character and lack a suitable unfinished story that explicitly targets it. Include both learners who need review and learners ready for a first encounter under their current learning goals. Show the two counts separately so the administrator can see why a suggestion ranks highly.

Each suggestion shows the target HSK band alongside the story difficulty. Coverage considers whether the surrounding vocabulary is accessible to the intended learners.

The requested focus guides the writer. For catalog stories, validation may accept different teaching words or chapter placement and derives a bounded focus list from practice in the finished text. It retains the focus budget for the chosen difficulty and length, the unfamiliar-character ceiling, dictionary checks, and readable chapter structure. A story without a credible focus goes back for repair.

Passing validation publishes the story to the shared catalog, including when the verified focus differs from the request. The admin result shows both, and coverage credits the verified focus. Milestone tests retain their existing validation rules.

The reader retains its AI connection for on-demand paragraph translations and milestone tests. Pre-generating that material is a possible later change.

## Insights discussed for the first dashboard

Show registered and 30-day active learner counts, average progress, and the observed distribution of learners by the HSK level they are working toward. Default the level chart to active learners and offer an all-learners view.

Use the reader dictionary’s browse-and-open interaction for character insights. Opening a character should show its average recorded reading strength across learners and how many have a score. The proposed story view shows the catalog’s verified character focuses by HSK band and difficulty, alongside unmet learner need.
