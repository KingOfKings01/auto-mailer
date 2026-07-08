# GitHub Actions Hosting & Configuration Guide

This guide details how to set up, configure, and host the **Universal Scraper & AI Summarizer Framework** on GitHub Actions. 

---

## 1. How GitHub Actions Scheduling Works
The workflow is defined in [.github/workflows/scrape-and-notify.yml](file:///e:/Data/code%20master/Auto%20mailer/.github/workflows/scrape-and-notify.yml). It triggers automatically using the `schedule` property (POSIX cron syntax in UTC time) or manually via `workflow_dispatch`.

### Customizing the Schedule (Different Times / More than once a day)
Open [.github/workflows/scrape-and-notify.yml](file:///e:/Data/code%20master/Auto%20mailer/.github/workflows/scrape-and-notify.yml) and look for the `cron` parameter:

```yaml
on:
  schedule:
    # Syntax: 'minute hour day-of-month month day-of-week' (in UTC)
    - cron: '30 3 * * *'  # Runs daily at 9:00 AM IST (3:30 AM UTC)
```

To change the run frequency, update the cron string. Here are common configuration examples:

| Frequency | Cron Expression (UTC) | IST Translation | Description |
| :--- | :--- | :--- | :--- |
| **Twice a day** | `30 3,12 * * *` | 9:00 AM & 5:30 PM | Runs at 3:30 AM and 12:00 PM UTC |
| **Three times a day** | `0 3,9,15 * * *` | 8:30 AM, 2:30 PM, 8:30 PM | Runs at 3:00, 9:00, and 15:00 UTC |
| **Every 6 hours** | `0 */6 * * *` | Every 6 hours | Runs at 12 AM, 6 AM, 12 PM, 6 PM UTC |
| **Every 12 hours** | `0 */12 * * *` | Every 12 hours | Runs at 12 AM and 12 PM UTC |
| **Specific Hours** | `0 4,8,12,16 * * *`| 9:30 AM, 1:30 PM, 5:30 PM, 9:30 PM | Add comma-separated hours as needed |

*Note: GitHub Actions scheduler can occasionally experience latency delays of up to 10-15 minutes depending on system load.*

---

## 2. Step-by-Step Repository Setup

### Step 1: Initialize Git and Push to GitHub
1. Open your terminal in the `Auto mailer` directory:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Universal Scraper Framework"
   ```
2. Create a new repository on GitHub (e.g. `universal-scraper`).
3. Link and push your local repository:
   ```bash
   git remote add origin https://github.com/your-username/your-repo-name.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Configure Workflow Permissions (Crucial)
To allow the automated runner to commit `history.json` back to your repository:
1. Go to your GitHub repository webpage.
2. Navigate to **Settings** > **Actions** > **General**.
3. Scroll down to **Workflow permissions**.
4. Check **Read and write permissions**.
5. Click **Save**.

### Step 3: Configure Repository Secrets
Your credentials (API keys, SMTP passwords) should never be committed directly to Git. Instead, save them as GitHub Secrets:
1. Navigate to **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret**.
3. Create the following secrets matching your local `.env` setup:
   * `GEMINI_API_KEY`: Your Gemini API Key
   * `EMAIL_SENDER`: Your sender Gmail address
   * `EMAIL_PASSWORD`: Your sender Gmail App Password
   * `EMAIL_RECIPIENT`: `aasifkhan9605@gmail.com`
   * `SMTP_HOST`: `smtp.gmail.com`
   * `SMTP_PORT`: `587`

---

## 3. Running More Than Once a Day Manually
If you need to run the script manually outside the scheduled cron times:
1. Go to your GitHub Repository page.
2. Click on the **Actions** tab at the top.
3. In the left sidebar, click **Daily Scraper & Summarizer**.
4. Click the **Run workflow** dropdown on the right side.
5. Select the branch (`main`) and click the green **Run workflow** button.

The runner will start executing immediately, crawl the configured websites, check for updates, send emails, and commit the updated `history.json` history log back to your repository automatically.
