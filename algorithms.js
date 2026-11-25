// Drawing actions are pushed once per gesture; undo removes the most recent action.
export class DrawingStack {
  #items = [];
  push(action) { this.#items.push(action); }
  pop() { return this.#items.pop(); }
  get size() { return this.#items.length; }
  values() { return this.#items.values(); }
}

// Stable, bottom-up merge sort. No Array.sort() is used for the gallery.
// Each pass merges runs of width 1, 2, 4, ...; time O(n log n), space O(n).
export function mergeSort(records, compare) {
  let source = [...records];
  let target = new Array(source.length);
  for (let width = 1; width < source.length; width *= 2) {
    for (let start = 0; start < source.length; start += width * 2) {
      const middle = Math.min(start + width, source.length);
      const end = Math.min(start + width * 2, source.length);
      let left = start;
      let right = middle;
      for (let output = start; output < end; output++) {
        if (left < middle && (right >= end || compare(source[left], source[right]) <= 0)) {
          target[output] = source[left++];
        } else {
          target[output] = source[right++];
        }
      }
    }
    [source, target] = [target, source];
  }
  return source;
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export function compareDrawings(order) {
  switch (order) {
    case 'oldest': return (a, b) => a.createdAt - b.createdAt;
    case 'name-asc': return (a, b) => collator.compare(a.name, b.name);
    case 'name-desc': return (a, b) => collator.compare(b.name, a.name);
    default: return (a, b) => b.createdAt - a.createdAt;
  }
}

// Build once when records change, then reuse these arrays on menu changes.
// Cache references to records, not copies of their image Blobs. Sort each
// direction separately so equal names/dates retain their stable input order.
export function buildDrawingSortCache(records) {
  const orders = ['newest', 'oldest', 'name-asc', 'name-desc'];
  return Object.fromEntries(orders.map(order => [order, mergeSort(records, compareDrawings(order))]));
}
