/**
 * Opt-in confirmation gate for tool writes, edits and shell deletions.
 * Default state is plain Pi behavior (no prompts); the gate can be enabled for
 * the current session with `/write-permission`, `ctrl+alt+a`, or `--write-permission`.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
import { evaluateToolCall } from './policy.ts';

/** Slash command, CLI flag and footer status share one identifier. */
export const EXTENSION_ID = 'write-permission';
export const SHORTCUT = 'ctrl+alt+a';
const STATUS_ON = 'write gate: ON';

interface GateState {
  enabled: boolean;
}

/** Shell-ish input shape read by the policy layer. */
interface GateInput {
  readonly path?: string;
  readonly command?: string;
}

function argumentCompletions(prefix: string): AutocompleteItem[] | null {
  const items: AutocompleteItem[] = [
    { value: 'on', label: 'on — ask before writes, edits and deletions' },
    { value: 'off', label: 'off — plain Pi behavior' },
    { value: 'toggle', label: 'toggle — flip the current state' },
    { value: 'status', label: 'status — show the current state' },
  ];
  const filtered = items.filter(item => item.value.startsWith(prefix));
  return filtered.length > 0 ? filtered : null;
}

export default function writePermissionExtension(pi: ExtensionAPI): void {
  const state: GateState = { enabled: false };

  const renderStatus = (ctx: ExtensionContext): void => {
    ctx.ui.setStatus(EXTENSION_ID, state.enabled ? STATUS_ON : undefined);
  };

  const setEnabled = (enabled: boolean, ctx: ExtensionContext): void => {
    state.enabled = enabled;
    renderStatus(ctx);
    ctx.ui.notify(
      enabled
        ? 'Write gate on — writes, edits and deletions ask for confirmation'
        : 'Write gate off — plain Pi behavior',
      enabled ? 'warning' : 'info',
    );
  };

  pi.registerFlag(EXTENSION_ID, {
    description: 'Start with the write-permission gate enabled',
    type: 'boolean',
    default: false,
  });

  pi.on('session_start', async (_event, ctx) => {
    state.enabled = pi.getFlag(EXTENSION_ID) === true;
    renderStatus(ctx);
  });

  pi.registerCommand(EXTENSION_ID, {
    description: 'Toggle confirmation prompts for writes, edits and deletions',
    getArgumentCompletions: argumentCompletions,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const arg = args.trim().toLowerCase();
      switch (arg) {
        case '':
        case 'toggle':
          setEnabled(!state.enabled, ctx);
          return;
        case 'on':
          setEnabled(true, ctx);
          return;
        case 'off':
          setEnabled(false, ctx);
          return;
        case 'status':
          ctx.ui.notify(
            `Write gate is ${state.enabled ? 'on' : 'off'}`,
            'info',
          );
          return;
        default:
          ctx.ui.notify(
            `Unknown argument "${arg}" — use on, off, toggle or status`,
            'error',
          );
      }
    },
  });

  pi.registerShortcut(SHORTCUT, {
    description: 'Toggle write-permission gate',
    handler: ctx => {
      setEnabled(!state.enabled, ctx);
    },
  });

  pi.on('tool_call', async (event, ctx) => {
    if (!state.enabled) return undefined;

    const decision = evaluateToolCall({
      toolName: event.toolName,
      input: event.input as GateInput,
    });
    if (decision.action === 'allow') return undefined;

    const title = decision.title ?? 'Allow this action?';
    const detail = decision.detail ?? '';

    if (!ctx.hasUI) {
      // No prompt is possible, so fail safe and block.
      return {
        block: true,
        reason: `${title} Blocked: no UI to confirm in ${ctx.mode} mode.`,
      };
    }

    if (await ctx.ui.confirm(title, detail)) return undefined;
    return { block: true, reason: 'Declined by user' };
  });
}
