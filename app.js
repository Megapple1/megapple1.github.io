import { DrawingStack, buildDrawingSortCache } from './algorithms.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#drawing-canvas');
const ctx = canvas.getContext('2d');
const undoStack = new DrawingStack();
const palette = [
  ['#292b42', '먹색'], ['#777b90', '회색'], ['#ffffff', '흰색'],
  ['#ef6683', '분홍'], ['#f58b58', '주황'], ['#f6c75b', '노랑'],
  ['#71bb87', '연두'], ['#39a7a0', '청록'], ['#63afe9', '하늘'],
  ['#6260e8', '보라'], ['#ab82d4', '연보라'], ['#ab7864', '갈색'],
];
let color = '#6260e8';
let tool = 'pen';
let brushSize = 8;
let activeStroke = null;
let activePointer = null;
let hasInk = false;
let saving = false;
let database;
let drawingSortCache = null;
let galleryUrls = [];
let selectedDrawing = null;
let dialogUrl = null;
let toastTimer;

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
}

function setTool(next) {
  tool = next;
  $('#pen-tool').classList.toggle('active', tool === 'pen');
  $('#eraser-tool').classList.toggle('active', tool === 'eraser');
  $('#pen-tool').setAttribute('aria-pressed', tool === 'pen');
  $('#eraser-tool').setAttribute('aria-pressed', tool === 'eraser');
  canvas.classList.toggle('erasing', tool === 'eraser');
  updateSample();
}

function setColor(next) {
  color = next.toLowerCase();
  $('#custom-color').value = color;
  $('#color-code').textContent = color.toUpperCase();
  document.documentElement.style.setProperty('--color', color);
  for (const swatch of $('#palette').children) {
    const selected = swatch.dataset.color === color;
    swatch.setAttribute('aria-pressed', selected);
    swatch.replaceChildren();
    if (selected) {
      const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      check.setAttribute('viewBox', '0 0 16 16');
      check.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'm4 8 3 3 5-6');
      check.append(path);
      swatch.append(check);
    }
  }
  setTool('pen');
}

for (const [hex, name] of palette) {
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = `swatch${hex === '#ffffff' || hex === '#f6c75b' ? ' light' : ''}`;
  swatch.dataset.color = hex;
  swatch.style.setProperty('--swatch', hex);
  swatch.setAttribute('aria-label', `${name} ${hex}`);
  swatch.title = name;
  swatch.addEventListener('click', () => setColor(hex));
  $('#palette').append(swatch);
}

function updateSample() {
  const sample = $('#sample-dot');
  sample.style.width = `${Math.max(2, brushSize / 2)}px`;
  sample.style.height = `${Math.max(2, brushSize / 2)}px`;
  sample.style.background = tool === 'eraser' ? '#fff' : color;
  sample.style.boxShadow = tool === 'eraser' ? '0 0 0 1px #caccdb' : 'none';
}

function updateActions() {
  $('#undo-button').disabled = undoStack.size === 0 || activeStroke !== null;
  $('#undo-count').textContent = undoStack.size;
  $('#clear-button').disabled = !hasInk || activeStroke !== null;
  $('#save-button').disabled = !hasInk || saving || activeStroke !== null;
  $('#canvas-hint').hidden = hasInk || activeStroke !== null;
}

