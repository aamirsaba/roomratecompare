// src/cron/expiryReminderCron.js
require('dotenv').config();
const { checkExpiringSubscriptions } = require('../utils/expiryReminderService');

// Run once immediately
async function runOnce() {
    console.log('🚀 Running expiry reminder check...');
    const result = await checkExpiringSubscriptions();
    console.log('Result:', result);
    process.exit(0);
}

// For scheduled running (every day at 9 AM)
function scheduleDailyReminder() {
    // Run every day at 9:00 AM
    const schedule = require('node-schedule');
    
    const rule = new schedule.RecurrenceRule();
    rule.hour = 9;
    rule.minute = 0;
    
    schedule.scheduleJob(rule, async () => {
        console.log('🕐 Running scheduled expiry reminder check...');
        await checkExpiringSubscriptions();
    });
    
    console.log('⏰ Scheduled expiry reminders to run daily at 9:00 AM');
}

// Run immediately if called directly
if (require.main === module) {
    runOnce();
}

module.exports = { checkExpiringSubscriptions, scheduleDailyReminder };