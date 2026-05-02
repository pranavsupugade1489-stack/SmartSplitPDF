# Technologies and Process

This document explains the main technologies used in the PDF Color Separator app and how the color detection and page separation workflow works.

## Main Technologies

### Node.js

Node.js runs the backend server. It receives the uploaded PDF, processes each page, creates the separated PDF files, and sends the final download links back to the browser.

### Express

Express is the web server framework. It serves the frontend files from `public/` and exposes the API endpoint:

```text
POST /api/process
```

The frontend sends the selected PDF to this endpoint for processing.

### Multer

Multer handles PDF uploads. It receives the file from the browser and temporarily stores it in the local `uploads/` folder while the server processes it.

### PDF.js

PDF.js is used to inspect the contents of each PDF page. The app uses it to read each page's drawing operations and embedded image data.

PDF pages are not just images. They are usually made of drawing commands such as:

- draw this text
- set this fill color
- place this image
- draw this shape

PDF.js helps expose those operations so the app can decide whether a page contains color.

### pdf-lib

`pdf-lib` is used to create the final output PDFs. It copies pages from the original PDF, adds page numbers, and saves two new PDFs:

- one for black-and-white pages
- one for color pages

### Supabase

Supabase is used as the backend storage layer. After processing, the generated PDF files are uploaded to a private Supabase Storage bucket.

The app then creates signed download URLs so the user can download the generated files without making the bucket public.

The optional `pdf_split_jobs` table stores metadata such as:

- original file name
- total page count
- black-and-white page numbers
- color page numbers
- Supabase Storage paths
- creation time

## Processing Workflow

The app follows this process:

1. The user uploads a PDF from the browser.
2. The frontend sends the PDF to the Node.js server.
3. Multer stores the uploaded file temporarily.
4. PDF.js reads the PDF page by page.
5. Each page is checked for color.
6. `pdf-lib` copies pages into two new PDF documents.
7. The original page number is stamped onto every copied page.
8. The two output PDFs are uploaded to Supabase Storage.
9. Supabase signed URLs are returned to the browser.
10. The user downloads the black-and-white and color PDF files separately.

## Color Detection

The app uses two main checks to decide whether a page contains color.

### 1. PDF Color Operators

PDF pages can contain drawing instructions that set colors for text, lines, shapes, or fills.

Examples include:

- RGB fill color
- RGB stroke color
- CMYK fill color
- CMYK stroke color
- advanced color spaces

If a page sets a color where the color channels are meaningfully different, the app treats that page as a color page.

For example:

```text
RGB(0, 0, 0)       black
RGB(120, 120, 120) gray
RGB(255, 0, 0)     color
RGB(30, 100, 180)  color
```

Black, white, and gray have roughly equal red, green, and blue values. A page is considered colored when the red, green, and blue values differ enough to indicate visible color.

For CMYK colors, the app checks whether the cyan, magenta, and yellow channels are meaningfully different. If they are, the page is treated as color.

### 2. Embedded Image Pixels

Some pages may not use colored text or shapes but may contain a photo, screenshot, scanned document, chart, or colored graphic.

For image-based pages, the app samples the image pixel data and compares the red, green, and blue channels.

If a pixel has a noticeable difference between its RGB channels, the image is considered colored.

For example:

```text
R=80,  G=80,  B=80   grayscale
R=220, G=40,  B=40   color
R=30,  G=120, B=200  color
```

This helps detect color in:

- photos
- scanned pages
- charts
- logos
- colored screenshots
- diagrams

## Why the Detection Uses Thresholds

The app does not require RGB values to be perfectly equal to count as grayscale.

Real PDFs and scanned documents often contain tiny differences caused by compression, anti-aliasing, or scanner noise. For example, a gray pixel might appear as:

```text
R=122, G=123, B=121
```

This should still be treated as grayscale. The app uses a small tolerance so minor differences do not incorrectly mark a page as colored.

## Page Separation

After every page is classified, the app creates two new PDF documents:

- `black-white.pdf`
- `color.pdf`

Each original page is copied into one of these files based on the detection result.

The original page order is preserved within each output file. For example, if pages 1, 3, and 6 are black-and-white, the black-and-white PDF will contain those pages in that order.

## Page Numbering

Before each copied page is added to an output PDF, the app stamps the original page number near the bottom center of the page.

This is important because once the PDF is split, the first page of the color PDF might originally have been page 8 or page 20. Page numbering helps the user match printed pages back to the original document.

## Supabase Storage Flow

The generated PDFs are uploaded to a private Supabase Storage bucket named:

```text
processed-pdfs
```

The app stores files using a job ID folder:

```text
job-id/document-black-white.pdf
job-id/document-color.pdf
```

After upload, the server creates signed URLs. These links allow temporary access to the private files.

The expiration time is controlled by:

```text
SUPABASE_SIGNED_URL_SECONDS
```

## Accuracy Notes

This app is designed for practical print-cost separation, not professional prepress certification.

It should work well for common PDFs that contain:

- normal text pages
- grayscale pages
- colored charts
- screenshots
- photos
- scanned pages
- colored logos or diagrams

Possible edge cases include:

- PDFs using unusual color spaces
- pages with tiny colored marks that may not matter for printing
- images with very subtle color noise
- scanned black-and-white pages saved as slightly tinted color images
- printer-specific behavior where grayscale objects are still printed using color toner

For most everyday documents, the detection should be useful enough to reduce unnecessary color printing.

## Security Notes

The Supabase service-role key is used only on the backend server. It must never be placed in frontend JavaScript.

The browser receives only signed download URLs, not Supabase admin credentials.
