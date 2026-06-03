import { loadEnvFileIntoProcess } from '../src/profileEnv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'profileEnv-test-'));

describe('loadEnvFileIntoProcess', () => {
  it('strips matching double quotes from values', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.env');
    fs.writeFileSync(file, 'MY_KEY="hello world"');
    const env: Record<string, string> = {};
    loadEnvFileIntoProcess(file, env);
    expect(env.MY_KEY).toBe('hello world');
    fs.rmSync(dir, { recursive: true });
  });

  it('strips matching single quotes from values', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.env');
    fs.writeFileSync(file, "MY_KEY='hello world'");
    const env: Record<string, string> = {};
    loadEnvFileIntoProcess(file, env);
    expect(env.MY_KEY).toBe('hello world');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not strip quotes when they do not match', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.env');
    fs.writeFileSync(file, "MY_KEY=\"hello'");
    const env: Record<string, string> = {};
    loadEnvFileIntoProcess(file, env);
    expect(env.MY_KEY).toBe('"hello\'');
    fs.rmSync(dir, { recursive: true });
  });

  it('leaves unquoted values unchanged', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.env');
    fs.writeFileSync(file, 'MY_KEY=plain_value');
    const env: Record<string, string> = {};
    loadEnvFileIntoProcess(file, env);
    expect(env.MY_KEY).toBe('plain_value');
    fs.rmSync(dir, { recursive: true });
  });

  it('handles empty quoted values', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.env');
    fs.writeFileSync(file, 'MY_KEY=""');
    const env: Record<string, string> = {};
    loadEnvFileIntoProcess(file, env);
    expect(env.MY_KEY).toBe('');
    fs.rmSync(dir, { recursive: true });
  });

  it('skips comment lines and blank lines', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.env');
    fs.writeFileSync(file, '# comment\n\nMY_KEY=val');
    const env: Record<string, string> = {};
    loadEnvFileIntoProcess(file, env);
    expect(env.MY_KEY).toBe('val');
    expect(Object.keys(env)).toHaveLength(1);
    fs.rmSync(dir, { recursive: true });
  });
});