function whitePaper() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function configureStroke(stroke) {
  ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawDot(stroke, point) {
  configureStroke(stroke);
  ctx.beginPath();
  ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(stroke, from, to) {
  configureStroke(stroke);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

// Replay the remaining actions after a pop. A clear is also one undoable action.
function redraw() {
  whitePaper();
  hasInk = false;
  for (const action of undoStack.values()) {
    if (action.type === 'clear') {
      whitePaper();
      hasInk = false;
      continue;
    }
    drawDot(action, action.points[0]);
    for (let i = 1; i < action.points.length; i++) {
      drawSegment(action, action.points[i - 1], action.points[i]);
    }
    if (action.tool === 'pen') hasInk = true;
  }
  updateActions();
}

function pointFromEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

canvas.addEventListener('pointerdown', (event) => {
  if (activeStroke || !event.isPrimary || event.button !== 0) return;
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  activeStroke = { type: 'stroke', tool, color, size: brushSize, points: [pointFromEvent(event)] };
  drawDot(activeStroke, activeStroke.points[0]);
  updateActions();
});

canvas.addEventListener('pointermove', (event) => {
  if (!activeStroke || event.pointerId !== activePointer) return;
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
  for (const sample of events.length ? events : [event]) {
    const point = pointFromEvent(sample);
    const previous = activeStroke.points.at(-1);
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.5) continue;
    activeStroke.points.push(point);
    drawSegment(activeStroke, previous, point);
  }
});

function finishStroke(event) {
  if (!activeStroke || event.pointerId !== activePointer) return;
  // A gesture, rather than an individual pointermove, is one stack entry.
  undoStack.push(activeStroke);
  if (activeStroke.tool === 'pen') hasInk = true;
  activeStroke = null;
  activePointer = null;
  updateActions();
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);
canvas.addEventListener('lostpointercapture', finishStroke);

function undo() {
  if (activeStroke || undoStack.size === 0) return;
  undoStack.pop();
  redraw();
}
$('#undo-button').addEventListener('click', undo);
$('#clear-button').addEventListener('click', () => {
  if (!hasInk || activeStroke) return;
  undoStack.push({ type: 'clear' });
  redraw();
  toast('종이를 비웠어요. 되돌리기로 다시 가져올 수 있어요.');
});
$('#pen-tool').addEventListener('click', () => setTool('pen'));
$('#eraser-tool').addEventListener('click', () => setTool('eraser'));
$('#custom-color').addEventListener('input', (event) => setColor(event.target.value));
$('#brush-size').addEventListener('input', (event) => {
  brushSize = Number(event.target.value);
  $('#size-value').textContent = `${brushSize} px`;
  updateSample();
});
document.addEventListener('keydown', (event) => {
  const editing = event.target.closest('input, textarea, select, [contenteditable="true"]');
  if (editing || $('#art-dialog').open) return;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.key.toLowerCase() === 'b') setTool('pen');
    if (event.key.toLowerCase() === 'e') setTool('eraser');
  }
});

// IndexedDB stores PNG Blobs without localStorage's small string quota.
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sketchroom', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drawings', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => toast('다른 탭의 스케치룸을 닫고 다시 시도해 주세요.');
  });
}

function storageRequest(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('drawings', mode);
    const request = operation(transaction.objectStore('drawings'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted'));
    transaction.onerror = () => reject(transaction.error || request.error);
  });
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

function renderGallery() {
  for (const url of galleryUrls) URL.revokeObjectURL(url);
  galleryUrls = [];
  const grid = $('#gallery-grid');
  grid.replaceChildren();
  // Switching options only reads the cache; it never sorts the records again.
  const ordered = drawingSortCache?.[$('#gallery-sort').value] ?? [];
  $('#gallery-count').textContent = ordered.length;
  $('#gallery-empty').hidden = ordered.length > 0;
  for (const drawing of ordered) {
    const card = document.createElement('article');
    card.className = 'art-card';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'art-open';
    button.setAttribute('aria-label', `${drawing.name} 크게 보기`);
    button.addEventListener('click', () => openDrawing(drawing));
    const imageWrap = document.createElement('div');
    imageWrap.className = 'art-image';
    const img = document.createElement('img');
    const url = URL.createObjectURL(drawing.image);
    galleryUrls.push(url);
    img.src = url;
    img.alt = drawing.name;
    img.loading = 'lazy';
    imageWrap.append(img);
    const caption = document.createElement('div');
    caption.className = 'art-caption';
    const information = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = drawing.name;
    const date = document.createElement('time');
    date.dateTime = new Date(drawing.createdAt).toISOString();
    date.textContent = dateFormatter.format(drawing.createdAt);
    information.append(name, date);
    caption.append(information, icon('image'));
    button.append(imageWrap, caption);
    card.append(button);
    grid.append(card);
  }
}

async function refreshGallery() {
  const drawings = await storageRequest('readonly', (store) => store.getAll());
  // Called on initial load and after successful saves/deletions only.
  drawingSortCache = buildDrawingSortCache(drawings);
  $('#gallery-error').hidden = true;
  renderGallery();
}

$('#gallery-sort').addEventListener('change', renderGallery);

function canvasBlob() {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
  });
}

