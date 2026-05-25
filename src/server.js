require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const hotelsRouter = require('./api/hotels');
const chatRouter = require('./api/chat');
const stripeWebhook = require('./payment/stripe');
const agentsRouter = require('./api/agents');


const app = express();

// Webhook needs raw body for Stripe
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

// Regular middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/hotels', hotelsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/agents', agentsRouter);

// Serve frontend

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', brand: 'RoomRateCompare', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🏨 RoomRateCompare running on port', PORT);
  console.log('📍 Compare room rates at http://localhost:' + PORT);
});