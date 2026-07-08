# Universal Scraper & AI Summarizer Framework

A lightweight, serverless framework designed to run scraper scripts daily using **GitHub Actions**, process raw texts and downloaded PDFs using **Google Gemini 2.5 Flash**, and dispatch structured email notifications with Word (DOCX) and PDF attachments.

---

## Features
- **Pluggable Scrapers**: Easily add scraper scripts in the `scrapers/` directory.
- **AI-Powered Summaries**: Compiles and summarizes downloaded PDFs and HTML content with Gemini.
- **Word Document Generator**: Converts scraped brief descriptions into professionally formatted DOCX files automatically.
- **Automated Dispatch**: Emails summaries with attachments using Nodemailer.
- **No Database Needed**: Keeps track of processed advisories via `history.json`, which the GitHub Action commits back to your repository.
- **Serverless & Free**: Runs on a daily Cron schedule at 9:00 AM IST (3:30 AM UTC) for free using GitHub Actions.

---

## Project Structure
```
├── .github/workflows/
│   └── scrape-and-notify.yml    # GitHub Actions workflow config
├── scrapers/
│   └── gst.js                  # Scraper plugins (GST, Taxmann, etc.)
├── config.js                   # Configuration and default email templates
├── runner.js                   # Central orchestration engine
├── history.json                # Keeps track of sent/processed IDs
├── package.json
└── README.md
```

---

## How to Add a New Scraper Script
To add a new website to scrape (e.g., Taxmann, CBIC, etc.):
1. Create a new `.js` file inside the `scrapers/` folder (e.g., `scrapers/taxmann.js`).
2. Export an async function named `scrape` that returns an array of objects matching this format:

```javascript
export async function scrape() {
  // 1. Write your scraping logic here (using Playwright, fetch, or Cheerio)
  // ...

  // 2. Return the scraped items
  return [
    {
      id: "unique_id_for_this_post", // e.g. a hash of the title
      title: "GST rate cut on electronic items",
      date: "2026-07-08",
      category: "GST Rates",
      htmlContent: "<p>The council decided to reduce tax on electronic goods...</p>",
      pdfUrls: [
        "https://services.gst.gov.in/documents/advisory_rate_cut.pdf"
      ]
    }
  ];
}
```

The orchestrator (`runner.js`) will automatically pick up your script, run it, download the PDFs, generate the DOCX, call Gemini, send the email, and record the `id` to `history.json` so it isn't processed again.

---

## Local Setup & Configuration
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key
EMAIL_SENDER=your_gmail_address
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_RECIPIENT=shabanamulla@cnkindia.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### Running Locally
1. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```
2. Run dry-run (scrapes sites, prints AI summary to console, sends no emails, and writes no history):
   ```bash
   npm run test-scrape
   ```
3. Run normally:
   ```bash
   npm start
   ```
4. Run the Control Panel UI Dashboard locally:
   ```bash
   npm run dashboard
   ```
   Open your browser and navigate to `http://localhost:3000` to access the light-themed control panel, trigger manual runs, stream live logs, and update email sent states.

---

## Deploying to GitHub Actions

1. Create a GitHub repository and push this codebase to the `main` branch.
2. In your repository page, go to **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
3. Add the following secrets:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `EMAIL_SENDER`: Your dispatch email address (e.g., your Gmail).
   - `EMAIL_PASSWORD`: Your email app password (Gmail app password).
   - `EMAIL_RECIPIENT`: Recipient email address.
   - `SMTP_HOST`: `smtp.gmail.com` (or your SMTP host).
   - `SMTP_PORT`: `587`.
4. Ensure GitHub Actions has write permission to commit `history.json` back to your repo:
   - Go to **Settings** > **Actions** > **General**.
   - Under **Workflow permissions**, select **Read and write permissions** and click **Save**.

The workflow is scheduled to run automatically every day at 9:00 AM IST. You can also trigger it manually from the **Actions** tab of your GitHub repository.
