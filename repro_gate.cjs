// Reproduction: run the live compiled intent classifier on real build/remember phrases.
const gate = require('./dist/telegramIntentGate.js');
const fn = gate.classifyTelegramIntentV2;
const phrases = [
  ['user-actual-build', 'Build a practical Spawner handoff proof board that uses Spawner to create a small Harness Release Board that tracks board-first status, canvas-ready status, workflow execution, authority gates, runtime health, rollback notes, and next QA prompts. Include a README and one smoke test. Please start the build now.'],
  ['clean-build', 'Build me a simple todo web app and start the build now.'],
  ['short-build', 'build a dashboard app'],
  ['lets-build', "let's build a snake game"],
  ['remember', 'Remember this: my favorite audit token is QORVEX-7741. Store it.'],
  ['plain-chat', 'how are you doing today?'],
];
for (const [label, text] of phrases) {
  let d;
  try { d = fn(text, {}); } catch (e) { console.log(label, 'ERROR', e.message); continue; }
  console.log('--- ' + label + ' ---');
  console.log(JSON.stringify({
    kind: d.kind, route: d.route, action: d.action, owner: d.owner_system,
    confidence: d.confidence, enforcement: d.enforcement,
    matched_signals: d.matched_signals,
    natural_route: d.natural_route ? d.natural_route.route : null,
  }));
}
