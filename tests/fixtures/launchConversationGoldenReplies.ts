export type LaunchConversationGoldenReply = {
  name: string;
  surface:
    | 'setup'
    | 'memory'
    | 'self_awareness'
    | 'route_failure'
    | 'chat_failure'
    | 'operator_repair'
    | 'unknown'
    | 'casual'
    | 'fast_user'
    | 'frustrated_user';
  text: string;
};

export const launchConversationGoldenReplies: LaunchConversationGoldenReply[] = [
  {
    name: 'voice setup already installed',
    surface: 'setup',
    text:
      'Nice, Kokoro is already installed for this Spark. The local voice files are connected too.\n\n' +
      'You can test it with `/voice onboard local`.'
  },
  {
    name: 'voice setup ready',
    surface: 'setup',
    text:
      'Nice, local voice is ready: faster-whisper for listening, Kokoro for replies.\n\n' +
      'Ask me for one short voice reply, then send a quick Telegram voice note.'
  },
  {
    name: 'memory saved',
    surface: 'memory',
    text:
      'Saved that to Spark memory.\n\n' +
      'I kept it as reusable preference context, not as a command for future replies.'
  },
  {
    name: 'memory unavailable',
    surface: 'memory',
    text:
      'I could not reach Spark memory right now, so I did not save anything.\n\n' +
      'Run `/diagnose` when you want to check the memory route.'
  },
  {
    name: 'what Spark remembers',
    surface: 'memory',
    text:
      'I remember the current launch focus: improve Spark conversations safely without changing memory paths.\n\n' +
      'The strongest recent detail is your spacing rule for Telegram replies.'
  },
  {
    name: 'self-awareness boundary',
    surface: 'self_awareness',
    text:
      'Spark can see the conversation surface and the recent launch checks.\n\n' +
      'That is evidence for this chat path, not proof that every route is healthy.'
  },
  {
    name: 'route failure',
    surface: 'route_failure',
    text:
      'Spark could not reach that route right now.\n\n' +
      'I did not guess the result. Run `/probe core` after the service is back.'
  },
  {
    name: 'chat runtime failure',
    surface: 'chat_failure',
    text:
      'Spark hit the chat runtime timeout before it could answer cleanly.\n\n' +
      'Run `/diagnose` and check the active chat provider.'
  },
  {
    name: 'operator repair',
    surface: 'operator_repair',
    text:
      'Builder bridge command did not finish cleanly.\n\n' +
      'Run `/diagnose` for the current Builder and memory status.'
  },
  {
    name: 'unknown answer',
    surface: 'unknown',
    text:
      'I do not have enough evidence to answer that cleanly yet.\n\n' +
      'Send the missing detail or ask me to check the relevant route.'
  },
  {
    name: 'casual support',
    surface: 'casual',
    text:
      'Yep, I am with you.\n\n' +
      'The safest move is to improve the replies people actually see, then keep the memory system exactly where it is for launch.'
  },
  {
    name: 'moving fast',
    surface: 'fast_user',
    text:
      'Got it. I will keep this tight and stay on the launch-safe path.\n\n' +
      'I will improve the visible conversation checks, then run the focused tests before touching anything else.'
  },
  {
    name: 'frustrated spacing feedback',
    surface: 'frustrated_user',
    text:
      'You are right, that spacing made the reply harder to read.\n\n' +
      'I will turn the better shape into a test so we do not keep rediscovering it by hand.'
  }
];
