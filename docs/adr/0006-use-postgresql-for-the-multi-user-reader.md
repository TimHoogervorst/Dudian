# Use PostgreSQL for the multi-user reader

The move from one learner to multiple accounts changes the ownership of almost every progress table. We chose to switch to PostgreSQL during that redesign so we can enforce learner isolation with row-level security, support concurrent progress updates, and use the same database for the generation queue. The browser handles rendering and navigation, while the backend owns sessions, progress writes, provider credentials, and generation.
