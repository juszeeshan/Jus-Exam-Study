# Jus Exam Study — Final (GitHub Pages + Google Apps Script)

This build uses only:
- **Frontend:** GitHub Pages
- **Backend:** Google Apps Script
- **Attempt log:** a Google Sheet created automatically in your Google Drive

No Firebase, Cloudflare, paid server, or API key is required.

## 1. Publish the frontend on GitHub

1. Download and extract `jus-exam-study-final.zip`.
2. Open your GitHub repository and upload the contents of the `jus-exam-study-final` folder to the repository's root (not the folder itself).
3. Commit the files.
4. In GitHub, open **Settings → Pages**.
5. Under Build and deployment, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
6. Wait for GitHub Pages to publish the site.

Frontend files are `index.html`, `style.css`, `pdf-engine.js`, `app.js`, `manifest.json`, and `service-worker.js`.

## 2. Set up the Google Apps Script backend (one time)

1. Open [script.google.com](https://script.google.com) and create a **New project**.
2. Delete the starter code in `Code.gs` and paste all contents of the included `Code.gs` file.
3. Click **Save**.
4. Click **Deploy → New deployment**.
5. Select the gear beside **Select type**, then choose **Web app**.
6. Set **Execute as** to **Me**.
7. Set **Who has access** to **Anyone**. This is needed so your GitHub Pages site can call the backend without a Google sign-in prompt.
8. Click **Deploy** and approve Google's authorization prompts.
9. Copy the Web app URL. It ends in `/exec`.
10. Open Jus Exam Study → **Settings** and paste that URL, then click **Save backend URL**.

The first submitted attempt automatically creates a Google Sheet named **Jus Exam Study - Results** in the Google account that owns the Apps Script. Each attempt is added to the `Attempts` tab.

If you edit `Code.gs` later, use **Deploy → Manage deployments → Edit → New version → Deploy**. The URL normally remains the same.

## 3. Use it

1. Upload the **question paper PDF** (no answers) and the **answer paper PDF** (correct answers in blue, underlined).
2. Click **Read PDFs**. The app builds one card per question and finds the correct answers by looking at the blue / underlined text on every page of the answer paper. Scanned PDFs are detected automatically and read with OCR (or press **OCR scanned PDF** to force it).
3. Check the **Detected answer key** list on the left. Cards marked "No answer detected" need the answer typed into the reference box.
4. Choose Practice or Exam mode, answer the questions and click **Evaluate my paper**.
5. Marking happens instantly in your browser. If you set up the optional Apps Script backend, every attempt is also logged to your Google Sheet.

## How the answers are found

- Each word of the answer paper is checked on the rendered page. A word counts as an answer if it is blue, sits on a blue highlighter band, or has a blue underline.
- MCQs: the option(s) marked in blue become the correct option(s). Options can be `(A)`, `A.`, `A)`, `(a)`, or `(1)` style, on separate lines or all on one line.
- Fill-in-the-blank, True/False and descriptive questions: the blue text under that question becomes the reference answer.
- Questions are matched by number (with a text-similarity safety check). Plain answer tables such as "1. B  2. D" are also understood when the answer paper has no highlights.
- Two-column pages and repeated headers / footers / page numbers are handled.

## What this build does / important limits

- MCQ, True/False and fill-in-the-blank are marked exactly. Descriptive answers get an **estimated** score from key-term overlap with the reference answer. It is **not** semantic AI grading, so review descriptive answers yourself.
- Draft answers and local evaluation history autosave in the same browser/device.
- PDF.js reads selectable text. OCR uses Tesseract.js in English and needs an internet connection.
- Question parsing is heuristic; skim the generated cards before answering. Anything wrong can be edited on the card.
- The Apps Script deployment is accessible to anyone with its URL. Do not store confidential exam material or personal data in a public/shared repository. If you updated the app, also redeploy the latest `Code.gs` (Deploy → Manage deployments → Edit → New version) so logging works.

## Troubleshooting

- **Backend URL rejected:** copy the full Apps Script Web app URL ending exactly in `/exec`.
- **Permission / authorization error:** redeploy as `Execute as Me` and `Who has access: Anyone`, then authorize the script.
- **No row in Google Sheet:** submit one test attempt after deployment and check the Google account that owns the script for the `Jus Exam Study - Results` spreadsheet.
- **"No blue underlined answers were found":** check the two PDFs are in the right slots. If the answer paper is a scan or a photo, press **OCR scanned PDF**.
- **A few answers missing:** type them into that card's reference box; the card then counts as detected.
