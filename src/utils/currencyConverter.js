// src/utils/currencyConverter.js
const axios = require('axios');

// We'll use a simple in-memory cache to avoid calling the API for every single price
let exchangeRatesCache = {};

/**
 * Gets the exchange rate from USD to a target currency.
 */
async function getExchangeRate(targetCurrency) {
    // If the target currency is USD, no conversion is needed
    if (targetCurrency === 'USD') {
        return 1;
    }

    // Check the cache first (rates are updated daily)
    const today = new Date().toISOString().split('T')[0];
    if (exchangeRatesCache.date === today && exchangeRatesCache.rates && exchangeRatesCache.rates[targetCurrency]) {
        console.log(`⚡ Using cached exchange rate for USD -> ${targetCurrency}`);
        return exchangeRatesCache.rates[targetCurrency];
    }

    try {
        // Call the free Frankfurter API
        const response = await axios.get(`https://api.frankfurter.dev/v1/latest?from=USD&to=${targetCurrency}`);
        
        const rate = response.data.rates[targetCurrency];
        if (rate) {
            // Store the rates in our cache
            exchangeRatesCache = {
                date: today,
                rates: response.data.rates
            };
            console.log(`✅ Fetched new exchange rate: 1 USD = ${rate} ${targetCurrency}`);
            return rate;
        } else {
            console.error(`Rate for ${targetCurrency} not found.`);
            return null;
        }
    } catch (error) {
        console.error(`Failed to fetch exchange rate for ${targetCurrency}:`, error.message);
        return null;
    }
}

/**
 * Converts a USD amount to the target currency.
 */
async function convertPrice(usdAmount, targetCurrency) {
    if (!targetCurrency || targetCurrency === 'USD') {
        return usdAmount;
    }

    const rate = await getExchangeRate(targetCurrency);
    if (!rate) {
        console.warn(`Could not convert to ${targetCurrency}, returning USD amount.`);
        return usdAmount;
    }

    const convertedAmount = usdAmount * rate;
    // Round to 2 decimal places for currency
    return Math.round(convertedAmount * 100) / 100;
}

module.exports = { convertPrice };