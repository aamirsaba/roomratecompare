// src/utils/expiryReminderService.js
require('dotenv').config();
const supabase = require('../db/supabase');
const { sendEmail, getExpiryReminderEmail } = require('./emailService');

// Check for expiring subscriptions and send reminders
async function checkExpiringSubscriptions() {
    console.log('🔍 Checking for expiring subscriptions...');
    
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);
    
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);
    
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(today.getDate() + 1);
    
    try {
        // Get all active subscriptions that are not cancelled
        const { data: agents, error } = await supabase
            .from('agents')
            .select('id, name, email, subscription_end_date, subscription_cancelled, subscription_status')
            .eq('subscription_status', 'active')
            .eq('subscription_cancelled', false)
            .not('subscription_end_date', 'is', null);
        
        if (error) throw error;
        
        let remindersSent = 0;
        
        for (const agent of agents) {
            const endDate = new Date(agent.subscription_end_date);
            const daysUntilExpiry = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
            
            // Check if we already sent a reminder for this period
            const { data: existingReminder } = await supabase
                .from('reminder_logs')
                .select('id')
                .eq('agent_id', agent.id)
                .eq('days_before', daysUntilExpiry)
                .single();
            
            if (existingReminder) continue; // Already sent
            
            let reminderType = null;
            
            if (daysUntilExpiry === 7) {
                reminderType = '7_days';
            } else if (daysUntilExpiry === 3) {
                reminderType = '3_days';
            } else if (daysUntilExpiry === 1) {
                reminderType = '1_day';
            }
            
            if (reminderType) {
                const renewalUrl = '/agent-login';
                const emailHtml = getExpiryReminderEmail(agent.name, daysUntilExpiry, endDate, renewalUrl);
                
                await sendEmail(agent.email, `⚠️ Subscription Expiring in ${daysUntilExpiry} Days`, emailHtml, 'noreply');
                
                // Log the reminder
                await supabase
                    .from('reminder_logs')
                    .insert([{
                        agent_id: agent.id,
                        days_before: daysUntilExpiry,
                        sent_at: new Date(),
                        reminder_type: reminderType
                    }]);
                
                remindersSent++;
                console.log(`📧 Expiry reminder sent to ${agent.email} (${daysUntilExpiry} days left)`);
            }
        }
        
        console.log(`✅ Sent ${remindersSent} expiry reminders`);
        return { success: true, remindersSent };
        
    } catch (error) {
        console.error('Error checking expiring subscriptions:', error);
        return { success: false, error: error.message };
    }
}

// Create reminder_logs table (run this SQL in Supabase)
const createReminderLogsTableSQL = `
CREATE TABLE IF NOT EXISTS reminder_logs (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    days_before INTEGER NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    reminder_type VARCHAR(20) CHECK (reminder_type IN ('7_days', '3_days', '1_day')),
    created_at TIMESTAMP DEFAULT NOW()
);
`;

module.exports = { checkExpiringSubscriptions, createReminderLogsTableSQL };