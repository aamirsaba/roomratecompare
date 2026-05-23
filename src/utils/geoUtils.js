const axios = require('axios');

// Cache to avoid calling API too often
let countriesCache = null;
let citiesCache = {};

/**
 * Fetch all countries from REST Countries API
 * Results are cached for 24 hours
 */
async function fetchCountries() {
    if (countriesCache) {
        return countriesCache;
    }
    
    try {
        const response = await axios.get('https://restcountries.com/v3.1/all?fields=name,cca2,cca3,region,subregion,capital');
        countriesCache = response.data;
        
        // Clear cache after 24 hours
        setTimeout(() => { countriesCache = null; }, 24 * 60 * 60 * 1000);
        
        return countriesCache;
    } catch (error) {
        console.error('Failed to fetch countries:', error.message);
        return [];
    }
}

/**
 * Get country info by city name (approximate match)
 * This searches through countries and their capitals
 */
async function getCountryByCity(cityName) {
    if (!cityName) return null;
    
    const countries = await fetchCountries();
    const lowerCity = cityName.toLowerCase().trim();
    
    // First, try to find exact country match
    const exactCountry = countries.find(c => 
        c.name.common.toLowerCase() === lowerCity ||
        (c.capital && c.capital[0] && c.capital[0].toLowerCase() === lowerCity)
    );
    
    if (exactCountry) {
        return {
            countryName: exactCountry.name.common,
            countryCode: exactCountry.cca2,
            capital: exactCountry.capital ? exactCountry.capital[0] : null,
            region: exactCountry.region,
            subregion: exactCountry.subregion
        };
    }
    
    // Try partial match
    const partialMatch = countries.find(c => 
        lowerCity.includes(c.name.common.toLowerCase()) ||
        (c.capital && c.capital[0] && lowerCity.includes(c.capital[0].toLowerCase()))
    );
    
    if (partialMatch) {
        return {
            countryName: partialMatch.name.common,
            countryCode: partialMatch.cca2,
            capital: partialMatch.capital ? partialMatch.capital[0] : null,
            region: partialMatch.region,
            subregion: partialMatch.subregion
        };
    }
    
    return null;
}

/**
 * Get country code from country name
 */
async function getCountryCode(countryName) {
    const countries = await fetchCountries();
    const country = countries.find(c => 
        c.name.common.toLowerCase() === countryName.toLowerCase()
    );
    return country ? country.cca2 : null;
}

/**
 * Get all countries list for autocomplete
 */
async function getCountryList() {
    const countries = await fetchCountries();
    return countries.map(c => ({
        name: c.name.common,
        code: c.cca2,
        capital: c.capital ? c.capital[0] : null,
        region: c.region
    }));
}

module.exports = {
    fetchCountries,
    getCountryByCity,
    getCountryCode,
    getCountryList
};