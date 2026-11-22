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

Frontend files are `index.html`, `style.css`, `app.js`, `manifest.json`, and `service-worker.js`.

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

1. Upload your question paper PDF and answer key PDF.
2. Click **Read PDFs**. If the question paper is scanned, use **OCR scanned PDF** instead.
3. Check the detected question cards. PDF extraction is not perfect: correct question text, marks, answer type and MCQ options if needed.
4. Add a reference answer / marking points to a question if the answer key was not detected correctly.
5. Choose Practice or Exam mode, answer the questions and click **Evaluate my paper**.
6. See question-wise feedback and score. Attempts are also logged in your Google Sheet.

## What this build does / important limits

- Draft answers and local evaluation history autosave in the same browser/device.
- Apps Script stores submitted results in your Google Sheet.
- PDF.js extracts selectable text. OCR uses Tesseract.js in English and needs an internet connection.
- Question parsing is heuristic; review the generated question cards before answering.
- Apps Script marking is a lightweight answer-key / keyword-coverage estimate. It is **not semantic AI grading** and should not be treated as an official grade, especially for descriptive answers. It awards estimated partial credit for descriptive answers when a reference answer is available.
- The answer key parser may not reliably identify every answer in complex layouts. If the expected answer shown in feedback is wrong or missing, edit the per-question reference answer before evaluating.
- The frontend keeps its own history locally. The backend Sheet is the central record of submitted attempts.
- The Apps Script deployment is accessible to anyone with its URL. Do not store confidential exam material or personal data in a public/shared repository. Anyone who obtains the URL could submit data to the Sheet; redeploy or restrict access if the URL is exposed.

## Troubleshooting

- **Backend URL rejected:** copy the full Apps Script Web app URL ending exactly in `/exec`.
- **Permission / authorization error:** redeploy as `Execute as Me` and `Who has access: Anyone`, then authorize the script.
- **No row in Google Sheet:** submit one test attempt after deployment and check the Google account that owns the script for the `Jus Exam Study - Results` spreadsheet.
- **PDF text is blank:** it may be a scanned PDF. Use OCR for the question paper; manually enter reference answers if the answer key is scanned.
