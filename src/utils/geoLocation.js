const axios = require('axios');

// Currency mapping based on country code
const currencyMap = {
    'GB': { code: 'GBP', symbol: '£', name: 'British Pound' },
    'EU': { code: 'EUR', symbol: '€', name: 'Euro' },
    'FR': { code: 'EUR', symbol: '€', name: 'Euro' },
    'DE': { code: 'EUR', symbol: '€', name: 'Euro' },
    'IT': { code: 'EUR', symbol: '€', name: 'Euro' },
    'ES': { code: 'EUR', symbol: '€', name: 'Euro' },
    'AE': { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    'SA': { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
    'PK': { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
    'IN': { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    'JP': { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    'CN': { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    'AU': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    'CA': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    'CH': { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    'OM': { code: 'OMR', symbol: '﷼', name: 'Omani Rial' },
    'US': { code: 'USD', symbol: '$', name: 'US Dollar' }
};

async function getUserLocation(ip = null) {
    try {
        // Use free geo IP service (no API key required)
        const response = await axios.get('https://get.geojs.io/v1/ip/country.json');
        const countryCode = response.data.country_code;
        
        const currency = currencyMap[countryCode] || { code: 'USD', symbol: '$', name: 'US Dollar' };
        
        console.log(`📍 Detected country: ${countryCode}, Currency: ${currency.code} (${currency.symbol})`);
        
        return {
            countryCode: countryCode,
            currencyCode: currency.code,
            currencySymbol: currency.symbol,
            currencyName: currency.name
        };
    } catch (error) {
        console.error('Geo location error:', error.message);
        return { currencyCode: 'USD', currencySymbol: '$', countryCode: 'US' };
    }
}

module.exports = { getUserLocation };