import * as pdfjsLib from 'https://unpkg.com/pdfjs-dist@5.4.394/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.4.394/build/pdf.worker.mjs';

// Page navigation
const page1 = document.getElementById('page1');
const page2 = document.getElementById('page2');
const page3 = document.getElementById('page3');
const goToPage2Btn = document.getElementById('goToPage2Btn');
const startOverBtn = document.getElementById('startOverBtn');

// Upload UI elements
const input = document.getElementById('pdfInput');
const uploadPrompt = document.getElementById('uploadPrompt');
const fileSelectedCard = document.getElementById('fileSelectedCard');
const fileName = document.getElementById('fileName');
const fileSizeSpan = document.getElementById('fileSize');
const pageCountSpan = document.getElementById('pageCountSpan');
const removeFileBtn = document.getElementById('removeFileBtn');
const processButton = document.getElementById('processButton');

// Exclude Region UI elements
const noPdfMessage = document.getElementById('noPdfMessage');
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const pdfCanvas = document.getElementById('pdfCanvas');
const selectionOverlay = document.getElementById('selectionOverlay');
const canvasWrapper = document.getElementById('canvasWrapper');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageNumSpan = document.getElementById('pageNum');
const modeSelectBtn = document.getElementById('modeSelectBtn');
const clearRegionBtn = document.getElementById('clearRegionBtn');

// Processing and Results UI
const processingState = document.getElementById('processingState');
const statusBox = document.getElementById('status');
const results = document.getElementById('results');
const origPageCountBadge = document.getElementById('origPageCountBadge');

const bwCount = document.getElementById('bwCount');
const bwPages = document.getElementById('bwPages');
const bwLink = document.getElementById('bwLink');

const colorCount = document.getElementById('colorCount');
const colorPages = document.getElementById('colorPages');
const colorLink = document.getElementById('colorLink');

// Mode variables
let currentPdf = null;
let currentPageNum = 1;
let isSelectMode = true;
let isEyedropMode = false;
let excludedRegion = null;
let dragStart = null;
let dragCurrent = null;
let ignoreColors = []; // Array of {r,g,b}

