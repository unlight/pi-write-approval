import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import {
  DELETE_PATTERNS,
  deleteOperands,
  evaluateToolCall,
  extraTmpRoots,
  isDeleteCommand,
  isDeleteInTmpOnly,
  isInTmp,
  stripPrivatePrefix,
} from '../src/policy.ts';
import {
  TMP_LOOKALIKE,
  TMP_ROOT,
  USER_ROOT,
  inTmp,
  inUserRoot,
} from './fixtures.ts';

describe('isInTmp', () => {
  it('accepts paths directly inside the temp root', () => {
    assert.equal(isInTmp(TMP_ROOT), true);
    assert.equal(isInTmp(inTmp('file.txt')), true);
    assert.equal(isInTmp(inTmp('nested', 'dir', 'file.txt')), true);
  });

  it('honors a custom temp root', () => {
    assert.equal(isInTmp(inUserRoot('file.txt'), USER_ROOT), true);
    assert.equal(isInTmp(inTmp('file.txt'), USER_ROOT), false);
  });

  it('rejects paths outside the temp root', () => {
    assert.equal(isInTmp(inUserRoot('file.txt')), false);
    assert.equal(isInTmp(join(TMP_LOOKALIKE, 'file.txt')), false);
    assert.equal(isInTmp(join(TMP_ROOT, '..', 'escape.txt')), false);
  });

  it('rejects empty input', () => {
    assert.equal(isInTmp(''), false);
    assert.equal(isInTmp('   '), false);
  });

  it('treats the macOS /private prefix as the same path', () => {
    assert.equal(isInTmp('/private/tmp/file.txt', '/tmp', 'darwin'), true);
    assert.equal(isInTmp('/private/tmp/file.txt', '/tmp', 'linux'), false);
  });
});

describe('extraTmpRoots', () => {
  it('adds /tmp on macOS only', () => {
    assert.deepEqual(extraTmpRoots('darwin'), ['/tmp']);
    assert.deepEqual(extraTmpRoots('linux'), []);
    assert.deepEqual(extraTmpRoots('win32'), []);
  });
});

describe('stripPrivatePrefix', () => {
  it('drops the prefix on macOS', () => {
    assert.equal(stripPrivatePrefix('/private/tmp/x', 'darwin'), '/tmp/x');
    assert.equal(stripPrivatePrefix('/private', 'darwin'), '/');
    assert.equal(stripPrivatePrefix('/privatex/a', 'darwin'), '/privatex/a');
  });

  it('keeps the path untouched elsewhere', () => {
    assert.equal(
      stripPrivatePrefix('/private/tmp/x', 'linux'),
      '/private/tmp/x',
    );
  });
});

describe('isDeleteCommand', () => {
  it('detects deletion commands', () => {
    const commands = [
      'rm file.txt',
      'rm -rf build',
      '/bin/rm -f file.txt',
      'git rm file.txt',
      'rmdir empty-dir',
      'unlink link',
      'trash file.txt',
      'trash-put file.txt',
      'shred -u secret.txt',
      "find . -name '*.log' -delete",
      'ls | xargs rm',
    ];
    for (const command of commands) {
      assert.equal(isDeleteCommand(command), true, command);
    }
  });

  it('ignores commands that do not delete', () => {
    const commands = [
      'ls -la',
      'cat file.txt',
      'npm run build',
      'git status',
      'echo remove-this-word',
    ];
    for (const command of commands) {
      assert.equal(isDeleteCommand(command), false, command);
    }
  });

  it('exposes the pattern list', () => {
    assert.ok(DELETE_PATTERNS.length > 0);
  });
});

