# Back to Back (BtoB) Printing Logic

Background: The user wants to add an option to optimize the PDF for double-sided (back-to-back) printing. When a sheet is printed on both sides, if *either* the front (odd page) or the back (even page) has color, the entire physical sheet (both pages) must be sent to the color printer. Otherwise, the front and back pages would be split between the color and black & white output PDFs, making it impossible to print them back-to-back properly on a single physical sheet.

## Proposed Changes

### UI (`public/index.html` & `public/app.js`)
- **[MODIFY] [index.html](file:///c:/projects/coloured_page_seperator/public/index.html)**: Add a new "Back to Back Printing" toggle switch in the "Configure detection options" section of page 2.
- **[MODIFY] [app.js](file:///c:/projects/coloured_page_seperator/public/app.js)**: Read the toggle's state and append `btob: true/false` to the `FormData` sent to the server.

### Backend (`server.js`)
- **[MODIFY] [server.js](file:///c:/projects/coloured_page_seperator/server.js)**: 
  - Update `createJob` to parse the boolean from `req.body.btob`.
  - In `processQueuedPdf`, before calling `createNumberedSplits`, process the `pageColors` array.
  - Apply the BtoB pairing logic: iterate through `pageColors` (0-indexed). For every page `i`, if `pageColors[i]` is true:
    - If `i` is even (front side of the sheet, e.g. page 1, index 0), mark `pageColors[i+1]` as true (if it exists).
    - If `i` is odd (back side of the sheet, e.g. page 2, index 1), mark `pageColors[i-1]` as true.
  - By modifying `pageColors` before splitting, we achieve the BtoB requirement gracefully without modifying the underlying split or stack logic.

## File Change Summary
| File | Action | What changes |
|------|--------|--------------|
| `public/index.html` | MODIFY | Add "Back to Back Printing" toggle in configuration. |
| `public/app.js` | MODIFY | Append `btob` toggle state to `FormData`. |
| `server.js` | MODIFY | Read `req.body.btob`, adjust `pageColors` array to pair odd/even pages when `job.isBackToBack` is true. |

## Verification Checklist
1. Upload a PDF with a colored page 1 and B&W page 2. Toggle BtoB ON -> both pages go to color.
2. Upload a PDF with B&W page 1 and colored page 2. Toggle BtoB ON -> both pages go to color.
3. Upload the same PDFs with BtoB OFF -> the pages are split normally between color and B&W.
