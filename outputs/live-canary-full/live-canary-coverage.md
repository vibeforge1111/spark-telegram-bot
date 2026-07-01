# SparkRecursive_bot Control-Proof Canary Coverage

Cases: 29
Intentional action cases: 4
Manual media cases: 4
Required category coverage: complete
Missing required categories: none
Full release pack: complete
Release-check scope: full release readiness
Missing release cases: none

Categories:
- access: 2
- audio: 1
- authority: 2
- builder: 3
- media: 2
- memory: 2
- mission: 1
- model_switch: 2
- no_action: 4
- proof: 2
- publish: 1
- rich_messages: 1
- spawner_build: 2
- streaming: 1
- voice: 1
- web_research: 2

Risk:
- inspect_only: 11
- intentional_action: 4
- manual_media: 4
- safe: 10

Mutation classes:
- external_network: 1
- launches_mission: 1
- media_read: 4
- none: 5
- read_only: 15
- switches_provider: 1
- updates_access_setting: 1
- writes_files: 1

Authority expectations:
- chat_only: 5
- confirmation_required_or_allowed: 5
- media_evidence_only: 4
- read_only_allowed: 15
