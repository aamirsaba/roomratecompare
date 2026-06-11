require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const contactRouter = require('./api/contact');

const hotelsRouter = require('./api/hotels');
const chatRouter = require('./api/chat');
const stripeWebhook = require('./payment/stripe');
const agentsRouter = require('./api/agents');
const agentRegisterRouter = require('./api/agent-register');
const adminRouter = require('./api/admin');
const agentAuthRouter = require('./api/agent-auth');
const blogRouter = require('./api/blog');
// In server.js after server starts
const { generateSitemap } = require('./utils/sitemap');
generateSitemap();
const partnersRouter = require('./api/partners');
// Add near the top of server.js
const cron = require('node-cron');
const { monitorAndProcessLeads } = require('./cron/leadMonitorCron');




const app = express();

// Webhook needs raw body for Stripe
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
app.post('/api/agent-register/webhook', express.raw({ type: 'application/json' }), agentRegisterRouter);

// Regular middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Run lead monitor every 15 minutes
cron.schedule('*/15 * * * *', async () => {
    console.log('🕐 Running lead monitor cron job...');
    await monitorAndProcessLeads();
});

// Run performance metrics update hourly
cron.schedule('0 * * * *', async () => {
    console.log('📊 Updating agent performance metrics...');
    const { updateAgentPerformanceMetrics } = require('./cron/leadMonitorCron');
    await updateAgentPerformanceMetrics();
});


// Trust proxy for HTTPS detection
app.set('trust proxy', 1);

// API routes
app.use('/api/hotels', hotelsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/agent-register', agentRegisterRouter);
app.use('/api/admin', adminRouter);
app.use('/api/agent-auth', agentAuthRouter);
app.use('/api/blog', blogRouter);
app.use('/api/partners', partnersRouter);
app.use('/api/contact', contactRouter);


// Serve frontend

// Password reset page
app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/reset-password.html'));
});

// Legal pages
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

// ============ BLOG ROUTES - SPECIFIC ROUTES FIRST ============
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog/index.html'));
});

app.get('/blog/submit', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog/submit.html'));
});

app.get('/blog/edit/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog/edit.html'));
});

// Dynamic blog route - MUST BE LAST
app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog/post.html'));
});

// Admin blog management
app.get('/admin/blog-manage', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/blog-manage.html'));
});

app.get('/admin/blog-pending', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/blog-pending.html'));
});

app.get('/agent-profile', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agent-profile.html'));
});

app.get('/rate-agent', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/rate-agent.html'));
});

app.get('/agent-login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agent-login.html'));
});

app.get('/renew-subscription', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/renew-subscription.html'));
});

app.get('/agent-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agent-dashboard.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/login.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});

app.get('/agent-register', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agent-register.html'));
});

app.get('/admin/agents', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/agents.html'));
});

app.get('/admin/requests', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/requests.html'));
});

app.get('/agents', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agents.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/search', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/search.html'));
});

app.get('/hotel/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/hotel.html'));
});

app.get('/contact-agent', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/contact-agent.html'));
});

app.get('/partners', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/partners.html'));
});

app.get('/admin/partners', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/partners.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', brand: 'RoomRateCompare', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🏨 RoomRateCompare running on port', PORT);
  console.log('📍 Compare room rates at http://localhost:' + PORT);
});