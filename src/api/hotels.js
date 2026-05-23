const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Store search results for detail page access
let recentSearchResults = {};

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city}`);
    
    if (!city) {
        return res.status(400).json({ error: 'City is required' });
    }

    try {
        const input = {
            city: city,
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests)
        };
        
        console.log(`🚀 Calling your Actor for ${city}...`);
        
        const run = await apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
        }
        
        console.log(`✅ Got ${hotels.length} real hotels from your Actor`);
        
        const nights = Math.ceil((new Date(checkout || '2026-06-04') - new Date(checkin || '2026-06-01')) / (1000 * 60 * 60 * 24));
        
        const formattedHotels = hotels.slice(0, 20).map((hotel, idx) => ({
            id: idx + 1,
            name: hotel.name,
            stars: 4,
            price: hotel.pricePerNight * nights,
            price_per_night: hotel.pricePerNight,
            currency: hotel.currency || 'USD',
            rating: hotel.rating || 0,
            nights: nights,
            city: city,
            country: getCountryFromCity(city),
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests),
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
        }));
        
        // Store in memory for detail page - IMPORTANT!
        recentSearchResults[city.toLowerCase()] = formattedHotels;
        
        res.json({ 
            source: 'custom-actor', 
            hotels: formattedHotels,
            count: formattedHotels.length
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.json({ source: 'error', hotels: [], error: error.message });
    }
});

// Helper function to get country from city
function getCountryFromCity(city) {
    const countries = {
        'karachi': 'Pakistan', 'lahore': 'Pakistan', 'islamabad': 'Pakistan',
        'mumbai': 'India', 'delhi': 'India', 'bangalore': 'India',
        'dubai': 'UAE', 'abu dhabi': 'UAE', 'muscat': 'Oman',
        'london': 'United Kingdom', 'paris': 'France', 'new york': 'USA'
    };
    return countries[city?.toLowerCase()] || 'International';
}

// Get single hotel details - FIXED to use cached data
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city, checkin, checkout, guests, name } = req.query;
    
    console.log(`🔍 Fetching hotel ID: ${hotelId} for city: ${city}`);
    
    try {
        // Try to find hotel in recent search results
        const searchKey = (city || '').toLowerCase();
        let hotel = null;
        
        if (recentSearchResults[searchKey]) {
            hotel = recentSearchResults[searchKey].find(h => h.id === hotelId);
            console.log(`Found hotel in cache: ${hotel ? hotel.name : 'not found'}`);
        }
        
        // If found in cache, return real data
        if (hotel) {
            const nights = checkin && checkout ? 
                Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 
                (hotel.nights || 1);
            
            const totalPrice = hotel.price_per_night * nights;
            const originalPrice = Math.round(totalPrice * 1.2);
            const savings = originalPrice - totalPrice;
            
            console.log(`✅ Returning real hotel: ${hotel.name}, price: $${hotel.price_per_night}/night`);
            
            return res.json({
                id: hotel.id,
                name: hotel.name,
                stars: hotel.stars || 4,
                price_per_night: hotel.price_per_night,
                total_price: totalPrice,
                original_price: originalPrice,
                savings: savings,
                currency: hotel.currency || 'USD',
                city: hotel.city,
                country: getCountryFromCity(hotel.city),
                description: `${hotel.name} offers great accommodation in ${hotel.city}.`,
                amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping', 'Elevator', 'Luggage storage'],
                checkin: checkin || hotel.checkin,
                checkout: checkout || hotel.checkout,
                guests: parseInt(guests) || hotel.guests || 2,
                nights: nights,
                booking_link: hotel.booking_link
            });
        }
        
        // If not found in cache, try to use the name parameter to search
        if (name) {
            console.log(`Hotel not in cache, using name parameter: ${name}`);
            const nights = checkin && checkout ? 
                Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
            
            // Estimate price based on name (fallback)
            const estimatedPrice = 150;
            
            return res.json({
                id: hotelId,
                name: decodeURIComponent(name),
                stars: 4,
                price_per_night: estimatedPrice,
                total_price: estimatedPrice * nights,
                original_price: Math.round(estimatedPrice * nights * 1.2),
                savings: Math.round(estimatedPrice * nights * 0.2),
                currency: 'USD',
                city: city || 'City',
                country: getCountryFromCity(city),
                description: `${decodeURIComponent(name)} offers great accommodation.`,
                amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping'],
                checkin: checkin || '2026-06-01',
                checkout: checkout || '2026-06-04',
                guests: parseInt(guests) || 2,
                nights: nights,
                booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests || 2}`
            });
        }
        
        // Final fallback
        console.log(`⚠️ No hotel found, returning fallback`);
        const nights = checkin && checkout ? 
            Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
        
        res.json({
            id: hotelId,
            name: `${city || 'Grand'} Hotel`,
            stars: 4,
            price_per_night: 199,
            total_price: 199 * nights,
            original_price: 239 * nights,
            savings: 40 * nights,
            currency: 'USD',
            city: city || 'City',
            country: getCountryFromCity(city),
            description: `A beautiful hotel located in ${city || 'the city'}.`,
            amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping', 'Elevator', 'Luggage storage'],
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests) || 2,
            nights: nights,
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'hotel')}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests || 2}`
        });
        
    } catch (error) {
        console.error('❌ Hotel detail error:', error.message);
        res.status(500).json({ error: 'Failed to fetch hotel details' });
    }
});

router.post('/click', async (req, res) => {
    try {
        await supabase.from('clicks').insert([{
            hotel_id: req.body.hotel_id,
            site: req.body.site,
            room_type: req.body.room_type,
            clicked_at: new Date()
        }]);
        res.json({ success: true });
    } catch (error) {
        console.error('Click error:', error.message);
        res.json({ success: false });
    }
});

module.exports = router;