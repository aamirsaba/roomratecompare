const axios = require('axios');

// Currency mapping based on country code
const currencyMap = {
    'GB': { code: 'GBP', symbol: '£' },
    'EU': { code: 'EUR', symbol: '€' },
    'FR': { code: 'EUR', symbol: '€' },
    'DE': { code: 'EUR', symbol: '€' },
    'IT': { code: 'EUR', symbol: '€' },
    'ES': { code: 'EUR', symbol: '€' },
    'AE': { code: 'AED', symbol: 'د.إ' },
    'SA': { code: 'SAR', symbol: '﷼' },
    'PK': { code: 'PKR', symbol: '₨' },
    'IN': { code: 'INR', symbol: '₹' },
    'JP': { code: 'JPY', symbol: '¥' },
    'CN': { code: 'CNY', symbol: '¥' },
    'AU': { code: 'AUD', symbol: 'A$' },
    'CA': { code: 'CAD', symbol: 'C$' },
    'CH': { code: 'CHF', symbol: 'CHF' },
    'US': { code: 'USD', symbol: '$' }
};

async function getUserLocation(ip = null) {
    try {
        // Use free geo IP service (no API key required)
        const response = await axios.get('https://get.geojs.io/v1/ip/country.json');
        const countryCode = response.data.country_code;
        
        const currency = currencyMap[countryCode] || { code: 'USD', symbol: '$' };
        
        console.log(`📍 Detected country: ${countryCode}, Currency: ${currency.code}`);
        
        return {
            countryCode: countryCode,
            currencyCode: currency.code,
            currencySymbol: currency.symbol
        };
    } catch (error) {
        console.error('Geo location error:', error.message);
        return { currencyCode: 'USD', currencySymbol: '$' };
    }
}

module.exports = { getUserLocation };