// New UI Elements
const eyedropperBtn = document.getElementById('eyedropperBtn');
const pickedColorsContainer = document.getElementById('pickedColors');
const noColorsText = document.getElementById('noColorsText');
const previewModal = document.getElementById('previewModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const pdfIframe = document.getElementById('pdfIframe');

// Navigation logic
goToPage2Btn.addEventListener('click', () => {
  page1.classList.remove('active');
  page2.classList.add('active');
  page2.style.display = 'block';
  page1.style.display = 'none';
});

startOverBtn.addEventListener('click', () => {
  location.reload();
});

// Selection mode logic
clearRegionBtn.addEventListener('click', () => {
  excludedRegion = null;
  clearRegionBtn.style.display = 'none';
  drawOverlay();
});

function setMode(select) {
  isSelectMode = select;
  isEyedropMode = !select;
  if (select) {
    if(modeSelectBtn) modeSelectBtn.classList.add('active');
    eyedropperBtn.classList.remove('active');
    selectionOverlay.style.cursor = 'crosshair';
  } else {
    if(modeSelectBtn) modeSelectBtn.classList.remove('active');
    eyedropperBtn.classList.add('active');
    // Using a custom eyedropper cursor
    selectionOverlay.style.cursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 22 5-5'/%3E%3Cpath d='M9.5 14.5 16 8'/%3E%3Cpath d='m17 2 5 5-.5.5-2 2L18 7l1.5-1.5L17 3l-1.5 1.5L14 3l2-2 .5.5Z'/%3E%3Cpath d='m19 11-4-4'/%3E%3Cpath d='M6.246 14.754a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l8.485-8.485 2.828 2.828-8.485 8.485Z'/%3E%3C/svg%3E") 0 24, auto`;
  }
}

modeSelectBtn.addEventListener('click', () => setMode(true));
eyedropperBtn.addEventListener('click', () => setMode(!isEyedropMode));
setMode(true);

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function renderPickedColors() {
  if (ignoreColors.length === 0) {
    noColorsText.style.display = 'block';
    pickedColorsContainer.innerHTML = '';
    pickedColorsContainer.appendChild(noColorsText);
    return;
  }
  noColorsText.style.display = 'none';
  pickedColorsContainer.innerHTML = '';
  
  const list = document.createElement('div');
  list.className = 'picked-colors-list';
  
  ignoreColors.forEach((color, idx) => {
    const item = document.createElement('div');
    item.className = 'color-list-item';
    
    const hex = rgbToHex(color.r, color.g, color.b);
    
    item.innerHTML = `
      <div class="swatch" style="background-color: ${hex}"></div>
      <span class="color-hex">${hex}</span>
      <button type="button" class="remove-color-btn" title="Remove">&times;</button>
    `;
    
    item.querySelector('.remove-color-btn').addEventListener('click', () => {
      ignoreColors.splice(idx, 1);
      renderPickedColors();
    });
    
    list.appendChild(item);
  });
  
  pickedColorsContainer.appendChild(list);
}

// Canvas overlay logic
selectionOverlay.addEventListener('mousedown', (e) => {
  if (isEyedropMode) {
    // Pick color
    const r = selectionOverlay.getBoundingClientRect();
    const scaleX = pdfCanvas.width / r.width;
    const scaleY = pdfCanvas.height / r.height;
    const x = (e.clientX - r.left) * scaleX;
    const y = (e.clientY - r.top) * scaleY;
    
    const ctx = pdfCanvas.getContext('2d');
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    
    if (pixel[3] > 0) { // Not fully transparent
      ignoreColors.push({ r: pixel[0], g: pixel[1], b: pixel[2] });
      renderPickedColors();
    }
    // Turn off eyedropper after picking one color to resume region selection if they want
    setMode(true);
    return;
  }

  e.preventDefault();
  const r = selectionOverlay.getBoundingClientRect();
  dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
  dragCurrent = { ...dragStart };
});

selectionOverlay.addEventListener('mousemove', (e) => {
  if (!dragStart || isEyedropMode) return;
  e.preventDefault();
  const r = selectionOverlay.getBoundingClientRect();
  dragCurrent = { x: e.clientX - r.left, y: e.clientY - r.top };
  drawOverlay();
});

selectionOverlay.addEventListener('mouseup', (e) => {
  if (!dragStart || isEyedropMode) return;
  const r = selectionOverlay.getBoundingClientRect();
  const end = { x: e.clientX - r.left, y: e.clientY - r.top };
  const w = Math.abs(end.x - dragStart.x);
  const h = Math.abs(end.y - dragStart.y);
  if (w > 5 && h > 5) {
    excludedRegion = {
      x: Math.min(dragStart.x, end.x) / r.width,
      y: Math.min(dragStart.y, end.y) / r.height,
      width: w / r.width,
      height: h / r.height
    };
    clearRegionBtn.style.display = 'inline-block';
  }
  dragStart = null;
  dragCurrent = null;
  drawOverlay();
});

function drawOverlay() {
  const ctx = selectionOverlay.getContext('2d');
  const W = selectionOverlay.width;
  const H = selectionOverlay.height;
  ctx.clearRect(0, 0, W, H);

  function drawRect(nx, ny, nw, nh, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.fillRect(nx * W, ny * H, nw * W, nh * H);
    ctx.strokeRect(nx * W, ny * H, nw * W, nh * H);
    ctx.restore();
  }

  if (excludedRegion) {
    drawRect(excludedRegion.x, excludedRegion.y, excludedRegion.width, excludedRegion.height,
      'rgba(255,80,0,0.18)', 'rgba(255,80,0,0.85)');
  }

  if (dragStart && dragCurrent && !isEyedropMode) {
    const r = selectionOverlay.getBoundingClientRect();
    const rw = r.width || 1;
    const rh = r.height || 1;
    const x = Math.min(dragStart.x, dragCurrent.x) / rw;
    const y = Math.min(dragStart.y, dragCurrent.y) / rh;
    const w = Math.abs(dragCurrent.x - dragStart.x) / rw;
    const h = Math.abs(dragCurrent.y - dragStart.y) / rh;
    drawRect(x, y, w, h, 'rgba(255,80,0,0.10)', 'rgba(255,80,0,0.6)');
  }
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// File input change logic
input.addEventListener('change', async () => {
  const file = input.files[0];
  if (file) {
    fileName.textContent = file.name;
    fileSizeSpan.textContent = formatBytes(file.size);
    processButton.disabled = false;
    
    uploadPrompt.style.display = 'none';
    fileSelectedCard.style.display = 'flex';

    try {
      const fileReader = new FileReader();
      fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        currentPdf = await pdfjsLib.getDocument(typedarray).promise;
        currentPageNum = 1;
        pageCountSpan.textContent = currentPdf.numPages;
        origPageCountBadge.textContent = `${currentPdf.numPages} pages`;
        await renderPage(currentPageNum);
        
        noPdfMessage.style.display = 'none';
        pdfPreviewContainer.style.display = 'flex';
        eyedropperBtn.style.display = 'inline-flex';
        modeSelectBtn.style.display = 'inline-block';
      };
      fileReader.readAsArrayBuffer(file);
    } catch (e) {
      console.error('Error rendering PDF preview:', e);
      resetFileInput();
    }
  } else {
    resetFileInput();
  }
});

removeFileBtn.addEventListener('click', () => {
  input.value = '';
  resetFileInput();
});

function resetFileInput() {
  processButton.disabled = true;
  uploadPrompt.style.display = 'block';
  fileSelectedCard.style.display = 'none';
  noPdfMessage.style.display = 'block';
  pdfPreviewContainer.style.display = 'none';
  eyedropperBtn.style.display = 'none';
  modeSelectBtn.style.display = 'none';
  currentPdf = null;
  excludedRegion = null;
  ignoreColors = [];
  renderPickedColors();
  clearRegionBtn.style.display = 'none';
}

async function renderPage(num) {
  if (!currentPdf) return;
  const page = await currentPdf.getPage(num);
  const viewport = page.getViewport({ scale: 1.0 });

  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  selectionOverlay.width = viewport.width;
  selectionOverlay.height = viewport.height;

  await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport }).promise;
  pageNumSpan.textContent = num;
  prevPageBtn.disabled = num <= 1;
  nextPageBtn.disabled = num >= currentPdf.numPages;
  drawOverlay();
}

