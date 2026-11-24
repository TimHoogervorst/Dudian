# Chinese reading app

## Product brief

An open-source TypeScript web app runs locally in Docker with one seeded admin learner. Desktop and mobile share that learner’s progress. Use the Sign in with ChatGPT preview for story generation, subject to a successful end-to-end account test. The first release focuses on reading. Speaking and Listening appear as disabled practice choices.

### The reading loop

The progression for Book, Article, and Dialogue is described in [Reading types and progression](reading-types.md).

1. Start on a dashboard showing reading activity and progress. Put Practice, Library, Progression, and Settings in the bottom navigation on mobile and at the top on desktop. Progression shows the current HSK progress score and the unlock requirements for each reading milestone.
2. Choose Practice → Reading. Short, medium, and long stories contain one, two, and five chapters respectively. In the existing children’s book format, each easy chapter has one paragraph, medium has two, and hard has three or four. Aim for about 40 segmented words per paragraph.
3. Choose Easy, Medium, or Hard when generating a story. Tailor the story to introduce new characters or revisit material the learner struggles with or has had little practice reading. A story at any difficulty may focus entirely on review. Preview the new characters with their meanings and pronunciations before reading.
4. Validate the entire story before showing its introduction. Check the promised targets and vocabulary budget, then save its chapters and word annotations together so resumed sessions show the same text.
   Show simplified Chinese with small pinyin controlled by a persistent Settings preference. A single tap on a word reveals its English meaning in the sentence. A double-tap explicitly marks difficulty with that word.
5. Save the story. On completion, show progress and the items the learner struggled with. Store the optional thumbs-up or thumbs-down rating for later analysis.

### Story targets

A short story defaults to two new characters on Easy, three on Medium, and five on Hard. Each additional chapter adds up to two slots, with length-based growth stopping at twelve. A short-story ceiling of one adds one slot per chapter and zero keeps all lengths review-only. Settings stores the learner’s preferred difficulty and short-story ceilings.

HSK 1 words are available as background vocabulary from day one. The first story can select characters from this pool to teach deliberately. Other background characters remain unseen until encountered. Later stories can introduce characters from the next level as explicit targets.

The unseen-character boost uses the Library’s Unseen characters in the next unpassed HSK level. From 90% of the way to that level, a long Hard story reserves up to three initial review cards and prioritizes those characters. The boost ends when the level’s Unseen list is empty. Ordinary review and introduction rules fill the remaining slots. After a pass, the same thresholds apply to progress through the next level.

A story may introduce one additional unfamiliar compound made entirely from familiar characters. Preview it as a whole word. Give each story an explicit review goal when prior practice is available. Show “New this story” with pronunciation, meaning, and a word containing each target character. Show “Practice again” for review items and reuse them in different sentences. Viewing the introduction earns no reading credit.

### Generating a story

The backend selects background vocabulary, eligible review targets, new material, and the length target before requesting a story. Include that plan in the prompt. Require each sentence as an ordered sequence of word and punctuation entries. Preserve the approved segmentation in storage and render entries together as natural Chinese. Each word occurrence must lead to its contextual dictionary information.

Each word occurrence identifies a dictionary entry and the sense intended in that sentence. Resolve pinyin and English meaning from the dictionary. Validate that the entry matches the written form and contains the selected sense. The model chooses the meaning in context. Reader actions and word flashcards refer to the same word identity.

When validation fails, return specific errors and request a revision of the affected chapter. Allow up to two automatic correction attempts across the story and revalidate the complete story after each. If validation still fails, offer a manual retry. Generation and retries leave learner scores untouched.

Multi-chapter stories distribute focus words across overlapping groups. With twelve focus words, five chapters cover words 1–4, 3–6, 5–8, 7–10 and 9–12. Each assigned word must appear in its chapter. The preview estimates points from those appearances. When eligible introductions leave slots open, longer stories fill them with additional review or background vocabulary.

Estimate short and long story lengths provisionally at first. After several completed chapters, use the learner’s active reading time, including definition checks, to adjust future lengths.

### Library and review

