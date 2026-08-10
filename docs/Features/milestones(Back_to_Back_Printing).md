# Milestones for Back to Back Printing

## Milestone 1: Core Logic Implementation
- **Recommended Model:** Gemini 3.1 Pro (High)
- **Key implementation details:**
  - Add the boolean toggle to the frontend UI (`index.html`).
  - Wire up the frontend to send the toggle value in FormData (`app.js`).
  - Add the pairing logic in the backend (`server.js`) right before splitting pages.
- **Gate ✅:**
  - Run the application, upload a test PDF, toggle BtoB on, and ensure the odd/even page pairing works.

| # | Milestone | Status | Model | New Files | Modified Files |
|---|---|---|---|---|---|
| 1 | Core Logic Implementation | ⏳ Next | Gemini 3.1 Pro (High) | 0 | 3 |
