require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const contactRouter = require('./api/contact');

const hotelsRouter = require('./api/hotels');
const chatRouter = require('./api/chat');
const stripeWebhook = require('./payment/stripe');
const agentsRouter = require('./api/agents');
const agentRegisterRouter = require('./api/agent-register');
const adminRouter = require('./api/admin');
const agentAuthRouter = require('./api/agent-auth');
const blogRouter = require('./api/blog');
const partnersRouter = require('./api/partners');

// Import cron jobs
const { monitorAndProcessLeads, updateAgentPerformanceMetrics } = require('./cron/leadMonitorCron');

// Generate sitemap
const { generateSitemap } = require('./utils/sitemap');

const app = express();

// Webhook needs raw body for Stripe
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.post('/api/agent-register/webhook', express.raw({ type: 'application/json' }), agentRegisterRouter);

// Regular middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Trust proxy for HTTPS detection
app.set('trust proxy', 1);

// ============ CRON JOBS ============
// Run lead monitor every 15 minutes
cron.schedule('*/15 * * * *', async () => {
    console.log('🕐 Running lead monitor cron job...');
    try {
        await monitorAndProcessLeads();
    } catch (error) {
        console.error('Cron error:', error);
    }
});

// Run performance metrics update hourly
cron.schedule('0 * * * *', async () => {
    console.log('📊 Updating agent performance metrics...');
    try {
        await updateAgentPerformanceMetrics();
    } catch (error) {
        console.error('Metrics update error:', error);
    }
});

// Generate sitemap daily at 2 AM
cron.schedule('0 2 * * *', async () => {
    console.log('🗺️ Generating sitemap...');
    try {
        await generateSitemap();
        console.log('✅ Sitemap generated');
    } catch (error) {
        console.error('Sitemap error:', error);
    }
});

// ============ API ROUTES ============
app.use('/api/hotels', hotelsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/agent-register', agentRegisterRouter);
app.use('/api/admin', adminRouter);
app.use('/api/agent-auth', agentAuthRouter);
app.use('/api/blog', blogRouter);
app.use('/api/partners', partnersRouter);
app.use('/api/contact', contactRouter);

// ============ FRONTEND ROUTES ============

// Auth & Legal pages
app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/reset-password.html'));
});
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/privacy.html'));
});
app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/terms.html'));
});
app.get('/refund', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/refund.html'));
});
app.get('/cookie-policy', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/cookie-policy.html'));
});
app.get('/affiliate-disclosure', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/affiliate-disclosure.html'));
});
app.get('/disclaimer', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/disclaimer.html'));
});
app.get('/agent-agreement', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/agent-agreement.html'));
});
app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/contact.html'));
});

// Blog routes
app.get('/blog', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/blog/index.html'));
});
app.get('/blog/submit', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/blog/submit.html'));
});
app.get('/blog/edit/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/blog/edit.html'));
});
app.get('/blog/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/blog/post.html'));
});

// Admin routes
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/login.html'));
});
app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});
app.get('/admin/agents', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/agents.html'));
});
app.get('/admin/requests', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/requests.html'));
});
app.get('/admin/blog-manage', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/blog-manage.html'));
});
app.get('/admin/blog-pending', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/blog-pending.html'));
});
app.get('/admin/partners', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/partners.html'));
});

// Agent routes
app.get('/agent-login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/agent-login.html'));
});
app.get('/agent-register', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/agent-register.html'));
});
app.get('/agent-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/agent-dashboard.html'));
});
app.get('/agent-profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/agent-profile.html'));
});
app.get('/renew-subscription', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/renew-subscription.html'));
});
app.get('/agents', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/agents.html'));
});
app.get('/rate-agent', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/rate-agent.html'));
});

// Main site routes
app.get('/partners', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/partners.html'));
});
app.get('/contact-agent', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/contact-agent.html'));
});
app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/search.html'));
});
app.get('/hotel/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/hotel.html'));
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Generate sitemap on startup
generateSitemap().catch(console.error);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', brand: 'RoomRateCompare', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('✅ Email transporter initialized');
    console.log('✅ Supabase connected for RoomRateCompare');
    console.log('⚠️ Twilio not configured - WhatsApp messages will be logged only');
    console.log(`🏨 RoomRateCompare running on port ${PORT}`);
    console.log(`📍 Compare room rates at http://localhost:${PORT}`);
    console.log('✅ Sitemap generated');
});