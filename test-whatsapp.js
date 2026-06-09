require('dotenv').config();
const { sendWhatsAppMessage, getWhatsAppInstructions } = require('./src/utils/whatsappService');

async function testWhatsApp() {
    console.log('🧪 Testing WhatsApp with Business Number...');
    console.log('📱 From:', process.env.TWILIO_WHATSAPP_NUMBER);
    
    // IMPORTANT: Replace with YOUR phone number (the one receiving the test)
    // Format: +968XXXXXXXX for Oman, or +1XXXXXXXXXX for US
    const testPhoneNumber = '+968XXXXXXXX'; // <-- CHANGE THIS TO YOUR NUMBER
    
    const testMessage = `🔔 *WhatsApp Test - RoomRateCompare*\n\n` +
                        `This is a test message from your WhatsApp Business number!\n\n` +
                        `✅ If you received this, WhatsApp integration is working correctly.\n\n` +
                        `Agents will now receive lead notifications like this:\n\n` +
                        `📋 New lead from: Client Name\n` +
                        `✈️ Destination: Paris\n` +
                        `💬 Message: "Need a hotel for 3 nights"\n\n` +
                        `🚀 Your platform is ready!`;
    
    console.log('\n📤 Sending test message...');
    const result = await sendWhatsAppMessage(testPhoneNumber, testMessage);
    
    if (result.success) {
        console.log('✅ Test message sent successfully!');
        console.log('📱 Check your WhatsApp now!');
    } else {
        console.log('❌ Test failed:', result.error);
    }
}

// Also show setup instructions
console.log('\n📱 WhatsApp Setup Instructions:');
console.log(getWhatsAppInstructions());
console.log('\n' + '='.repeat(50) + '\n');

testWhatsApp();