import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import writeApprovalExtension, {
  EXTENSION_ID,
  SHORTCUT,
  STATUS_TEXT,
} from '../src/index.ts';
import { USER_ROOT, inTmp, inUserRoot } from './fixtures.ts';

interface CommandOptions {
  description?: string;
  getArgumentCompletions?: (prefix: string) => unknown;
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
}

interface HarnessOptions {
  hasUI?: boolean;
  confirm?: boolean;
  flag?: boolean;
}

/** Minimal stand-in for the Pi runtime: records UI calls, replays handlers. */
function createHarness(options: HarnessOptions = {}) {
  const hasUI = options.hasUI ?? true;
  const confirmAnswer = options.confirm ?? true;
  const asked: { title: string; detail: string }[] = [];
  const notifications: { message: string; level?: string | undefined }[] = [];
  const statuses: (string | undefined)[] = [];
  const commands = new Map<string, CommandOptions>();
  const flags = new Map<string, boolean | string | undefined>();
  let shortcutHandler: ((ctx: ExtensionContext) => void) | undefined;
  let sessionStartHandler:
    | ((event: { type: string }, ctx: ExtensionContext) => Promise<void>)
    | undefined;
  let toolCallHandler:
    ((event: unknown, ctx: ExtensionContext) => Promise<unknown>) | undefined;

  const ui = {
    confirm: async (title: string, detail: string) => {
      asked.push({ title, detail });
      return confirmAnswer;
    },
    notify: (message: string, level?: string) => {
      notifications.push({ message, level });
    },
    setStatus: (_key: string, text: string | undefined) => {
      statuses.push(text);
    },
  };

  const ctx = {
    hasUI,
    mode: 'tui',
    cwd: USER_ROOT,
    ui,
  } as unknown as ExtensionContext;

  const pi = {
    on: (event: string, handler: unknown) => {
      if (event === 'session_start')
        sessionStartHandler = handler as typeof sessionStartHandler;
      if (event === 'tool_call')
        toolCallHandler = handler as typeof toolCallHandler;
      return () => {};
    },
    registerFlag: (
      name: string,
      flagOptions: { default?: boolean | string },
    ) => {
      flags.set(name, flagOptions.default);
    },
    registerCommand: (name: string, commandOptions: CommandOptions) => {
      commands.set(name, commandOptions);
    },
    registerShortcut: (
      _key: string,
      shortcutOptions: { handler: (ctx: ExtensionContext) => void },
    ) => {
      shortcutHandler = shortcutOptions.handler;
    },
    getFlag: (name: string) => flags.get(name),
  } as unknown as ExtensionAPI;

  writeApprovalExtension(pi);

  return {
    asked,
    notifications,
    statuses,
    commands,
    shortcut: SHORTCUT,
    setFlag(value: boolean) {
      flags.set(EXTENSION_ID, value);
    },
    async startSession() {
      const handler = sessionStartHandler;
      assert.ok(handler, 'session_start handler is registered');
      await handler({ type: 'session_start' }, ctx);
    },
    async runCommand(args: string) {
      const command = commands.get(EXTENSION_ID);
      assert.ok(command, 'command is registered');
      await command.handler(args, ctx);
    },
    runShortcut() {
      const handler = shortcutHandler;
      assert.ok(handler, 'shortcut handler is registered');
      handler(ctx);
    },
    async callTool(toolName: string, input: Record<string, unknown>) {
      const handler = toolCallHandler;
      assert.ok(handler, 'tool_call handler is registered');
      return (await handler(
        { type: 'tool_call', toolCallId: 'call-1', toolName, input },
        ctx,
      )) as { block?: boolean; reason?: string } | undefined;
    },
  };
}

describe('registration', () => {
  it('registers the command, the shortcut, the flag and the handlers', () => {
    const harness = createHarness();
    assert.ok(harness.commands.has(EXTENSION_ID));
    assert.equal(harness.shortcut, 'ctrl+alt+a');
    assert.ok(
      harness.commands.get(EXTENSION_ID)?.getArgumentCompletions?.('o'),
    );
  });
});

describe('default state', () => {
  it('does not ask before writes', async () => {
    const harness = createHarness();
    const result = await harness.callTool('write', {
      path: inUserRoot('notes.md'),
    });
    assert.equal(result, undefined);
    assert.deepEqual(harness.asked, []);
  });

  it('does not ask before deletions', async () => {
    const harness = createHarness();
    const result = await harness.callTool('bash', {
      command: `rm -rf ${inUserRoot('build')}`,
    });
    assert.equal(result, undefined);
    assert.deepEqual(harness.asked, []);
  });

  it('shows the OFF indicator at startup', async () => {
    const harness = createHarness();
    await harness.startSession();
    assert.deepEqual(harness.statuses, [STATUS_TEXT.off]);
  });
});

