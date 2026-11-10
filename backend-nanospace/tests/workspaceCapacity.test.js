const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateWorkspaceCapacity,
  getPlanSeatCount,
  getReservedSeatCount,
  isExclusiveWorkspaceType,
} = require('../src/utils/workspaceCapacity');

test('ordinary cabins reserve only the requested number of seats', () => {
  assert.equal(getReservedSeatCount('PRIVATE_CABIN', 20, 3), 3);
  assert.equal(calculateWorkspaceCapacity(20, 3, 'AVAILABLE').availableCapacity, 17);
});

test('a 10-seater plan reserves ten seats and leaves no free seats in a 10-seat cabin', () => {
  const plan = 'Private Office: 10 Seater office';
  assert.equal(getPlanSeatCount(plan), 10);
  assert.equal(getReservedSeatCount('PRIVATE_CABIN', 10, 1, plan), 10);
  assert.equal(calculateWorkspaceCapacity(10, 10, 'AVAILABLE').availableCapacity, 0);
});

test('seater plans reserve their seats in larger cabins, leaving the correct capacity', () => {
  const plan = 'CABIN (3 SEATER)';
  assert.equal(getReservedSeatCount('PRIVATE_CABIN', 20, 1, plan), 3);
  assert.equal(calculateWorkspaceCapacity(20, 3, 'AVAILABLE').availableCapacity, 17);
});

test('plans without a seater count use the requested seat count', () => {
  assert.equal(getPlanSeatCount('Dedicated Seat (Inside Cabin)'), 0);
  assert.equal(getReservedSeatCount('PRIVATE_CABIN', 20, 1, 'Dedicated Seat (Inside Cabin)'), 1);
});

test('conference and meeting rooms reserve their full capacity', () => {
  for (const type of ['CONFERENCE_ROOM', 'MEETING_ROOM', 'BOARDROOM']) {
    assert.equal(isExclusiveWorkspaceType(type), true);
    assert.equal(getReservedSeatCount(type, 20, 1), 20);
  }
  assert.equal(calculateWorkspaceCapacity(20, 20, 'AVAILABLE').availableCapacity, 0);
});

test('an exact time window uses overlapping bookings instead of stale occupied status', () => {
  assert.equal(calculateWorkspaceCapacity(20, 0, 'OCCUPIED', false, true).status, 'AVAILABLE');
  assert.equal(calculateWorkspaceCapacity(20, 0, 'OCCUPIED').status, 'OCCUPIED');
});
