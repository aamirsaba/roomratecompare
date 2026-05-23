const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Cache for 1 hour (3600000 milliseconds)
const CACHE_DURATION = 3600000;
let hotelCache = {};

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    if (!city || !checkin || !checkout) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create cache key
    const cacheKey = `${city.toLowerCase()}_${checkin}_${checkout}_${guests}`;
    
    // Check cache first
    if (hotelCache[cacheKey] && (Date.now() - hotelCache[cacheKey].timestamp) < CACHE_DURATION) {
        console.log(`✅ Returning cached results for ${city} (${(Date.now() - hotelCache[cacheKey].timestamp) / 1000} seconds old)`);
        return res.json({ 
            source: 'cache', 
            hotels: hotelCache[cacheKey].hotels,
            count: hotelCache[cacheKey].hotels.length
        });
    }
    
    console.log(`🔍 Fetching fresh results for ${city}...`);
    
    try {
        const input = {
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests)
        };
        
        // Set timeout to 15 seconds
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Search timeout')), 15000)
        );
        
        const runPromise = apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const run = await Promise.race([runPromise, timeoutPromise]);
        
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
        }
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        const formattedHotels = hotels.slice(0, 15).map((hotel, idx) => ({
            id: idx + 1,
            name: hotel.name,
            stars: 4,
            price: hotel.pricePerNight * nights,
            price_per_night: hotel.pricePerNight,
            currency: hotel.currency || 'USD',
            rating: hotel.rating || 0,
            nights: nights,
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests),
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
        }));
        
        // Store in cache
        hotelCache[cacheKey] = {
            hotels: formattedHotels,
            timestamp: Date.now()
        };
        
        console.log(`✅ Cached ${formattedHotels.length} hotels for ${city}`);
        
        res.json({ 
            source: 'custom-actor', 
            hotels: formattedHotels,
            count: formattedHotels.length
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        // Try to return stale cache if available
        if (hotelCache[cacheKey]) {
            console.log(`⚠️ Using stale cache for ${city}`);
            return res.json({ 
                source: 'stale-cache', 
                hotels: hotelCache[cacheKey].hotels,
                count: hotelCache[cacheKey].hotels.length,
                warning: 'Using cached data - search was slow'
            });
        }
        
        res.json({ source: 'error', hotels: [], error: error.message });
    }
});

module.exports = router;