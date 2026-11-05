# pi-write-approval

Opt-in approval prompts for file writes, edits and shell deletions in [Pi](https://pi.dev).

Default Pi behavior is unchanged: approval is **off** and nothing asks for permission.
Turn it on for the current session and Pi asks before every write, edit and deletion.

## Install

The package is loaded from this directory without copying, so edits take effect on `/reload`.

```bash
pi install /path/to/pi-write-approval
```

Manual alternative — add the path to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["/path/to/pi-write-approval"]
}
```

Remove with `pi remove /path/to/pi-write-approval`.

## Usage

| Action                                        | Effect                                 |
| --------------------------------------------- | -------------------------------------- |
| `/write-approval` or `/write-approval toggle` | Flip the switch                        |
| `/write-approval on`                          | Ask before writes, edits and deletions |
| `/write-approval off`                         | Back to plain Pi behavior              |
| `/write-approval status`                      | Report the current state               |
| `ctrl+alt+a`                                  | Flip the switch                        |
| `pi --write-approval`                         | Start every session with approval on   |

The footer always carries the indicator: `Write approval: ON` while prompts are active,
`Write approval: OFF` otherwise. The text is plain, so it renders in the theme's default
color.

The state is session-scoped: a new session starts from the `--write-approval` flag
(default off).

## What asks for approval

With approval on, Pi asks before:

- `write` and `edit` tool calls outside the temp directory;
- `bash` calls that delete files or directories (`rm`, `rmdir`, `unlink`, `trash`,
  `trash-put`, `shred`, `find ... -delete`), unless every delete operand lives in the
  temp directory.

Never asked: `read`, `grep`, `ls`, `find`, non-deleting `bash` commands, and every path
inside `os.tmpdir()` (on macOS also the shared `/tmp`, `/private/tmp` included). Both
`/` and `\` separators are recognized, so Windows paths are covered as well.

In modes without a UI (`-p`, `--mode json`) a blocked call fails with a reason instead of
waiting for an answer, so approval turned on cannot silently skip a confirmation.

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
src/index.ts    extension wiring: command, shortcut, flag, tool_call hook
src/policy.ts   pure decision logic, no Pi imports, fully unit-tested
test/           node:test suites for both layers plus path fixtures
```