describe('deleteOperands', () => {
  it('keeps only operands with a path separator', () => {
    assert.deepEqual(deleteOperands('rm -rf build'), []);
    assert.deepEqual(deleteOperands(`rm -rf build/out ${inTmp('x')}`), [
      'build/out',
      inTmp('x'),
    ]);
  });

  it('accepts Windows separators and drive prefixes', () => {
    assert.deepEqual(deleteOperands('rm -rf .\\build'), ['.\\build']);
    assert.deepEqual(deleteOperands('rm -rf C:'), ['C:']);
  });

  it('ignores pipes and redirections', () => {
    assert.deepEqual(deleteOperands(`rm -rf ${inTmp('a')} > ${inTmp('log')}`), [
      inTmp('a'),
    ]);
    assert.deepEqual(deleteOperands(`echo x | rm ${inTmp('a')}`), []);
  });
});

describe('isDeleteInTmpOnly', () => {
  it('accepts deletions that stay in the temp root', () => {
    assert.equal(isDeleteInTmpOnly(`rm -rf ${inTmp('build')}`), true);
    assert.equal(isDeleteInTmpOnly(`rm -rf ${inTmp('a')} ${inTmp('b')}`), true);
  });

  it('rejects deletions that touch other paths', () => {
    assert.equal(
      isDeleteInTmpOnly(`rm -rf ${inTmp('a')} ${inUserRoot('b')}`),
      false,
    );
    assert.equal(isDeleteInTmpOnly(`rm -rf ${inUserRoot('b')}`), false);
  });

  it('rejects deletions with relative or missing operands', () => {
    assert.equal(isDeleteInTmpOnly('rm -rf build'), false);
    assert.equal(isDeleteInTmpOnly('rm -rf *'), false);
    assert.equal(isDeleteInTmpOnly("find . -name '*.log' -delete"), false);
  });
});

describe('evaluateToolCall', () => {
  it('asks before writing a file outside the temp root', () => {
    const path = inUserRoot('notes.md');
    const decision = evaluateToolCall({ toolName: 'write', input: { path } });
    assert.equal(decision.action, 'ask');
    assert.equal(decision.title, 'Allow file write?');
    assert.equal(decision.detail, path);
  });

  it('asks before editing a file outside the temp root', () => {
    const decision = evaluateToolCall({
      toolName: 'edit',
      input: { path: inUserRoot('notes.md') },
    });
    assert.equal(decision.action, 'ask');
    assert.equal(decision.title, 'Allow file edit?');
  });

  it('allows writes and edits inside the temp root', () => {
    assert.equal(
      evaluateToolCall({ toolName: 'write', input: { path: inTmp('a') } })
        .action,
      'allow',
    );
    assert.equal(
      evaluateToolCall({ toolName: 'edit', input: { path: inTmp('a') } })
        .action,
      'allow',
    );
  });

  it('asks before a shell deletion outside the temp root', () => {
    const command = `rm -rf ${inUserRoot('build')}`;
    const decision = evaluateToolCall({ toolName: 'bash', input: { command } });
    assert.equal(decision.action, 'ask');
    assert.equal(decision.title, 'Allow file deletion?');
    assert.equal(decision.detail, `bash: ${command}`);
  });

  it('allows shell deletions confined to the temp root', () => {
    const decision = evaluateToolCall({
      toolName: 'bash',
      input: { command: `rm -rf ${inTmp('build')}` },
    });
    assert.equal(decision.action, 'allow');
  });

  it('allows non-deleting shell commands', () => {
    assert.equal(
      evaluateToolCall({ toolName: 'bash', input: { command: 'ls -la' } })
        .action,
      'allow',
    );
  });

  it('allows tools it does not guard', () => {
    assert.equal(
      evaluateToolCall({ toolName: 'read', input: { path: '/etc/hosts' } })
        .action,
      'allow',
    );
    assert.equal(
      evaluateToolCall({ toolName: 'grep', input: {} }).action,
      'allow',
    );
  });

  it('asks when the input is missing', () => {
    assert.equal(
      evaluateToolCall({ toolName: 'write', input: {} }).action,
      'ask',
    );
  });
});
