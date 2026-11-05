/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['master', 'next'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
      },
    ],
    '@semantic-release/changelog',
    // No build step: the published package is the TypeScript source Pi loads.
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        // A fresh repository has no labels, and the plugin creates the failure
        // issue with 'semantic-release' by default, which GitHub rejects (422).
        labels: false,
      },
    ],
    // Commits CHANGELOG.md, package.json and package-lock.json with the default
    // 'chore(release): <version> [skip ci]' message plus the release notes.
    '@semantic-release/git',
  ],
};
