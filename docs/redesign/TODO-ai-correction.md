# TODO: AI correction ("תקן") on the meal result screen

**Status:** UI only. The backend is not implemented; the submit button is a deliberate no-op.

## What exists
- `AddMealDrawer.tsx`, result screen (`meal-items` tab): a glass **"תקן"** button next to the save button.
  It replaces the design's "תקן בקול" (voice correction).
- The button opens a modal (`correctionOpen` / `correctionText` state) with a free-text field and a
  **"שלח ל-AI"** button. Submitting only closes the modal and clears the text.
  Look for `TODO(ai-correction)` in the code.

## What is left to do
1. API route (e.g. `/api/ai/correct-meal`) that takes the current meal items plus the user's
   correction text, calls the AI, and returns updated items. Reuse the response shape of
   `/api/ai/analyze-meal` (`items`, `engine`, `isAiFallback`).
2. Wire the submit handler in `AddMealDrawer.tsx`: loading state on the button, error banner,
   replace `items` with the result (keep the user's ability to undo or edit afterwards).
3. Decide whether it should run in the background job flow like photo analysis
   (`onStartBackgroundAiAnalysis`) or inline.
4. Optional later: voice input for the correction text (the design's original "תקן בקול").
5. Replace the no-op, then delete this file.

Remember to do this. It is intentionally not implemented yet.