describe('enabled via command', () => {
  it('asks before a write outside the temp root', async () => {
    const harness = createHarness({ confirm: false });
    await harness.runCommand('on');
    const result = await harness.callTool('write', {
      path: inUserRoot('notes.md'),
    });
    assert.equal(harness.asked.length, 1);
    assert.equal(harness.asked[0]?.title, 'Approve file write?');
    assert.equal(result?.block, true);
    assert.equal(harness.statuses.at(-1), STATUS_TEXT.on);
  });

  it('lets the write through when the user confirms', async () => {
    const harness = createHarness({ confirm: true });
    await harness.runCommand('on');
    const result = await harness.callTool('edit', {
      path: inUserRoot('notes.md'),
    });
    assert.equal(result, undefined);
    assert.equal(harness.asked[0]?.title, 'Approve file edit?');
  });

  it('asks before a shell deletion', async () => {
    const harness = createHarness({ confirm: false });
    await harness.runCommand('on');
    const result = await harness.callTool('bash', {
      command: `rm -rf ${inUserRoot('build')}`,
    });
    assert.equal(harness.asked[0]?.title, 'Approve file deletion?');
    assert.equal(
      harness.asked[0]?.detail,
      `bash: rm -rf ${inUserRoot('build')}`,
    );
    assert.equal(result?.block, true);
  });

  it('skips paths inside the temp root', async () => {
    const harness = createHarness();
    await harness.runCommand('on');
    assert.equal(
      await harness.callTool('write', { path: inTmp('scratch.md') }),
      undefined,
    );
    assert.equal(
      await harness.callTool('bash', { command: `rm -rf ${inTmp('scratch')}` }),
      undefined,
    );
    assert.deepEqual(harness.asked, []);
  });

  it('ignores read-only tools', async () => {
    const harness = createHarness();
    await harness.runCommand('on');
    assert.equal(
      await harness.callTool('read', { path: inUserRoot('notes.md') }),
      undefined,
    );
    assert.deepEqual(harness.asked, []);
  });

  it('stops asking after being switched off', async () => {
    const harness = createHarness();
    await harness.runCommand('on');
    await harness.callTool('write', { path: inUserRoot('notes.md') });
    await harness.runCommand('off');
    assert.equal(harness.statuses.at(-1), STATUS_TEXT.off);
    assert.equal(
      await harness.callTool('write', { path: inUserRoot('other.md') }),
      undefined,
    );
    assert.equal(harness.asked.length, 1);
  });
});

describe('shortcut', () => {
  it('toggles the gate on and off', async () => {
    const harness = createHarness();
    harness.runShortcut();
    await harness.callTool('write', { path: inUserRoot('notes.md') });
    assert.equal(harness.asked.length, 1);

    harness.runShortcut();
    await harness.callTool('write', { path: inUserRoot('notes.md') });
    assert.equal(harness.asked.length, 1);
  });
});

describe('command arguments', () => {
  it('toggles without arguments', async () => {
    const harness = createHarness();
    await harness.runCommand('');
    assert.equal(harness.notifications.at(-1)?.message.includes('on'), true);
    await harness.runCommand('');
    assert.equal(harness.notifications.at(-1)?.message.includes('off'), true);
  });

  it('reports the current state', async () => {
    const harness = createHarness();
    await harness.runCommand('on');
    await harness.runCommand('status');
    assert.equal(harness.notifications.at(-1)?.message, 'Write approval is on');
  });

  it('rejects unknown arguments', async () => {
    const harness = createHarness();
    await harness.runCommand('bogus');
    assert.equal(harness.notifications.at(-1)?.level, 'error');
  });

  it('completes the known arguments', async () => {
    const harness = createHarness();
    const completions = harness.commands
      .get(EXTENSION_ID)
      ?.getArgumentCompletions?.('t');
    assert.deepEqual(completions, [
      { value: 'toggle', label: 'toggle — flip the current state' },
    ]);
  });
});

describe('CLI flag', () => {
  it('starts enabled when the flag is passed', async () => {
    const harness = createHarness({ confirm: false });
    harness.setFlag(true);
    await harness.startSession();
    assert.equal(harness.statuses.at(-1), STATUS_TEXT.on);
    const result = await harness.callTool('write', {
      path: inUserRoot('notes.md'),
    });
    assert.equal(result?.block, true);
  });

  it('starts disabled without the flag', async () => {
    const harness = createHarness();
    await harness.startSession();
    assert.equal(
      await harness.callTool('write', { path: inUserRoot('notes.md') }),
      undefined,
    );
  });
});

describe('no UI available', () => {
  it('blocks instead of prompting', async () => {
    const harness = createHarness({ hasUI: false });
    await harness.runCommand('on');
    const result = await harness.callTool('write', {
      path: inUserRoot('notes.md'),
    });
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? '', /no UI/);
    assert.deepEqual(harness.asked, []);
  });
});
