// src/utils/aiChatbot.js
const Groq = require('groq-sdk');

let groq = null;

function initGroq() {
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('✅ Groq AI initialized for chatbot');
        return true;
    }
    console.log('⚠️ Groq API not configured - using fallback responses');
    return false;
}

async function getChatResponse(message, context = {}) {
    if (!groq) {
        initGroq();
        if (!groq) {
            return getFallbackResponse(message, context);
        }
    }
    
    const prompt = `You are a helpful travel assistant for RoomRateCompare, a hotel comparison website.
    
Context: ${JSON.stringify(context)}

User question: ${message}

Instructions:
1. Be helpful and friendly
2. If the user asks about hotels, suggest using the search feature
3. If the user has spelling mistakes, correct them politely
4. Keep responses concise (max 150 words)
5. Use emojis occasionally
6. If you don't know something, say so honestly

Respond in a natural, conversational way.`;

    try {
        const response = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.1-70b-versatile",
            temperature: 0.7,
            max_tokens: 300,
        });
        
        return response.choices[0].message.content;
        
    } catch (error) {
        console.error('Groq error:', error);
        return getFallbackResponse(message, context);
    }
}

function getFallbackResponse(message, context) {
    const msg = message.toLowerCase();
    
    // Spelling correction suggestions
    const corrections = {
        'dubia': 'Dubai',
        'dubay': 'Dubai',
        'paris': 'Paris',
        'london': 'London',
        'newyork': 'New York',
        'nyc': 'New York',
        'tokio': 'Tokyo',
        'singapor': 'Singapore',
        'bangkok': 'Bangkok',
        'istanbul': 'Istanbul'
    };
    
    let corrected = false;
    let correctedCity = '';
    for (const [wrong, correct] of Object.entries(corrections)) {
        if (msg.includes(wrong)) {
            corrected = true;
            correctedCity = correct;
            break;
        }
    }
    
    if (correctedCity) {
        return `🔍 Did you mean **${correctedCity}**? You can search for hotels in ${correctedCity} using the search box above! ✈️`;
    }
    
    if (msg.includes('hotel') || msg.includes('stay') || msg.includes('booking')) {
        return `🏨 I can help you find hotels! Just use the search box above to compare rates from Booking.com, Agoda, and Expedia. What city are you interested in?`;
    }
    
    if (msg.includes('flight')) {
        return `✈️ For flights, I recommend checking our affiliate partners like Kiwi.com and Aviasales. Use the search box to find hotels first!`;
    }
    
    if (msg.includes('visa')) {
        return `🛂 Visa requirements vary by country. Please check with your local embassy or a travel agent for specific visa information.`;
    }
    
    if (msg.includes('cheap') || msg.includes('budget')) {
        return `💰 Looking for budget options? Try searching for 2-3 star hotels or using our filters to sort by price (lowest first)!`;
    }
    
    if (msg.includes('best') || msg.includes('top')) {
        return `⭐ For the best hotels, I recommend checking 4-5 star properties with high guest ratings. Use our search to compare prices!`;
    }
    
    return `👋 Hi! I'm your travel assistant. You can ask me about hotels, destinations, or get help with spelling. Try saying "Find hotels in Dubai" or "Best hotels in Paris"!`;
}

module.exports = { initGroq, getChatResponse };