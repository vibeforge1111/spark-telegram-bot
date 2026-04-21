/**
 * Spark Intelligence Client
 * Connects to Spark API for learnings, status, and resonance
 */

import axios from 'axios';

const SPARK_API = process.env.SPARK_API_URL || 'http://localhost:8787';
const SPARK_DASHBOARD = process.env.SPARK_DASHBOARD_URL || 'http://localhost:8585';

interface SparkStatus {
  ok: boolean;
  port: number;
  bridge_worker?: {
    last_heartbeat: number;
    stats: Record<string, unknown>;
    pattern_backlog: number;
    validation_backlog: number;
  };
}

interface DashboardStatus {
  cognitive: {
    total: number;
    avg_reliability: number;
    by_category: Record<string, number>;
    insights: Array<{
      category: string;
      insight: string;
      reliability: number;
      validations: number;
    }>;
  };
  mind: {
    available: boolean;
    synced: number;
    queue: number;
  };
  queue: {
    events: number;
  };
  resonance: {
    score: number;
    state: string;
    icon: string;
    name: string;
    description: string;
  };
  voice: {
    opinions_count: number;
    growth_count: number;
    opinions: Array<{
      topic: string;
      preference: string;
      strength: number;
    }>;
    growth: Array<{
      before: string;
      after: string;
    }>;
  };
  surprises: {
    total: number;
    lessons: number;
    recent: Array<{
      type: string;
      lesson: string | null;
    }>;
  };
}

export const spark = {
  /**
   * Check if Spark API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await axios.get(`${SPARK_API}/health`, { timeout: 2000 });
      return res.data === 'ok';
    } catch {
      return false;
    }
  },

  /**
   * Get Spark API status
   */
  async getStatus(): Promise<SparkStatus | null> {
    try {
      const res = await axios.get(`${SPARK_API}/status`, { timeout: 3000 });
      return res.data;
    } catch {
      return null;
    }
  },

  /**
   * Get full dashboard status (includes resonance, insights, voice)
   */
  async getDashboardStatus(): Promise<DashboardStatus | null> {
    try {
      const res = await axios.get(`${SPARK_DASHBOARD}/api/status`, { timeout: 5000 });
      return res.data;
    } catch {
      return null;
    }
  },

  /**
   * Format a quick status summary
   */
  async getQuickStatus(): Promise<string> {
    const [sparkOk, dashboard] = await Promise.all([
      this.isAvailable(),
      this.getDashboardStatus()
    ]);

    if (!sparkOk) {
      return '❌ Spark is offline';
    }

    if (!dashboard) {
      return '⚡ Spark API: Online\n📊 Dashboard: Offline';
    }

    const r = dashboard.resonance;
    const c = dashboard.cognitive;
    const q = dashboard.queue;

    return [
      `${r.icon} Resonance: ${r.name} (${r.score.toFixed(1)}%)`,
      `📊 Insights: ${c.total} (${(c.avg_reliability * 100).toFixed(0)}% reliable)`,
      `📥 Queue: ${q.events} events`,
      `🧠 Mind: ${dashboard.mind.available ? 'Online' : 'Offline'}`,
    ].join('\n');
  },

  /**
   * Get resonance state
   */
  async getResonance(): Promise<string> {
    const dashboard = await this.getDashboardStatus();
    if (!dashboard) return 'Unable to get resonance';

    const r = dashboard.resonance;
    return [
      `${r.icon} ${r.name}`,
      `Score: ${r.score.toFixed(1)}/100`,
      `"${r.description}"`,
    ].join('\n');
  },

  /**
   * Get cognitive insights summary
   */
  async getInsights(limit = 5): Promise<string> {
    const dashboard = await this.getDashboardStatus();
    if (!dashboard) return 'Unable to get insights';

    const c = dashboard.cognitive;
    const categories = Object.entries(c.by_category)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `  ${cat}: ${count}`)
      .join('\n');

    const recent = c.insights
      .slice(0, limit)
      .map((i, idx) => `${idx + 1}. [${i.category}] ${i.insight.slice(0, 50)}...`)
      .join('\n');

    return [
      `📊 Cognitive Insights: ${c.total}`,
      `Avg Reliability: ${(c.avg_reliability * 100).toFixed(0)}%`,
      '',
      'By Category:',
      categories,
      '',
      'Recent:',
      recent || '(none)',
    ].join('\n');
  },

  /**
   * Get what Spark learned about the user (voice)
   */
  async getVoice(): Promise<string> {
    const dashboard = await this.getDashboardStatus();
    if (!dashboard) return 'Unable to get voice profile';

    const v = dashboard.voice;

    const opinions = v.opinions
      .slice(0, 6)
      .map(o => `• ${o.topic}: ${o.preference.slice(0, 40)}${o.preference.length > 40 ? '...' : ''}`)
      .join('\n');

    const growth = v.growth
      .slice(0, 3)
      .map(g => `Before: ${g.before}\nAfter: ${g.after}`)
      .join('\n\n');

    return [
      `🎤 Voice Profile`,
      `Opinions: ${v.opinions_count} | Growth moments: ${v.growth_count}`,
      '',
      'What Spark learned about you:',
      opinions || '(still learning)',
      '',
      growth ? `Growth:\n${growth}` : '',
    ].filter(Boolean).join('\n');
  },

  /**
   * Get surprise lessons (prediction mismatches)
   */
  async getSurprises(): Promise<string> {
    const dashboard = await this.getDashboardStatus();
    if (!dashboard) return 'Unable to get surprises';

    const s = dashboard.surprises;

    const lessons = s.recent
      .filter(r => r.lesson)
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.lesson}`)
      .join('\n');

    return [
      `💡 Surprise Lessons: ${s.lessons} extracted from ${s.total} surprises`,
      '',
      lessons || '(no lessons yet)',
    ].join('\n');
  },

  /**
   * Process pending events in the queue
   */
  async processQueue(): Promise<string> {
    try {
      const res = await axios.post(`${SPARK_API}/process`, {}, { timeout: 30000 });
      const data = res.data;

      if (data.processed !== undefined) {
        return [
          `✅ Processing complete!`,
          `📥 Processed: ${data.processed} events`,
          data.learnings ? `🧠 New learnings: ${data.learnings}` : '',
          data.patterns ? `🔍 Patterns found: ${data.patterns}` : '',
        ].filter(Boolean).join('\n');
      }

      return `✅ Processing triggered`;
    } catch (err: any) {
      if (err.response?.status === 404) {
        return '❌ Process endpoint not available. Is Spark daemon running?';
      }
      return `❌ Failed to process: ${err.message}`;
    }
  },

  /**
   * Trigger a deep reflection session
   */
  async reflect(): Promise<string> {
    try {
      const res = await axios.post(`${SPARK_API}/reflect`, {}, { timeout: 60000 });
      const data = res.data;

      return [
        `🔮 Reflection complete!`,
        data.meta_patterns ? `Meta-patterns: ${data.meta_patterns}` : '',
        data.insights ? `New insights: ${data.insights}` : '',
      ].filter(Boolean).join('\n');
    } catch (err: any) {
      if (err.response?.status === 404) {
        return '❌ Reflect endpoint not available';
      }
      return `❌ Failed to reflect: ${err.message}`;
    }
  },
};
