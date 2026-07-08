import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  EMAIL_SENDER: process.env.EMAIL_SENDER || '',
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || '', // Gmail App Password
  EMAIL_RECIPIENT: process.env.EMAIL_RECIPIENT || 'shabanamulla@cnkindia.com',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  
  DEFAULT_PROMPT_TEMPLATE: `You are assisting in sending a formal newsletter/email notification for a new document/advisory.

Here is the model template format of the email you should draft:
\`\`\`
{template}
\`\`\`

Use the following metadata and content from the advisory to write a professional email in the exact structure/tone of the template above. 
Generate only the body content of the email, keeping the structure (Dear Sir/Madam, Preliminary analysis, Key changes, Recommended actions, Regards...) EXACTLY as shown in the template above, but make the summary details accurate to the advisory content below.

Title: {title}
Date: {date}
Category: {category}
Brief Text/HTML: {html_content}

PDF Full Text:
{pdf_text}

Draft the email body matching the template format. Do not add markdown backticks wrapper around the email itself (unless formatting lists/bold), just provide the clean text.`,

  DEFAULT_EMAIL_TEMPLATE: `Dear Sir/Madam,

We have analyzed the latest updates and prepared a brief summary for your reference.

Our preliminary analysis:

Nature of change: {category}
Who is primarily impacted: Relevant business divisions and taxpayers.

Key changes:
* Detailed changes extracted from the document.

Recommended actions:
* Recommended organization-level actions.

Please find attached the relevant documents. We are available to discuss the impact on your specific business processes.

Regards,

Taxation Team`
};
