const axios = require('axios');

let exchangeRatesCache = {};

async function getExchangeRate(targetCurrency) {
    if (targetCurrency === 'USD') return 1;
    
    const today = new Date().toISOString().split('T')[0];
    if (exchangeRatesCache.date === today && exchangeRatesCache.rates && exchangeRatesCache.rates[targetCurrency]) {
        console.log(`⚡ Using cached exchange rate for USD -> ${targetCurrency}`);
        return exchangeRatesCache.rates[targetCurrency];
    }

    try {
        const response = await axios.get(`https://api.frankfurter.dev/v1/latest?from=USD&to=${targetCurrency}`);
        const rate = response.data.rates[targetCurrency];
        if (rate && !isNaN(rate)) {
            exchangeRatesCache = { date: today, rates: response.data.rates };
            console.log(`✅ Exchange rate: 1 USD = ${rate} ${targetCurrency}`);
            return rate;
        }
        console.log(`⚠️ No rate found for ${targetCurrency}, using USD`);
        return 1;
    } catch (error) {
        console.error('Exchange rate error:', error.message);
        return 1;
    }
}

async function convertPrice(usdAmount, targetCurrency) {
    if (!targetCurrency || targetCurrency === 'USD') return usdAmount;
    if (!usdAmount || isNaN(usdAmount)) return 0;
    
    const rate = await getExchangeRate(targetCurrency);
    if (!rate || isNaN(rate)) return usdAmount;
    
    const converted = (usdAmount * rate);
    // Round to 2 decimal places
    return Math.round(converted * 100) / 100;
}

module.exports = { convertPrice, getExchangeRate };