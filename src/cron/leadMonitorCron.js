const supabase = require('../db/supabase');
const { sendEmail, sendAgentReminderEmail, sendEscalationEmail } = require('../utils/emailService');

// Configuration
const CONFIG = {
    FIRST_REMINDER_HOURS: 1,      // Send first reminder after 1 hour
    SECOND_REMINDER_HOURS: 6,     // Send second reminder after 6 hours
    ESCALATION_HOURS: 24,         // Escalate to admin after 24 hours
    AUTO_REASSIGN_HOURS: 48,      // Auto-reassign after 48 hours
    AGENT_RESPONSE_LIMIT: 12      // Hours before agent gets warning
};

async function monitorAndProcessLeads() {
    console.log('🔍 Running lead monitor cron job...', new Date().toISOString());
    
    const now = new Date();
    
    // 1. Find leads that need reminders
    const { data: pendingLeads, error } = await supabase
        .from('agent_leads')
        .select('*, agents!assigned_agent(name, email, phone, status)')
        .in('status', ['new', 'assigned', 'contacted'])
        .is('auto_escalated', false)
        .order('created_at', { ascending: true });
    
    if (error) {
        console.error('Error fetching leads:', error);
        return;
    }
    
    for (const lead of pendingLeads) {
        const ageHours = (now - new Date(lead.created_at)) / (1000 * 60 * 60);
        const agent = lead.agents;
        
        // Skip if no agent assigned
        if (!lead.assigned_agent) {
            await handleUnassignedLead(lead, ageHours);
            continue;
        }
        
        // Skip if agent is not active
        if (agent?.status !== 'approved') {
            await handleInactiveAgent(lead, agent);
            continue;
        }
        
        // Calculate time since last agent action
        const lastAction = lead.agent_last_action ? new Date(lead.agent_last_action) : new Date(lead.created_at);
        const hoursSinceLastAction = (now - lastAction) / (1000 * 60 * 60);
        
        // First Reminder
        if (ageHours >= CONFIG.FIRST_REMINDER_HOURS && !lead.first_reminder_sent) {
            await sendFirstReminder(lead, agent);
            await updateLeadReminder(lead.id, { first_reminder_sent: true });
        }
        
        // Second Reminder
        if (ageHours >= CONFIG.SECOND_REMINDER_HOURS && !lead.second_reminder_sent) {
            await sendSecondReminder(lead, agent);
            await updateLeadReminder(lead.id, { second_reminder_sent: true });
        }
        
        // Escalate to Admin
        if (ageHours >= CONFIG.ESCALATION_HOURS && !lead.escalation_sent) {
            await escalateToAdmin(lead, agent);
            await updateLeadReminder(lead.id, { 
                escalation_sent: true,
                status: 'escalated',
                auto_escalated: true
            });
        }
        
        // Auto-reassign after 48 hours with no response
        if (ageHours >= CONFIG.AUTO_REASSIGN_HOURS && lead.status !== 'converted') {
            await autoReassignLead(lead);
        }
        
        // Track agent response time
        if (!lead.agent_response_time && lead.agent_last_action) {
            const responseMinutes = Math.floor((new Date(lead.agent_last_action) - new Date(lead.created_at)) / (1000 * 60));
            await supabase
                .from('agent_leads')
                .update({ agent_response_time: responseMinutes })
                .eq('id', lead.id);
        }
    }
    
    // 2. Check agent performance metrics
    await updateAgentPerformanceMetrics();
    
    // 3. Send weekly performance reports
    if (now.getDay() === 1) { // Monday
        await sendWeeklyReports();
    }
}

async function handleUnassignedLead(lead, ageHours) {
    // Find best agent for this lead based on specialty and location
    const { data: availableAgents } = await supabase
        .from('agents')
        .select('id, name, email, specialty, performance_score')
        .eq('status', 'approved')
        .eq('is_active', true)
        .order('performance_score', { ascending: false })
        .limit(3);
    
    if (availableAgents && availableAgents.length > 0) {
        // Auto-assign to best available agent
        const bestAgent = availableAgents[0];
        
        await supabase
            .from('agent_leads')
            .update({ 
                assigned_agent: bestAgent.id,
                status: 'assigned',
                agent_last_action: new Date()
            })
            .eq('id', lead.id);
        
        // Notify agent of new auto-assignment
        await sendAutoAssignmentEmail(lead, bestAgent);
        
        console.log(`✅ Auto-assigned lead ${lead.id} to agent ${bestAgent.name}`);
    } else if (ageHours >= 12) {
        // No agents available, escalate to admin
        await escalateToAdmin(lead, null, 'No available agents found for auto-assignment');
    }
}

