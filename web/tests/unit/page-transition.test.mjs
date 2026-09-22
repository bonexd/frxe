import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_TRANSITION_PANEL_COUNT,
  transitionLabelFor,
  shouldTransitionNavigation,
} from '../../src/pageTransition.js';

test('Vitr page transitions use a four-panel J-Vers-inspired wipe', () => {
  assert.equal(PAGE_TRANSITION_PANEL_COUNT, 4);
  assert.equal(transitionLabelFor('/'), 'VITR / HOME');
  assert.equal(transitionLabelFor('/music'), 'VITR / WEB');
});

test('page transition only intercepts same-origin page navigation', () => {
  const base = {
    currentOrigin: 'https://vitr.example',
    currentHref: 'https://vitr.example/',
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  };

  assert.equal(shouldTransitionNavigation({ ...base, href: 'https://vitr.example/music' }), true);
  assert.equal(shouldTransitionNavigation({ ...base, href: 'https://vitr.example/#apps' }), false);
  assert.equal(shouldTransitionNavigation({ ...base, href: 'https://github.com/bloodvitr/vitr' }), false);
  assert.equal(shouldTransitionNavigation({ ...base, href: 'https://vitr.example/music', target: '_blank' }), false);
});
