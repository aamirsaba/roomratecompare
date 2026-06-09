const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { sendWhatsAppMessage, getLeadNotificationMessage } = require('../utils/whatsappService');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ============ CONTENT MODERATION FUNCTION ============
function moderateContent(message) {
    // Profanity list
    const profanityList = [
        'fuck', 'shit', 'damn', 'bitch', 'crap', 'asshole', 'bastard', 
        'whore', 'slut', 'dick', 'pussy', 'nigger', 'faggot', 'stupid', 
        'idiot', 'moron', 'retard', 'dumb', 'loser', 'suck', 'bullshit',
        'fucking', 'shitting', 'damn it', 'hell', 'piss', 'cock', 'cunt', 
        'sex'
    ];
    
    const lowerMsg = message.toLowerCase();
    
    for (const badWord of profanityList) {
        if (lowerMsg.includes(badWord)) {
            return { 
                isAppropriate: false, 
                reason: `Your message contains inappropriate language: "${badWord}". Please keep conversations respectful.`
            };
        }
    }
    
    return { isAppropriate: true };
}


// Email service
const {
    sendEmail,
    notifyAdmin,
    getRenewalEmail,
    getCancellationEmail
} = require('../utils/emailService');

// ============ MIDDLEWARE ============
const authenticateAgent = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.agent = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