async function sendFirstReminder(lead, agent) {
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e67e22;">⏰ Action Required: New Client Lead</h2>
            <p>Dear ${agent?.name || 'Agent'},</p>
            <p>You have a new client lead that requires your attention:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Client:</strong> ${lead.client_name}</p>
                <p><strong>Destination:</strong> ${lead.destination}</p>
                <p><strong>Dates:</strong> ${lead.checkin} to ${lead.checkout}</p>
                <p><strong>Budget:</strong> ${lead.budget || 'Not specified'}</p>
                <p><strong>Created:</strong> ${new Date(lead.created_at).toLocaleString()}</p>
            </div>
            <p><strong>⚠️ This is your 1st reminder (1 hour).</strong> Please respond within 5 hours to avoid escalation.</p>
            <a href="${process.env.APP_URL}/agent-dashboard?lead=${lead.id}" 
               style="display: inline-block; background: #e67e22; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0;">
                View & Respond →
            </a>
            <hr style="margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">Response timeline: 1h ⏰ | 6h ⏰⏰ | 24h 🚨 Escalation</p>
        </div>
    `;
    
    await sendEmail(agent.email, '⏰ Action Required: New Client Lead', emailHtml, 'noreply');
    
    // Log email sent
    await logEmailSent(lead.id, 'first_reminder', agent.email);
    
    // Also send SMS if agent has phone
    if (agent?.phone) {
        await sendSmsReminder(agent.phone, lead.id);
    }
}

async function sendSecondReminder(lead, agent) {
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e67e22;">⚠️ FINAL REMINDER: Client Lead Expiring</h2>
            <p>Dear ${agent?.name},</p>
            <p><strong>This is your FINAL reminder.</strong> This lead will be escalated to admin in 18 hours.</p>
            <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #e67e22;">
                <p><strong>Client:</strong> ${lead.client_name}</p>
                <p><strong>Destination:</strong> ${lead.destination}</p>
                <p><strong>Message:</strong> ${lead.message || 'No message provided'}</p>
            </div>
            <p>🚨 <strong>Consequences of no response:</strong></p>
            <ul>
                <li>Lead will be reassigned to another agent</li>
                <li>Your response score will decrease</li>
                <li>May affect your agent ranking</li>
            </ul>
            <a href="${process.env.APP_URL}/agent-dashboard?lead=${lead.id}" 
               style="display: inline-block; background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                RESPOND NOW →
            </a>
        </div>
    `;
    
    await sendEmail(agent.email, '⚠️ FINAL REMINDER: Client Lead Expiring', emailHtml, 'noreply');
    await logEmailSent(lead.id, 'second_reminder', agent.email);
}

