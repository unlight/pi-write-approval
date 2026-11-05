/**
 * Pure decision logic for the write-permission gate.
 * No Pi imports and no UI calls here, so every rule is unit-testable.
 */

import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

/** What the gate wants to do with a single tool call. */
export type GuardAction = 'allow' | 'ask';

/** The subset of a tool call the gate cares about. */
export interface ToolCallLike {
  readonly toolName: string;
  readonly input: {
    readonly path?: string;
    readonly command?: string;
  };
}

/** Decision for a tool call; `title`/`detail` are filled for `ask`. */
export interface GuardDecision {
  readonly action: GuardAction;
  readonly title?: string;
  readonly detail?: string;
}

const ALLOW: GuardDecision = { action: 'allow' };

/** Tokens that name a path: any separator, or a Windows drive prefix. */
const PATH_TOKEN_PATTERN = /[\\/]|^[A-Za-z]:/;

/**
 * Shell commands that delete files or directories, matched anywhere in the
 * command line (so `git rm`, `find -delete`, `xargs rm` are covered too).
 */
export const DELETE_PATTERNS: readonly RegExp[] = [
  /\brm\b/,
  /\brmdir\b/,
  /\bunlink\b/,
  /\btrash(?:-put)?\b/,
  /\bshred\b/,
  /\bfind\b[\s\S]*-delete\b/,
];

/** Extra temp roots beside `tmpdir()`: macOS also has a shared `/tmp`. */
export function extraTmpRoots(
  platform: NodeJS.Platform = process.platform,
): string[] {
  return platform === 'darwin' ? ['/tmp'] : [];
}

/** Drop the macOS `/private` prefix so both spellings of a path match. */
export function stripPrivatePrefix(
  path: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'darwin') return path;
  if (path === '/private') return '/';
  return path.startsWith('/private/') ? path.slice('/private'.length) : path;
}

/** True when `abs` equals `root` or sits below it. */
function isUnder(abs: string, root: string): boolean {
  if (abs === root) return true;
  const rel = relative(root, abs);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** True when the path resolves inside the temp directory. */
export function isInTmp(
  path: string,
  tmpRoot: string = tmpdir(),
  platform: NodeJS.Platform = process.platform,
): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  const abs = stripPrivatePrefix(resolve(trimmed), platform);
  const roots = [tmpRoot, ...extraTmpRoots(platform)].map(root =>
    stripPrivatePrefix(resolve(root), platform),
  );
  return roots.some(root => isUnder(abs, root));
}

/** True when the command looks like it deletes files or directories. */
export function isDeleteCommand(command: string): boolean {
  return DELETE_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * Path operands of the first command segment, ignoring pipes and redirections.
 * Relative operands without a separator stay out, so `rm -rf build` never
 * auto-approves.
 */
export function deleteOperands(command: string): string[] {
  const head = command.split(/[<>|]/)[0] ?? '';
  return head.split(/\s+/).filter(token => PATH_TOKEN_PATTERN.test(token));
}

/** True when every delete operand of the command lives in the temp directory. */
export function isDeleteInTmpOnly(
  command: string,
  tmpRoot: string = tmpdir(),
  platform: NodeJS.Platform = process.platform,
): boolean {
  const operands = deleteOperands(command);
  return (
    operands.length > 0 &&
    operands.every(operand => isInTmp(operand, tmpRoot, platform))
  );
}

/** Decide whether a tool call needs user confirmation. */
export function evaluateToolCall(
  call: ToolCallLike,
  tmpRoot: string = tmpdir(),
  platform: NodeJS.Platform = process.platform,
): GuardDecision {
  if (call.toolName === 'write' || call.toolName === 'edit') {
    const path = call.input.path ?? '';
    if (isInTmp(path, tmpRoot, platform)) return ALLOW;
    const verb = call.toolName === 'write' ? 'write' : 'edit';
    return { action: 'ask', title: `Allow file ${verb}?`, detail: path };
  }

  if (call.toolName === 'bash') {
    const command = call.input.command ?? '';
    if (!isDeleteCommand(command)) return ALLOW;
    if (isDeleteInTmpOnly(command, tmpRoot, platform)) return ALLOW;
    return {
      action: 'ask',
      title: 'Allow file deletion?',
      detail: `bash: ${command}`,
    };
  }

  return ALLOW;
}
