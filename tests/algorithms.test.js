import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawingStack, mergeSort, compareDrawings, buildDrawingSortCache } from '../algorithms.js';

test('undo removes gestures and clear actions in last-in-first-out order', () => {
  const stack = new DrawingStack();
  const pen = { type: 'stroke', tool: 'pen', points: [{ x: 1, y: 2 }] };
  const eraser = { type: 'stroke', tool: 'eraser' };
  const clear = { type: 'clear' };
  assert.equal(stack.pop(), undefined);
  stack.push(pen);
  stack.push(eraser);
  stack.push(clear);
  assert.equal(stack.size, 3);
  assert.deepEqual([...stack.values()], [pen, eraser, clear]);
  assert.equal(stack.pop(), clear);
  assert.equal(stack.pop(), eraser);
  assert.equal(stack.pop(), pen);
  assert.equal(stack.size, 0);
});

test('merge sort handles empty, single and odd-sized collections without mutating input', () => {
  const compare = (a, b) => a - b;
  assert.deepEqual(mergeSort([], compare), []);
  assert.deepEqual(mergeSort([1], compare), [1]);
  const original = [9, 3, 7, 1, 2, 3, -5];
  assert.deepEqual(mergeSort(original, compare), [-5, 1, 2, 3, 3, 7, 9]);
  assert.deepEqual(original, [9, 3, 7, 1, 2, 3, -5]);
});

test('equal sort keys preserve original record order', () => {
  const records = [{ id: 1, createdAt: 3 }, { id: 2, createdAt: 1 }, { id: 3, createdAt: 3 }];
  assert.deepEqual(mergeSort(records, compareDrawings('newest')).map(x => x.id), [1, 3, 2]);
});

test('gallery compares dates numerically and Korean names naturally in both directions', () => {
  const records = [
    { name: '하늘 10', createdAt: 20 },
    { name: '가을', createdAt: 100 },
    { name: '하늘 2', createdAt: 3 },
  ];
  const names = order => mergeSort(records, compareDrawings(order)).map(x => x.name);
  assert.deepEqual(names('newest'), ['가을', '하늘 10', '하늘 2']);
  assert.deepEqual(names('oldest'), ['하늘 2', '하늘 10', '가을']);
  assert.deepEqual(names('name-asc'), ['가을', '하늘 2', '하늘 10']);
  assert.deepEqual(names('name-desc'), ['하늘 10', '하늘 2', '가을']);
});

test('merge sort agrees with a reference sort for a larger deterministic collection', () => {
  const records = Array.from({ length: 2049 }, (_, i) => ({ id: i, createdAt: (i * 811) % 211 }));
  const compare = compareDrawings('newest');
  assert.deepEqual(mergeSort(records, compare), [...records].sort(compare));
});

test('sort cache reuses all four stable orders without copying drawings or changing input', () => {
  const records = [
    { id: 'a', name: '하늘 10', createdAt: 20 },
    { id: 'b', name: '가을', createdAt: 100 },
    { id: 'c', name: '하늘 2', createdAt: 3 },
    { id: 'd', name: '가을', createdAt: 100 },
  ];
  const cache = buildDrawingSortCache(records);
  const ids = order => cache[order].map(record => record.id);
  assert.deepEqual(ids('newest'), ['b', 'd', 'a', 'c']);
  assert.deepEqual(ids('oldest'), ['c', 'a', 'b', 'd']);
  assert.deepEqual(ids('name-asc'), ['b', 'd', 'c', 'a']);
  assert.deepEqual(ids('name-desc'), ['a', 'c', 'b', 'd']);
  assert.deepEqual(records.map(record => record.id), ['a', 'b', 'c', 'd']);
  const cachedNames = cache['name-asc'];
  assert.equal(cache['name-asc'], cachedNames);
  assert.equal(cache.newest[0], records[1]);
});

test('rebuilding the cache after save or delete replaces every order without stale entries', () => {
  const first = { id: 'first', name: '나무', createdAt: 1 };
  const second = { id: 'second', name: '가을', createdAt: 2 };
  const initial = buildDrawingSortCache([first]);
  const afterSave = buildDrawingSortCache([first, second]);
  const afterDelete = buildDrawingSortCache([second]);
  const empty = buildDrawingSortCache([]);
  for (const order of ['newest', 'oldest', 'name-asc', 'name-desc']) {
    assert.notEqual(initial[order], afterSave[order]);
    assert.equal(afterSave[order].length, 2);
    assert.deepEqual(initial[order], [first]);
    assert.deepEqual(afterDelete[order], [second]);
    assert.deepEqual(empty[order], []);
  }
});
