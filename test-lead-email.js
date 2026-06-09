require('dotenv').config();
const { sendEmail, getNewLeadEmail } = require('./src/utils/emailService');

async function testLeadEmail() {
    console.log('🧪 Testing Lead Notification Email...');
    
    const testAgent = {
        name: 'Test Agent',
        email: 'admin@roomratecompare.com' // Change to your email
    };
    
    const testLead = {
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        clientPhone: '+96891234567',
        destination: 'Paris, France',
        checkin: '2026-06-15',
        checkout: '2026-06-20',
        budget: 'luxury',
        message: 'I need a luxury hotel near the Eiffel Tower for 5 nights. Please suggest some options.'
    };
    
    const emailHtml = getNewLeadEmail(testAgent.name, testLead);
    
    console.log('📧 Sending test email to:', testAgent.email);
    console.log('📧 Subject: 🔔 New Lead Request - RoomRateCompare');
    
    const result = await sendEmail(
        testAgent.email,
        '🔔 New Lead Request - RoomRateCompare',
        emailHtml,
        'noreply'
    );
    
    if (result.success) {
        console.log('✅ Test email sent successfully!');
        console.log('📧 Check your inbox at:', testAgent.email);
    } else {
        console.log('❌ Test failed:', result.error);
    }
}

testLeadEmail();