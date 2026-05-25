// src/utils/groqService.js
const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function callGroq(prompt) {
    if (!GROQ_API_KEY) {
        console.log('⚠️ Groq API key missing');
        return null;
    }
    
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama3-8b-8192',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 200
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Groq API Error:', error.message);
        return null;
    }
}

async function answerTravelQuestion(prompt) {
    const reply = await callGroq(prompt);
    return reply || "I can help you find hotels! Try searching for a city above.";
}

module.exports = { callGroq, answerTravelQuestion };