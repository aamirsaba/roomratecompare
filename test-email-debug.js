// test-email-debug.js
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    console.log('🔍 Testing email configuration...');
    console.log('SMTP_HOST:', process.env.SMTP_HOST);
    console.log('SMTP_PORT:', process.env.SMTP_PORT);
    console.log('SMTP_USER:', process.env.SMTP_USER);
    console.log('SMTP_SECURE:', process.env.SMTP_SECURE);
    
    // Create transporter
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        debug: true,  // Enable debug output
        logger: true   // Enable logging
    });
    
    // Verify connection
    try {
        await transporter.verify();
        console.log('✅ SMTP connection verified');
    } catch (error) {
        console.error('❌ SMTP verification failed:', error.message);
        console.log('\nPossible issues:');
        console.log('1. Wrong SMTP_HOST - use: smtp.hostinger.com');
        console.log('2. Wrong SMTP_PORT - try 465 or 587');
        console.log('3. Wrong credentials - check email/password');
        console.log('4. Email account not activated in Hostinger');
        return;
    }
    
    // Try sending
    try {
        const info = await transporter.sendMail({
            from: `"RoomRateCompare" <${process.env.SMTP_USER}>`,
            to: 'your-test-email@gmail.com', // CHANGE THIS to a real email
            subject: 'Test Email from RoomRateCompare',
            html: '<h1>Test</h1><p>If you see this, email is working!</p>'
        });
        console.log('✅ Email sent!', info.messageId);
    } catch (error) {
        console.error('❌ Send failed:', error.message);
        console.error('Full error:', error);
    }
}

testEmail();