const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Admin login attempt:', email);
    
    try {
        // Get admin from database
        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email)
            .single();
        
        if (!admin) {
            console.log('Admin not found:', email);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        // Verify password
        const valid = await bcrypt.compare(password, admin.password_hash);
        if (!valid) {
            console.log('Invalid password for:', email);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        // Generate token
        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: 'admin' },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        
        console.log('Admin login successful:', email);
        res.json({ success: true, token: token });
        
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;