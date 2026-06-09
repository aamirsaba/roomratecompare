const express = require('express');
const router = express.Router();
const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ============ CONTENT MODERATION FUNCTION ============
async function moderateContent(message) {
    // First, check with simple profanity filter
    const profanityList = ['fuck', 'shit', 'damn', 'bitch', 'crap', 'asshole', 'bastard', 'whore', 'slut', 'dick', 'pussy', 'nigger', 'faggot', 'stupid', 'idiot'];
    const lowerMsg = message.toLowerCase();
    
    for (const badWord of profanityList) {
        if (lowerMsg.includes(badWord)) {
            return { 
                isAppropriate: false, 
                reason: 'Your message contains inappropriate language. Please keep conversations respectful.'
            };
        }
    }
    
    // If Groq API key is available, use AI for advanced moderation
    if (GROQ_API_KEY) {
        try {
            const prompt = `You are a content moderator. Analyze if this message contains profanity, hate speech, harassment, or inappropriate content. 
            Message: "${message}"
            Return ONLY JSON: {"isAppropriate": true or false, "reason": "explanation if inappropriate"} `;
            
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    max_tokens: 150
                },
                {
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );
            
            const result = JSON.parse(response.data.choices[0].message.content.trim());
            return {
                isAppropriate: result.isAppropriate,
                reason: result.reason || 'Inappropriate content detected'
            };
        } catch (error) {
            console.error('Groq moderation error:', error.message);
            // Fallback to simple filter
            return { isAppropriate: true };
        }
    }
    
    return { isAppropriate: true };
}

// ============ YOUR EXISTING FUNCTIONS ============
async function callGroq(prompt) {
    if (!GROQ_API_KEY) {
        console.log('⚠️ Groq API key missing - using fallback responses');
        return null;
    }
    
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 200
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Groq API Error:', error.message);
        return null;
    }
}

async function getChatReply(message) {
    // Simple rule-based fallback (works without API)
    const msg = message.toLowerCase();
    
    if (msg.includes('find hotel') || msg.includes('search hotel') || msg.includes('hotel in')) {
        let city = '';
        if (msg.includes('in ')) {
            city = msg.split('in ')[1].split(' ')[0];
        }
        if (city) {
            return `🔍 I'll help you find hotels in ${city}! Use the search box above or <a href="/search?city=${encodeURIComponent(city)}">click here to search</a>`;
        }
        return "Please tell me which city you want to search. Example: 'Find hotels in Dubai'";
    }
    
    if (msg.includes('best hotel') || msg.includes('top hotel')) {
        return "🏨 For the best hotels, I recommend checking 5-star properties. Use our search to compare prices from Booking.com, Agoda, and Expedia!";
    }
    
    if (msg.includes('cheap') || msg.includes('budget')) {
        return "💰 Looking for budget hotels? Try sorting by price (lowest first) in search results. You can also look for 2-3 star hotels for better rates.";
    }
    
    if (msg.includes('help')) {
        return "I can help you:<br>• Search hotels in any city<br>• Find best deals<br>• Compare prices<br>Just say 'Find hotels in London' or ask me a question!";
    }
    
    // Try Groq API if available
    if (GROQ_API_KEY) {
        const prompt = `You are a helpful hotel assistant for RoomRateCompare.com. Answer this briefly: "${message}" Keep response under 100 words.`;
        const aiReply = await callGroq(prompt);
        if (aiReply) return aiReply;
    }
    
    return "I'm your hotel assistant. Try saying 'Find hotels in Dubai', 'Best hotels in Paris', or 'Budget hotels in London'";
}

// ============ MAIN CHAT ENDPOINT WITH MODERATION ============
router.post('/', async (req, res) => {
    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ reply: 'Please ask me something!' });
    }
    
    // FIRST: Moderate the content
    const moderation = await moderateContent(message);
    
    if (!moderation.isAppropriate) {
        return res.json({ 
            reply: `⚠️ ${moderation.reason || 'Your message was flagged as inappropriate. Please keep conversations respectful.'}`
        });
    }
    
    // SECOND: Get chat reply
    try {
        const reply = await getChatReply(message);
        res.json({ reply: reply });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.json({ reply: "I can help you find hotels! Try searching for a city above or ask me something specific." });
    }
});

module.exports = router;