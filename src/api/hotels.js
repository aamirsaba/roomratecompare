const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { searchHotels } = require('./puppeteerScraper');

let recentSearchResults = {};

// Helper to get country (simplified)
function getCountry(city) {
    const countries = {
        'lahore': 'Pakistan', 'karachi': 'Pakistan', 'islamabad': 'Pakistan',
        'mumbai': 'India', 'delhi': 'India', 'bangalore': 'India',
        'london': 'United Kingdom', 'paris': 'France', 'dubai': 'UAE',
        'new york': 'United States', 'muscat': 'Oman'
    };
    return countries[city?.toLowerCase()] || 'International';
}

// Search using custom scraper
router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city} using custom scraper`);
    
    if (!city) {
        return res.status(400).json({ error: 'City is required' });
    }

    try {
        const hotelsData = await searchHotels(city, checkin, checkout, guests);
        
        const nights = Math.ceil((new Date(checkout || '2026-06-04') - new Date(checkin || '2026-06-01')) / (1000 * 60 * 60 * 24));
        const countryName = getCountry(city);
        const cityName = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
        
        const hotels = hotelsData.map((hotel, idx) => ({
            id: idx + 1,
            name: hotel.name,
            stars: hotel.stars || 4,
            price: (hotel.price_per_night) * nights,
            price_per_night: hotel.price_per_night,
            currency: 'USD',
            rating: hotel.rating || 8,
            nights: nights,
            city: cityName,
            country: countryName,
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests),
            booking_link: hotel.booking_link || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`
        }));
        
        recentSearchResults[city.toLowerCase()] = hotels;
        
        res.json({ 
            source: 'custom-scraper', 
            hotels: hotels,
            count: hotels.length
        });
        
    } catch (error) {
        console.error('❌ Search error:', error.message);
        res.status(500).json({ error: 'Search failed', hotels: [] });
    }
});

// Get hotel details
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city } = req.query;
    
    try {
        const searchKey = (city || 'muscat').toLowerCase();
        let hotel = null;
        
        if (recentSearchResults[searchKey]) {
            hotel = recentSearchResults[searchKey].find(h => h.id === hotelId);
        }
        
        if (hotel) {
            return res.json({
                id: hotel.id,
                name: hotel.name,
                stars: hotel.stars,
                price_per_night: hotel.price_per_night,
                total_price: hotel.price,
                currency: 'USD',
                city: hotel.city,
                country: hotel.country,
                description: `${hotel.name} offers great accommodation in ${hotel.city}.`,
                amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk'],
                booking_link: hotel.booking_link
            });
        }
        
        res.json({
            id: hotelId,
            name: `${city || 'Grand'} Hotel`,
            stars: 4,
            price_per_night: 199,
            total_price: 199,
            currency: 'USD',
            city: city || 'Muscat',
            country: 'International',
            description: 'A beautiful hotel with great amenities.',
            amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk'],
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'Muscat')}`
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch hotel details' });
    }
});

router.post('/click', async (req, res) => {
    try {
        await supabase.from('clicks').insert([{
            hotel_id: req.body.hotel_id,
            clicked_at: new Date()
        }]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

module.exports = router;