const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Memory cache (fastest)
let memoryCache = {};
const MEMORY_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Fallback hotels
const FALLBACK_HOTELS = {
    'lahore': [
        { name: 'Pearl Continental Hotel Lahore', pricePerNight: 120, stars: 5 },
        { name: 'Nishat Hotel', pricePerNight: 95, stars: 4 },
        { name: 'Avari Hotel Lahore', pricePerNight: 110, stars: 5 },
        { name: 'Rose Palace Hotel', pricePerNight: 45, stars: 3 },
        { name: 'The Residency Hotel', pricePerNight: 35, stars: 3 }
    ],
    'karachi': [
        { name: 'Pearl Continental Hotel Karachi', pricePerNight: 145, stars: 5 },
        { name: 'Karachi Marriott Hotel', pricePerNight: 134, stars: 5 }
    ],
    'dubai': [
        { name: 'Atlantis The Palm', pricePerNight: 350, stars: 5 },
        { name: 'Burj Al Arab', pricePerNight: 1200, stars: 5 }
    ],
    'muscat': [
        { name: 'Kempinski Hotel Muscat', pricePerNight: 219, stars: 5 },
        { name: 'Jumeirah Muscat Bay', pricePerNight: 868, stars: 5 }
    ]
};

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Search requested for: ${city}`);
    
    if (!city || !checkin || !checkout) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const cacheKey = `${city.toLowerCase()}_${checkin}_${checkout}_${guests}`;
    
    // STEP 1: Check memory cache (0-1ms response)
    if (memoryCache[cacheKey] && (Date.now() - memoryCache[cacheKey].timestamp) < MEMORY_CACHE_DURATION) {
        console.log(`⚡ INSTANT: Returning memory cached results for ${city}`);
        return res.json({ 
            source: 'memory-cache', 
            hotels: memoryCache[cacheKey].hotels,
            count: memoryCache[cacheKey].hotels.length,
            cached: true
        });
    }
    
    // STEP 2: Check Supabase database cache
    try {
        const { data: cached } = await supabase
            .from('hotel_cache')
            .select('data, created_at')
            .eq('city', city.toLowerCase())
            .eq('checkin', checkin)
            .eq('checkout', checkout)
            .single();
        
        if (cached && cached.data && cached.data.length > 0) {
            const cacheAge = Date.now() - new Date(cached.created_at).getTime();
            if (cacheAge < MEMORY_CACHE_DURATION) {
                console.log(`⚡ INSTANT: Returning database cached results for ${city} (${Math.round(cacheAge / 1000 / 60)} minutes old)`);
                
                // Store in memory cache for even faster next time
                memoryCache[cacheKey] = {
                    hotels: cached.data,
                    timestamp: Date.now()
                };
                
                return res.json({ 
                    source: 'db-cache', 
                    hotels: cached.data,
                    count: cached.data.length,
                    cached: true
                });
            }
        }
    } catch (e) {
        console.log('Cache check error:', e.message);
    }
    
    // STEP 3: Fetch fresh data (only happens once per city/dates)
    console.log(`🔄 Fetching fresh data for ${city} (this will take ~10-25 seconds once)`);
    
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Search timeout')), 25000)
        );
        
        const input = {
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests)
        };
        
        const runPromise = apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const run = await Promise.race([runPromise, timeoutPromise]);
        
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
        }
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        let formattedHotels = [];
        
        if (hotels.length > 0) {
            formattedHotels = hotels.slice(0, 15).map((hotel, idx) => ({
                id: idx + 1,
                name: hotel.name,
                stars: hotel.stars || 4,
                price: (hotel.pricePerNight || 99) * nights,
                price_per_night: hotel.pricePerNight || 99,
                currency: hotel.currency || 'USD',
                rating: hotel.rating || 0,
                nights: nights,
                city: city,
                checkin: checkin,
                checkout: checkout,
                guests: parseInt(guests),
                booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
            }));
        }
        
        // Use fallback if needed
        if (formattedHotels.length === 0) {
            const fallback = FALLBACK_HOTELS[city.toLowerCase()];
            if (fallback) {
                formattedHotels = fallback.map((hotel, idx) => ({
                    id: idx + 1,
                    name: hotel.name,
                    stars: hotel.stars || 4,
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
            }
        }
        
        // Store in memory cache
        if (formattedHotels.length > 0) {
            memoryCache[cacheKey] = {
                hotels: formattedHotels,
                timestamp: Date.now()
            };
            
            // Store in Supabase for persistence
            try {
                await supabase
                    .from('hotel_cache')
                    .upsert({ 
                        city: city.toLowerCase(), 
                        checkin: checkin,
                        checkout: checkout,
                        data: formattedHotels, 
                        created_at: new Date() 
                    });
            } catch (dbError) {
                console.log('DB cache error:', dbError.message);
            }
        }
        
        console.log(`✅ Cached ${formattedHotels.length} hotels for ${city}`);
        
        res.json({ 
            source: 'fresh', 
            hotels: formattedHotels,
            count: formattedHotels.length,
            cached: false
        });
        
    } catch (error) {
        console.error(`❌ Error for ${city}:`, error.message);
        
        // Try fallback data
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        const fallback = FALLBACK_HOTELS[city.toLowerCase()];
        
        if (fallback) {
            const formattedHotels = fallback.map((hotel, idx) => ({
                id: idx + 1,
                name: hotel.name,
                stars: hotel.stars || 4,
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
            
            // Cache fallback data
            memoryCache[cacheKey] = {
                hotels: formattedHotels,
                timestamp: Date.now()
            };
            
            return res.json({ 
                source: 'fallback', 
                hotels: formattedHotels,
                count: formattedHotels.length,
                cached: false
            });
        }
        
        res.json({ source: 'error', hotels: [], error: error.message });
    }
});

// Get single hotel details (same as before)
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city, checkin, checkout, guests, name } = req.query;
    
    try {
        const searchKey = (city || '').toLowerCase();
        let hotel = null;
        
        // Search in memory cache
        for (const cacheKey in memoryCache) {
            if (cacheKey.startsWith(searchKey)) {
                hotel = memoryCache[cacheKey].hotels.find(h => h.id === hotelId);
                if (hotel) break;
            }
        }
        
        if (hotel) {
            const nights = checkin && checkout ? 
                Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
            const totalPrice = hotel.price_per_night * nights;
            
            return res.json({
                id: hotel.id,
                name: hotel.name,
                stars: hotel.stars || 4,
                price_per_night: hotel.price_per_night,
                total_price: totalPrice,
                currency: 'USD',
                city: hotel.city,
                country: 'International',
                description: `${hotel.name} offers great accommodation.`,
                amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping'],
                checkin: checkin || hotel.checkin,
                checkout: checkout || hotel.checkout,
                guests: parseInt(guests) || 2,
                nights: nights,
                booking_link: hotel.booking_link
            });
        }
        
        // Fallback response
        const nights = checkin && checkout ? 
            Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
        
        res.json({
            id: hotelId,
            name: name ? decodeURIComponent(name) : `${city || 'Grand'} Hotel`,
            stars: 4,
            price_per_night: 120,
            total_price: 120 * nights,
            currency: 'USD',
            city: city || 'City',
            country: 'International',
            description: 'A beautiful hotel with great amenities.',
            amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk'],
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests) || 2,
            nights: nights,
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'hotel')}`
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch hotel details' });
    }
});

router.post('/click', async (req, res) => {
    try {
        await supabase.from('clicks').insert([{
            hotel_id: req.body.hotel_id,
            site: req.body.site,
            clicked_at: new Date()
        }]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

module.exports = router;