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
    // First check if APP_URL is set in env
    if (process.env.APP_URL) {
        return process.env.APP_URL;
    }
    
    // Fallback based on NODE_ENV
    if (process.env.NODE_ENV === 'production') {
        return 'https://www.roomratecompare.com';
    }
    
    // Default for local development
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

// Safe string function (replaces escapeHtml)
function safe(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Send email with sender type
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

// ============ EMAIL TEMPLATES WITH DYNAMIC URLS ============

// Welcome email - FIXED with absolute URL
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
                <div class="header">
                    <h1>Welcome to RoomRateCompare! 🎉</h1>
                </div>
                <div class="content">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your registration has been approved! You are now an official travel agent.</p>
                    <p style="text-align:center;">
                        <a href="${absoluteUrl}" class="button">Access Your Dashboard →</a>
                    </p>
                    <p style="font-size:12px; color:#999; margin-top:20px;">
                        Or copy this link: ${absoluteUrl}
                    </p>
                </div>
                <div class="footer">
                    <p>© 2026 RoomRateCompare.com - Compare hotel rates worldwide</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Renewal email
function getRenewalEmail(agentName, endDate, amount, paymentId) {
    const formattedDate = new Date(endDate).toLocaleDateString();
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body{font-family:Arial,sans-serif;}
                .header{background:#28a745;color:white;padding:20px;text-align:center;}
                .button{background:#28a745;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;}
                .container{max-width:600px;margin:0 auto;}
                .content{padding:20px;}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>Subscription Renewed ✅</h1></div>
                <div class="content">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription has been renewed successfully!</p>
                    <p><strong>Amount:</strong> $${amount}</p>
                    <p><strong>Valid Until:</strong> ${formattedDate}</p>
                    <p style="text-align:center; margin-top:20px;">
                        <a href="${dashboardUrl}" class="button">Go to Dashboard →</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Cancellation email
function getCancellationEmail(agentName, endDate) {
    const renewalUrl = makeAbsoluteUrl('/agent-register');
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body{font-family:Arial,sans-serif;}
                .header{background:#f44336;color:white;padding:20px;text-align:center;}
                .button{background:#f44336;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>Subscription Cancelled</h1></div>
                <div class="content">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription has been cancelled.</p>
                    <p>You can renew at any time to regain access.</p>
                    <p style="text-align:center; margin-top:20px;">
                        <a href="${renewalUrl}" class="button">Renew Subscription →</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Expiry reminder email
function getExpiryReminderEmail(agentName, daysLeft, endDate, renewalUrl = '/renew-subscription') {
    const formattedDate = new Date(endDate).toLocaleDateString();
    const absoluteRenewalUrl = makeAbsoluteUrl(renewalUrl);
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body{font-family:Arial,sans-serif;}
                .header{background:#e67e22;color:white;padding:20px;text-align:center;}
                .button{background:#e67e22;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>⚠️ Subscription Expiring Soon</h1></div>
                <div class="content">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription will expire in <strong>${daysLeft} days</strong> on ${formattedDate}.</p>
                    <p style="text-align:center; margin-top:20px;">
                        <a href="${absoluteRenewalUrl}" class="button">Renew Now →</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Admin notification email
function getAdminNotificationEmail(subject, message, agentDetails = null) {
    const adminUrl = makeAbsoluteUrl('/admin/requests');
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #e67e22; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { padding: 20px; background: #f9f9f9; }
                .alert-box { background: #fff3e0; border-left: 4px solid #e67e22; padding: 15px; margin: 15px 0; }
                .button { background: #e67e22; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Admin Notification</h1>
                </div>
                <div class="content">
                    <h2>${subject}</h2>
                    <div class="alert-box">
                        <p>${message}</p>
                        ${agentDetails ? `
                        <hr>
                        <p><strong>Agent Details:</strong><br>
                        Name: ${agentDetails.name || 'N/A'}<br>
                        Email: ${agentDetails.email || 'N/A'}<br>
                        ID: ${agentDetails.id || 'N/A'}</p>
                        ` : ''}
                    </div>
                    <p style="text-align:center; margin-top:20px;">
                        <a href="${adminUrl}" class="button">View in Admin Panel →</a>
                    </p>
                </div>
                <div class="footer">
                    <p>RoomRateCompare Admin System</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// New lead notification email for agent
function getNewLeadEmail(agentName, leadDetails) {
    const formatDate = (date) => {
        if (!date) return 'Not specified';
        try {
            return new Date(date).toLocaleDateString();
        } catch(e) {
            return date;
        }
    };
    
    const getBudget = (budget) => {
        const budgets = {
            'budget': 'Budget ($)',
            'moderate': 'Moderate ($$)',
            'luxury': 'Luxury ($$$)'
        };
        return budgets[budget] || budget || 'Not specified';
    };
    
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #e67e22; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { padding: 20px; background: #f9f9f9; }
                .lead-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #e67e22; }
                .button { display: inline-block; background: #e67e22; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔔 New Lead Request</h1>
                </div>
                <div class="content">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>You have received a new travel request!</p>
                    
                    <div class="lead-box">
                        <h3 style="color: #e67e22;">📋 Client Details</h3>
                        <p><strong>Name:</strong> ${safe(leadDetails.clientName)}</p>
                        <p><strong>Email:</strong> <a href="mailto:${safe(leadDetails.clientEmail)}">${safe(leadDetails.clientEmail)}</a></p>
                        ${leadDetails.clientPhone ? `<p><strong>Phone:</strong> <a href="tel:${safe(leadDetails.clientPhone)}">${safe(leadDetails.clientPhone)}</a></p>` : ''}
                        
                        <h3 style="color: #e67e22; margin-top: 15px;">✈️ Travel Details</h3>
                        <p><strong>Destination:</strong> ${safe(leadDetails.destination)}</p>
                        ${leadDetails.checkin ? `<p><strong>Check-in:</strong> ${formatDate(leadDetails.checkin)}</p>` : ''}
                        ${leadDetails.checkout ? `<p><strong>Check-out:</strong> ${formatDate(leadDetails.checkout)}</p>` : ''}
                        <p><strong>Budget:</strong> ${getBudget(leadDetails.budget)}</p>
                        
                        ${leadDetails.message ? `<p><strong>Message:</strong></p><p style="background: #f0f0f0; padding: 10px; border-radius: 5px;">"${safe(leadDetails.message)}"</p>` : ''}
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${dashboardUrl}" class="button">Go to Dashboard →</a>
                    </p>
                    <p style="font-size: 12px; color: #999;">Login to view and manage this lead.</p>
                </div>
                <div class="footer">
                    <p>RoomRateCompare - Compare & Book Hotels Worldwide</p>
                    <p>Need help? Contact support@roomratecompare.com</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ============ LEAD REMINDER & ESCALATION EMAILS ============

// Agent reminder email for lead response - FULLY IMPLEMENTED
async function sendAgentReminderEmail(lead, agent, reminderType) {
    const reminderTitles = {
        first: '⏰ First Reminder: New Client Lead Waiting',
        second: '⚠️ FINAL REMINDER: Client Lead Requires Action',
        escalation: '🚨 URGENT: Lead Escalation Warning'
    };
    
    const reminderMessages = {
        first: 'This is your first reminder. Please respond within 5 hours to avoid escalation.',
        second: 'This is your FINAL reminder. The lead will be escalated to admin in 18 hours.',
        escalation: 'This lead has been escalated to admin due to no response.'
    };
    
    const colors = {
        first: '#e67e22',
        second: '#ff9800',
        escalation: '#f44336'
    };
    
    const formatDate = (date) => {
        if (!date) return 'Not specified';
        try {
            return new Date(date).toLocaleDateString();
        } catch(e) {
            return date;
        }
    };
    
    const leadUrl = makeAbsoluteUrl(`/agent-dashboard?lead=${lead.id}`);
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: ${colors[reminderType]}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { padding: 20px; background: #f9f9f9; }
                .lead-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid ${colors[reminderType]}; }
                .warning-box { background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .button { display: inline-block; background: ${colors[reminderType]}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
                .timeline { display: flex; justify-content: space-between; margin: 20px 0; }
                .timeline-step { text-align: center; flex: 1; }
                .timeline-dot { width: 12px; height: 12px; background: #ddd; border-radius: 50%; margin: 5px auto; }
                .timeline-step.active .timeline-dot { background: ${colors[reminderType]}; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>${reminderTitles[reminderType]}</h1>
                </div>
                <div class="content">
                    <h2>Dear ${safe(agent.name || 'Agent')},</h2>
                    
                    <div class="warning-box">
                        <p><strong>⚠️ ${reminderMessages[reminderType]}</strong></p>
                    </div>
                    
                    <div class="timeline">
                        <div class="timeline-step ${reminderType === 'first' ? 'active' : ''}">
                            <div class="timeline-dot"></div>
                            <small>1h Reminder</small>
                        </div>
                        <div class="timeline-step ${reminderType === 'second' ? 'active' : ''}">
                            <div class="timeline-dot"></div>
                            <small>6h Final</small>
                        </div>
                        <div class="timeline-step">
                            <div class="timeline-dot"></div>
                            <small>24h Escalate</small>
                        </div>
                        <div class="timeline-step">
                            <div class="timeline-dot"></div>
                            <small>48h Reassign</small>
                        </div>
                    </div>
                    
                    <div class="lead-box">
                        <h3 style="color: ${colors[reminderType]}; margin-top: 0;">📋 Client Request Details</h3>
                        <p><strong>Client:</strong> ${safe(lead.client_name)}</p>
                        <p><strong>Email:</strong> <a href="mailto:${safe(lead.client_email)}">${safe(lead.client_email)}</a></p>
                        ${lead.client_phone ? `<p><strong>Phone:</strong> <a href="tel:${safe(lead.client_phone)}">${safe(lead.client_phone)}</a></p>` : ''}
                        <p><strong>Destination:</strong> ${safe(lead.destination)}</p>
                        ${lead.checkin ? `<p><strong>Check-in:</strong> ${formatDate(lead.checkin)}</p>` : ''}
                        ${lead.checkout ? `<p><strong>Check-out:</strong> ${formatDate(lead.checkout)}</p>` : ''}
                        ${lead.budget ? `<p><strong>Budget:</strong> ${safe(lead.budget)}</p>` : ''}
                        ${lead.message ? `<p><strong>Message:</strong></p><p style="background: #f0f0f0; padding: 10px; border-radius: 5px;">"${safe(lead.message)}"</p>` : ''}
                        <p><strong>Created:</strong> ${new Date(lead.created_at).toLocaleString()}</p>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${leadUrl}" class="button">View & Respond Now →</a>
                    </p>
                    
                    <hr style="margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">
                        ⏰ <strong>Response Timeline:</strong><br>
                        • 1 hour: First reminder<br>
                        • 6 hours: Final warning<br>
                        • 24 hours: Escalated to admin<br>
                        • 48 hours: Lead reassigned
                    </p>
                </div>
                <div class="footer">
                    <p>RoomRateCompare - Lead Management System</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(agent.email, reminderTitles[reminderType], html, 'noreply');
}

// Escalation email to admin - FULLY IMPLEMENTED
async function sendEscalationEmail(lead, agent = null, reason = null) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@roomratecompare.com';
    const escalationReason = reason || `Agent ${agent?.name || 'Unassigned'} did not respond within 24 hours`;
    const ageHours = Math.floor((new Date() - new Date(lead.created_at)) / (1000 * 60 * 60));
    const adminUrl = makeAbsoluteUrl('/admin/requests');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { padding: 20px; background: #f9f9f9; }
                .lead-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f44336; }
                .agent-box { background: #ffebee; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .button { display: inline-block; background: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚨 LEAD ESCALATION ALERT</h1>
                </div>
                <div class="content">
                    <h2>Urgent: Client Lead Requires Immediate Attention</h2>
                    
                    <div class="lead-box">
                        <h3 style="color: #f44336; margin-top: 0;">📋 Escalated Lead Details</h3>
                        <p><strong>Lead ID:</strong> ${lead.id}</p>
                        <p><strong>Client:</strong> ${safe(lead.client_name)}</p>
                        <p><strong>Email:</strong> <a href="mailto:${safe(lead.client_email)}">${safe(lead.client_email)}</a></p>
                        ${lead.client_phone ? `<p><strong>Phone:</strong> <a href="tel:${safe(lead.client_phone)}">${safe(lead.client_phone)}</a></p>` : ''}
                        <p><strong>Destination:</strong> ${safe(lead.destination)}</p>
                        ${lead.checkin ? `<p><strong>Check-in:</strong> ${new Date(lead.checkin).toLocaleDateString()}</p>` : ''}
                        ${lead.checkout ? `<p><strong>Check-out:</strong> ${new Date(lead.checkout).toLocaleDateString()}</p>` : ''}
                        ${lead.budget ? `<p><strong>Budget:</strong> ${safe(lead.budget)}</p>` : ''}
                        ${lead.message ? `<p><strong>Message:</strong></p><p style="background: #f0f0f0; padding: 10px; border-radius: 5px;">"${safe(lead.message)}"</p>` : ''}
                        <p><strong>Created:</strong> ${new Date(lead.created_at).toLocaleString()} (${ageHours} hours ago)</p>
                    </div>
                    
                    ${agent ? `
                    <div class="agent-box">
                        <h3 style="color: #f44336; margin-top: 0;">⚠️ Assigned Agent Information</h3>
                        <p><strong>Agent:</strong> ${safe(agent.name)}</p>
                        <p><strong>Email:</strong> ${safe(agent.email)}</p>
                        <p><strong>Status:</strong> ${agent.status || 'Unknown'}</p>
                        <p><strong>Escalation Reason:</strong> ${escalationReason}</p>
                    </div>
                    ` : '<div class="agent-box"><p><strong>No agent assigned</strong> - Lead was never claimed</p></div>'}
                    
                    <p style="text-align: center;">
                        <a href="${adminUrl}" class="button">View in Admin Panel →</a>
                    </p>
                    
                    <hr style="margin: 20px 0;">
                    <p><strong>Recommended Actions:</strong></p>
                    <ul>
                        <li>Contact the client directly immediately</li>
                        <li>Reassign lead to another agent</li>
                        <li>Review agent's performance metrics</li>
                    </ul>
                </div>
                <div class="footer">
                    <p>RoomRateCompare Admin System - Automated Escalation</p>
                    <p>Time: ${new Date().toLocaleString()}</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(adminEmail, `🚨 LEAD ESCALATED: ${lead.client_name} - ${lead.destination}`, html, 'alerts');
}

// Weekly performance report email - FULLY IMPLEMENTED
async function sendWeeklyReportEmail(adminEmail, reportData) {
    const { topAgents = [], bottomAgents = [], totalLeads = 0, conversionRate = 0, avgResponseTime = 0 } = reportData;
    const adminUrl = makeAbsoluteUrl('/admin/agents');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 700px; margin: 0 auto; padding: 20px; }
                .header { background: #e67e22; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { padding: 20px; background: #f9f9f9; }
                .stats-grid { display: flex; gap: 15px; margin: 20px 0; }
                .stat-card { background: white; padding: 15px; border-radius: 8px; text-align: center; flex: 1; }
                .stat-number { font-size: 28px; font-weight: bold; color: #e67e22; }
                .agent-list { margin: 20px 0; }
                .agent-item { background: white; padding: 10px 15px; margin: 5px 0; border-radius: 5px; display: flex; justify-content: space-between; flex-wrap: wrap; }
                .top-agent { border-left: 4px solid #4caf50; }
                .bottom-agent { border-left: 4px solid #f44336; }
                .score-high { color: #4caf50; font-weight: bold; }
                .score-low { color: #f44336; font-weight: bold; }
                .button { display: inline-block; background: #e67e22; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📊 Weekly Agent Performance Report</h1>
                    <p>Week Ending ${new Date().toLocaleDateString()}</p>
                </div>
                <div class="content">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-number">${totalLeads}</div>
                            <div>Total Leads</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${conversionRate}%</div>
                            <div>Conversion Rate</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${avgResponseTime}</div>
                            <div>Avg Response (min)</div>
                        </div>
                    </div>
                    
                    <h3>🏆 Top Performing Agents</h3>
                    <div class="agent-list">
                        ${topAgents.map(agent => `
                            <div class="agent-item top-agent">
                                <span><strong>${safe(agent.name)}</strong></span>
                                <span>Score: <span class="score-high">${agent.performance_score || 0}</span></span>
                                <span>Conversion: ${agent.conversion_rate || 0}%</span>
                                <span>Response: ${agent.avg_response_time || 0} min</span>
                            </div>
                        `).join('')}
                        ${topAgents.length === 0 ? '<p>No data available</p>' : ''}
                    </div>
                    
                    <h3>⚠️ Needs Improvement</h3>
                    <div class="agent-list">
                        ${bottomAgents.map(agent => `
                            <div class="agent-item bottom-agent">
                                <span><strong>${safe(agent.name)}</strong></span>
                                <span>Score: <span class="score-low">${agent.performance_score || 0}</span></span>
                                <span>Conversion: ${agent.conversion_rate || 0}%</span>
                                <span>Response: ${agent.avg_response_time || 0} min</span>
                            </div>
                        `).join('')}
                        ${bottomAgents.length === 0 ? '<p>No data available</p>' : ''}
                    </div>
                    
                    <hr>
                    <p style="text-align: center;">
                        <a href="${adminUrl}" class="button">View Full Analytics →</a>
                    </p>
                </div>
                <div class="footer">
                    <p>RoomRateCompare - Automated Weekly Report</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(adminEmail, '📊 Weekly Agent Performance Report', html, 'admin');
}

// Auto-assignment notification to agent
async function sendAutoAssignmentEmail(lead, agent) {
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4caf50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { padding: 20px; background: #f9f9f9; }
                .lead-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #4caf50; }
                .button { display: inline-block; background: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✨ New Lead Assigned to You!</h1>
                </div>
                <div class="content">
                    <h2>Dear ${safe(agent.name)},</h2>
                    <p>A new client lead has been automatically assigned to you.</p>
                    
                    <div class="lead-box">
                        <h3 style="color: #4caf50; margin-top: 0;">📋 Client Request</h3>
                        <p><strong>Client:</strong> ${safe(lead.client_name)}</p>
                        <p><strong>Destination:</strong> ${safe(lead.destination)}</p>
                        ${lead.checkin ? `<p><strong>Check-in:</strong> ${new Date(lead.checkin).toLocaleDateString()}</p>` : ''}
                        ${lead.budget ? `<p><strong>Budget:</strong> ${safe(lead.budget)}</p>` : ''}
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${dashboardUrl}" class="button">View & Respond →</a>
                    </p>
                    
                    <p style="color: #999; font-size: 12px;">
                        ⏰ Please respond within 1 hour to maintain your performance score.
                    </p>
                </div>
                <div class="footer">
                    <p>RoomRateCompare - Lead Management System</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(agent.email, '✨ New Lead Assigned to You', html, 'noreply');
}

// Reassignment notification
async function sendReassignmentEmail(lead, newAgent, oldAgentName = null) {
    const dashboardUrl = makeAbsoluteUrl('/agent-dashboard');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { padding: 20px; background: #f9f9f9; }
                .lead-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ff9800; }
                .button { display: inline-block; background: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔄 Lead Reassigned to You</h1>
                </div>
                <div class="content">
                    <h2>Dear ${safe(newAgent.name)},</h2>
                    ${oldAgentName ? `<p>A lead has been reassigned from ${safe(oldAgentName)} to you due to no response.</p>` : '<p>A lead has been reassigned to you.</p>'}
                    
                    <div class="lead-box">
                        <h3 style="color: #ff9800; margin-top: 0;">📋 Lead Details</h3>
                        <p><strong>Client:</strong> ${safe(lead.client_name)}</p>
                        <p><strong>Email:</strong> ${safe(lead.client_email)}</p>
                        <p><strong>Destination:</strong> ${safe(lead.destination)}</p>
                        ${lead.checkin ? `<p><strong>Dates:</strong> ${new Date(lead.checkin).toLocaleDateString()} - ${lead.checkout ? new Date(lead.checkout).toLocaleDateString() : '?'}</p>` : ''}
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${dashboardUrl}" class="button">Respond to Client →</a>
                    </p>
                    
                    <p style="color: #999; font-size: 12px;">
                        Please respond promptly. This lead has already been waiting.
                    </p>
                </div>
                <div class="footer">
                    <p>RoomRateCompare - Lead Management System</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(newAgent.email, '🔄 Lead Reassigned to You', html, 'noreply');
}

// Notify admin function
async function notifyAdmin(subject, message, agentDetails = null) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@roomratecompare.com';
    const emailHtml = getAdminNotificationEmail(subject, message, agentDetails);
    await sendEmail(adminEmail, subject, emailHtml, 'admin');
}

// Initialize email transporter
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