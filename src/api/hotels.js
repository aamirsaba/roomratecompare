const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Cache for 1 hour
const CACHE_DURATION = 3600000;
let hotelCache = {};

// Popular cities with working fallbacks
const FALLBACK_HOTELS = {
    'lahore': [
        { name: 'Pearl Continental Hotel Lahore', pricePerNight: 120 },
        { name: 'Nishat Hotel', pricePerNight: 95 },
        { name: 'Avari Hotel Lahore', pricePerNight: 110 },
        { name: 'Rose Palace Hotel', pricePerNight: 45 },
        { name: 'The Residency Hotel', pricePerNight: 35 }
    ],
    'karachi': [
        { name: 'Pearl Continental Hotel Karachi', pricePerNight: 145 },
        { name: 'Karachi Marriott Hotel', pricePerNight: 134 },
        { name: 'Movenpick Hotel Karachi', pricePerNight: 128 },
        { name: 'Avari Tower Karachi', pricePerNight: 115 }
    ],
    'dubai': [
        { name: 'Atlantis The Palm', pricePerNight: 350 },
        { name: 'Burj Al Arab', pricePerNight: 1200 },
        { name: 'Jumeirah Beach Hotel', pricePerNight: 280 }
    ]
};

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city}`);
    
    if (!city || !checkin || !checkout) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const cacheKey = `${city.toLowerCase()}_${checkin}_${checkout}_${guests}`;
    
    // Check cache first
    if (hotelCache[cacheKey] && (Date.now() - hotelCache[cacheKey].timestamp) < CACHE_DURATION) {
        console.log(`✅ Returning cached results for ${city}`);
        return res.json({ 
            source: 'cache', 
            hotels: hotelCache[cacheKey].hotels,
            count: hotelCache[cacheKey].hotels.length
        });
    }
    
    try {
        // Increase timeout to 30 seconds for slower cities
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Search timeout after 30 seconds')), 30000)
        );
        
        const input = {
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests)
        };
        
        console.log(`🚀 Calling Actor for ${city} (30s timeout)...`);
        
        const runPromise = apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const run = await Promise.race([runPromise, timeoutPromise]);
        
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
        }
        
        if (hotels.length === 0) {
            console.log(`⚠️ Actor returned 0 hotels for ${city}, using fallback`);
            // Use fallback data for this city if available
            const fallback = FALLBACK_HOTELS[city.toLowerCase()];
            if (fallback) {
                hotels = fallback;
            }
        }
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        const formattedHotels = hotels.slice(0, 15).map((hotel, idx) => ({
            id: idx + 1,
            name: hotel.name,
            stars: 4,
            price: (hotel.pricePerNight || 99) * nights,
            price_per_night: hotel.pricePerNight || 99,
            currency: 'USD',
            rating: hotel.rating || 0,
            nights: nights,
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests),
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
        }));
        
        // Store in cache only if we have hotels
        if (formattedHotels.length > 0) {
            hotelCache[cacheKey] = {
                hotels: formattedHotels,
                timestamp: Date.now()
            };
        }
        
        console.log(`✅ Returning ${formattedHotels.length} hotels for ${city}`);
        
        res.json({ 
            source: formattedHotels.length > 0 ? 'custom-actor' : 'fallback', 
            hotels: formattedHotels,
            count: formattedHotels.length
        });
        
    } catch (error) {
        console.error(`❌ Error for ${city}:`, error.message);
        
        // Try to use fallback data
        const fallback = FALLBACK_HOTELS[city.toLowerCase()];
        if (fallback) {
            const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
            const formattedHotels = fallback.map((hotel, idx) => ({
                id: idx + 1,
                name: hotel.name,
                stars: 4,
                price: hotel.pricePerNight * nights,
                price_per_night: hotel.pricePerNight,
                currency: 'USD',
                rating: 0,
                nights: nights,
                city: city,
                checkin: checkin,
                checkout: checkout,
                guests: parseInt(guests),
                booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
            }));
            
            console.log(`⚠️ Using fallback data for ${city}`);
            return res.json({ 
                source: 'fallback', 
                hotels: formattedHotels,
                count: formattedHotels.length
            });
        }
        
        res.json({ source: 'error', hotels: [], error: error.message });
    }
});

module.exports = router;