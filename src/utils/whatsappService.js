// src/utils/whatsappService.js
const twilio = require('twilio');

let twilioClient = null;

function initTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (accountSid && authToken && accountSid !== 'your_account_sid') {
        twilioClient = twilio(accountSid, authToken);
        console.log('✅ Twilio WhatsApp client initialized');
        console.log('📱 WhatsApp Business Number:', process.env.TWILIO_WHATSAPP_NUMBER);
        return true;
    } else {
        console.log('⚠️ Twilio not configured - WhatsApp messages will be logged only');
        return false;
    }
}

// Format phone number for WhatsApp
function formatWhatsAppNumber(phoneNumber) {
    if (!phoneNumber) return null;
    
    // Remove all non-digit characters
    let clean = phoneNumber.replace(/\D/g, '');
    
    console.log('Original number:', phoneNumber);
    console.log('Cleaned number:', clean);
    
    // If the number starts with 968 (Oman), format as is
    if (clean.startsWith('968')) {
        return `+${clean}`;
    }
    
    // Remove leading zero if present
    if (clean.startsWith('0')) {
        clean = clean.substring(1);
    }
    
    // For Oman numbers (8 digits after removing 0)
    if (clean.length === 8) {
        clean = `968${clean}`;
    }
    
    // For US numbers
    if (clean.length === 10) {
        return `+1${clean}`;
    }
    
    if (clean.length === 11 && clean.startsWith('1')) {
        return `+${clean}`;
    }
    
    const formatted = `+${clean}`;
    console.log('Formatted number:', formatted);
    
    return formatted;
}

// Send WhatsApp message using dedicated business number
async function sendWhatsAppMessage(phoneNumber, message) {
    const formattedNumber = formatWhatsAppNumber(phoneNumber);
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER;
    
    if (!formattedNumber) {
        console.log('❌ Invalid phone number:', phoneNumber);
        return { success: false, error: 'Invalid phone number' };
    }
    
    console.log(`📱 Sending WhatsApp to: ${formattedNumber}`);
    console.log(`📱 From: ${fromNumber}`);
    console.log(`📱 Message preview: ${message.substring(0, 100)}...`);
    
    // If Twilio is not initialized, just log
    if (!twilioClient) {
        console.log('⚠️ [MOCK] WhatsApp message would be sent');
        console.log('📱 Full message:', message);
        return { success: true, mock: true };
    }
    
    try {
        const response = await twilioClient.messages.create({
            body: message,
            from: `whatsapp:${fromNumber}`,
            to: `whatsapp:${formattedNumber}`
        });
        
        console.log(`✅ WhatsApp sent! SID: ${response.sid}`);
        return { success: true, sid: response.sid };
        
    } catch (error) {
        console.error('❌ WhatsApp error:', error.message);
        return { success: false, error: error.message };
    }
}

// Generate lead notification message
function getLeadNotificationMessage(agentName, leadDetails) {
    const dashboardUrl = ''; // Use relative URLs
    
    return `🔔 *New Lead Request - RoomRateCompare*\n\n` +
           `Dear ${agentName},\n\n` +
           `You have a new travel request from *${leadDetails.clientName}*!\n\n` +
           `📋 *Client Details:*\n` +
           `Name: ${leadDetails.clientName}\n` +
           `Email: ${leadDetails.clientEmail}\n` +
           `${leadDetails.clientPhone ? `Phone: ${leadDetails.clientPhone}\n` : ''}\n` +
           `✈️ *Travel Details:*\n` +
           `Destination: ${leadDetails.destination}\n` +
           `${leadDetails.checkin ? `Check-in: ${leadDetails.checkin}\n` : ''}` +
           `${leadDetails.checkout ? `Check-out: ${leadDetails.checkout}\n` : ''}` +
           `${leadDetails.budget ? `Budget: ${leadDetails.budget}\n` : ''}\n` +
           `${leadDetails.message ? `💬 *Message:* "${leadDetails.message}"\n\n` : '\n'}` +
           `🔗 View & respond: ${dashboardUrl}/agent-dashboard\n\n` +
           `Respond quickly to convert this lead! 🚀`;
}

// Get WhatsApp setup instructions for agents
function getWhatsAppInstructions() {
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER;
    
    return `📱 *WhatsApp Setup Instructions*\n\n` +
           `To receive lead notifications on WhatsApp:\n\n` +
           `1. Save this number to your contacts: ${whatsappNumber}\n` +
           `2. Send a WhatsApp message to ${whatsappNumber}\n` +
           `3. You will be automatically registered to receive notifications\n\n` +
           `You will now receive instant lead notifications! 🚀`;
}

// Initialize on load
initTwilio();

module.exports = {
    initTwilio,
    sendWhatsAppMessage,
    getLeadNotificationMessage,
    getWhatsAppInstructions,
    formatWhatsAppNumber
};