prevPageBtn.addEventListener('click', async () => {
  if (currentPageNum <= 1) return;
  currentPageNum--;
  await renderPage(currentPageNum);
});

nextPageBtn.addEventListener('click', async () => {
  if (!currentPdf || currentPageNum >= currentPdf.numPages) return;
  currentPageNum++;
  await renderPage(currentPageNum);
});

// Processing logic
processButton.addEventListener('click', async () => {
  if (!input.files[0]) return;

  // Move to page 3
  page2.classList.remove('active');
  page2.style.display = 'none';
  page3.classList.add('active');
  page3.style.display = 'block';
  
  processingState.style.display = 'block';
  results.hidden = true;

  const body = new FormData();
  body.append('pdf', input.files[0]);
  if (excludedRegion) {
    body.append('excludeRegion', JSON.stringify(excludedRegion));
  }
  if (ignoreColors.length > 0) {
    body.append('ignoreColors', JSON.stringify(ignoreColors));
  }

  try {
    const response = await fetch('/api/process', {
      method: 'POST',
      body
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Processing failed.');
    }

    showResults(data);
  } catch (error) {
    const errObj = document.getElementById('status');
    errObj.textContent = `Error: ${error.message}`;
    errObj.classList.add('error');
    document.querySelector('.spinner').style.display = 'none';
  }
});

// Modal Logic
function openModal(url, isBw, title) {
  modalTitle.textContent = title;
  pdfIframe.src = url;
  if (isBw) {
    pdfIframe.classList.add('iframe-bw');
  } else {
    pdfIframe.classList.remove('iframe-bw');
  }
  previewModal.style.display = 'flex';
}

closeModalBtn.addEventListener('click', () => {
  previewModal.style.display = 'none';
  pdfIframe.src = '';
});

async function showResults(data) {
  processingState.style.display = 'none';
  
  // Render Original PDF Thumbnails
  const allPageNums = Array.from({length: currentPdf.numPages}, (_, i) => i + 1);
  document.getElementById('origPageCountBadge').textContent = `${currentPdf.numPages} pages`;
  await renderThumbnails(allPageNums, 'origThumbnails', 5, false);

  // Black & White Stream
  const bwCountVal = data.blackWhitePages.length;
  bwCount.textContent = pageLabel(bwCountVal);
  // Optional: In a real implementation you would render real thumbnails here.
  // bwPages.textContent = formatPages(data.blackWhitePages);
  
  if (bwCountVal > 0) {
    const blob = base64ToBlob(data.files.blackWhite);
    const objectUrl = URL.createObjectURL(blob);
    bwLink.href = objectUrl;
    bwLink.download = `${data.fileName}-bw.pdf`;
    bwLink.style.display = 'flex';
    
    // Update meta sizes
    document.getElementById('bwDlMeta').textContent = `${bwCountVal} pages`;
    
    await renderThumbnails(data.blackWhitePages, 'bwPages', 4, false);
  } else {
    bwLink.style.display = 'none';
    document.getElementById('bwPages').innerHTML = '<p class="page-list" style="margin-top:10px;">No pages</p>';
  }

  // Color Stream
  const colorCountVal = data.colorPages.length;
  colorCount.textContent = pageLabel(colorCountVal);
  // colorPages.textContent = formatPages(data.colorPages);
  
  if (colorCountVal > 0) {
    const blob = base64ToBlob(data.files.color);
    const objectUrl = URL.createObjectURL(blob);
    colorLink.href = objectUrl;
    colorLink.download = `${data.fileName}-color.pdf`;
    colorLink.style.display = 'flex';
    
    // Update meta sizes
    document.getElementById('colorDlMeta').textContent = `${colorCountVal} pages`;
    
    await renderThumbnails(data.colorPages, 'colorPages', 4, true);
  } else {
    colorLink.style.display = 'none';
    document.getElementById('colorPages').innerHTML = '<p class="page-list" style="margin-top:10px;">No pages</p>';
  }

  // Summary Text
  const summaryText = document.getElementById('summaryText');
  if (summaryText) {
    summaryText.textContent = `${colorCountVal} pages in color • ${bwCountVal} pages in black & white`;
  }

  document.getElementById('startOverBtn').style.display = 'block';
  results.hidden = false;
}

async function appendThumbnails(container, pageNumbers, startIndex, endIndex, insertBeforeEl = null) {
  for (let i = startIndex; i < endIndex; i++) {
    const pageNum = pageNumbers[i];
    
    const wrapper = document.createElement('div');
    wrapper.className = 'thumb-item';
    
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas';
    
    const pageLabel = document.createElement('span');
    pageLabel.className = 'thumb-page';
    pageLabel.textContent = pageNum;
    
    wrapper.appendChild(canvas);
    wrapper.appendChild(pageLabel);
    
    if (insertBeforeEl) {
      container.insertBefore(wrapper, insertBeforeEl);
    } else {
      container.appendChild(wrapper);
    }
    
    try {
      const page = await currentPdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.3 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch (err) {
      console.error('Error rendering thumbnail for page ' + pageNum, err);
    }
  }
}

async function renderThumbnails(pageNumbers, containerId, maxThumbs = 4, isPinkMore = false) {
  const container = document.getElementById(containerId);
  if (!container || !currentPdf) return;
  
  container.innerHTML = '';
  
  if (pageNumbers.length <= maxThumbs) {
    await appendThumbnails(container, pageNumbers, 0, pageNumbers.length, null);
    return;
  }

  await appendThumbnails(container, pageNumbers, 0, maxThumbs, null);
  
  const more = document.createElement('div');
  more.className = 'thumb-more';
  if (isPinkMore) more.classList.add('pink-more');
  more.textContent = '...';
  more.style.cursor = 'pointer';
  more.title = "Load all remaining pages";
  container.appendChild(more);

  more.addEventListener('click', async () => {
    more.style.cursor = 'default';
    more.style.pointerEvents = 'none';
    more.style.opacity = '0.5';
    
    await appendThumbnails(container, pageNumbers, maxThumbs, pageNumbers.length, more);
    
    more.remove();
  }, { once: true });
}

function base64ToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

function pageLabel(count) {
  return `${count} page${count === 1 ? '' : 's'}`;
}

function formatPages(pages) {
  if (!pages.length) return 'No pages detected in this group.';
  return `Pages ${pages.join(', ')}`;
}
