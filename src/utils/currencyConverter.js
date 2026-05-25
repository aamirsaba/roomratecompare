const axios = require('axios');

let exchangeRatesCache = {};

// Fixed rates for all currencies (reliable, no API calls needed)
const FIXED_RATES = {
    'USD': 1,
    'EUR': 0.92,
    'GBP': 0.79,
    'JPY': 157,
    'AED': 3.67,
    'SAR': 3.75,
    'PKR': 278,
    'INR': 83,
    'OMR': 0.384,
    'TRY': 32,
    'CAD': 1.37,
    'AUD': 1.51,
    'CHF': 0.91,
    'CNY': 7.25,
    'SGD': 1.35,
    'MYR': 4.70,
    'THB': 36.5,
    'KWD': 0.308,
    'QAR': 3.64,
    'BHD': 0.376
};

async function getExchangeRate(targetCurrency) {
    if (!targetCurrency || targetCurrency === 'USD') return 1;
    
    const rate = FIXED_RATES[targetCurrency];
    if (rate) {
        console.log(`📌 Exchange rate: 1 USD = ${rate} ${targetCurrency}`);
        return rate;
    }
    
    console.log(`⚠️ No rate found for ${targetCurrency}, using USD`);
    return 1;
}

async function convertPrice(usdAmount, targetCurrency) {
    // Validate input
    if (!usdAmount || isNaN(usdAmount) || usdAmount === 0) {
        return 0;
    }
    
    if (!targetCurrency || targetCurrency === 'USD') {
        return Math.round(usdAmount * 100) / 100;
    }
    
    const rate = await getExchangeRate(targetCurrency);
    const converted = usdAmount * rate;
    
    // Round appropriately
    let rounded;
    if (targetCurrency === 'OMR' || targetCurrency === 'KWD' || targetCurrency === 'BHD') {
        rounded = Math.round(converted * 1000) / 1000;
    } else {
        rounded = Math.round(converted * 100) / 100;
    }
    
    return rounded;
}

module.exports = { convertPrice, getExchangeRate };