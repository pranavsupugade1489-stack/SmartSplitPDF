import express from 'express';
import multer from 'multer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
await fs.mkdir(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF files are supported.'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/process', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Upload a PDF file first.' });
    return;
  }

  try {
    const inputBytes = await fs.readFile(req.file.path);
    
    let excludedRegion = null;
    if (req.body.excludeRegion) {
      try {
        const p = JSON.parse(req.body.excludeRegion);
        if (typeof p.x === 'number' && typeof p.y === 'number' &&
            typeof p.width === 'number' && typeof p.height === 'number') {
          excludedRegion = p;
        }
      } catch { /* ignore malformed */ }
    }

    let ignoreColors = [];
    if (req.body.ignoreColors) {
      try {
        ignoreColors = JSON.parse(req.body.ignoreColors); // Array of {r, g, b}
      } catch { /* ignore malformed */ }
    }

    const pageColors = await classifyPdfPages(inputBytes, excludedRegion, ignoreColors);
    const split = await createNumberedSplits(inputBytes, pageColors);
    const id = crypto.randomUUID();
    const baseName = safeBaseName(req.file.originalname);
    
    // Return the bytes directly as Base64 strings
    const blackWhiteBase64 = Buffer.from(split.blackWhiteBytes).toString('base64');
    const colorBase64 = Buffer.from(split.colorBytes).toString('base64');

    await fs.unlink(req.file.path).catch(() => {});

    res.json({
      jobId: id,
      fileName: baseName,
      pages: pageColors.length,
      blackWhitePages: split.blackWhitePages,
      colorPages: split.colorPages,
      files: {
        blackWhite: `data:application/pdf;base64,${blackWhiteBase64}`,
        color: `data:application/pdf;base64,${colorBase64}`
      }
    });
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {});
    console.error(error);
    res.status(500).json({ error: error.message || 'Could not process the PDF.' });
  }
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message || 'Upload failed.' });
});

app.listen(port, () => {
  console.log(`PDF separator running at http://localhost:${port}`);
});

async function classifyPdfPages(inputBytes, excludedRegion, ignoreColors) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(inputBytes),
    disableWorker: true,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  const results = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const operatorList = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1 });
    results.push(await pageHasColor(page, operatorList, excludedRegion, viewport, ignoreColors));
    page.cleanup();
  }

  await pdf.destroy();
  return results;
}

async function pageHasColor(page, operatorList, excludedRegion, viewport, ignoreColors) {
  const ops = pdfjsLib.OPS;

  // Convert excluded region (normalised canvas/top-left coords) to PDF pts (bottom-left origin)
  let excl = null;
  if (excludedRegion && viewport) {
    const pw = viewport.width;
    const ph = viewport.height;
    excl = {
      x1: excludedRegion.x * pw,
      x2: (excludedRegion.x + excludedRegion.width) * pw,
      y1: (1 - excludedRegion.y - excludedRegion.height) * ph,
      y2: (1 - excludedRegion.y) * ph
    };
  }

  // CTM tracking (identity matrix)
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [];

  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] || [];

    // Update current transformation matrix
    if (fn === ops.transform) {
      ctm = matMul(ctm, args);
    } else if (fn === ops.save) {
      ctmStack.push([...ctm]);
    } else if (fn === ops.restore && ctmStack.length) {
      ctm = ctmStack.pop();
    }

    if (isColorOperator(fn) && colorArgsAreColored(args, ignoreColors)) {
      return true;
    }

    if (isImageOperator(fn)) {
      // Skip image if its centre lies inside the excluded region
      if (excl) {
        const bbox = imageBbox(ctm);
        const cx = (bbox.x1 + bbox.x2) / 2;
        const cy = (bbox.y1 + bbox.y2) / 2;
        if (cx >= excl.x1 && cx <= excl.x2 && cy >= excl.y1 && cy <= excl.y2) {
          continue;
        }
      }
      const imageName = args[0];
      const image = await getPdfImage(page, imageName);
      if (image && imageHasColor(image, ignoreColors)) {
        return true;
      }
    }
  }

  return false;
}

// --- Matrix helpers ---
function matMul(m, a) {
  // Multiply current CTM m by new transform a (both as [a,b,c,d,e,f])
  return [
    a[0]*m[0] + a[1]*m[2],
    a[0]*m[1] + a[1]*m[3],
    a[2]*m[0] + a[3]*m[2],
    a[2]*m[1] + a[3]*m[3],
    a[4]*m[0] + a[5]*m[2] + m[4],
    a[4]*m[1] + a[5]*m[3] + m[5]
  ];
}

function transformPt(m, x, y) {
  return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
}

// Bounding box of the unit square [0,0]-[1,1] under ctm (PDF bottom-left coords)
function imageBbox(ctm) {
  const pts = [[0,0],[1,0],[0,1],[1,1]].map(([x,y]) => transformPt(ctm, x, y));
  return {
    x1: Math.min(...pts.map(p => p[0])),
    x2: Math.max(...pts.map(p => p[0])),
    y1: Math.min(...pts.map(p => p[1])),
    y2: Math.max(...pts.map(p => p[1]))
  };
}

