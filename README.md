# PDF Color Separator

A minimal Node.js web app that uploads a PDF, detects pages that use color, stamps the original page number onto every page, and provides two separated PDFs for download:

- black-and-white pages
- color pages

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the app:

   ```bash
   npm start
   ```

3. Open:

   ```text
   http://localhost:3000
   ```

## Notes

- Processing happens entirely on the server.
- Output PDFs are sent directly to the browser as data URLs for download.
- No external database or storage service (like Supabase) is required.
- The page classifier checks PDF color drawing operators and embedded image pixel data. It is designed for print-cost separation, not forensic prepress analysis.
