// src/api/partners.js
const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Generate slug from name
function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

// ============ PUBLIC ENDPOINTS ============

// GET all active partners (public)
router.get('/', async (req, res) => {
    const { category } = req.query;
    
    try {
        let query = supabase
            .from('partners')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .order('name', { ascending: true });
        
        if (category && category !== 'all') {
            // Check if category exists in categories array
            query = query.contains('categories', [category]);
        }
        
        const { data: partners, error } = await query;
        
        if (error) throw error;
        res.json({ success: true, partners: partners || [] });
        
    } catch (error) {
        console.error('Get partners error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET partner by slug (public)
router.get('/:slug', async (req, res) => {
    const { slug } = req.params;
    
    try {
        const { data: partner, error } = await supabase
            .from('partners')
            .select('*')
            .eq('slug', slug)
            .eq('is_active', true)
            .single();
        
        if (error || !partner) {
            return res.status(404).json({ success: false, error: 'Partner not found' });
        }
        
        res.json({ success: true, partner: partner });
        
    } catch (error) {
        console.error('Get partner error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Track affiliate click
router.post('/click/:id', async (req, res) => {
    const { id } = req.params;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    
    try {
        // First, get current clicks
        const { data: partner, error: fetchError } = await supabase
            .from('partners')
            .select('clicks')
            .eq('id', id)
            .single();
        
        if (fetchError) throw fetchError;
        
        const currentClicks = partner?.clicks || 0;
        
        // Update click count
        const { error: updateError } = await supabase
            .from('partners')
            .update({ clicks: currentClicks + 1 })
            .eq('id', id);
        
        if (updateError) throw updateError;
        
        // Log click (optional - create table if you want)
        // await supabase.from('partner_clicks').insert([{ partner_id: id, ip_address: ip }]);
        
        console.log(`📊 Click tracked for partner ${id} (Total: ${currentClicks + 1})`);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Track click error:', error);
        res.json({ success: false, error: error.message });
    }
});

// ============ ADMIN ONLY ENDPOINTS ============

// Logo upload configuration
const logoStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../public/uploads/partners');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'partner-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const logoUpload = multer({
    storage: logoStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Upload logo endpoint
router.post('/upload-logo', logoUpload.single('logo'), async (req, res) => {
    const adminToken = req.headers.authorization?.split(' ')[1];
    if (adminToken !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        const logoUrl = `/uploads/partners/${req.file.filename}`;
        res.json({ success: true, logoUrl: logoUrl });
        
    } catch (error) {
        console.error('Logo upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET all partners (admin)
router.get('/admin/all', async (req, res) => {
    const adminToken = req.headers.authorization?.split(' ')[1];
    if (adminToken !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { data: partners, error } = await supabase
            .from('partners')
            .select('*')
            .order('display_order', { ascending: true });
        
        if (error) throw error;
        res.json({ success: true, partners: partners || [] });
        
    } catch (error) {
        console.error('Get all partners error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// CREATE partner (admin)
router.post('/admin', async (req, res) => {
    const adminToken = req.headers.authorization?.split(' ')[1];
    if (adminToken !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    const { name, logo, description, categories, reward_rate, cookie_days, affiliate_link, is_hot, display_order } = req.body;
    
    if (!name || !affiliate_link) {
        return res.status(400).json({ success: false, error: 'Name and affiliate link required' });
    }
    
    if (!categories || categories.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one category required' });
    }
    
    try {
        const slug = generateSlug(name);
        
        const { data: partner, error } = await supabase
            .from('partners')
            .insert([{
                name: name,
                slug: slug,
                logo: logo || null,
                description: description || null,
                categories: categories,
                reward_rate: reward_rate || null,
                cookie_days: cookie_days || 30,
                affiliate_link: affiliate_link,
                is_hot: is_hot || false,
                display_order: display_order || 0,
                is_active: true
            }])
            .select()
            .single();
        
        if (error) throw error;
        res.json({ success: true, partner: partner });
        
    } catch (error) {
        console.error('Create partner error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// UPDATE partner (admin)
router.put('/admin/:id', async (req, res) => {
    const adminToken = req.headers.authorization?.split(' ')[1];
    if (adminToken !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const { name, logo, description, categories, reward_rate, cookie_days, affiliate_link, is_hot, display_order, is_active } = req.body;
    
    try {
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (logo !== undefined) updateData.logo = logo;
        if (description !== undefined) updateData.description = description;
        if (categories !== undefined) updateData.categories = categories;
        if (reward_rate !== undefined) updateData.reward_rate = reward_rate;
        if (cookie_days !== undefined) updateData.cookie_days = cookie_days;
        if (affiliate_link !== undefined) updateData.affiliate_link = affiliate_link;
        if (is_hot !== undefined) updateData.is_hot = is_hot;
        if (display_order !== undefined) updateData.display_order = display_order;
        if (is_active !== undefined) updateData.is_active = is_active;
        
        if (name) updateData.slug = generateSlug(name);
        
        const { error } = await supabase
            .from('partners')
            .update(updateData)
            .eq('id', id);
        
        if (error) throw error;
        res.json({ success: true });
        
    } catch (error) {
        console.error('Update partner error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE partner (admin)
router.delete('/admin/:id', async (req, res) => {
    const adminToken = req.headers.authorization?.split(' ')[1];
    if (adminToken !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    
    try {
        const { error } = await supabase
            .from('partners')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        res.json({ success: true });
        
    } catch (error) {
        console.error('Delete partner error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;