# Synthetic fixtures

Stage 1 ships **50** JSON message fixtures under `messages/`. They cover every primary category, ATS-brand senders, multi-employer conflict, missing fields, forwarded content, and adversarial instructions.

Replay (persists decisions; **zero** Gmail mutations in dry run):

```bash
pnpm fixtures:replay
```

These fixtures are synthetic. They must never include real mailbox content or credentials.