async function escalateToAdmin(lead, agent, reason = null) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@roomratecompare.com';
    const escalationReason = reason || `Agent ${agent?.name || 'Unknown'} (${agent?.email}) did not respond within ${CONFIG.ESCALATION_HOURS} hours`;
    
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f44336;">🚨 Lead Escalation Alert</h2>
            <p><strong>Lead ID:</strong> ${lead.id}</p>
            <p><strong>Escalation Reason:</strong> ${escalationReason}</p>
            <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Client:</strong> ${lead.client_name}</p>
                <p><strong>Email:</strong> ${lead.client_email}</p>
                <p><strong>Phone:</strong> ${lead.client_phone}</p>
                <p><strong>Destination:</strong> ${lead.destination}</p>
                <p><strong>Check-in:</strong> ${lead.checkin}</p>
                <p><strong>Check-out:</strong> ${lead.checkout}</p>
                <p><strong>Budget:</strong> ${lead.budget}</p>
                <p><strong>Message:</strong> ${lead.message || 'No message'}</p>
            </div>
            <p><strong>Action Required:</strong> Please contact this client immediately or reassign to another agent.</p>
            <a href="${process.env.APP_URL}/admin/requests" 
               style="display: inline-block; background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                View in Admin Panel →
            </a>
        </div>
    `;
    
    await sendEmail(adminEmail, `🚨 Lead Escalation Alert - ${lead.id}`, emailHtml, 'admin');
    await logEmailSent(lead.id, 'escalation', adminEmail);
    
    // Also notify admin via webhook/slack if configured
    if (process.env.SLACK_WEBHOOK_URL) {
        await sendSlackNotification(lead, escalationReason);
    }
}

async function autoReassignLead(lead) {
    // Find next best agent
    const { data: alternativeAgents } = await supabase
        .from('agents')
        .select('id, name, email')
        .eq('status', 'approved')
        .eq('is_active', true)
        .neq('id', lead.assigned_agent)
        .order('performance_score', { ascending: false })
        .limit(1);
    
    if (alternativeAgents && alternativeAgents.length > 0) {
        const newAgent = alternativeAgents[0];
        
        await supabase
            .from('agent_leads')
            .update({ 
                assigned_agent: newAgent.id,
                status: 'assigned',
                previous_agent: lead.assigned_agent,
                reassigned_count: (lead.reassigned_count || 0) + 1
            })
            .eq('id', lead.id);
        
        // Notify new agent
        await sendReassignmentEmail(lead, newAgent);
        
        // Penalize original agent
        await penalizeAgent(lead.assigned_agent);
        
        console.log(`🔄 Lead ${lead.id} reassigned from agent ${lead.assigned_agent} to ${newAgent.name}`);
    }
}

async function updateAgentPerformanceMetrics() {
    // Calculate response time averages per agent
    const { data: agentStats } = await supabase
        .from('agent_leads')
        .select('assigned_agent, agent_response_time, status')
        .not('agent_response_time', 'is', null);
    
    const agentMetrics = {};
    for (const stat of agentStats) {
        if (!agentMetrics[stat.assigned_agent]) {
            agentMetrics[stat.assigned_agent] = {
                total_response_time: 0,
                count: 0,
                converted: 0
            };
        }
        agentMetrics[stat.assigned_agent].total_response_time += stat.agent_response_time;
        agentMetrics[stat.assigned_agent].count++;
        if (stat.status === 'converted') {
            agentMetrics[stat.assigned_agent].converted++;
        }
    }
    
    // Update agent scores
    for (const [agentId, metrics] of Object.entries(agentMetrics)) {
        const avgResponseTime = metrics.total_response_time / metrics.count;
        const conversionRate = (metrics.converted / metrics.count) * 100;
        const performanceScore = calculatePerformanceScore(avgResponseTime, conversionRate);
        
        await supabase
            .from('agents')
            .update({ 
                avg_response_time: Math.round(avgResponseTime),
                conversion_rate: Math.round(conversionRate),
                performance_score: performanceScore
            })
            .eq('id', agentId);
    }
}

function calculatePerformanceScore(avgResponseTime, conversionRate) {
    // Score out of 100
    let score = 100;
    
    // Penalize slow response
    if (avgResponseTime > 60) score -= 20;      // Over 1 hour
    if (avgResponseTime > 120) score -= 20;     // Over 2 hours
    if (avgResponseTime > 240) score -= 20;     // Over 4 hours
    
    // Reward high conversion
    if (conversionRate > 30) score += 10;
    if (conversionRate > 50) score += 10;
    
    return Math.max(0, Math.min(100, score));
}

async function penalizeAgent(agentId) {
    await supabase
        .from('agents')
        .update({ 
            missed_leads: supabase.raw('missed_leads + 1'),
            performance_score: supabase.raw('performance_score - 5')
        })
        .eq('id', agentId);
}

async function sendWeeklyReports() {
    // Get top and bottom performing agents
    const { data: topAgents } = await supabase
        .from('agents')
        .select('name, email, performance_score, conversion_rate, avg_response_time')
        .eq('status', 'approved')
        .order('performance_score', { ascending: false })
        .limit(5);
    
    const { data: bottomAgents } = await supabase
        .from('agents')
        .select('name, email, performance_score, conversion_rate, avg_response_time')
        .eq('status', 'approved')
        .order('performance_score', { ascending: true })
        .limit(3);
    
    const reportHtml = generateWeeklyReportHtml(topAgents, bottomAgents);
    await sendEmail(process.env.ADMIN_EMAIL, '📊 Weekly Agent Performance Report', reportHtml, 'admin');
}

async function logEmailSent(leadId, type, recipient) {
    const { data: lead } = await supabase
        .from('agent_leads')
        .select('email_logs')
        .eq('id', leadId)
        .single();
    
    const logs = lead.email_logs || [];
    logs.push({
        type,
        recipient,
        timestamp: new Date().toISOString()
    });
    
    await supabase
        .from('agent_leads')
        .update({ email_logs: logs })
        .eq('id', leadId);
}

async function updateLeadReminder(leadId, updates) {
    await supabase
        .from('agent_leads')
        .update(updates)
        .eq('id', leadId);
}

// Helper functions (implement based on your SMS provider)
async function sendSmsReminder(phoneNumber, leadId) {
    // Integrate with Twilio or other SMS service
    console.log(`📱 SMS reminder sent to ${phoneNumber} for lead ${leadId}`);
}

async function sendSlackNotification(lead, reason) {
    // Integrate with Slack webhook
    console.log(`💬 Slack notification sent for lead ${lead.id}`);
}

async function sendAutoAssignmentEmail(lead, agent) {
    // Send notification to agent about auto-assignment
}

async function sendReassignmentEmail(lead, newAgent) {
    // Send notification about reassignment
}

// Export for cron job
module.exports = { monitorAndProcessLeads };