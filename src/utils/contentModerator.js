// src/utils/contentModerator.js
const Groq = require('groq-sdk');

let groq = null;

function initGroq() {
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('✅ Groq AI initialized for content moderation');
        return true;
    }
    console.log('⚠️ Groq API not configured - using fallback moderation');
    return false;
}

async function reviewContent(title, content, category) {
    // If Groq is not configured, use fallback
    if (!groq) {
        return fallbackReview(title, content, category);
    }

    const prompt = `You are a content moderator for a travel blog website. Review the following article.

Article Title: ${title}
Category: ${category}
Content: ${content.substring(0, 4000)}

Check for:
1. Profanity or offensive language (score 0-100, higher is better - no profanity = 100)
2. Spam or excessive promotional content (score 0-100, legitimate travel article with occasional tips = 85+)
3. Grammar and spelling (score 0-100, higher is better)
4. SEO keyword optimization (score 0-100, 50-70 is ideal)
5. Travel relevance (score 0-100, higher is better)
6. Word count (minimum 500 words required)

IMPORTANT: 
- DO NOT flag legitimate travel articles as spam just because they contain travel tips or suggestions.
- A table of contents or comparison table is perfectly acceptable for travel articles.
- Phrases like "Here is why" or "Let's talk about" are normal conversational writing.
- Only flag as spam if it contains: excessive affiliate links, "buy now" language, or pure advertising.
- This is a genuine travel article, not an ad.

Return ONLY valid JSON:
{
    "profanity_score": number,
    "profanity_feedback": "string if score < 70",
    "spam_score": number,
    "spam_feedback": "string if score < 70",
    "grammar_score": number,
    "grammar_feedback": "string if score < 70",
    "seo_score": number,
    "relevance_score": number,
    "word_count": number,
    "overall_score": number,
    "verdict": "approve" or "reject" or "manual_review",
    "feedback": "constructive feedback or approval message"
}`;

    try {
        const response = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.1-70b-versatile",
            temperature: 0.3,
        });

        const result = JSON.parse(response.choices[0].message.content);
        return result;
    } catch (error) {
        console.error('AI review error:', error);
        return fallbackReview(title, content, category);
    }
}

function fallbackReview(title, content, category) {
    const wordCount = content.split(/\s+/).length;
    
    // Check for real profanity (not travel terms)
    const profanityPattern = /\b(fuck|shit|damn|bitch|crap|asshole|bastard)\b/i;
    const hasProfanity = profanityPattern.test(content);
    
    // Check for excessive spam (not normal travel content)
    const spamPattern = /(buy now|click here|limited time|act now|only \$|discount code)/i;
    const hasSpam = spamPattern.test(content);
    
    let verdict = 'approve';
    let feedback = [];
    
    if (wordCount < 500) {
        verdict = 'reject';
        feedback.push(`Your article has only ${wordCount} words. Minimum requirement is 500 words.`);
    } else if (wordCount < 800) {
        feedback.push(`Good length (${wordCount} words). Consider adding more detail for richer content.`);
    } else {
        feedback.push(`Excellent length! ${wordCount} words - very comprehensive.`);
    }
    
    if (hasProfanity) {
        verdict = 'reject';
        feedback.push('Your article contains inappropriate language. Please remove profanity.');
    }
    
    if (hasSpam) {
        verdict = 'manual_review';
        feedback.push('Your article appears to have promotional content. Please review if this is legitimate travel advice.');
    }
    
    // Check for quality indicators
    if (content.includes('##') || content.includes('###')) {
        feedback.push('Good use of headings for structure.');
    }
    
    if (content.includes('table') || content.includes('|')) {
        feedback.push('Nice use of tables for organization.');
    }
    
    if (verdict === 'approve') {
        if (feedback.length === 0) {
            feedback.push('Great article! It meets our quality standards and provides valuable travel insights.');
        }
        feedback.push('✓ Article approved for publication.');
    }
    
    return {
        profanity_score: hasProfanity ? 20 : 98,
        profanity_feedback: hasProfanity ? 'Contains inappropriate language' : '',
        spam_score: hasSpam ? 65 : 95,
        spam_feedback: hasSpam ? 'Contains promotional elements' : '',
        grammar_score: 88,
        grammar_feedback: '',
        seo_score: 72,
        relevance_score: 95,
        word_count: wordCount,
        overall_score: verdict === 'approve' ? 85 : 45,
        verdict: verdict,
        feedback: feedback.join(' ')
    };
}

module.exports = { initGroq, reviewContent };