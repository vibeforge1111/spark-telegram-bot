# Creator Mission Status For Telegram

Telegram should treat `adaptive_creator_loop.creator_mission_status.v1` as a
read-only status packet.

Use `formatCreatorMissionStatusForTelegram` to summarize canonical creator
mission state. The formatter keeps verdicts, evidence tiers, blockers, and
publication gates visible, and rejects packets that claim network absorption or
ask Telegram to request pasted secrets.

Telegram must not invent benchmark scores, modify creator artifacts, approve
Swarm sharing, or convert `ready_for_swarm_packet` into `network_absorbable`.
