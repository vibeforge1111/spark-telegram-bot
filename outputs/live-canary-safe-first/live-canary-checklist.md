# SparkRecursive_bot Control-Proof Canary Checklist

Verdict values: pass, fail, blocked, needs-retest, untested

1. cp-builder-001
- Category: builder
- Risk: safe
- Prompt: In one sentence, what does route confidence mean for Spark? Do not start anything.
- Expected authority: read_only_allowed
- Expected mutation class: read_only
- Expected route: plain_conversation
- Expected reply shape: natural
- Expected side effect: Builder may answer; no mission or mutation.
- Expected proof join: Telegram proof should show a no-execution plain conversation with a Builder-backed reply.
- Source refs: natural-language-live-commands.json:memory-004:derived_from
- Capture observed reply: yes
- Capture side effects: yes
- Capture proof panel: yes
- Capture screenshot/user confirmation: yes
- Verdict: untested
- Observed reply:
- Observed side effects:
- Observed proof join:
- Screenshot/user confirmation:
- Notes:
- Operator note: This is the primary safe Builder-answer canary; route-confidence definitions stay no-execution plain conversation proof.

2. cp-proof-001
- Category: proof
- Risk: inspect_only
- Prompt: Show me whether the last action has Harness proof, but do not run anything new.
- Expected authority: read_only_allowed
- Expected mutation class: read_only
- Expected route: proof.inspect
- Expected reply shape: proof_panel
- Expected side effect: No new action; only proof inspection.
- Expected proof join: Proof panel shows joined and missing planes without raw ids.
- Capture observed reply: yes
- Capture side effects: yes
- Capture proof panel: yes
- Capture screenshot/user confirmation: yes
- Verdict: untested
- Observed reply:
- Observed side effects:
- Observed proof join:
- Screenshot/user confirmation:
- Notes:

3. cp-streaming-001
- Category: streaming
- Risk: inspect_only
- Prompt: /streaming
- Expected authority: read_only_allowed
- Expected mutation class: read_only
- Expected route: streaming.status
- Expected reply shape: compact_card
- Expected side effect: No setting changes.
- Expected proof join: Telegram command reply should prove the live /streaming runtime status and visible transport-proof line came through the active Telegram profile path.
- Capture observed reply: yes
- Capture side effects: yes
- Capture proof panel: no
- Capture screenshot/user confirmation: yes
- Verdict: untested
- Observed reply:
- Observed side effects:
- Observed proof join:
- Screenshot/user confirmation:
- Notes:

4. cp-streaming-002
- Category: rich_messages
- Risk: inspect_only
- Prompt: Give me a two-line rich-message check: bold one word and include one short code token. Do not run anything.
- Expected authority: read_only_allowed
- Expected mutation class: read_only
- Expected route: plain_chat.rich_message_render
- Expected reply shape: natural
- Expected side effect: No mutation.
- Expected proof join: Telegram delivery audit should carry request/trace for the reply.
- Capture observed reply: yes
- Capture side effects: yes
- Capture proof panel: no
- Capture screenshot/user confirmation: yes
- Verdict: untested
- Observed reply:
- Observed side effects:
- Observed proof join:
- Screenshot/user confirmation:
- Notes:
