import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import nodemailer from 'nodemailer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMAIL_LOGS_FILE = path.join(__dirname, 'email_logs.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const TEMP_DIR = path.join(__dirname, 'temp');

// Load email logs
export function loadEmailLogs() {
  if (fs.existsSync(EMAIL_LOGS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(EMAIL_LOGS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    } catch (e) {
      console.error('Error reading email logs file:', e);
    }
  }
  return [];
}

// Log a sent email
export function logSentEmail(recipient, subject, content, attachments) {
  const logs = loadEmailLogs();
  const newLog = {
    timestamp: new Date().toISOString(),
    recipient: recipient,
    subject: subject,
    content: content,
    attachmentCount: attachments ? attachments.length : 0,
    attachmentTitles: attachments ? attachments.map(a => a.filename) : []
  };
  logs.push(newLog);
  try {
    fs.writeFileSync(EMAIL_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write email logs:', e);
  }
}

// Load history
export function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
      if (Array.isArray(data.processedIds)) {
        const migrated = { processed_advisories: {} };
        data.processedIds.forEach(id => {
          migrated.processed_advisories[id] = {
            id,
            title: 'Migrated Advisory',
            date: 'Unknown',
            category: 'GST',
            sent: true,
            sentAt: new Date().toISOString(),
            source: 'gst'
          };
        });
        return migrated;
      }
      if (!data.processed_advisories) {
        data.processed_advisories = {};
      }
      return data;
    } catch (e) {
      console.error('Error reading history file, resetting history:', e);
    }
  }
  return { processed_advisories: {} };
}

// Save history
export function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

// Clean HTML tags for docx text formatting
function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Generate DOCX file from brief text
async function generateDocx(title, date, category, htmlContent, destPath) {
  const plainText = cleanHtml(htmlContent);
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 32, // 16pt
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Date: ${date} | Category: ${category}`,
              italics: true,
              size: 20, // 10pt
            }),
          ],
        }),
        new Paragraph({ text: '' }), // Spacer
        ...plainText.split('\n').map(line => new Paragraph({
          children: [
            new TextRun({
              text: line.trim(),
              size: 24, // 12pt
            }),
          ],
        })),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(destPath, buffer);
}

// Extract text from PDF
async function extractPdfText(pdfPath) {
  if (!fs.existsSync(pdfPath)) return '';
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text || '';
  } catch (e) {
    console.error(`Failed to extract text from ${pdfPath}:`, e.message);
    return '';
  }
}

// Generate AI summary using Gemini
async function generateSummary(item, pdfTextCombined) {
  if (!CONFIG.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY is not configured. Using default template fields without AI summary.');
    return CONFIG.DEFAULT_EMAIL_TEMPLATE
      .replace('{category}', item.category || 'N/A')
      .replace('{title}', item.title || 'N/A');
  }

  try {
    const ai = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const prompt = CONFIG.DEFAULT_PROMPT_TEMPLATE
      .replace('{template}', CONFIG.DEFAULT_EMAIL_TEMPLATE)
      .replace('{title}', item.title || '')
      .replace('{date}', item.date || '')
      .replace('{category}', item.category || '')
      .replace('{html_content}', cleanHtml(item.htmlContent || ''))
      .replace('{pdf_text}', pdfTextCombined || 'No PDF content extracted.');

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Failed to generate summary with Gemini:', error);
    throw error;
  }
}

// Send email with attachments
async function sendEmail(item, summaryText, attachments, scraperFile) {
  let recipient = CONFIG.EMAIL_RECIPIENT;

  // Try loading specific recipient for this script from config.json
  const configJsonPath = path.join(__dirname, 'config.json');
  if (scraperFile && fs.existsSync(configJsonPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8'));
      if (cfg.EMAIL_RECIPIENTS && cfg.EMAIL_RECIPIENTS[scraperFile]) {
        recipient = cfg.EMAIL_RECIPIENTS[scraperFile];
      }
    } catch (e) {
      // Ignore
    }
  }

  const isDryRun = process.argv.includes('--dry-run');
  if (!CONFIG.EMAIL_SENDER || !CONFIG.EMAIL_PASSWORD || isDryRun) {
    console.log(`--- ${isDryRun ? 'DRY RUN' : 'NO CREDENTIALS'}: EMAIL CONTENT ---`);
    console.log(`To: ${recipient}`);
    console.log(`Subject: GST Alert: ${item.title}`);
    console.log(`Body:\n${summaryText}`);
    console.log(`Attachments: ${attachments.map(a => a.filename).join(', ')}`);
    console.log('------------------------------');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: CONFIG.SMTP_HOST,
    port: CONFIG.SMTP_PORT,
    secure: CONFIG.SMTP_PORT === 465,
    auth: {
      user: CONFIG.EMAIL_SENDER,
      pass: CONFIG.EMAIL_PASSWORD,
    },
  });

  const formattedSummary = summaryText
    .replace(/^[ \t]*\*[ \t]*/gm, '• ') // Replace leading asterisks with bullets
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // bold markdown to HTML
    .replace(/\*/g, '') // Remove any remaining asterisks
    .replace(/\n/g, '<br>');

  const mailOptions = {
    from: CONFIG.EMAIL_SENDER,
    to: recipient,
    subject: `GST Alert: ${item.title}`,
    html: `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${formattedSummary}
        </body>
      </html>
    `,
    attachments: attachments.map(att => ({
      filename: att.filename,
      path: att.path
    }))
  };

  await transporter.sendMail(mailOptions);
  console.log(`🚀 Email successfully sent for: "${item.title}"`);
  logSentEmail(recipient, `GST Alert: ${item.title}`, summaryText, attachments);
}

// GitHub Sync Helpers
async function downloadFromGithub(filename) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !repo) {
    console.log(`[GitHub Sync] Credentials not set. Skipping download for ${filename}.`);
    return false;
  }

  console.log(`[GitHub Sync] Downloading ${filename} from GitHub...`);
  try {
    const res = await axios.get(`https://api.github.com/repos/${repo}/contents/${filename}?ref=${branch}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.status === 200 && res.data.content) {
      const decoded = Buffer.from(res.data.content, 'base64').toString('utf-8');
      const filePath = path.join(__dirname, filename);
      fs.writeFileSync(filePath, decoded, 'utf-8');
      console.log(`[GitHub Sync] Successfully updated local ${filename} from GitHub.`);
      return true;
    }
  } catch (err) {
    if (err.response && err.response.status === 404) {
      console.log(`[GitHub Sync] File ${filename} not found on GitHub. Using local or creating new.`);
    } else {
      console.error(`[GitHub Sync] Failed to download ${filename}:`, err.message);
    }
  }
  return false;
}

async function uploadToGithub(filename) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !repo) {
    return false;
  }

  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  console.log(`[GitHub Sync] Uploading/committing ${filename} to GitHub...`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const base64Content = Buffer.from(content, 'utf-8').toString('base64');

    let sha = null;
    try {
      const getRes = await axios.get(`https://api.github.com/repos/${repo}/contents/${filename}?ref=${branch}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.status === 200) {
        sha = getRes.data.sha;
      }
    } catch (e) {
      // If 404, we leave sha as null
    }

    const body = {
      message: `chore: sync ${filename} from local run`,
      content: base64Content,
      branch: branch
    };
    if (sha) {
      body.sha = sha;
    }

    await axios.put(`https://api.github.com/repos/${repo}/contents/${filename}`, body, {
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    console.log(`[GitHub Sync] Successfully committed ${filename} to GitHub.`);
    return true;
  } catch (err) {
    console.error(`[GitHub Sync] Failed to upload ${filename}:`, err.message);
  }
  return false;
}

// Main execution loop
async function run() {
  console.log('Starting Scraper Orchestrator...');
  
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
  const isDryRun = process.argv.includes('--dry-run');

  // Sync config/history from GitHub if running locally
  if (!isGithubActions) {
    await downloadFromGithub('history.json');
    await downloadFromGithub('email_logs.json');
  }

  const history = loadHistory();
  const runOnlyScript = process.env.RUN_ONLY_SCRIPT || process.argv.find(arg => arg.startsWith('--script='))?.split('=')[1];
  if (runOnlyScript) {
    console.log(`Running in SINGLE script mode: ONLY running ${runOnlyScript}`);
  }

  // Load config.json to check scraper schedules & weekly alarms
  const configJsonPath = path.join(__dirname, 'config.json');
  let alarms = [];
  let scraperAlarms = {};
  if (fs.existsSync(configJsonPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8'));
      alarms = cfg.ALARMS || [];
      scraperAlarms = cfg.SCRAPER_ALARMS || {};
    } catch (e) {
      console.warn('Failed to parse config.json:', e.message);
    }
  }

  // Get current hour and day in IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
  const currentHour = String(istTime.getHours()).padStart(2, '0');
  const currentDay = istTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  console.log(`Current Time (IST): ${currentHour}:${String(istTime.getMinutes()).padStart(2, '0')} on ${dayNames[currentDay]}`);

  // Identify active alarms for the current hour and day of the week
  const activeAlarmIds = alarms
    .filter(alarm => {
      const [alarmHour] = (alarm.time || '').split(':');
      const isCorrectHour = alarmHour === currentHour;
      const isCorrectDay = Array.isArray(alarm.days) && alarm.days.includes(currentDay);
      return isCorrectHour && isCorrectDay;
    })
    .map(alarm => alarm.id);

  const isScheduled = process.env.GITHUB_EVENT_NAME === 'schedule';

  // Ensure directories exist
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Load scraper files from 'scrapers' directory
  const scrapersDir = path.join(__dirname, 'scrapers');
  if (!fs.existsSync(scrapersDir)) {
    fs.mkdirSync(scrapersDir, { recursive: true });
  }

  const scraperFiles = fs.readdirSync(scrapersDir).filter(f => f.endsWith('.js'));
  console.log(`Found ${scraperFiles.length} scraper plugin(s) to run.`);

  for (const file of scraperFiles) {
    if (runOnlyScript && file !== runOnlyScript) {
      console.log(`⏩ Skipping scraper ${file}: Running in SINGLE script mode for ${runOnlyScript}.`);
      continue;
    }

    // Check schedule if run by GitHub Actions cron
    if (isScheduled) {
      const assignedAlarmId = scraperAlarms[file];
      if (!assignedAlarmId || assignedAlarmId === 'disabled') {
        console.log(`⏩ Skipping scraper ${file}: Auto-execution is disabled.`);
        continue;
      }
      
      const isActive = activeAlarmIds.includes(assignedAlarmId);
      if (!isActive) {
        const assignedAlarm = alarms.find(a => a.id === assignedAlarmId);
        const scheduleDesc = assignedAlarm 
          ? `scheduled for ${assignedAlarm.time} IST on [${assignedAlarm.days.map(d => dayNames[d].substring(0, 3)).join(', ')}]`
          : 'not found in alarms';
        console.log(`⏩ Skipping scraper ${file}: Assigned to alarm (${scheduleDesc}), but it is not active at the current hour.`);
        continue;
      }
    }

    const scraperPath = path.join(scrapersDir, file);
    console.log(`Running scraper: ${file}...`);
    try {
      const { scrape } = await import(`file://${scraperPath}`);
      if (typeof scrape !== 'function') {
        console.warn(`Skipping ${file}: No 'scrape' function exported.`);
        continue;
      }

      const scrapedItems = await scrape();
      console.log(`Scraper ${file} returned ${scrapedItems.length} item(s).`);

      for (const item of scrapedItems) {
        if (!item.id) {
          console.warn('Skipping item: Missing unique ID.', item);
          continue;
        }

        const existingRecord = history.processed_advisories[item.id];
        if (existingRecord && existingRecord.sent) {
          console.log(`⏩ Skipping already processed and sent item: [${item.id}] ${item.title}`);
          continue;
        }

        if (!existingRecord) {
          history.processed_advisories[item.id] = {
            id: item.id,
            title: item.title,
            date: item.date || new Date().toLocaleDateString(),
            category: item.category || 'GST',
            sent: false,
            sentAt: null,
            source: file.replace('.js', '')
          };
          saveHistory(history);
        }

        console.log(`\nProcessing new item: "${item.title}"`);
        const itemTempDir = path.join(TEMP_DIR, item.id);
        fs.mkdirSync(itemTempDir, { recursive: true });

        const attachments = [];
        let pdfTextCombined = '';

        // 1. Download PDFs
        if (item.pdfUrls && Array.isArray(item.pdfUrls)) {
          for (let i = 0; i < item.pdfUrls.length; i++) {
            const url = item.pdfUrls[i];
            const fileName = url.split('/').pop() || `doc_${i}.pdf`;
            const destPath = path.join(itemTempDir, fileName);

            console.log(`  Downloading PDF: ${fileName}...`);
            try {
              const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream'
              });
              const writer = fs.createWriteStream(destPath);
              response.data.pipe(writer);
              
              await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
              });

              attachments.push({ filename: fileName, path: destPath });
              
              // Extract text for Gemini
              const txt = await extractPdfText(destPath);
              pdfTextCombined += txt + '\n';
            } catch (dlError) {
              console.error(`  Failed to download/parse PDF from ${url}:`, dlError.message);
            }
          }
        }

        // 2. Generate DOCX from brief htmlContent
        if (item.htmlContent) {
          const docxName = 'advisory_content.docx';
          const docxPath = path.join(itemTempDir, docxName);
          console.log('  Generating Word Document (DOCX)...');
          try {
            await generateDocx(item.title, item.date, item.category, item.htmlContent, docxPath);
            attachments.push({ filename: docxName, path: docxPath });
          } catch (docxErr) {
            console.error('  Failed to generate DOCX:', docxErr.message);
          }
        }

        // 3. Generate summary using Gemini
        console.log('  Generating email summary with Gemini...');
        let summary = '';
        try {
          summary = await generateSummary(item, pdfTextCombined);
        } catch (gemError) {
          console.error('  Gemini generation failed. Using default template fallback.');
          summary = CONFIG.DEFAULT_EMAIL_TEMPLATE
            .replace('{category}', item.category || 'N/A')
            .replace('{title}', item.title || 'N/A');
        }

        // 4. Send Email
        console.log('  Dispatching email notification...');
        try {
          await sendEmail(item, summary, attachments, file);
          
          if (!isDryRun) {
            history.processed_advisories[item.id].sent = true;
            history.processed_advisories[item.id].sentAt = new Date().toISOString();
            saveHistory(history);
          }
        } catch (mailError) {
          console.error('  Email dispatch failed:', mailError.message);
          if (!isDryRun) {
            history.processed_advisories[item.id].sent = false;
            history.processed_advisories[item.id].sentAt = null;
            saveHistory(history);
          }
        }

        // Clean up this item's temp files
        try {
          fs.rmSync(itemTempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.error(`  Failed to clean temp dir ${itemTempDir}:`, cleanupErr.message);
        }
      }
    } catch (err) {
      console.error(`Error executing scraper ${file}:`, err);
    }
  }

  // Final cleanup of temp directory
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (err) {
    // Ignore if already deleted
  }

  // Sync history/logs back to GitHub if running locally
  if (!isGithubActions && !isDryRun) {
    await uploadToGithub('history.json');
    await uploadToGithub('email_logs.json');
  }

  console.log('All scraper execution finished.');
}

run().catch(console.error);
