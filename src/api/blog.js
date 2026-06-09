// src/api/blog.js
const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { reviewContent } = require('../utils/contentModerator');
const { sendEmail } = require('../utils/emailService');

// Helper functions
function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function generateMetaDescription(content, maxLength = 160) {
    const plainText = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
    return plainText.length > maxLength ? plainText.substring(0, maxLength) + '...' : plainText;
}

// SIMPLE EDIT TOKEN FUNCTIONS
function generateEditToken(postId) {
    const secret = process.env.ADMIN_SECRET || 'roomratecompare_secret';
    return Buffer.from(`${postId}-${secret}`).toString('base64').substring(0, 32);
}

function verifyEditToken(postId, token) {
    const expectedToken = generateEditToken(postId);
    return token === expectedToken || token === process.env.ADMIN_SECRET;
}

// Submit new blog post
router.post('/submit', async (req, res) => {
    const { title, content, category, authorName, authorEmail, tags, featuredImage } = req.body;
    
    if (!title || !content || !authorName || !authorEmail) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const wordCount = content.split(/\s+/).length;
    if (wordCount < 500) {
        return res.status(400).json({ success: false, error: 'Article must be at least 500 words' });
    }
    
    try {
        // Generate slug
        let slug = generateSlug(title);
        let counter = 1;
        let exists = true;
        while (exists) {
            const { data } = await supabase.from('blog_posts').select('id').eq('slug', slug).single();
            if (!data) {
                exists = false;
            } else {
                slug = `${generateSlug(title)}-${counter}`;
                counter++;
            }
        }
        
        // AI Content Review
        console.log(`🤖 AI reviewing article: ${title}`);
        const aiReview = await reviewContent(title, content, category);
        
        let status = 'pending';
        if (aiReview.verdict === 'approve') {
            status = 'published';
        } else if (aiReview.verdict === 'reject') {
            status = 'rejected';
        } else {
            status = 'pending_review';
        }
        
        // Save to database
        const { data: post, error } = await supabase
            .from('blog_posts')
            .insert([{
                title: title,
                slug: slug,
                content: content,
                excerpt: content.substring(0, 300),
                featured_image: featuredImage || null,
                author_name: authorName,
                author_email: authorEmail,
                category: category || 'general',
                tags: tags || [],
                status: status,
                ai_score: Math.round(aiReview.overall_score || 0),
                ai_feedback: aiReview.feedback,
                published_at: status === 'published' ? new Date() : null
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        // Generate edit token and DYNAMIC URLs
        const editToken = generateEditToken(post.id);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const editUrl = `${baseUrl}/blog/edit/${post.id}?id=${post.id}&token=${editToken}`;
        const viewUrl = `${baseUrl}/blog/${slug}`;
        
        // Send email with AI feedback
        let emailSubject = '';
        let emailContent = '';
        
        if (status === 'published') {
            emailSubject = 'Your Article Has Been Published! 🎉';
            emailContent = `
                <h2 style="color: #4caf50;">✅ Your Article Has Been Published!</h2>
                <p>Dear ${authorName},</p>
                <p>Great news! Your article "<strong>${title}</strong>" has been published on RoomRateCompare.</p>
                ${aiReview.feedback ? `<p><strong>🤖 AI Review Feedback:</strong> ${aiReview.feedback}</p>` : ''}
                <p><strong>📖 Read your article:</strong> <a href="${viewUrl}">Click here</a></p>
                <p><strong>✏️ Edit your article:</strong> <a href="${editUrl}">Click here to edit</a></p>
            `;
        } else if (status === 'rejected') {
            emailSubject = 'Your Article Needs Revision';
            emailContent = `
                <h2 style="color: #f44336;">❌ Your Article Needs Revision</h2>
                <p>Dear ${authorName},</p>
                <p>Thank you for submitting "<strong>${title}</strong>" to RoomRateCompare.</p>
                <p><strong>🤖 AI Review Feedback:</strong> ${aiReview.feedback || 'Please review your article and make necessary changes.'}</p>
                <p><strong>✏️ Edit & Resubmit:</strong> <a href="${editUrl}">Click here to edit your article</a></p>
            `;
        } else {
            emailSubject = 'Your Article Has Been Submitted for Review';
            emailContent = `
                <h2 style="color: #ff9800;">🟡 Your Article Has Been Submitted for Review</h2>
                <p>Dear ${authorName},</p>
                <p>Thank you for submitting "<strong>${title}</strong>" to RoomRateCompare.</p>
                ${aiReview.feedback ? `<p><strong>🤖 AI Suggestions:</strong> ${aiReview.feedback}</p>` : ''}
                <p><strong>✏️ Edit your article:</strong> <a href="${editUrl}">Click here to edit</a></p>
            `;
        }
        
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #e67e22; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1>RoomRateCompare</h1></div>
                    <div class="content">${emailContent}</div>
                    <div class="footer"><p>RoomRateCompare - Compare & Book Hotels Worldwide</p></div>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(authorEmail, emailSubject, emailHtml, 'noreply');
        
        res.json({ 
            success: true, 
            post: post,
            review: aiReview,
            editToken: editToken,
            editUrl: editUrl,
            message: status === 'published' ? 'Article published!' : 'Article submitted for review'
        });
        
    } catch (error) {
        console.error('Blog submission error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get article for editing
router.get('/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { token } = req.query;
    
    console.log(`📝 Edit request for article ${id}`);
    
    try {
        const { data: post, error } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error || !post) {
            return res.status(404).json({ success: false, error: 'Article not found' });
        }
        
        if (!verifyEditToken(parseInt(id), token)) {
            console.log(`❌ Invalid token for article ${id}`);
            return res.status(403).json({ success: false, error: 'Invalid edit token' });
        }
        
        console.log(`✅ Edit token verified for article ${id}`);
        res.json({ success: true, post: post });
        
    } catch (error) {
        console.error('Get edit error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update article with AI re-review
router.put('/update/:id', async (req, res) => {
    const { id } = req.params;
    const { title, content, category, token, featuredImage } = req.body;

    try {
        const { data: existing, error: fetchError } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('id', id)
            .single();
        
        if (fetchError || !existing) {
            return res.status(404).json({ success: false, error: 'Article not found' });
        }
        
        if (!verifyEditToken(parseInt(id), token)) {
            return res.status(403).json({ success: false, error: 'Invalid edit token' });
        }
        
        const wordCount = content.split(/\s+/).length;
        if (wordCount < 500) {
            return res.status(400).json({ success: false, error: 'Article must be at least 500 words' });
        }
        
        console.log(`🤖 AI re-reviewing edited article: ${title}`);
        const aiReview = await reviewContent(title, content, existing.category);
        
        let status = existing.status;
        if (aiReview.verdict === 'approve') {
            status = 'published';
        } else if (aiReview.verdict === 'reject') {
            status = 'rejected';
        } else {
            status = 'pending_review';
        }
        
        const updateData = {
            title: title,
            content: content,
            category: category || existing.category,
            status: status,
            ai_score: Math.round(aiReview.overall_score || 0),
            ai_feedback: aiReview.feedback,
            updated_at: new Date(),
            published_at: status === 'published' ? new Date() : existing.published_at
        };
        
        if (featuredImage !== undefined) {
            updateData.featured_image = featuredImage;
        }
        
        const { error: updateError } = await supabase
            .from('blog_posts')
            .update(updateData)
            .eq('id', id);
        
        if (updateError) throw updateError;
        
        if (status === 'published') {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const viewUrl = `${baseUrl}/blog/${existing.slug}`;
            const emailHtml = `<h2>Your Article Has Been Updated! 🎉</h2>
                <p>Dear ${existing.author_name},</p>
                <p>Your edited version of "${title}" has been published.</p>
                <p><a href="${viewUrl}">View Article</a></p>`;
            await sendEmail(existing.author_email, 'Article Updated - RoomRateCompare', emailHtml, 'noreply');
        }
        
        res.json({ 
            success: true, 
            review: aiReview,
            status: status,
            message: status === 'published' ? 'Article updated and published!' : 'Article update submitted for review'
        });
        
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all published blog posts
router.get('/posts', async (req, res) => {
    const { category, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        let query = supabase.from('blog_posts').select('*', { count: 'exact' }).eq('status', 'published').order('published_at', { ascending: false });
        if (category && category !== 'all') query = query.eq('category', category);
        
        const { data: posts, error, count } = await query.range(offset, offset + parseInt(limit) - 1);
        if (error) throw error;
        
        res.json({ success: true, posts: posts || [], total: count || 0, page: parseInt(page), totalPages: Math.ceil((count || 0) / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single blog post by slug
router.get('/post/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const { data: post, error } = await supabase.from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').single();
        if (error || !post) return res.status(404).json({ success: false, error: 'Post not found' });
        
        await supabase.from('blog_posts').update({ views: (post.views || 0) + 1 }).eq('id', post.id);
        res.json({ success: true, post: { ...post, views: (post.views || 0) + 1 } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get all articles
router.get('/admin/all', async (req, res) => {
    const adminToken = req.headers.authorization?.split(' ')[1];
    if (adminToken !== process.env.ADMIN_SECRET) return res.status(403).json({ success: false, error: 'Unauthorized' });
    
    try {
        const { data: posts, error } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, posts: posts || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Approve or reject post
router.put('/admin/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const adminToken = req.headers.authorization?.split(' ')[1];
    if (adminToken !== process.env.ADMIN_SECRET) return res.status(403).json({ success: false, error: 'Unauthorized' });
    
    try {
        const { data: post } = await supabase.from('blog_posts').select('*').eq('id', id).single();
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        
        const updateData = { status: status };
        if (status === 'published') updateData.published_at = new Date();
        
        await supabase.from('blog_posts').update(updateData).eq('id', id);
        
        const editToken = generateEditToken(post.id);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const editUrl = `${baseUrl}/blog/edit/${post.id}?id=${post.id}&token=${editToken}`;
        const viewUrl = `${baseUrl}/blog/${post.slug}`;
        
        if (status === 'published') {
            const emailHtml = `
                <h2 style="color: #4caf50;">✅ Your Article Has Been Published!</h2>
                <p>Dear ${post.author_name},</p>
                <p>Your article "${post.title}" has been published.</p>
                <p><a href="${viewUrl}">View Article</a></p>
                <p><strong>✏️ Edit:</strong> <a href="${editUrl}">Click here to edit</a></p>`;
            await sendEmail(post.author_email, 'Your Article is Published - RoomRateCompare', emailHtml, 'noreply');
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Like a post
router.post('/:id/like', async (req, res) => {
    const { id } = req.params;
    try {
        const { data: post } = await supabase.from('blog_posts').select('likes').eq('id', id).single();
        await supabase.from('blog_posts').update({ likes: (post?.likes || 0) + 1 }).eq('id', id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Request edit link via email
router.post('/request-edit-link', async (req, res) => {
    const { postId, email } = req.body;
    
    try {
        const { data: post, error } = await supabase.from('blog_posts').select('*').eq('id', postId).single();
        if (error || !post) return res.status(404).json({ success: false, error: 'Article not found' });
        
        if (post.author_email.toLowerCase() !== email.toLowerCase()) {
            return res.status(403).json({ success: false, error: 'Email does not match the author' });
        }
        
        const editToken = generateEditToken(post.id);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const editUrl = `${baseUrl}/blog/edit/${post.id}?id=${post.id}&token=${editToken}`;
        
        const emailHtml = `<h2>Edit Your Article</h2><p>Dear ${post.author_name},</p><p>You requested an edit link for your article "${post.title}".</p><p><strong>✏️ Edit:</strong> <a href="${editUrl}">Click here to edit</a></p>`;
        await sendEmail(email, 'Edit Your Article - RoomRateCompare', emailHtml, 'noreply');
        
        res.json({ success: true, message: 'Edit link sent to your email' });
    } catch (error) {
        console.error('Request edit link error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Image upload
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../public/uploads/blog');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'blog-' + uniqueSuffix + path.extname(file.originalname));
    }
});

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

async function moderateImage(imagePath) {
    const stats = fs.statSync(imagePath);
    if (stats.size > 5 * 1024 * 1024) {
        return { safe: false, reason: 'Image too large (max 5MB)' };
    }
    return { safe: true, reason: null };
}

router.post('/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image uploaded' });
        }
        
        const moderation = await moderateImage(req.file.path);
        if (!moderation.safe) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, error: `Image rejected: ${moderation.reason}` });
        }
        
        const optimizedPath = req.file.path.replace(/\.\w+$/, '-optimized.jpg');
        await sharp(req.file.path).resize(800, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(optimizedPath);
        fs.unlinkSync(req.file.path);
        
        const imageUrl = `/uploads/blog/${path.basename(optimizedPath)}`;
        res.json({ success: true, imageUrl: imageUrl });
        
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;