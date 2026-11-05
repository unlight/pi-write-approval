/**
 * Cross-platform paths for the test suites.
 * Nothing here depends on the machine the tests run on.
 */

import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Platform temp directory as reported by Node. */
export const TMP_ROOT = tmpdir();

/** Path outside the temp root, standing in for user files. */
export const USER_ROOT = join(homedir(), 'write-permission-fixture');

/** Sibling path that only shares the temp root prefix, e.g. `/tmpfoo`. */
export const TMP_LOOKALIKE = `${TMP_ROOT}foo`;

/** Absolute path inside the temp root. */
export function inTmp(...segments: string[]): string {
  return join(TMP_ROOT, ...segments);
}

/** Absolute path outside the temp root. */
export function inUserRoot(...segments: string[]): string {
  return join(USER_ROOT, ...segments);
}
