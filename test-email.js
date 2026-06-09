require('dotenv').config();
const { sendEmail, getWelcomeEmail } = require('./src/utils/emailService');

async function testEmail() {
    console.log('Testing email configuration...');
    console.log('SMTP Host:', process.env.SMTP_HOST);
    console.log('SMTP User:', process.env.SMTP_USER);
    
    const result = await sendEmail(
        'admin@roomratecompare.com',  // Send to your admin email
        'Test Email from RoomRateCompare',
        getWelcomeEmail('Test Agent', 'http://localhost:3000/agent-login'),
        'noreply'
    );
    
    if (result.success) {
        console.log('✅ Email sent successfully!');
    } else {
        console.log('❌ Email failed:', result.error);
    }
}

testEmail();