$('#save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!hasInk || saving || activeStroke) return;
  const name = $('#drawing-name').value.trim() || '이름 없는 그림';
  saving = true;
  $('#save-button').replaceChildren(icon('save'), document.createTextNode('저장 중…'));
  updateActions();
  try {
    await storageReady;
    if (!database) throw new Error('Storage unavailable');
    const image = await canvasBlob();
    const drawing = { id: crypto.randomUUID(), name, createdAt: Date.now(), image };
    await storageRequest('readwrite', (store) => store.add(drawing));
    await refreshGallery();
    toast(`“${name}”을 보관함에 저장했어요.`);
  } catch (error) {
    console.error('Saving failed:', error);
    toast('그림을 보관하지 못했어요. 브라우저 저장 공간과 사이트 저장 권한을 확인해 주세요.');
  } finally {
    saving = false;
    $('#save-button').replaceChildren(icon('save'), document.createTextNode('그림 저장하기'));
    updateActions();
  }
});

function openDrawing(drawing) {
  selectedDrawing = drawing;
  if (dialogUrl) URL.revokeObjectURL(dialogUrl);
  dialogUrl = URL.createObjectURL(drawing.image);
  $('#dialog-title').textContent = drawing.name;
  $('#dialog-date').textContent = dateFormatter.format(drawing.createdAt);
  $('#dialog-image').src = dialogUrl;
  $('#dialog-image').alt = drawing.name;
  $('#art-dialog').showModal();
}

$('#close-dialog').addEventListener('click', () => $('#art-dialog').close());
$('#art-dialog').addEventListener('click', (event) => {
  if (event.target !== $('#art-dialog')) return;
  const bounds = event.target.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
});
$('#art-dialog').addEventListener('close', () => {
  if (dialogUrl) URL.revokeObjectURL(dialogUrl);
  dialogUrl = null;
  selectedDrawing = null;
  $('#dialog-image').removeAttribute('src');
});

$('#download-drawing').addEventListener('click', () => {
  if (!selectedDrawing) return;
  const link = document.createElement('a');
  const url = URL.createObjectURL(selectedDrawing.image);
  link.href = url;
  link.download = `${selectedDrawing.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

$('#delete-drawing').addEventListener('click', async () => {
  if (!selectedDrawing) return;
  const drawing = selectedDrawing;
  if (!confirm(`“${drawing.name}”을 보관함에서 삭제할까요? 삭제한 그림은 되돌릴 수 없어요.`)) return;
  $('#delete-drawing').disabled = true;
  try {
    await storageRequest('readwrite', (store) => store.delete(drawing.id));
    $('#art-dialog').close();
    await refreshGallery();
    toast('보관함에서 그림을 삭제했어요.');
  } catch (error) {
    console.error('Deletion failed:', error);
    toast('삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
  } finally {
    $('#delete-drawing').disabled = false;
  }
});

whitePaper();
setColor(color);
updateActions();
const storageReady = (async () => {
  try {
    database = await openDatabase();
    await refreshGallery();
  } catch (error) {
    console.error('Storage unavailable:', error);
    $('#gallery-empty').hidden = true;
    $('#gallery-error').textContent = '그림 보관함을 열 수 없어요. 브라우저에서 사이트 데이터 저장을 허용한 후 새로고침해 주세요.';
    $('#gallery-error').hidden = false;
  }
})();
