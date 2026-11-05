# pi-write-permission

Opt-in confirmation gate for file writes, edits and shell deletions in [Pi](https://pi.dev).

Default Pi behavior is unchanged: the gate is **off** and nothing asks for permission.
Enable it for the current session and Pi asks before every write, edit and deletion.

## Install

The package is loaded from this directory without copying, so edits take effect on `/reload`.

```bash
pi install /path/to/write-permission
```

Manual alternative — add the path to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["/path/to/write-permission"]
}
```

Remove with `pi remove /path/to/write-permission`.

## Usage

| Action                                            | Effect                                    |
| ------------------------------------------------- | ----------------------------------------- |
| `/write-permission` or `/write-permission toggle` | Flip the gate                             |
| `/write-permission on`                            | Ask before writes, edits and deletions    |
| `/write-permission off`                           | Back to plain Pi behavior                 |
| `/write-permission status`                        | Report the current state                  |
| `ctrl+alt+a`                                      | Flip the gate                             |
| `pi --write-permission`                           | Start every session with the gate enabled |

While the gate is on, the footer shows `write gate: ON`.

The state is session-scoped: a new session starts from the `--write-permission` flag
(default off).

## What is gated

Enabled gate asks for confirmation on:

- `write` and `edit` tool calls outside the temp directory;
- `bash` calls that delete files or directories (`rm`, `rmdir`, `unlink`, `trash`,
  `trash-put`, `shred`, `find ... -delete`), unless every delete operand lives in the
  temp directory.

Never gated: `read`, `grep`, `ls`, `find`, non-deleting `bash` commands, and every path
inside `os.tmpdir()` (on macOS also the shared `/tmp`, `/private/tmp` included). Both
`/` and `\` separators are recognized, so Windows paths are covered as well.

In modes without a UI (`-p`, `--mode json`) a blocked call fails with a reason instead of
waiting for an answer, so an enabled gate cannot silently skip a confirmation.

## Known limitations

Deletion detection is textual, so it can ask for harmless commands that merely contain a
match (for example `grep 'rm' notes.txt`). Erring toward an extra prompt is intentional.

Not covered by design: truncating `bash` redirections (`> file`), `mv` over an existing
file, `sed -i`, `truncate`, `dd`, the `powershell` tool, and deletion performed by scripts
started through `bash`.

## Development

```bash
npm install    # once: typescript, prettier, @types/node and host types
npm test       # node:test, TypeScript runs through Node's type stripping
npm run format # prettier --write
npm run check  # format:check + typecheck + tests
```

The suites are platform-independent: every path comes from `node:os` and `node:path`
fixtures in `test/fixtures.ts`, and platform-specific rules (`darwin`, `win32`) are
exercised by passing the platform explicitly.

Layout:

```text
src/index.ts    extension wiring: command, shortcut, flag, tool_call gate
src/policy.ts   pure decision logic, no Pi imports, fully unit-tested
test/           node:test suites for both layers plus path fixtures
```
