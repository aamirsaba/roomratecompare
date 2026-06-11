const { sendEmail, notifyAdmin, getWelcomeEmail } = require('../utils/emailService');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const supabase = require('../db/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const REGISTRATION_FEE = 2500; // $25.00
const MONTHLY_FEE = 1000; // $10.00

// Step 1: Register agent
router.post('/register', async (req, res) => {
    const { 
        name, email, phone, whatsapp_number, company_name, specialty, bio, password,
        disclaimerAccepted
    } = req.body;
    
    console.log('📝 Registration request for:', email);
    
    if (!name || !email || !phone || !password) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    if (!disclaimerAccepted) {
        return res.status(400).json({ success: false, error: 'You must accept the disclaimer' });
    }
    
    try {
        const { data: existing } = await supabase
            .from('agents')
            .select('id')
            .eq('email', email)
            .single();
        
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const customer = await stripe.customers.create({
            email: email,
            name: name,
            metadata: { type: 'travel_agent' }
        });
        
        console.log('✅ Stripe customer created:', customer.id);
        
        const setupIntent = await stripe.setupIntents.create({
            customer: customer.id,
            payment_method_types: ['card'],
            usage: 'off_session'
        });
        
        // Save agent with status 'pending_payment'
        // In the /register endpoint, update the insert:
const { data: agent, error } = await supabase
    .from('agents')
    .insert([{
        name: name,
        email: email,
        phone: phone,
        whatsapp_number: whatsapp_number || null,
        company_name: company_name || null,
        specialty: specialty || null,
        bio: bio || null,
        password_hash: hashedPassword,
        status: 'pending_payment',
        stripe_customer_id: customer.id,
        registration_date: new Date(),
        disclaimer_accepted: true,
        is_independent: true,
        country: req.body.country || null,
        city: req.body.city || null,
        languages: req.body.languages || null,
        services: req.body.services || []
    }])
    .select()
    .single();

        if (error) throw error;
        
        res.json({ 
            success: true, 
            clientSecret: setupIntent.client_secret,
            agentId: agent.id
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Step 2: Confirm payment and AUTO-APPROVE agent
router.post('/confirm-payment', async (req, res) => {
    const { agentId, paymentMethodId } = req.body;
    
    console.log('💰 Confirming payment for agent:', agentId);
    
    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('*')
            .eq('id', agentId)
            .single();
        
        if (!agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        console.log('Agent found:', agent.id, agent.email, 'Current status:', agent.status);
        
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: agent.stripe_customer_id
        });
        
        await stripe.customers.update(agent.stripe_customer_id, {
            invoice_settings: {
                default_payment_method: paymentMethodId
            }
        });
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount: REGISTRATION_FEE,
            currency: 'usd',
            customer: agent.stripe_customer_id,
            payment_method: paymentMethodId,
            confirm: true,
            payment_method_types: ['card'],
            metadata: { agent_id: agentId, type: 'registration_fee' }
        });
        
        if (paymentIntent.status !== 'succeeded') {
            throw new Error('Payment failed: ' + paymentIntent.status);
        }
        
        console.log('✅ Registration fee paid');
        
        const product = await stripe.products.create({
            name: 'Travel Agent Monthly Subscription',
            description: 'Access to client leads and agent dashboard'
        });
        
        const price = await stripe.prices.create({
            product: product.id,
            unit_amount: MONTHLY_FEE,
            currency: 'usd',
            recurring: { interval: 'month' }
        });
        
        const subscription = await stripe.subscriptions.create({
            customer: agent.stripe_customer_id,
            items: [{ price: price.id }],
            trial_period_days: 30,
            metadata: { agent_id: agentId }
        });
        
        console.log('✅ Subscription created:', subscription.id);
// Send welcome email
const loginUrl = '/agent-login';
const welcomeHtml = getWelcomeEmail(agent.name, loginUrl);
await sendEmail(agent.email, 'Welcome to RoomRateCompare!', welcomeHtml, 'noreply');

// Notify admin
await notifyAdmin('🎉 New Agent Registered', `New agent ${agent.name} (${agent.email}) has registered and paid the registration fee.`, {
    id: agent.id,
    name: agent.name,
    email: agent.email
});        


        // UPDATE AGENT - FIXED QUERY
     // In the confirm-payment endpoint, change the update section to this:

const { data: updatedAgent, error: updateError } = await supabase
    .from('agents')
    .update({ 
        registration_fee_paid: true,
        status: 'approved',
        is_active: true,
        subscription_status: 'active',
        subscription_id: subscription.id
        // Removed stripe_payment_id since column doesn't exist
    })
    .eq('id', agentId)
    .select();
   
        if (updateError) {
            console.error('Update error:', updateError);
            throw new Error('Failed to update agent status: ' + updateError.message);
        }
        
        console.log('✅ Agent updated:', updatedAgent);
        
        await supabase
            .from('agent_subscriptions')
            .insert([{
                agent_id: agentId,
                stripe_subscription_id: subscription.id,
                status: 'active',
                amount: 10.00,
                current_period_start: new Date(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }]);
        
        console.log('✅ Agent automatically approved! Status changed to approved');
        
        res.json({ success: true, message: 'Payment successful! You are now an approved agent.' });
        
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all agents (Admin - still needed for management)
router.get('/admin/agents', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, agents: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all client requests (Admin)
router.get('/admin/requests', async (req, res) => {
    const adminToken = req.headers.authorization?.split(' ')[1];
    
    if (!adminToken) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data: requests, error } = await supabase
            .from('agent_leads')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, requests: requests || [] });
        
    } catch (error) {
        console.error('Get requests error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update agent status (Admin - for flagging/removing agents)
router.put('/admin/agents/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, flag_reason } = req.body;
    
    try {
        const updateData = { status: status };
        if (status === 'flagged') {
            updateData.is_flagged = true;
            updateData.flag_reason = flag_reason;
            updateData.is_active = false;
        } else if (status === 'approved') {
            updateData.is_active = true;
            updateData.is_flagged = false;
            updateData.flag_reason = null;
        } else if (status === 'suspended') {
            updateData.is_active = false;
        }
        
        await supabase
            .from('agents')
            .update(updateData)
            .eq('id', id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;