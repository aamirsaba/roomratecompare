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

// ============ EMAIL TEMPLATES ============

// Welcome email
function getWelcomeEmail(agentName, loginUrl) {
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#e67e22;color:white;padding:20px;text-align:center;}.button{background:#e67e22;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;}</style></head>
        <body>
            <div style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>Welcome to RoomRateCompare! 🎉</h1></div>
                <div style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your registration has been approved! You are now an official travel agent.</p>
                    <p><a href="${loginUrl}" class="button">Access Your Dashboard →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Renewal email
function getRenewalEmail(agentName, endDate, amount, paymentId) {
    const formattedDate = new Date(endDate).toLocaleDateString();
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#28a745;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>Subscription Renewed ✅</h1></div>
                <div style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription has been renewed successfully!</p>
                    <p><strong>Amount:</strong> $${amount}</p>
                    <p><strong>Valid Until:</strong> ${formattedDate}</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Cancellation email
function getCancellationEmail(agentName, endDate) {
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#f44336;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>Subscription Cancelled</h1></div>
                <div style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription has been cancelled.</p>
                    <p>You can renew at any time to regain access.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Expiry reminder email
function getExpiryReminderEmail(agentName, daysLeft, endDate, renewalUrl) {
    const formattedDate = new Date(endDate).toLocaleDateString();
    return `
        <!DOCTYPE html>
        <html>
        <head><style>body{font-family:Arial,sans-serif;}.header{background:#e67e22;color:white;padding:20px;text-align:center;}</style></head>
        <body>
            <div style="max-width:600px;margin:0 auto;">
                <div class="header"><h1>⚠️ Subscription Expiring Soon</h1></div>
                <div style="padding:20px;">
                    <h2>Dear ${safe(agentName)},</h2>
                    <p>Your subscription will expire in <strong>${daysLeft} days</strong> on ${formattedDate}.</p>
                    <p><a href="${renewalUrl}" style="background:#e67e22;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Renew Now →</a></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Admin notification email
function getAdminNotificationEmail(subject, message, agentDetails = null) {
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
                        <a href="/agent-dashboard" class="button">Go to Dashboard →</a>
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
    getNewLeadEmail
};