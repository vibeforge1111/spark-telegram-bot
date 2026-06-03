import { spawnerAuthHeaders } from '../src/spawnerAuth';

describe('spawnerAuthHeaders', () => {
  const baseEnv: Record<string, string> = {};

  it('does not use SPARK_UI_API_KEY as control key', () => {
    const env = { ...baseEnv, SPARK_UI_API_KEY: 'ui-key-123' };
    const headers = spawnerAuthHeaders(env);
    expect(headers['x-api-key']).toBeUndefined();
    expect(headers['x-spawner-ui-key']).toBe('ui-key-123');
  });

  it('uses SPARK_BRIDGE_API_KEY as control key', () => {
    const env = { ...baseEnv, SPARK_BRIDGE_API_KEY: 'bridge-key-123', SPARK_UI_API_KEY: 'ui-key' };
    const headers = spawnerAuthHeaders(env);
    expect(headers['x-api-key']).toBe('bridge-key-123');
    expect(headers['x-spawner-ui-key']).toBe('ui-key');
  });

  it('uses MCP_API_KEY as control key when BRIDGE is missing', () => {
    const env = { ...baseEnv, MCP_API_KEY: 'mcp-key-456', SPARK_UI_API_KEY: 'ui-key' };
    const headers = spawnerAuthHeaders(env);
    expect(headers['x-api-key']).toBe('mcp-key-456');
    expect(headers['x-spawner-ui-key']).toBe('ui-key');
  });

  it('uses EVENTS_API_KEY as control key when BRIDGE and MCP are missing', () => {
    const env = { ...baseEnv, EVENTS_API_KEY: 'events-key-789', SPARK_UI_API_KEY: 'ui-key' };
    const headers = spawnerAuthHeaders(env);
    expect(headers['x-api-key']).toBe('events-key-789');
    expect(headers['x-spawner-ui-key']).toBe('ui-key');
  });

  it('returns empty headers when no keys are set', () => {
    const env = { ...baseEnv };
    const headers = spawnerAuthHeaders(env);
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it('does not fall back from UI key to control key', () => {
    const env = { ...baseEnv, SPARK_UI_API_KEY: 'only-ui-key' };
    const headers = spawnerAuthHeaders(env);
    expect(headers['x-api-key']).toBeUndefined();
  });
});
