# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): small Markdown files
that describe a change to a published package and the version bump it needs.

Add one with `pnpm changeset` in any PR that changes `lucidiff`, `@lucidiff/core`, or
`@lucidiff/renderer`. The release workflow turns pending changesets into a "Version packages"
PR, and merging that PR publishes to npm.

The three packages are versioned together (a "fixed" group), so they always share a version.