// Special login for renewal (bypass subscription check)
router.post('/renewal-login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const { data: agent, error } = await supabase
            .from('agents')
            .select('*')
            .eq('email', email)
            .single();
        
        if (!agent || error) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        // Check if account is deleted
        if (agent.account_deleted === true) {
            return res.status(401).json({ success: false, error: 'Account has been deleted' });
        }
        
        // Skip subscription check for renewal - only check password
        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: agent.id, email: agent.email, role: 'agent' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token: token,
            agent: {
                id: agent.id,
                name: agent.name,
                email: agent.email
            }
        });
        
    } catch (error) {
        console.error('Renewal login error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});


// ============ AGENT LOGIN ============
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const { data: agent, error } = await supabase
            .from('agents')
            .select('*')
            .eq('email', email)
            .single();
        
        if (!agent || error) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        // Check if account is deleted
        if (agent.account_deleted === true) {
            return res.status(401).json({ success: false, error: 'Account has been deleted' });
        }
        
        // Check if subscription is cancelled
        if (agent.subscription_cancelled === true) {
            return res.status(401).json({ success: false, error: 'Your subscription has been cancelled. Please renew to access your account.' });
        }
        
        // Check if subscription is active
        if (agent.subscription_status !== 'active') {
            return res.status(401).json({ success: false, error: 'Your subscription is inactive. Please renew to access your account.' });
        }
        
        if (agent.status !== 'approved') {
            return res.status(401).json({ success: false, error: 'Account not approved yet' });
        }
        
        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: agent.id, email: agent.email, role: 'agent' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token: token,
            agent: {
                id: agent.id,
                name: agent.name,
                email: agent.email
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ============ GET AGENT ID BY EMAIL ============
router.post('/get-agent-id', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { data: agent, error } = await supabase
            .from('agents')
            .select('id')
            .eq('email', email)
            .single();
        
        if (error || !agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        res.json({ success: true, agentId: agent.id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CHECK SUBSCRIPTION STATUS ============
router.get('/check-status', authenticateAgent, async (req, res) => {
    try {
        const agentId = req.agent.id;
        
        const { data: agent, error } = await supabase
            .from('agents')
            .select('subscription_cancelled, subscription_status, is_active, subscription_end_date')
            .eq('id', agentId)
            .single();
        
        if (error) throw error;
        
        res.json({
            success: true,
            subscription_cancelled: agent.subscription_cancelled,
            subscription_status: agent.subscription_status,
            is_active: agent.is_active,
            subscription_end_date: agent.subscription_end_date
        });
        
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ RENEW SUBSCRIPTION DIRECT (NO AUTH TOKEN NEEDED) ============
router.post('/renew-subscription-direct', async (req, res) => {
    const { email, password, paymentMethodId } = req.body;
    
    try {
        // Verify credentials first
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('email', email)
            .single();
        
        if (agentError || !agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        // Verify password
        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }
        
        // Check if renewal is needed
        if (!agent.subscription_cancelled && agent.subscription_status === 'active') {
            return res.status(400).json({ 
                success: false, 
                error: 'Subscription is already active. No renewal needed.' 
            });
        }
        
        // ============================================================
        // STRIPE PAYMENT PROCESSING
        // ============================================================
        
        // Ensure customer exists in Stripe
        let customerId = agent.stripe_customer_id;
        
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: agent.email,
                name: agent.name,
                metadata: { agent_id: agent.id, type: 'travel_agent' }
            });
            customerId = customer.id;
            
            await supabase
                .from('agents')
                .update({ stripe_customer_id: customerId })
                .eq('id', agent.id);
        }
        
        // Attach payment method to customer
        if (paymentMethodId) {
            try {
                await stripe.paymentMethods.attach(paymentMethodId, {
                    customer: customerId
                });
                
                await stripe.customers.update(customerId, {
                    invoice_settings: {
                        default_payment_method: paymentMethodId
                    }
                });
            } catch (attachError) {
                console.error('Error attaching payment method:', attachError);
            }
        }
        
        // Create and confirm payment intent
        let paymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.create({
                amount: 1000,
                currency: 'usd',
                customer: customerId,
                payment_method_types: ['card'],
                confirm: true,
                ...(paymentMethodId && { payment_method: paymentMethodId }),
                metadata: {
                    agent_id: agent.id,
                    email: agent.email,
                    type: 'subscription_renewal'
                }
            });
            
            if (paymentIntent.status !== 'succeeded') {
                throw new Error(`Payment failed with status: ${paymentIntent.status}`);
            }
            
        } catch (stripeError) {
            console.error('Stripe payment error:', stripeError.message);
            return res.status(400).json({ 
                success: false, 
                error: 'Payment failed: ' + stripeError.message
            });
        }
        
        // Calculate new end date
        const now = new Date();
        const newEndDate = new Date();
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        
        const formatDate = (date) => date.toISOString();
        
        // Update agents table
        await supabase
            .from('agents')
            .update({
                subscription_cancelled: false,
                subscription_status: 'active',
                is_active: true,
                subscription_end_date: formatDate(newEndDate),
                subscription_cancelled_at: null,
                stripe_payment_id: paymentIntent.id
            })
            .eq('id', agent.id);
        
        // Update or create subscription record
        const { data: existingSub } = await supabase
            .from('agent_subscriptions')
            .select('id')
            .eq('agent_id', agent.id)
            .eq('status', 'cancelled')
            .order('id', { ascending: false })
            .limit(1);
        
        if (existingSub && existingSub.length > 0) {
            await supabase
                .from('agent_subscriptions')
                .update({
                    status: 'active',
                    current_period_start: formatDate(now),
                    current_period_end: formatDate(newEndDate)
                })
                .eq('id', existingSub[0].id);
        } else {
            await supabase
                .from('agent_subscriptions')
                .insert([{
                    agent_id: agent.id,
                    status: 'active',
                    amount: 10.00,
                    current_period_start: formatDate(now),
                    current_period_end: formatDate(newEndDate),
                    created_at: formatDate(now)
                }]);
        }
        
        // Send renewal email
        const renewalEmail = getRenewalEmail(agent.name, newEndDate, '10.00', paymentIntent.id);
        await sendEmail(agent.email, 'Subscription Renewed - Payment Confirmed', renewalEmail, 'noreply');
        
        // Notify admin
        await notifyAdmin('💰 Agent Subscription Renewed', `Agent ${agent.name} (${agent.email}) has renewed their subscription. Payment: $10.00`, {
            id: agent.id,
            name: agent.name,
            email: agent.email
        });
        
        res.json({ 
            success: true, 
            message: 'Subscription renewed successfully! Your payment of $10.00 has been processed.',
            new_end_date: newEndDate
        });
        
    } catch (error) {
        console.error('Renewal error:', error);
        res.status(500).json({ success: false, error: 'Renewal failed: ' + error.message });
    }
});

// ============ PASSWORD RESET ============

// Request password reset (send OTP to email)
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    try {
        const { data: agent, error } = await supabase
            .from('agents')
            .select('id, email, name')
            .eq('email', email)
            .single();
        
        if (error || !agent) {
            return res.json({ success: true, message: 'If your email is registered, you will receive a reset link.' });
        }
        
        // Generate reset token
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Use Unix timestamp (milliseconds since epoch)
        const expiryTimestamp = Date.now() + (60 * 60 * 1000); // 1 hour from now
        
        console.log(`===== PASSWORD RESET REQUEST =====`);
        console.log(`Email: ${email}`);
        console.log(`Agent ID: ${agent.id}`);
        console.log(`Generated token: ${resetToken}`);
        console.log(`Current timestamp: ${Date.now()}`);
        console.log(`Expiry timestamp: ${expiryTimestamp}`);
        console.log(`Expiry datetime: ${new Date(expiryTimestamp).toISOString()}`);
        
        // Save token to database
        const { data: updateData, error: updateError } = await supabase
            .from('agents')
            .update({
                reset_token: resetToken,
                reset_token_expiry: expiryTimestamp
            })
            .eq('id', agent.id)
            .select();
        
        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        console.log('Update successful, verified agent:', updateData);
        
        // Verify the update worked
        const { data: verifyAgent } = await supabase
            .from('agents')
            .select('reset_token, reset_token_expiry')
            .eq('id', agent.id)
            .single();
        
        console.log('Verification - stored token:', verifyAgent?.reset_token);
        console.log('Verification - stored expiry:', verifyAgent?.reset_token_expiry);
        
        // Send reset email
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?email=${encodeURIComponent(email)}&token=${resetToken}`;
        
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #e67e22; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { padding: 20px; background: #f9f9f9; text-align: center; }
                    .otp-code { font-size: 36px; font-weight: bold; color: #e67e22; letter-spacing: 8px; margin: 20px 0; }
                    .button { display: inline-block; background: #e67e22; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Password Reset Request</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${agent.name},</h2>
                        <p>We received a request to reset your password.</p>
                        <div class="otp-code">${resetToken}</div>
                        <p>Enter this <strong>6-digit code</strong> on the password reset page.</p>
                        <p>This code will expire in <strong>1 hour</strong>.</p>
                        <a href="${resetUrl}" class="button">Reset Password →</a>
                        <p style="margin-top: 20px;">If you didn't request this, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>RoomRateCompare - Compare & Book Hotels Worldwide</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const { sendEmail } = require('../utils/emailService');
        await sendEmail(agent.email, 'Password Reset Request - RoomRateCompare', emailHtml, 'noreply');
        
        res.json({ success: true, message: 'If your email is registered, you will receive a reset link.' });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Verify reset token and reset password
router.post('/reset-password', async (req, res) => {
    const { email, token, newPassword } = req.body;
    
    console.log(`===== PASSWORD RESET =====`);
    console.log(`Email: ${email}`);
    console.log(`Provided token: ${token}`);
    
    if (!email || !token || !newPassword) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    
    try {
        // Get agent with reset token
        const { data: agent, error } = await supabase
            .from('agents')
            .select('id, email, name, reset_token, reset_token_expiry')
            .eq('email', email)
            .single();
        
        if (error || !agent) {
            console.log('Agent not found');
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }
        
        console.log(`Agent found: ${agent.id}`);
        console.log(`Stored token: ${agent.reset_token}`);
        console.log(`Stored expiry (timestamp): ${agent.reset_token_expiry}`);
        
        if (!agent.reset_token) {
            console.log('No token found in database');
            return res.status(400).json({ success: false, error: 'No reset request found. Please request a new code.' });
        }
        
        if (String(agent.reset_token) !== String(token)) {
            console.log(`Token mismatch: ${agent.reset_token} vs ${token}`);
            return res.status(400).json({ success: false, error: 'Invalid reset code' });
        }
        
        // Check expiry
        const now = Date.now();
        const expiryTimestamp = parseInt(agent.reset_token_expiry);
        
        console.log(`Current timestamp: ${now}`);
        console.log(`Expiry timestamp: ${expiryTimestamp}`);
        
        if (isNaN(expiryTimestamp)) {
            console.log('Expiry timestamp is NaN');
            return res.status(400).json({ success: false, error: 'Invalid expiry date. Please request a new code.' });
        }
        
        if (now > expiryTimestamp) {
            console.log(`Token expired: ${now} > ${expiryTimestamp}`);
            // Clear expired token
            await supabase
                .from('agents')
                .update({
                    reset_token: null,
                    reset_token_expiry: null
                })
                .eq('id', agent.id);
            return res.status(400).json({ success: false, error: 'Reset code has expired. Please request a new one.' });
        }
        
        console.log('Token valid, resetting password...');
        
        // Hash new password
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password and clear reset token
        await supabase
            .from('agents')
            .update({
                password_hash: hashedPassword,
                reset_token: null,
                reset_token_expiry: null
            })
            .eq('id', agent.id);
        
        console.log('Password updated successfully');
        
        // Send confirmation email
        const { sendEmail } = require('../utils/emailService');
        const emailHtml = `
            <h2>Password Changed Successfully</h2>
            <p>Your password has been changed. You can now login with your new password.</p>
            <p>If you did not make this change, please contact support immediately.</p>
            <a href="/agent-login">Login Now →</a>
        `;
        
        await sendEmail(agent.email, 'Password Changed - RoomRateCompare', emailHtml, 'noreply');
        
        res.json({ success: true, message: 'Password reset successfully. You can now login.' });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ============ GET AGENT PROFILE ============
router.get('/profile/:id', authenticateAgent, async (req, res) => {
    const { id } = req.params;
    
    if (parseInt(id) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('id, name, email, phone, whatsapp_number, specialty, country, city, languages, services, bio, subscription_status, profile_photo')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        res.json({ success: true, agent: data });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ UPDATE AGENT PROFILE ============
router.put('/update-profile', authenticateAgent, async (req, res) => {
    const { agentId, name, phone, whatsapp_number, specialty, country, city, languages, services, bio } = req.body;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { error } = await supabase
            .from('agents')
            .update({
                name: name,
                phone: phone,
                whatsapp_number: whatsapp_number,
                specialty: specialty,
                country: country,
                city: city,
                languages: languages,
                services: services,
                bio: bio
            })
            .eq('id', agentId);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CHANGE PASSWORD ============
router.post('/change-password', authenticateAgent, async (req, res) => {
    const { agentId, currentPassword, newPassword } = req.body;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('password_hash')
            .eq('id', agentId)
            .single();
        
        if (!agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        const valid = await bcrypt.compare(currentPassword, agent.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Current password is incorrect' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const { error } = await supabase
            .from('agents')
            .update({ password_hash: hashedPassword })
            .eq('id', agentId);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET AGENT LEADS ============
router.get('/leads/:agentId', authenticateAgent, async (req, res) => {
    const { agentId } = req.params;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data, error } = await supabase
            .from('agent_leads')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, leads: data || [] });
    } catch (error) {
        console.error('Leads error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SUBMIT LEAD (CLIENT REQUEST) ============
// Submit lead from public profile
router.post('/submit-lead', async (req, res) => {
    const { agentId, clientName, clientEmail, clientPhone, clientWhatsapp, destination, checkin, checkout, budget, message } = req.body;
    
    console.log('Lead submission received:', { agentId, clientName, clientEmail, destination });
    
    try {
        // Check if agent exists
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, name, email')
            .eq('id', agentId)
            .single();
        
        if (agentError || !agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        // Save lead to database
        const { error: insertError } = await supabase
            .from('agent_leads')
            .insert([{
                agent_id: agentId,
                client_name: clientName,
                client_email: clientEmail,
                client_phone: clientPhone || null,
                client_whatsapp: clientWhatsapp || null,
                destination: destination,
                checkin: checkin || null,
                checkout: checkout || null,
                budget: budget || null,
                message: message || null,
                status: 'new'
            }]);
        
        if (insertError) throw insertError;
        
        // Send email notification to agent
        const { sendEmail, getNewLeadEmail } = require('../utils/emailService');
        const emailHtml = getNewLeadEmail(agent.name, {
            clientName, clientEmail, clientPhone, clientWhatsapp, destination, checkin, checkout, budget, message
        });
        
        await sendEmail(agent.email, '🔔 New Lead Request - RoomRateCompare', emailHtml, 'noreply');
        
        res.json({ success: true, message: 'Lead submitted successfully' });
        
    } catch (error) {
        console.error('Submit lead error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CANCEL SUBSCRIPTION ============
router.post('/cancel-subscription', authenticateAgent, async (req, res) => {
    const { agentId } = req.body;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('*')
            .eq('id', agentId)
            .single();
        
        if (!agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        if (agent.subscription_id) {
            try {
                await stripe.subscriptions.update(agent.subscription_id, {
                    cancel_at_period_end: true
                });
            } catch (stripeError) {
                console.error('Stripe error:', stripeError.message);
            }
        }
        
        await supabase
            .from('agents')
            .update({
                subscription_status: 'cancelled',
                subscription_cancelled: true,
                subscription_cancelled_at: new Date(),
                is_active: false
            })
            .eq('id', agentId);
        
        const { data: existingSub } = await supabase
            .from('agent_subscriptions')
            .select('id')
            .eq('agent_id', agentId)
            .eq('status', 'active')
            .order('id', { ascending: false })
            .limit(1);
        
        if (existingSub && existingSub.length > 0) {
            await supabase
                .from('agent_subscriptions')
                .update({ status: 'cancelled' })
                .eq('id', existingSub[0].id);
        }
        
        // Send cancellation email
        const cancellationEmail = getCancellationEmail(agent.name, new Date());
        await sendEmail(agent.email, 'Subscription Cancelled', cancellationEmail, 'noreply');
        
        // Notify admin
        await notifyAdmin('⚠️ Agent Subscription Cancelled', `Agent ${agent.name} (${agent.email}) has cancelled their subscription.`, {
            id: agent.id,
            name: agent.name,
            email: agent.email
        });
        
        res.json({ success: true, message: 'Subscription cancelled' });
        
    } catch (error) {
        console.error('Cancel error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete account
// Delete account
router.post('/delete-account', authenticateAgent, async (req, res) => {
    const { agentId } = req.body;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('*')
            .eq('id', agentId)
            .single();
        
        if (!agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        console.log(`🗑️ Deleting account for agent: ${agent.email}`);
        
        // Cancel Stripe subscription if exists
        if (agent.subscription_id) {
            try {
                const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                await stripe.subscriptions.cancel(agent.subscription_id);
                console.log('✅ Stripe subscription cancelled');
            } catch (stripeError) {
                console.error('Stripe error:', stripeError.message);
            }
        }
        
        // Soft delete - mark as deleted
        await supabase
            .from('agents')
            .update({
                is_active: false,
                status: 'deleted',
                account_deleted: true,
                account_deleted_at: new Date(),
                subscription_status: 'cancelled',
                email: `${agent.email}_deleted_${Date.now()}`
            })
            .eq('id', agentId);
        
        console.log('✅ Agent marked as deleted in database');
        
        // ============ SEND EMAIL NOTIFICATIONS ============
        const { sendEmail, getAdminNotificationEmail } = require('../utils/emailService');
        
        // 1. Send email to the agent confirming deletion
        console.log(`📧 Attempting to send deletion email to agent: ${agent.email}`);
        
        const agentEmailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { padding: 20px; background: #f9f9f9; }
                    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🗑️ Account Deleted</h1>
                    </div>
                    <div class="content">
                        <h2>Dear ${agent.name},</h2>
                        <p>Your RoomRateCompare agent account has been permanently deleted as requested.</p>
                        <p><strong>Account Details:</strong></p>
                        <ul>
                            <li>Email: ${agent.email}</li>
                            <li>Deletion Date: ${new Date().toLocaleString()}</li>
                        </ul>
                        <p>If you did not request this deletion, please contact us immediately at <a href="mailto:support@roomratecompare.com">support@roomratecompare.com</a>.</p>
                        <p>We're sad to see you go! If you change your mind, you can always register again.</p>
                    </div>
                    <div class="footer">
                        <p>RoomRateCompare - Compare & Book Hotels Worldwide</p>
                        <p>Need help? Contact us at support@roomratecompare.com</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const agentEmailResult = await sendEmail(agent.email, 'Account Deleted - RoomRateCompare', agentEmailHtml, 'noreply');
        console.log('Agent email result:', agentEmailResult);
        
        // 2. Send email to admin
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@roomratecompare.com';
        console.log(`📧 Attempting to send admin notification to: ${adminEmail}`);
        
        const adminEmailHtml = getAdminNotificationEmail(
            '🗑️ Agent Account Deleted',
            `An agent account has been permanently deleted.`,
            {
                name: agent.name,
                email: agent.email,
                id: agent.id
            }
        );
        
        const adminEmailResult = await sendEmail(adminEmail, 'Alert: Agent Account Deleted', adminEmailHtml, 'admin');
        console.log('Admin email result:', adminEmailResult);
        
        res.json({ success: true, message: 'Account deleted' });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ EXPORT LEADS AS CSV ============
router.get('/export-leads/:agentId', authenticateAgent, async (req, res) => {
    const { agentId } = req.params;
    const { format = 'csv' } = req.query;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        // Get all leads for this agent
        const { data: leads, error } = await supabase
            .from('agent_leads')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!leads || leads.length === 0) {
            return res.status(404).json({ success: false, error: 'No leads to export' });
        }
        
        // Prepare CSV data
        const headers = [
            'ID',
            'Client Name',
            'Client Email',
            'Client Phone',
            'Destination',
            'Check-in Date',
            'Check-out Date',
            'Budget',
            'Message',
            'Status',
            'Received Date'
        ];
        
        const rows = leads.map(lead => [
            lead.id,
            lead.client_name || '',
            lead.client_email || '',
            lead.client_phone || '',
            lead.destination || '',
            lead.checkin || '',
            lead.checkout || '',
            lead.budget || '',
            (lead.message || '').replace(/,/g, ';').replace(/\n/g, ' '),
            lead.status || 'new',
            new Date(lead.created_at).toLocaleString()
        ]);
        
        // Generate CSV content
        let csvContent = headers.join(',') + '\n';
        rows.forEach(row => {
            const escapedRow = row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
            csvContent += escapedRow + '\n';
        });
        
        // Set response headers for file download
        const filename = `leads_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        // Add BOM for UTF-8 (handles special characters)
        const bom = '\uFEFF';
        res.send(bom + csvContent);
        
    } catch (error) {
        console.error('Export leads error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ EXPORT LEADS AS EXCEL (JSON format) ============
router.get('/export-leads-json/:agentId', authenticateAgent, async (req, res) => {
    const { agentId } = req.params;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data: leads, error } = await supabase
            .from('agent_leads')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!leads || leads.length === 0) {
            return res.status(404).json({ success: false, error: 'No leads to export' });
        }
        
        const filename = `leads_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        res.json(leads);
        
    } catch (error) {
        console.error('Export leads error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ UPDATE LEAD STATUS ============
router.put('/update-lead-status/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const { status } = req.body;
    const agentId = req.agent.id;
    
    try {
        // Verify lead belongs to this agent
        const { data: lead, error: checkError } = await supabase
            .from('agent_leads')
            .select('agent_id')
            .eq('id', leadId)
            .single();
        
        if (checkError || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== agentId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        // Update status
        const { error } = await supabase
            .from('agent_leads')
            .update({ 
                status: status,
                updated_at: new Date()
            })
            .eq('id', leadId);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Status updated' });
        
    } catch (error) {
        console.error('Update lead status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ UPDATE LEAD STATUS ============
router.put('/update-lead-status/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const { status } = req.body;
    const agentId = req.agent.id;
    
    // Validate status
    const validStatuses = ['new', 'contacted', 'converted', 'lost'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    
    try {
        // Verify lead belongs to this agent
        const { data: lead, error: checkError } = await supabase
            .from('agent_leads')
            .select('agent_id')
            .eq('id', leadId)
            .single();
        
        if (checkError || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== parseInt(agentId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        // Update status
        const { error } = await supabase
            .from('agent_leads')
            .update({ 
                status: status,
                updated_at: new Date()
            })
            .eq('id', leadId);
        
        if (error) throw error;
        
        // If status is 'converted', maybe send a notification or log conversion
        if (status === 'converted') {
            console.log(`🎉 Lead ${leadId} converted by agent ${agentId}`);
            
            // Optional: Update agent stats for conversion rate
            // We can add a conversion counter to agents table later
        }
        
        res.json({ success: true, message: 'Status updated successfully' });
        
    } catch (error) {
        console.error('Update lead status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET LEAD STATISTICS ============
router.get('/lead-stats/:agentId', authenticateAgent, async (req, res) => {
    const { agentId } = req.params;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data: leads, error } = await supabase
            .from('agent_leads')
            .select('status')
            .eq('agent_id', agentId);
        
        if (error) throw error;
        
        const stats = {
            total: leads.length,
            new: leads.filter(l => l.status === 'new' || !l.status).length,
            contacted: leads.filter(l => l.status === 'contacted').length,
            converted: leads.filter(l => l.status === 'converted').length,
            lost: leads.filter(l => l.status === 'lost').length
        };
        
        stats.conversionRate = stats.total > 0 
            ? ((stats.converted / stats.total) * 100).toFixed(1) 
            : 0;
        
        res.json({ success: true, stats });
        
    } catch (error) {
        console.error('Lead stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET LEADS BY STATUS ============
router.get('/leads/:agentId/status/:status', authenticateAgent, async (req, res) => {
    const { agentId, status } = req.params;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        let query = supabase
            .from('agent_leads')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });
        
        if (status !== 'all') {
            query = query.eq('status', status);
        }
        
        const { data: leads, error } = await query;
        
        if (error) throw error;
        
        res.json({ success: true, leads: leads || [] });
        
    } catch (error) {
        console.error('Filter leads error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ADD/UPDATE LEAD NOTE ============
router.post('/lead-note/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const { note } = req.body;
    const agentId = req.agent.id;
    
    try {
        // Verify lead belongs to this agent
        const { data: lead, error: checkError } = await supabase
            .from('agent_leads')
            .select('agent_id')
            .eq('id', leadId)
            .single();
        
        if (checkError || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== parseInt(agentId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        // Update note
        const { error } = await supabase
            .from('agent_leads')
            .update({ 
                notes: note,
                updated_at: new Date()
            })
            .eq('id', leadId);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Note saved successfully' });
        
    } catch (error) {
        console.error('Save note error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET LEAD NOTE ============
router.get('/lead-note/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const agentId = req.agent.id;
    
    try {
        const { data: lead, error } = await supabase
            .from('agent_leads')
            .select('notes, agent_id')
            .eq('id', leadId)
            .single();
        
        if (error || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== parseInt(agentId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        res.json({ success: true, notes: lead.notes || '' });
        
    } catch (error) {
        console.error('Get note error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SAVE LEAD NOTE ============
router.post('/lead-note/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const { note } = req.body;
    const agentId = req.agent.id;
    
    try {
        const { data: lead, error: checkError } = await supabase
            .from('agent_leads')
            .select('agent_id')
            .eq('id', leadId)
            .single();
        
        if (checkError || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== parseInt(agentId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        const { error } = await supabase
            .from('agent_leads')
            .update({ 
                notes: note,
                updated_at: new Date()
            })
            .eq('id', leadId);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Note saved' });
        
    } catch (error) {
        console.error('Save note error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============ UPDATE LAST CONTACTED ============
router.post('/lead-contact/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const agentId = req.agent.id;
    
    try {
        const { data: lead, error: checkError } = await supabase
            .from('agent_leads')
            .select('agent_id')
            .eq('id', leadId)
            .single();
        
        if (checkError || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== parseInt(agentId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        const { error } = await supabase
            .from('agent_leads')
            .update({ 
                last_contacted: new Date(),
                updated_at: new Date()
            })
            .eq('id', leadId);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Contact time updated' });
        
    } catch (error) {
        console.error('Update contact error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET CHART DATA ============
router.get('/chart-data/:agentId', authenticateAgent, async (req, res) => {
    const { agentId } = req.params;
    
    if (parseInt(agentId) !== req.agent.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        // Get all leads for this agent
        const { data: leads, error } = await supabase
            .from('agent_leads')
            .select('created_at, status')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        // Prepare data for charts
        const last30Days = [];
        const leadsByDay = {};
        const statusCounts = { new: 0, contacted: 0, converted: 0, lost: 0 };
        
        // Get last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            last30Days.push(dateStr);
            leadsByDay[dateStr] = 0;
        }
        
        // Count leads by day and status
        leads.forEach(lead => {
            const dateStr = new Date(lead.created_at).toISOString().split('T')[0];
            if (leadsByDay[dateStr] !== undefined) {
                leadsByDay[dateStr]++;
            }
            
            const status = lead.status || 'new';
            if (statusCounts[status] !== undefined) {
                statusCounts[status]++;
            }
        });
        
        // Calculate conversion rate
        const total = statusCounts.new + statusCounts.contacted + statusCounts.converted + statusCounts.lost;
        const conversionRate = total > 0 ? ((statusCounts.converted / total) * 100).toFixed(1) : 0;
        
        // Calculate monthly trends (last 6 months)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyLeads = {};
        const now = new Date();
        
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(now.getMonth() - i);
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
            const monthName = months[date.getMonth()];
            monthlyLeads[monthName] = 0;
        }
        
        leads.forEach(lead => {
            const date = new Date(lead.created_at);
            const monthName = months[date.getMonth()];
            if (monthlyLeads[monthName] !== undefined) {
                monthlyLeads[monthName]++;
            }
        });
        
        res.json({
            success: true,
            chartData: {
                last30Days: last30Days,
                leadsByDay: Object.values(leadsByDay),
                statusCounts: statusCounts,
                conversionRate: conversionRate,
                monthlyLabels: Object.keys(monthlyLeads),
                monthlyData: Object.values(monthlyLeads)
            }
        });
        
    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SUBMIT RATING ============
router.post('/submit-rating', async (req, res) => {
    const { agentId, clientName, clientEmail, rating, review, leadId } = req.body;
    
    // Validate rating
    if (rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
    }
    
    try {
        // Check if agent exists
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, name')
            .eq('id', agentId)
            .single();
        
        if (agentError || !agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        // Insert rating
        const { data: ratingData, error } = await supabase
            .from('agent_ratings')
            .insert([{
                agent_id: agentId,
                client_name: clientName,
                client_email: clientEmail,
                rating: rating,
                review: review || null,
                lead_id: leadId || null,
                status: 'approved'
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            message: 'Thank you for your rating!',
            rating: ratingData
        });
        
    } catch (error) {
        console.error('Submit rating error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET AGENT RATINGS ============
router.get('/ratings/:agentId', async (req, res) => {
    const { agentId } = req.params;
    const { limit = 10 } = req.query;
    
    try {
        // Get ratings
        const { data: ratings, error } = await supabase
            .from('agent_ratings')
            .select('*')
            .eq('agent_id', agentId)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));
        
        if (error) throw error;
        
        // Get agent's average rating
        const { data: agent } = await supabase
            .from('agents')
            .select('avg_rating, total_ratings')
            .eq('id', agentId)
            .single();
        
        res.json({
            success: true,
            ratings: ratings || [],
            averageRating: agent?.avg_rating || 0,
            totalRatings: agent?.total_ratings || 0
        });
        
    } catch (error) {
        console.error('Get ratings error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET TOP RATED AGENTS ============
router.get('/top-rated', async (req, res) => {
    const { limit = 10 } = req.query;
    
    try {
        const { data: agents, error } = await supabase
            .from('agents')
            .select('id, name, email, specialty, avg_rating, total_ratings, profile_photo')
            .eq('status', 'approved')
            .eq('is_active', true)
            .gt('avg_rating', 0)
            .order('avg_rating', { ascending: false })
            .limit(parseInt(limit));
        
        if (error) throw error;
        
        res.json({ success: true, agents: agents || [] });
        
    } catch (error) {
        console.error('Get top rated error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ UPLOAD PROFILE PHOTO ============
// ============ PROFILE PHOTO UPLOAD ============
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/uploads/agents');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const agentId = req.agent.id;
        const ext = path.extname(file.originalname);
        cb(null, `agent_${agentId}_${Date.now()}${ext}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

// Upload profile photo
router.post('/upload-photo', authenticateAgent, upload.single('profilePhoto'), async (req, res) => {
    const agentId = req.agent.id;
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        // Get old photo to delete
        const { data: agent } = await supabase
            .from('agents')
            .select('profile_photo')
            .eq('id', agentId)
            .single();
        
        // Delete old photo if exists
        if (agent && agent.profile_photo) {
            const oldPhotoPath = path.join(__dirname, '../../public', agent.profile_photo);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }
        
        // Save photo URL to database
        const photoUrl = `/uploads/agents/${req.file.filename}`;
        
        const { error } = await supabase
            .from('agents')
            .update({ 
                profile_photo: photoUrl,
                photo_updated_at: new Date()
            })
            .eq('id', agentId);
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            photoUrl: photoUrl,
            message: 'Profile photo updated successfully'
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete profile photo
router.delete('/delete-photo', authenticateAgent, async (req, res) => {
    const agentId = req.agent.id;
    
    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('profile_photo')
            .eq('id', agentId)
            .single();
        
        if (agent && agent.profile_photo) {
            const photoPath = path.join(__dirname, '../../public', agent.profile_photo);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }
        
        const { error } = await supabase
            .from('agents')
            .update({ 
                profile_photo: null,
                photo_updated_at: new Date()
            })
            .eq('id', agentId);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Profile photo deleted' });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET LEAD NOTE ============
router.get('/lead-note/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const agentId = req.agent.id;
    
    try {
        const { data: lead, error } = await supabase
            .from('agent_leads')
            .select('notes, agent_id')
            .eq('id', leadId)
            .single();
        
        if (error || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== parseInt(agentId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        res.json({ success: true, notes: lead.notes || '' });
        
    } catch (error) {
        console.error('Get note error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SAVE LEAD NOTE ============
// Save lead note with moderation
router.post('/lead-note/:leadId', authenticateAgent, async (req, res) => {
    const { leadId } = req.params;
    const { note } = req.body;
    const agentId = req.agent.id;
    
    // Moderate the note content
    if (note) {
        const moderation = moderateContent(note);
        if (!moderation.isAppropriate) {
            return res.status(400).json({ 
                success: false, 
                error: moderation.reason 
            });
        }
    }
    
    try {
        const { data: lead, error: checkError } = await supabase
            .from('agent_leads')
            .select('agent_id')
            .eq('id', leadId)
            .single();
        
        if (checkError || !lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        
        if (lead.agent_id !== parseInt(agentId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        const { error } = await supabase
            .from('agent_leads')
            .update({ 
                notes: note,
                updated_at: new Date()
            })
            .eq('id', leadId);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Note saved' });
        
    } catch (error) {
        console.error('Save note error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============ SUBMIT LEAD (CLIENT REQUEST) ============
// Submit lead from public profile
router.post('/submit-lead', async (req, res) => {
    const { agentId, clientName, clientEmail, clientPhone, clientWhatsapp, destination, checkin, checkout, budget, message } = req.body;
    
    console.log('Lead submission received:', { agentId, clientName, clientEmail, destination });
    
    // ============ MODERATE THE MESSAGE CONTENT ============
    if (message) {
        const moderation = moderateContent(message);
        if (!moderation.isAppropriate) {
            return res.status(400).json({ 
                success: false, 
                error: moderation.reason 
            });
        }
    }
    
    // Also moderate the client name
    if (clientName) {
        const nameModeration = moderateContent(clientName);
        if (!nameModeration.isAppropriate) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please use a respectful name. Inappropriate language is not allowed.'
            });
        }
    }
    
    try {
        // Check if agent exists
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, name, email')
            .eq('id', agentId)
            .single();
        
        if (agentError || !agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        // Save lead to database
        const { error: insertError } = await supabase
            .from('agent_leads')
            .insert([{
                agent_id: agentId,
                client_name: clientName,
                client_email: clientEmail,
                client_phone: clientPhone || null,
                client_whatsapp: clientWhatsapp || null,
                destination: destination,
                checkin: checkin || null,
                checkout: checkout || null,
                budget: budget || null,
                message: message || null,
                status: 'new'
            }]);
        
        if (insertError) throw insertError;
        
        // Send email notification to agent
        const { sendEmail, getNewLeadEmail } = require('../utils/emailService');
        const emailHtml = getNewLeadEmail(agent.name, {
            clientName, clientEmail, clientPhone, clientWhatsapp, destination, checkin, checkout, budget, message
        });
        
        await sendEmail(agent.email, '🔔 New Lead Request - RoomRateCompare', emailHtml, 'noreply');
        
        res.json({ success: true, message: 'Lead submitted successfully' });
        
    } catch (error) {
        console.error('Submit lead error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;