Favor unseen HSK 1 material first. Once the learner reads recent HSK 1 stories comfortably and has few unresolved review items, occasionally introduce HSK 2 targets even if some HSK 1 entries are still gray. A word becomes eligible for deliberate story review 24 hours after its difficulty mark. During that interval it can occur naturally as background vocabulary and remains available for Library practice.

Provide separate Characters and Words views. A character entry shows its readings, meanings, and examples of words that use it. A word entry shows its pronunciation, meaning, and component characters with their readings. Track character and word flashcards separately. Difficulty with a word brings that whole word back for review.

Start every new learner at HSK 1 in the six-level curriculum. All entries begin unseen. A starting-level selector or placement test is a possible later addition.

Assign each character to the earliest curriculum level containing a word that uses it. Show examples from the learner’s level first. In a word entry, display each character’s pronunciation in that word and link to its other readings and uses.

A difficulty mark records the occurrence in usage history and queues its penalty for story completion. A lookup excludes the affected vocabulary from unaided appearance credit. Each completed chapter saves its base points. The final chapter applies the story multiplier and posts the award to the Library. [Story scoring](reading-strength.md)

Group material under HSK levels 1–6. Use green for strong reading knowledge, yellow for uncertain, red for struggling, and gray for unseen. Library Practice opens a set of ten exercises at the selected level, mixing characters and words with priority for weak and overdue entries. Choose an English meaning or match up to five entries to their meanings. Show pinyin with each entry and grade each target once. A matching board submits all pairs together. After a set, offer another set when fresh overdue targets remain.

Completing a chapter containing a compound records an encounter with its component characters. A character’s first such encounter moves it from gray to yellow. Reading the character as a standalone word or reviewing its character flashcard builds evidence of independent recognition.

Green requires repeated success. A first correct flashcard answer leaves an unseen item yellow. Successful recall on another day carries more weight, and repeated unaided reading can bring a word to green. An incorrect first flashcard answer can turn an unseen item red. A miss on an established item lowers its strength while preserving prior evidence.

Start separate Characters or Words sessions of up to ten cards. Favor weaker items and mix in familiar ones. Offer Incorrect, Almost, and Got it buttons on desktop and mobile, with mobile swipe shortcuts. Almost covers partial recall of pronunciation or meaning.

Answering the final chapter question (or selecting Finish chapter on a story without questions) awards the chapter’s automatic reading gains once per learner. Rereading, refreshing, or finishing the same chapter on another device cannot award those gains again. Learners can still mark a difficult word on a later reading.

### Presentation

Show Start reading on the first visit. When a story is in progress, show Continue reading with its title and chapter. Resume at the saved paragraph across devices. Practice remains available for starting a new story.

Place Recent stories below the main dashboard card. See all opens the complete story history, with each saved story labeled In progress or Finished.

Show one circle per day in the weekly reading view. Fully color a day when the learner finishes at least one story. Use a lighter fill for a day when the learner reads without finishing a story. Leave inactive days empty. If a story spans two days, the earlier reading day keeps its lighter fill and the completion day gets full color.

A day qualifies for light fill when the learner advances to another paragraph, checks a word, marks a difficulty, or spends one active minute in the reader. Opening and immediately closing a story leaves the day empty. Show one numeric summary for the week, the number of stories finished. The circles convey daily activity.

At story completion, show each explicitly marked word alongside the sentence where the learner marked it. Offer Practice these words when there are marked words. These words are immediately available for meaning-choice and matching exercises. Collect the optional thumbs-up or thumbs-down story rating separately.

The supplied illustrations establish the warm paper palette, deep red controls, and responsive chapter layout. The desktop reference places the chapter list beside the reading column and opens a dictionary alongside it. Generate the text first. Artwork and audio in the references are outside the current reading discussion.

### 包包 and illustrated story covers

Dudian (读点) is the app name. 包包 (Bāobāo) drives the action in children’s books and can appear in baby books. Beginner stories use a small, concrete goal with a visible outcome, like catching a train with Dad. More advanced stories can revisit the same setting with richer language and more complicated situations.

