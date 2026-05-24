// Simple country detection based on timezone and language
function getUserLocation() {
    try {
        // Get user's timezone (e.g., "Europe/London", "Asia/Dubai")
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        console.log(`🕐 Timezone: ${timezone}`);
        
        // Map timezone to currency
        const currencyMap = {
            'London': { code: 'GBP', symbol: '£', country: 'GB' },
            'United Kingdom': { code: 'GBP', symbol: '£', country: 'GB' },
            'Dubai': { code: 'AED', symbol: 'د.إ', country: 'AE' },
            'Abu Dhabi': { code: 'AED', symbol: 'د.إ', country: 'AE' },
            'Riyadh': { code: 'SAR', symbol: '﷼', country: 'SA' },
            'Karachi': { code: 'PKR', symbol: '₨', country: 'PK' },
            'Mumbai': { code: 'INR', symbol: '₹', country: 'IN' },
            'Delhi': { code: 'INR', symbol: '₹', country: 'IN' },
            'Paris': { code: 'EUR', symbol: '€', country: 'FR' },
            'Berlin': { code: 'EUR', symbol: '€', country: 'DE' },
            'Rome': { code: 'EUR', symbol: '€', country: 'IT' },
            'Madrid': { code: 'EUR', symbol: '€', country: 'ES' },
            'Muscat': { code: 'OMR', symbol: '﷼', country: 'OM' },
            'Tokyo': { code: 'JPY', symbol: '¥', country: 'JP' },
            'Singapore': { code: 'SGD', symbol: 'S$', country: 'SG' },
            'Sydney': { code: 'AUD', symbol: 'A$', country: 'AU' },
            'New York': { code: 'USD', symbol: '$', country: 'US' },
            'Los Angeles': { code: 'USD', symbol: '$', country: 'US' }
        };
        
        // Find matching currency
        let currency = { code: 'USD', symbol: '$', country: 'US' };
        
        for (const [key, value] of Object.entries(currencyMap)) {
            if (timezone.includes(key)) {
                currency = value;
                break;
            }
        }
        
        console.log(`📍 Detected: ${currency.country}, Currency: ${currency.code} (${currency.symbol})`);
        
        return {
            countryCode: currency.country,
            currencyCode: currency.code,
            currencySymbol: currency.symbol
        };
    } catch (error) {
        console.error('Geo detection error:', error.message);
        return { currencyCode: 'USD', currencySymbol: '$', countryCode: 'US' };
    }
}

module.exports = { getUserLocation };