function isColorOperator(fn) {
  const ops = pdfjsLib.OPS;
  return [
    ops.setFillRGBColor,
    ops.setStrokeRGBColor,
    ops.setFillCMYKColor,
    ops.setStrokeCMYKColor,
    ops.setFillColorN,
    ops.setStrokeColorN
  ].includes(fn);
}

function isImageOperator(fn) {
  const ops = pdfjsLib.OPS;
  return [
    ops.paintImageXObject,
    ops.paintImageXObjectRepeat,
    ops.paintJpegXObject,
    ops.paintInlineImageXObject,
    ops.paintInlineImageXObjectGroup,
    ops.paintImageMaskXObject
  ].includes(fn);
}

function isColorIgnored(r, g, b, ignoreColors) {
  if (!ignoreColors || ignoreColors.length === 0) return false;
  // Check if distance to any ignored color is below a threshold
  const thresholdSq = 40 * 40; // Allow some tolerance
  for (const ic of ignoreColors) {
    const dr = r - ic.r;
    const dg = g - ic.g;
    const db = b - ic.b;
    if (dr * dr + dg * dg + db * db < thresholdSq) {
      return true;
    }
  }
  return false;
}

function colorArgsAreColored(args, ignoreColors) {
  const flat = args.flat ? args.flat(Infinity) : args;
  const nums = flat.filter((value) => typeof value === 'number');

  // Skip CMYK for simple ignore checking for now, just consider them colored if not grayscale
  if (nums.length >= 4) {
    const [c, m, y, k] = nums;
    if (Math.abs(c - m) > 0.01 || Math.abs(m - y) > 0.01 || Math.abs(c - y) > 0.01) {
      return true;
    }
  }

  if (nums.length >= 3) {
    let [r, g, b] = nums;
    // PDF color operators are typically 0.0 to 1.0
    if (r <= 1 && g <= 1 && b <= 1) {
      r *= 255; g *= 255; b *= 255;
    }
    // Check if it's grayscale
    if (Math.abs(r - g) > 8 || Math.abs(g - b) > 8 || Math.abs(r - b) > 8) {
      // It's a color. Check if ignored.
      if (isColorIgnored(r, g, b, ignoreColors)) {
        return false;
      }
      return true;
    }
  }

  return false;
}

function getPdfImage(page, imageName) {
  if (!imageName || typeof imageName !== 'string') return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (image) => resolve(image || null);
    try {
      page.objs.get(imageName, done);
    } catch {
      try {
        page.commonObjs.get(imageName, done);
      } catch {
        resolve(null);
      }
    }
  });
}

function imageHasColor(image, ignoreColors) {
  const data = image?.data;
  if (!data || data.length < 3) return false;
  if (image.kind === 1) return false;

  const stride = image.kind === 3 ? 4 : 3;
  const limit = Math.min(data.length, 2_000_000); // Check up to 2M values
  for (let i = 0; i < limit - 2; i += stride) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Check if pixel is grayscale
    if (Math.max(r, g, b) - Math.min(r, g, b) > 8) {
      // It's a color. Is it ignored?
      if (!isColorIgnored(r, g, b, ignoreColors)) {
        return true;
      }
    }
  }

  return false;
}

async function createNumberedSplits(inputBytes, pageColors) {
  const source = await PDFDocument.load(inputBytes);
  const blackWhiteDoc = await PDFDocument.create();
  const colorDoc = await PDFDocument.create();
  const blackWhiteFont = await blackWhiteDoc.embedFont(StandardFonts.Helvetica);
  const colorFont = await colorDoc.embedFont(StandardFonts.Helvetica);
  const blackWhitePages = [];
  const colorPages = [];

  for (let i = 0; i < source.getPageCount(); i += 1) {
    const isColor = pageColors[i];
    
    if (isColor) {
      const [copiedPage] = await colorDoc.copyPages(source, [i]);
      addPageNumber(copiedPage, i + 1, colorFont);
      colorDoc.addPage(copiedPage);
      colorPages.push(i + 1);
    } else {
      const [copiedPage] = await blackWhiteDoc.copyPages(source, [i]);
      addPageNumber(copiedPage, i + 1, blackWhiteFont);
      blackWhiteDoc.addPage(copiedPage);
      blackWhitePages.push(i + 1);
    }
  }

  return {
    blackWhiteBytes: await blackWhiteDoc.save(),
    colorBytes: await colorDoc.save(),
    blackWhitePages,
    colorPages
  };
}

function addPageNumber(page, pageNumber, font) {
  const { width } = page.getSize();
  const text = String(pageNumber);
  const fontSize = 10;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  page.drawText(text, {
    x: (width - textWidth) / 2,
    y: 18,
    size: fontSize,
    font,
    color: rgb(0, 0, 0)
  });
}

function safeBaseName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'document';
}
