# SparkRecursive_bot Control-Proof Canary Coverage

Cases: 4
Intentional action cases: 0
Manual media cases: 0
Required category coverage: missing
Missing required categories: no_action, authority, spawner_build, mission, memory, access, web_research, model_switch, media, audio, voice
Full release pack: missing
Missing release cases: cp-noaction-001, cp-noaction-002, cp-noaction-003, cp-noaction-004, cp-authority-001, cp-authority-002, cp-proof-002, cp-builder-002, cp-memory-001, cp-memory-002, cp-access-001, cp-access-002, cp-model-001, cp-model-002, cp-web-001, cp-web-002, cp-spawner-001, cp-spawner-002, cp-mission-001, cp-media-001, cp-media-002, cp-voice-001, cp-audio-001

Categories:
- builder: 1
- proof: 1
- rich_messages: 1
- streaming: 1

Risk:
- inspect_only: 3
- safe: 1

Mutation classes:
- read_only: 4

Authority expectations:
- read_only_allowed: 4
