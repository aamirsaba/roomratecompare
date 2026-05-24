const axios = require('axios');

// Currency mapping based on country code
const CURRENCY_MAP = {
    'US': { code: 'USD', symbol: '$' },
    'GB': { code: 'GBP', symbol: '£' },
    'OM': { code: 'OMR', symbol: '﷼' },
    'AE': { code: 'AED', symbol: 'د.إ' },
    'SA': { code: 'SAR', symbol: '﷼' },
    'KW': { code: 'KWD', symbol: 'د.ك' },
    'QA': { code: 'QAR', symbol: '﷼' },
    'BH': { code: 'BHD', symbol: '.د.ب' },
    'IN': { code: 'INR', symbol: '₹' },
    'PK': { code: 'PKR', symbol: '₨' },
    'EU': { code: 'EUR', symbol: '€' },
    'FR': { code: 'EUR', symbol: '€' },
    'DE': { code: 'EUR', symbol: '€' },
    'IT': { code: 'EUR', symbol: '€' },
    'ES': { code: 'EUR', symbol: '€' },
    'JP': { code: 'JPY', symbol: '¥' },
    'CN': { code: 'CNY', symbol: '¥' },
    'SG': { code: 'SGD', symbol: 'S$' },
    'MY': { code: 'MYR', symbol: 'RM' },
    'TH': { code: 'THB', symbol: '฿' },
    'AU': { code: 'AUD', symbol: 'A$' },
    'CA': { code: 'CAD', symbol: 'C$' },
    'CH': { code: 'CHF', symbol: 'CHF' },
    'TR': { code: 'TRY', symbol: '₺' },
    'RU': { code: 'RUB', symbol: '₽' },
    'BR': { code: 'BRL', symbol: 'R$' },
    'ZA': { code: 'ZAR', symbol: 'R' },
};

async function getUserLocation(ip = null) {
    try {
        // Skip for localhost
        if (ip === '::1' || ip === '127.0.0.1') {
            console.log('📍 Localhost detected, using default currency');
            return { currencyCode: 'USD', currencySymbol: '$', countryCode: 'US' };
        }
        
        // Use ip-api.com (free, no key required)
        let apiUrl = 'http://ip-api.com/json/';
        if (ip && ip !== '::1' && ip !== '127.0.0.1') {
            apiUrl += ip;
        }
        
        const response = await axios.get(apiUrl, { timeout: 5000 });
        const data = response.data;
        
        if (data.status === 'success') {
            const currency = CURRENCY_MAP[data.countryCode] || { code: 'USD', symbol: '$' };
            console.log(`📍 Detected location: ${data.country}, Currency: ${currency.code} (${currency.symbol})`);
            
            return {
                countryName: data.country,
                countryCode: data.countryCode,
                currencyCode: currency.code,
                currencySymbol: currency.symbol,
            };
        } else {
            console.log('📍 IP Geolocation failed, using USD default');
        }
    } catch (error) {
        console.error("IP Geolocation error:", error.message);
    }
    
    return { currencyCode: 'USD', currencySymbol: '$', countryCode: 'US' };
}

module.exports = { getUserLocation };