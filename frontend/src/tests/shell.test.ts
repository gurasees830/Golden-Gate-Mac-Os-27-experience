import { describe, it, expect, beforeAll } from 'vitest';
import { tokenize, runLine, type ShellState, type ShellIO } from '../lib/shell';
import { useFs, HOME, resolvePath } from '../stores/fs';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const io: ShellIO = { clear() {}, exit() {}, open() {}, openApp() {} };
const st: ShellState = { cwd: HOME, env: { HOME: '~', USER: 'guest' }, history: [] };
const sh = async (line: string) => strip(await runLine(line, st, io));

beforeAll(async () => {
  await useFs.getState().init();
});

describe('shell tokenizer', () => {
  it('splits on whitespace, honours quotes and escapes', () => {
    expect(tokenize(`echo "hello world" 'a b' c\\ d`)).toEqual(['echo', 'hello world', 'a b', 'c d']);
  });
  it('separates pipes, redirects and command separators', () => {
    expect(tokenize('ls|grep x>out.txt&&cat out.txt;pwd')).toEqual(['ls', '|', 'grep', 'x', '>', 'out.txt', '&&', 'cat', 'out.txt', ';', 'pwd']);
    expect(tokenize('echo hi >> log')).toEqual(['echo', 'hi', '>>', 'log']);
  });
});

describe('shell commands against the virtual disk', () => {
  it('creates folders and files, and reads them back', async () => {
    await sh('mkdir -p tmp/nested');
    expect(resolvePath(useFs.getState().nodes, 'tmp/nested', HOME)).toBeTruthy();
    expect(await sh('cd tmp && pwd')).toMatch(/\/tmp$/);
    expect(await sh('echo hello > hi.txt && cat hi.txt')).toBe('hello');
    await sh('echo again >> hi.txt');
    expect(await sh('cat hi.txt')).toBe('hello\nagain');
    expect(await sh('cat hi.txt | grep again | wc -l')).toMatch(/1/);
  });
  it('moves, copies and removes', async () => {
    await sh('cp hi.txt copy.txt');
    await sh('mv copy.txt nested/moved.txt');
    expect(await sh('ls nested')).toContain('moved.txt');
    await sh('rm nested/moved.txt');
    expect(await sh('ls nested')).not.toContain('moved.txt');
  });
  it('stops an && chain after a failure but continues after ;', async () => {
    expect(await sh('cat nope.txt && echo should-not-run')).not.toContain('should-not-run');
    expect(await sh('cat nope.txt ; echo ran')).toContain('ran');
  });
  it('expands environment variables', async () => {
    await sh('export GREETING=hey');
    expect(await sh('echo $GREETING $USER')).toBe('hey guest');
  });
  it('refuses to pretend it can reach the host or network', async () => {
    expect(await sh('sudo rm -rf /')).toMatch(/not|simulat|cannot|can't/i);
    expect(await sh('curl https://example.com')).toMatch(/not|simulat|cannot|can't/i);
  });
  it('reports unknown commands like zsh', async () => {
    expect(await sh('frobnicate')).toMatch(/command not found/);
  });
});
