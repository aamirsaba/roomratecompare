const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'admin_secret_key_2024';

// Admin login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Admin login attempt:', email);
    
    // Simple admin check (you can move this to database)
    if (email === 'admin@roomratecompare.com' && password === 'admin123') {
        // Create a JWT token
        const token = jwt.sign(
            { email: email, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        console.log('Admin login successful');
        return res.json({ success: true, token: token, email: email });
    }
    
    console.log('Admin login failed');
    res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// Verify admin token middleware
function verifyAdminToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
}

// Dashboard stats
router.get('/dashboard', verifyAdminToken, async (req, res) => {
    try {
        // Get total agents
        const { count: totalAgents } = await supabase
            .from('agents')
            .select('*', { count: 'exact', head: true });
        
        // Get pending agents
        const { count: pendingAgents } = await supabase
            .from('agents')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        
        // Get total client requests
        const { count: totalRequests } = await supabase
            .from('agent_leads')
            .select('*', { count: 'exact', head: true });
        
        // Get pending requests
        const { count: pendingRequests } = await supabase
            .from('agent_leads')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'new');
        
        // Get recent agents (last 5)
        const { data: recentAgents } = await supabase
            .from('agents')
            .select('id, name, email, specialty, status, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
        
        // Get recent requests (last 5)
        const { data: recentRequests } = await supabase
            .from('agent_leads')
            .select('id, client_name as name, destination, budget, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
        
        res.json({
            success: true,
            stats: {
                totalAgents: totalAgents || 0,
                pendingAgents: pendingAgents || 0,
                totalRequests: totalRequests || 0,
                pendingRequests: pendingRequests || 0
            },
            recentAgents: recentAgents || [],
            recentRequests: recentRequests || []
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

	
// Change admin password
router.post('/change-password', verifyAdminToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (currentPassword !== 'admin123') {
        return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    
    // In production, you would hash and save the new password
    res.json({ success: true, message: 'Password changed successfully' });
});

// Resend welcome email to agent
router.post('/resend-welcome', verifyAdminToken, async (req, res) => {
    const { agentId, agentEmail, agentName } = req.body;
    
    console.log(`📧 Resending welcome email to: ${agentEmail}`);
    
    if (!agentEmail) {
        return res.status(400).json({ success: false, error: 'Agent email required' });
    }
    
    try {
        const { getWelcomeEmail, sendEmail } = require('../utils/emailService');
        const baseUrl = process.env.APP_URL || 'https://www.roomratecompare.com';
        const loginUrl = `${baseUrl}/agent-login`;
        
        const emailHtml = getWelcomeEmail(agentName || 'Agent', loginUrl);
        
        const result = await sendEmail(
            agentEmail,
            'Welcome to RoomRateCompare! 🎉',
            emailHtml,
            'noreply'
        );
        
        if (result.success) {
            console.log(`✅ Welcome email resent to ${agentEmail}`);
            res.json({ success: true, message: 'Welcome email sent' });
        } else {
            throw new Error(result.error || 'Failed to send');
        }
    } catch (error) {
        console.error('Resend error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;