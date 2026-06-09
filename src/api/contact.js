// src/api/contact.js
const express = require('express');
const router = express.Router();
const { sendEmail } = require('../utils/emailService');

router.post('/send', async (req, res) => {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !message) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    try {
        // Send to admin
        const adminHtml = `
            <h2>New Contact Form Message</h2>
            <p><strong>From:</strong> ${name} (${email})</p>
            <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
        `;
        await sendEmail('admin@roomratecompare.com', `Contact Form: ${subject || 'New Message'}`, adminHtml, 'support');
        
        // Send confirmation to user
        const userHtml = `
            <h2>Thank you for contacting RoomRateCompare</h2>
            <p>Dear ${name},</p>
            <p>We have received your message and will respond within 24-48 hours.</p>
            <p><strong>Your message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <p>Best regards,<br>RoomRateCompare Team</p>
        `;
        await sendEmail(email, 'We received your message', userHtml, 'support');
        
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Contact error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;