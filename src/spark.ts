/**
 * Launch-safe Spark status helpers.
 *
 * The older local Spark dashboard/API is intentionally out of the launch path.
 * Keep these commands non-networked until the new dashboard contract is ready.
 */

const DASHBOARD_DEFERRED =
  'The Spark dashboard/resonance surface is not part of this launch build yet. ' +
  'Core chat, LLM, Builder memory, and Spawner relay are the supported launch path.';

export const spark = {
  /**
   * Spark itself is available when the bot process is running. Legacy dashboard
   * health is no longer used as the source of truth.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  },

  /**
   * Format a quick launch status summary.
   */
  async getQuickStatus(): Promise<string> {
    return [
      'Launch core: ONLINE',
      'Dashboard/resonance: deferred',
      '',
      DASHBOARD_DEFERRED,
    ].join('\n');
  },

  async getResonance(): Promise<string> {
    return DASHBOARD_DEFERRED;
  },

  async getInsights(_limit = 5): Promise<string> {
    return DASHBOARD_DEFERRED;
  },

  async getVoice(): Promise<string> {
    return DASHBOARD_DEFERRED;
  },

  async getSurprises(): Promise<string> {
    return DASHBOARD_DEFERRED;
  },

  async processQueue(): Promise<string> {
    return 'Dashboard queue processing is deferred for this launch build.';
  },

  async reflect(): Promise<string> {
    return 'Dashboard reflection is deferred for this launch build.';
  },
};
