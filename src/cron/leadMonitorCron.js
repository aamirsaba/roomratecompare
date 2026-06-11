const supabase = require('../db/supabase');
const { sendEmail, sendAgentReminderEmail, sendEscalationEmail, sendAutoAssignmentEmail, sendReassignmentEmail } = require('../utils/emailService');

// Configuration
const CONFIG = {
    FIRST_REMINDER_HOURS: 1,
    SECOND_REMINDER_HOURS: 6,
    ESCALATION_HOURS: 24,
    AUTO_REASSIGN_HOURS: 48,
    AGENT_RESPONSE_LIMIT: 12
};

async function monitorAndProcessLeads() {
    console.log('🔍 Running lead monitor cron job...', new Date().toISOString());
    
    const now = new Date();
    
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
    
    for (const lead of pendingLeads || []) {
        const ageHours = (now - new Date(lead.created_at)) / (1000 * 60 * 60);
        const agent = lead.agents;
        
        if (!lead.assigned_agent) {
            await handleUnassignedLead(lead, ageHours);
            continue;
        }
        
        if (ageHours >= CONFIG.FIRST_REMINDER_HOURS && !lead.first_reminder_sent && agent) {
            await sendFirstReminder(lead, agent);
            await updateLeadReminder(lead.id, { first_reminder_sent: true });
        }
        
        if (ageHours >= CONFIG.SECOND_REMINDER_HOURS && !lead.second_reminder_sent && agent) {
            await sendSecondReminder(lead, agent);
            await updateLeadReminder(lead.id, { second_reminder_sent: true });
        }
        
        if (ageHours >= CONFIG.ESCALATION_HOURS && !lead.escalation_sent) {
            await escalateToAdmin(lead, agent);
            await updateLeadReminder(lead.id, { 
                escalation_sent: true,
                status: 'escalated',
                auto_escalated: true
            });
        }
    }
    
    console.log('✅ Lead monitor completed');
}

async function handleUnassignedLead(lead, ageHours) {
    const { data: availableAgents } = await supabase
        .from('agents')
        .select('id, name, email')
        .eq('status', 'approved')
        .eq('is_active', true)
        .limit(3);
    
    if (availableAgents && availableAgents.length > 0) {
        const bestAgent = availableAgents[0];
        
        await supabase
            .from('agent_leads')
            .update({ 
                assigned_agent: bestAgent.id,
                status: 'assigned',
                agent_last_action: new Date()
            })
            .eq('id', lead.id);
        
        await sendAutoAssignmentEmail(lead, bestAgent);
        console.log(`✅ Auto-assigned lead ${lead.id} to agent ${bestAgent.name}`);
    } else if (ageHours >= 12) {
        await escalateToAdmin(lead, null, 'No available agents found');
    }
}

async function sendFirstReminder(lead, agent) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e67e22;">⏰ Action Required: New Client Lead</h2>
            <p>Dear ${agent?.name || 'Agent'},</p>
            <p>You have a new client lead that requires your attention:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Client:</strong> ${lead.client_name}</p>
                <p><strong>Destination:</strong> ${lead.destination}</p>
                <p><strong>Created:</strong> ${new Date(lead.created_at).toLocaleString()}</p>
            </div>
            <a href="${baseUrl}/agent-dashboard?lead=${lead.id}" 
               style="display: inline-block; background: #e67e22; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                View & Respond →
            </a>
        </div>
    `;
    
    await sendEmail(agent.email, '⏰ Action Required: New Client Lead', emailHtml, 'noreply');
    console.log(`📧 First reminder sent to ${agent.email} for lead ${lead.id}`);
}

async function sendSecondReminder(lead, agent) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f44336;">⚠️ FINAL REMINDER: Client Lead Expiring</h2>
            <p>Dear ${agent?.name},</p>
            <p>This lead will be escalated to admin in 18 hours.</p>
            <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Client:</strong> ${lead.client_name}</p>
                <p><strong>Destination:</strong> ${lead.destination}</p>
            </div>
            <a href="${baseUrl}/agent-dashboard?lead=${lead.id}" 
               style="display: inline-block; background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                RESPOND NOW →
            </a>
        </div>
    `;
    
    await sendEmail(agent.email, '⚠️ FINAL REMINDER: Client Lead Expiring', emailHtml, 'noreply');
    console.log(`📧 Second reminder sent to ${agent.email} for lead ${lead.id}`);
}

async function escalateToAdmin(lead, agent, reason = null) {
    const adminEmail = process.env.ADMIN_EMAIL || 'noreply@roomratecompare.com';
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    
    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f44336;">🚨 Lead Escalation Alert</h2>
            <p><strong>Client:</strong> ${lead.client_name}</p>
            <p><strong>Email:</strong> ${lead.client_email}</p>
            <p><strong>Destination:</strong> ${lead.destination}</p>
            <p><strong>Reason:</strong> ${reason || 'No agent response within 24 hours'}</p>
            <a href="${baseUrl}/admin/requests" 
               style="display: inline-block; background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                View in Admin Panel →
            </a>
        </div>
    `;
    
    await sendEmail(adminEmail, `🚨 Lead Escalated: ${lead.client_name}`, emailHtml, 'noreply');
    console.log(`🚨 Escalation sent to admin for lead ${lead.id}`);
}

async function updateLeadReminder(leadId, updates) {
    await supabase
        .from('agent_leads')
        .update(updates)
        .eq('id', leadId);
}

async function updateAgentPerformanceMetrics() {
    console.log('📊 Updating agent performance metrics...');
    
    try {
        const { data: agentStats } = await supabase
            .from('agent_leads')
            .select('assigned_agent, agent_response_time, status')
            .not('agent_response_time', 'is', null);
        
        const agentMetrics = {};
        for (const stat of agentStats || []) {
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
        
        for (const [agentId, metrics] of Object.entries(agentMetrics)) {
            const avgResponseTime = metrics.total_response_time / metrics.count;
            const conversionRate = (metrics.converted / metrics.count) * 100;
            const performanceScore = calculatePerformanceScore(avgResponseTime, conversionRate);
            
            await supabase
                .from('agents')
                .update({ 
                    avg_response_time: Math.round(avgResponseTime),
                    conversion_rate: Math.round(conversionRate),
                    performance_score: performanceScore,
                    updated_at: new Date()
                })
                .eq('id', agentId);
        }
        
        console.log('✅ Agent performance metrics updated');
    } catch (error) {
        console.error('Error updating metrics:', error);
    }
}

function calculatePerformanceScore(avgResponseTime, conversionRate) {
    let score = 100;
    if (avgResponseTime > 60) score -= 20;
    if (avgResponseTime > 120) score -= 20;
    if (avgResponseTime > 240) score -= 20;
    if (conversionRate > 30) score += 10;
    if (conversionRate > 50) score += 10;
    return Math.max(0, Math.min(100, score));
}

// Export all functions
module.exports = { 
    monitorAndProcessLeads, 
    updateAgentPerformanceMetrics,
    calculatePerformanceScore
};