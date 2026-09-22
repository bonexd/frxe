import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGithubRepo } from '../../shared/github-repo.js';

test('normalizes owner/repo and GitHub repository URLs', () => {
  assert.equal(normalizeGithubRepo('voidnont/Frxe-Windows'), 'voidnont/Frxe-Windows');
  assert.equal(normalizeGithubRepo('https://github.com/voidnont/frxe'), 'voidnont/frxe');
  assert.equal(normalizeGithubRepo('https://github.com/voidnont/frxe.git'), 'voidnont/frxe');
});

test('rejects non-GitHub and malformed repositories', () => {
  assert.equal(normalizeGithubRepo('https://example.com/voidnont/frxe'), null);
  assert.equal(normalizeGithubRepo('../bad'), null);
  assert.equal(normalizeGithubRepo('owner/repo/extra'), null);
});
