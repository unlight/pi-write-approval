# pi-write-approval

Opt-in approval prompts for file writes, edits and shell deletions in [Pi](https://pi.dev).

Default Pi behavior is unchanged: approval is **off** and nothing asks for permission.
Turn it on for the current session and Pi asks before every write, edit and deletion.

## Install

```bash
pi install npm:pi-write-approval
```

Manual alternative — add the package to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:pi-write-approval"]
}
```

Remove with `pi remove npm:pi-write-approval`. Updates arrive with
`pi update --extensions`.

To run a local checkout instead of the published package — the working copy is loaded
without copying, so edits take effect on `/reload`:

```bash
pi -e /path/to/pi-write-approval
```

## Usage

| Action                                        | Effect                                 |
| --------------------------------------------- | -------------------------------------- |
| `/write-approval` or `/write-approval toggle` | Flip the switch                        |
| `/write-approval on`                          | Ask before writes, edits and deletions |
| `/write-approval off`                         | Back to plain Pi behavior              |
| `/write-approval status`                      | Report the current state               |
| `ctrl+alt+w`                                  | Flip the switch, same as the command   |
| `pi --write-approval`                         | Start every session with approval on   |

The keyboard shortcut works in both states and is registered by `pi.registerShortcut`
from the `SHORTCUT` constant in `src/index.ts` — change it there if your terminal or
window manager already grabs `ctrl+alt+w`. No other loaded extension or built-in Pi
binding uses that combination (the only built-in `ctrl+alt` shortcut is `ctrl+alt+]`).

The footer always carries the indicator: `Write approval: ON` in the default foreground
while prompts are active, `Write approval: OFF` dimmed like the footer's own lines
otherwise.

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

## Release

Publishing runs on GitHub Actions (`.github/workflows/ci.yml`). Every push and pull
request runs `npm run check`; a push to `master` or `next` additionally runs
`semantic-release`, which derives the version from Conventional Commits, updates
`CHANGELOG.md`, publishes to npm and pushes the version commit plus the tag.

Before the first release:

- create the GitHub repository and push this history to `master` (semantic-release needs
  the tags and commits, hence `fetch-depth: 0` in the workflow);
- add an `NPM_TOKEN` repository secret — an npm automation token with publish rights for
  `pi-write-approval` (automation tokens bypass 2FA);
- `GITHUB_TOKEN` is built in; the workflow requests `contents: write` because
  `@semantic-release/git` pushes the release commit.

Commit types drive the bump — `feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` →
major, while `chore:`/`docs:`/`style:`/`refactor:` alone publish nothing. The initial
`1.0.0` is already published; semantic-release continues from the latest tag (`v1.0.0`).

The package has no build step: the tarball ships `src/`, `README.md` and `package.json`
(see the `files` field), which is exactly what Pi loads.

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
