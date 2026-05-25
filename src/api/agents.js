// src/api/agents.js
const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// Submit a travel agent request
router.post('/request', async (req, res) => {
    console.log('📝 Agent request received:', req.body);
    
    const { name, email, destination, checkin, checkout, budget, message, agentId } = req.body;
    
    // Validate required fields
    if (!name || !email || !destination || !checkin || !checkout) {
        console.log('❌ Missing fields:', { name, email, destination, checkin, checkout });
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields. Please fill in all required information.' 
        });
    }
    
    try {
        // Insert into Supabase
        const { data, error } = await supabase
            .from('agent_requests')
            .insert([
                {
                    name: name,
                    email: email,
                    destination: destination,
                    checkin: checkin,
                    checkout: checkout,
                    budget: budget || null,
                    message: message || null,
                    agent_id: agentId || null,
                    status: 'pending',
                    created_at: new Date()
                }
            ]);
        
        if (error) {
            console.error('❌ Supabase error:', error);
            throw error;
        }
        
        console.log('✅ Request saved successfully for:', name);
        
        res.json({ 
            success: true, 
            message: 'Thank you! A travel agent will contact you within 24 hours.' 
        });
        
    } catch (error) {
        console.error('❌ Error saving request:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error. Please try again later.' 
        });
    }
});

// Get all requests (admin only - protect this later)
router.get('/requests', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agent_requests')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, requests: data });
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;