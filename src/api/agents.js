const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// ============ GET ALL AGENTS (PUBLIC) ============
router.get('/list', async (req, res) => {
    console.log('GET /api/agents/list');
    
    try {
        const { data: agents, error } = await supabase
            .from('agents')
            .select('id, name, email, phone, whatsapp_number, specialty, bio, avg_rating, total_ratings, profile_photo')
            .eq('status', 'approved');
        
        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
        
        console.log(`Found ${agents?.length || 0} approved agents`);
        res.json({ success: true, agents: agents || [] });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GET AGENT BY ID ============
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`GET /api/agents/${id}`);
    
    try {
        const { data: agent, error } = await supabase
            .from('agents')
            .select('id, name, email, phone, whatsapp_number, specialty, bio, avg_rating, total_ratings, profile_photo')
            .eq('id', parseInt(id))
            .single();
        
        if (error || !agent) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        
        res.json({ success: true, agent });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;