Start with 包包 and everyday family life. Mom and Dad can appear in early scenes. The intended progression introduces more relatives, such as a younger sister and an uncle, as the learner gains distinct Strong characters. Introduced cast members stay available. Other food characters are a future expansion. Add Meet the cast to the Library, beginning with 包包’s portrait, name, pinyin, and a short introduction.

Allow approved cast names in stories as names. Selecting 包包 shows the character’s name and introduction. Name occurrences consume no teaching slot and award no vocabulary strength. Ordinary vocabulary uses of the same written characters follow the usual learning rules.

Each new story has one cover illustration based on a scene from its accepted text using the approved 包包 reference portrait only at the children’s book stage. Use the illustration for the story thumbnail and Introduction. The cover includes a one- or two-sentence Chinese teaser in the approved vocabulary, the chapter list, and Start reading. Continue reading resumes the saved paragraph. Make the text available as soon as it and the comprehension checks are ready. Display a reading-appropriate placeholder while illustration is pending or unavailable, and allow artwork retries for the same story.

### UI reference screenshots

- [Mobile dashboard, story list, reader, and word card](<Street Talk Mandarin reading app screens.png>)
- [Mobile chapter reader](<A Rainy Afternoon Story.png>)
- [Desktop chapter reader with chapter list and dictionary](<Rainy Afternoon Tea Shop Reader-1.png>)
- [Desktop reading dashboard](<Street Talk reading week dashboard-2.png>)

### First release of the cast and cover

包包 is the only named cast member with a profile. Every Bāobāo children’s book names 包包 in the reading text. 妈妈 and 爸爸 are ordinary family vocabulary. Apply the cast-name rule to the cover teaser and comprehension questions too. A question about whom 包包 accompanied can test 爸爸.

Label the opening page Introduction across reading types. Keep its New this story and Practice again vocabulary sections with pronunciation and meanings. Show the cover illustration, short Chinese teaser, Start reading, and chapter list on this page.

Dudian uses the Sign in with ChatGPT open-source preview for story text. As verified on 23 November 2026, its plan-funded inference route excludes image generation even when the selected model accepts image input. [OpenAI preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

Offer both artwork paths in the first release. Offer **Copy illustration prompt** and **Import cover**. The learner can use the story’s scene description and any applicable reference portrait in ChatGPT Images, then import the illustration for that story. Use the imported image on the cover and in the story overview.

Automatic artwork uses a host Codex worker signed in with ChatGPT. New installations enable subscription covers by default. Existing learners keep their automatic-generation preference. Separately billed API artwork requires explicitly choosing the API provider. The cover, vocabulary preview, and reader are available while the illustration is being drawn.

## Chapter comprehension checks

Generate and save comprehension questions in the background story-generation job after the chapter text passes validation. Each question links to a supporting sentence in its chapter and identifies the tested word and its contextual sense. The backend validates these references and checks the Chinese in the prompt and all choices against the story’s approved vocabulary pool. A question may use familiar words that do not occur in the chapter. Stories saved before this feature retain their original completion flow.

New chapters end with one inline comprehension question on Easy, two on Medium, and three on Hard. Hover over the Chinese words for dictionary help or tap a prompt word. Each question has three choices and one correct answer. **Show English** reveals the prompt and choices. Submitting the final answer marks the chapter complete and offers the next chapter or story summary. Previously saved chapters keep their original checks.

Save the first answer and its pending score together. Immediately show the correct choice and supporting sentence. Leaving and returning resumes the check with submitted answers locked. Record chapter completion after all its questions have answers, at any score. The saved check works without contacting the AI service.

Use the story focus tier to score the tested word and any explicitly tested characters. Revealing English before a correct answer counts toward quiz accuracy and earns zero direct points. Tested items receive their answer outcome once per attempt and have no separate passage award. [Scoring and final award](reading-strength.md)

## Local data and persistence

Bundle pinned versions of CC-CEDICT and the six-level HSK vocabulary lists with the app. Include source versions, attribution, and license notices. Saved stories retain their word annotations so dictionary lookups and flashcards work while the Docker app is running, even when the AI service is unavailable.

Store stories, reading positions, and learner progress in a single backend SQLite database on a persistent Docker volume. Desktop and mobile use the same learner record. Rebuilding the container preserves progress when the volume is retained.
