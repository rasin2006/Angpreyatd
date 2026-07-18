const test = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../scoring');

test('completion requires the full target text to match', () => {
  assert.equal(scoring.isTextComplete('x b c', 'a b c'), false);
  assert.equal(scoring.isTextComplete('a b c', 'a b c'), true);
  assert.equal(scoring.isTextComplete('hello world', 'hello world'), true);
  assert.equal(scoring.isTextComplete('hello world  ', 'hello world'), true, 'handles trailing space');
  assert.equal(scoring.isTextComplete('hello worl', 'hello world'), false, 'handles partial last word');
  assert.equal(scoring.isTextComplete('hello', 'hello world'), false, 'handles partial text');
  assert.equal(scoring.isTextComplete('hello world a b c', 'hello world'), true, 'handles extra typed words');
});
