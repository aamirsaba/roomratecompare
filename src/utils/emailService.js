// src/utils/emailService.js
const nodemailer = require('nodemailer');

// Define senders
const SENDERS = {
    noreply: '"RoomRateCompare" <noreply@roomratecompare.com>',
    support: '"RoomRateCompare Support" <support@roomratecompare.com>',
    admin: '"RoomRateCompare Admin" <admin@roomratecompare.com>',
    alerts: '"RoomRateCompare Alerts" <alerts@roomratecompare.com>'
};

let transporter = null;

// ============ DYNAMIC URL HELPER ============
function getBaseUrl() {
    if (process.env.APP_URL) {
        return process.env.APP_URL;
    }
    if (process.env.NODE_ENV === 'production') {
        return 'https://www.roomratecompare.com';
    }
    return 'http://localhost:3000';
}

function makeAbsoluteUrl(path) {
    const baseUrl = getBaseUrl();
    if (path.startsWith('http')) return path;
    if (path.startsWith('/')) return `${baseUrl}${path}`;
    return `${baseUrl}/${path}`;
}

function initEmailTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 465,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        console.log('✅ Email transporter initialized');
    } else {
        console.log('⚠️ Email not configured. Emails will be logged to console.');
        transporter = null;
    }
    return transporter;
}

function safe(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function sendEmail(to, subject, htmlContent, fromType = 'noreply', textContent = null) {
    const text = textContent || htmlContent.replace(/<[^>]*>/g, '');
    
    if (!transporter) {
        initEmailTransporter();
    }
    
    if (!transporter) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📧 TO: ${to}`);
        console.log(`📧 FROM: ${SENDERS[fromType] || SENDERS.noreply}`);
        console.log(`📧 SUBJECT: ${subject}`);
        console.log(`📧 CONTENT: ${text.substring(0, 500)}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return { success: true, logged: true };
    }
    
    try {
        const info = await transporter.sendMail({
            from: SENDERS[fromType] || SENDERS.noreply,
            to: to,
            subject: subject,
            text: text,
            html: htmlContent
        });
        console.log(`✅ Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Email failed to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

// ============ EMAIL TEMPLATES ============

function getWelcomeEmail(agentName, loginUrl = '/agent-login') {
    const absoluteUrl = makeAbsoluteUrl(loginUrl);
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body{font-family:Arial,sans-serif;}
                .header{background:#e67e22;color:white;padding:20px;text-align:center;}
                .button{background:#e67e22;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;}
                .container{max-width:600px;margin:0 auto;}
                .content{padding:20px;}
                .footer{text-align:center;padding:20px;font-size:12px;color:#666;background:#f5f5f5;}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>Welcome to RoomRateCompare! 🎉</h1></div>
                <div class="content">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your registration has been approved! You are now an official travel agent.</p>
                    <p style="text-align:center;"><a href="${absoluteUrl}" class="button">Access Your Dashboard →</a></p>
                    <p style="font-size:12px; color:#999;">Or copy this link: ${absoluteUrl}</p>
                </div>
                <div class="footer"><p>© 2026 RoomRateCompare.com - Compare hotel rates worldwide</p></div>
            </div>
        </body>
        </html>
    `;
}

function getRenewalEmail(agentName, endDate, amount, paymentId) {
    const formattedDate = new Date(endDate).toLocaleDateString();
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#28a745;color:white;padding:20px;text-align:center;}.button{background:#28a745;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>Subscription Renewed ✅</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription has been renewed successfully!</p>
                    <p><strong>Amount:</strong> $${amount}</p>
                    <p><strong>Valid Until:</strong> ${formattedDate}</p>
                    <p style="text-align:center;"><a href="${dashboardUrl}" class="button">Go to Dashboard →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

function getCancellationEmail(agentName, endDate) {
    const renewalUrl = makeAbsoluteUrl('/agent-register');
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#f44336;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>Subscription Cancelled</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription has been cancelled.</p>
                    <p><a href="${renewalUrl}" style="background:#e67e22;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Renew Subscription →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

function getExpiryReminderEmail(agentName, daysLeft, endDate, renewalUrl = '/renew-subscription') {
    const formattedDate = new Date(endDate).toLocaleDateString();
    const absoluteRenewalUrl = makeAbsoluteUrl(renewalUrl);
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#e67e22;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>⚠️ Subscription Expiring Soon</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription will expire in <strong>${daysLeft} days</strong> on ${formattedDate}.</p>
                    <p><a href="${absoluteRenewalUrl}" style="background:#e67e22;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Renew Now →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

function getAdminNotificationEmail(subject, message, agentDetails = null) {
    const adminUrl = makeAbsoluteUrl('/admin/requests');
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#e67e22;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>Admin Notification</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>${subject}</h2>
                    <p>${message}</p>
                    ${agentDetails ? `<p><strong>Agent:</strong> ${agentDetails.name} (${agentDetails.email})</p>` : ''}
                    <p><a href="${adminUrl}" style="background:#e67e22;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View in Admin Panel →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

function getNewLeadEmail(agentName, leadDetails) {
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#e67e22;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>🔔 New Lead Request</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>You have received a new travel request from ${safe(leadDetails.clientName)}!</p>
                    <p><strong>Destination:</strong> ${safe(leadDetails.destination)}</p>
                    <p style="text-align:center;"><a href="${dashboardUrl}" class="button" style="background:#e67e22;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View Lead →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ============ LEAD REMINDER & ESCALATION EMAILS ============

async function sendAgentReminderEmail(lead, agent, reminderType) {
    const reminderTitles = {
        first: '⏰ First Reminder: New Client Lead Waiting',
        second: '⚠️ FINAL REMINDER: Client Lead Requires Action',
        escalation: '🚨 URGENT: Lead Escalation Warning'
    };
    
    const colors = {
        first: '#e67e22',
        second: '#ff9800',
        escalation: '#f44336'
    };
    
    const leadUrl = makeAbsoluteUrl(`/agent-dashboard?lead=${lead.id}`);
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:${colors[reminderType]};color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>${reminderTitles[reminderType]}</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Dear ${safe(agent.name || 'Agent')},</h2>
                    <p>You have a client lead that needs your attention:</p>
                    <p><strong>Client:</strong> ${safe(lead.client_name)}</p>
                    <p><strong>Destination:</strong> ${safe(lead.destination)}</p>
                    <p style="text-align:center;"><a href="${leadUrl}" style="background:${colors[reminderType]};color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View & Respond →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(agent.email, reminderTitles[reminderType], html, 'noreply');
}

async function sendEscalationEmail(lead, agent = null, reason = null) {
    const adminEmail = process.env.ADMIN_EMAIL || 'noreply@roomratecompare.com';
    const adminUrl = makeAbsoluteUrl('/admin/requests');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#f44336;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>🚨 LEAD ESCALATION ALERT</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Urgent: Client Lead Requires Attention</h2>
                    <p><strong>Client:</strong> ${safe(lead.client_name)}</p>
                    <p><strong>Destination:</strong> ${safe(lead.destination)}</p>
                    <p><strong>Reason:</strong> ${reason || 'No agent response within 24 hours'}</p>
                    <p style="text-align:center;"><a href="${adminUrl}" style="background:#f44336;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View in Admin Panel →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(adminEmail, `🚨 LEAD ESCALATED: ${lead.client_name}`, html, 'noreply');
}

async function sendWeeklyReportEmail(adminEmail, reportData) {
    const adminUrl = makeAbsoluteUrl('/admin/agents');
    const html = `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#e67e22;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>📊 Weekly Agent Performance Report</h1></div>
                <div class="content" style="padding:20px;">
                    <p>Total Leads: ${reportData.totalLeads || 0}</p>
                    <p>Conversion Rate: ${reportData.conversionRate || 0}%</p>
                    <p><a href="${adminUrl}" style="background:#e67e22;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View Full Report →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(adminEmail, '📊 Weekly Agent Performance Report', html, 'noreply');
}

async function sendAutoAssignmentEmail(lead, agent) {
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    const html = `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#4caf50;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>✨ New Lead Assigned to You</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Dear ${safe(agent.name)},</h2>
                    <p>A new lead has been assigned to you from ${safe(lead.client_name)}.</p>
                    <p><strong>Destination:</strong> ${safe(lead.destination)}</p>
                    <p style="text-align:center;"><a href="${dashboardUrl}" style="background:#4caf50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View Lead →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(agent.email, '✨ New Lead Assigned to You', html, 'noreply');
}

async function sendReassignmentEmail(lead, newAgent, oldAgentName = null) {
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    const html = `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#ff9800;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div class="container" style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>🔄 Lead Reassigned to You</h1></div>
                <div class="content" style="padding:20px;">
                    <h2>Dear ${safe(newAgent.name)},</h2>
                    <p>A lead has been reassigned to you from ${safe(lead.client_name)}.</p>
                    <p style="text-align:center;"><a href="${dashboardUrl}" style="background:#ff9800;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">View Lead →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(newAgent.email, '🔄 Lead Reassigned to You', html, 'noreply');
}

async function notifyAdmin(subject, message, agentDetails = null) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@roomratecompare.com';
    const emailHtml = getAdminNotificationEmail(subject, message, agentDetails);
    await sendEmail(adminEmail, subject, emailHtml, 'noreply');
}

// Initialize
initEmailTransporter();

module.exports = {
    initEmailTransporter,
    sendEmail,
    notifyAdmin,
    getWelcomeEmail,
    getRenewalEmail,
    getCancellationEmail,
    getExpiryReminderEmail,
    getAdminNotificationEmail,
    getNewLeadEmail,
    sendAgentReminderEmail,
    sendEscalationEmail,
    sendWeeklyReportEmail,
    sendAutoAssignmentEmail,
    sendReassignmentEmail,
    getBaseUrl,
    makeAbsoluteUrl
};