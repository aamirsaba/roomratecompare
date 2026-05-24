const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Memory cache - now properly separated by city
let memoryCache = {};
const MEMORY_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Helper to get cache key
function getCacheKey(city, checkin, checkout, guests) {
    return `${city.toLowerCase()}_${checkin}_${checkout}_${guests}`;
}

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city}`);
    
    if (!city || !checkin || !checkout) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const cacheKey = getCacheKey(city, checkin, checkout, guests);
    
    // Check memory cache
    if (memoryCache[cacheKey]) {
        console.log(`⚡ Returning from MEMORY CACHE for ${city}`);
        return res.json({ 
            source: 'memory-cache', 
            hotels: memoryCache[cacheKey].hotels,
            count: memoryCache[cacheKey].hotels.length
        });
    }
    
    // Check Supabase database
    try {
        console.log(`📦 Checking Supabase database for ${city}...`);
        
        const { data: cached, error } = await supabase
            .from('hotel_cache')
            .select('data')
            .eq('city', city.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (cached && cached.length > 0 && cached[0].data) {
            const hotels = cached[0].data;
            console.log(`✅ Found ${hotels.length} REAL hotels in DATABASE for ${city}`);
            
            memoryCache[cacheKey] = {
                hotels: hotels,
                timestamp: Date.now()
            };
            
            return res.json({ 
                source: 'database-cache', 
                hotels: hotels,
                count: hotels.length
            });
        } else {
            console.log(`⚠️ No database cache found for ${city}`);
        }
    } catch (dbError) {
        console.error('Database read error:', dbError.message);
    }
    
    // Call Apify Actor (slow)
    try {
        console.log(`🚀 Calling Apify Actor for ${city} (this will take ~15-30 seconds)...`);
        
        const input = {
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests)
        };
        
        const run = await apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
            console.log(`✅ Actor returned ${hotels.length} real hotels for ${city}`);
        }
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        const formattedHotels = hotels.slice(0, 30).map((hotel, idx) => ({
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
        
        if (formattedHotels.length > 0) {
            memoryCache[cacheKey] = {
                hotels: formattedHotels,
                timestamp: Date.now()
            };
            
            // Store in Supabase
            try {
                await supabase
                    .from('hotel_cache')
                    .insert({ 
                        city: city.toLowerCase(), 
                        check_in: checkin,
                        check_out: checkout,
                        data: formattedHotels, 
                        created_at: new Date() 
                    });
                console.log(`💾 Saved ${formattedHotels.length} hotels to database for ${city}`);
            } catch (dbError) {
                console.log('DB save error:', dbError.message);
            }
        }
        
        if (formattedHotels.length === 0) {
            console.log(`❌ No hotels found for ${city}`);
            return res.json({ 
                source: 'error', 
                hotels: [], 
                count: 0,
                error: 'No hotels found for this city'
            });
        }
        
        res.json({ 
            source: 'apify', 
            hotels: formattedHotels,
            count: formattedHotels.length
        });
        
    } catch (error) {
        console.error(`❌ Error for ${city}:`, error.message);
        res.json({ source: 'error', hotels: [], count: 0, error: error.message });
    }
});

// Get single hotel details - FIXED to prevent cross-city mixing
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city, checkin, checkout, guests, name } = req.query;
    
    console.log(`🔍 Fetching hotel ID: ${hotelId} for city: ${city}`);
    
    if (!city) {
        console.log(`⚠️ No city provided, cannot fetch hotel`);
        return res.status(400).json({ error: 'City is required' });
    }
    
    try {
        const searchKey = city.toLowerCase();
        let hotel = null;
        
        // CRITICAL: Only search cache for the exact city
        const cacheKey = getCacheKey(searchKey, checkin, checkout, guests);
        
        // Check memory cache for exact city
        if (memoryCache[cacheKey]) {
            hotel = memoryCache[cacheKey].hotels.find(h => h.id === hotelId);
            if (hotel) {
                console.log(`✅ Found hotel in memory cache for ${city}: ${hotel.name}`);
            }
        }
        
        // If not in memory, check database for exact city
        if (!hotel) {
            const { data: cached } = await supabase
                .from('hotel_cache')
                .select('data')
                .eq('city', searchKey)
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (cached && cached.length > 0 && cached[0].data) {
                hotel = cached[0].data.find(h => h.id === hotelId);
                if (hotel) {
                    console.log(`✅ Found hotel in DATABASE for ${city}: ${hotel.name}`);
                }
            }
        }
        
        if (hotel) {
            const nights = checkin && checkout ? 
                Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 
                (hotel.nights || 1);
            
            const totalPrice = hotel.price_per_night * nights;
            const originalPrice = Math.round(totalPrice * 1.2);
            const savings = originalPrice - totalPrice;
            
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
                country: 'International',
                description: `${hotel.name} offers great accommodation in ${hotel.city}.`,
                amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping', 'Elevator', 'Luggage storage'],
                checkin: checkin || hotel.checkin,
                checkout: checkout || hotel.checkout,
                guests: parseInt(guests) || hotel.guests || 2,
                nights: nights,
                booking_link: hotel.booking_link
            });
        }
        
        console.log(`⚠️ Hotel ${hotelId} not found for city ${city}`);
        
        // If hotel not found but we have name parameter
        if (name) {
            const nights = checkin && checkout ? 
                Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
            const decodedName = decodeURIComponent(name);
            
            return res.json({
                id: hotelId,
                name: decodedName,
                stars: 4,
                price_per_night: 150,
                total_price: 150 * nights,
                original_price: 180 * nights,
                savings: 30 * nights,
                currency: 'USD',
                city: city,
                country: 'International',
                description: `${decodedName} offers great accommodation.`,
                amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk'],
                checkin: checkin || '2026-06-01',
                checkout: checkout || '2026-06-04',
                guests: parseInt(guests) || 2,
                nights: nights,
                booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(decodedName)}`
            });
        }
        
        // Final fallback
        const nights = checkin && checkout ? 
            Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
        
        res.json({
            id: hotelId,
            name: `${city} Hotel`,
            stars: 4,
            price_per_night: 150,
            total_price: 150 * nights,
            original_price: 180 * nights,
            savings: 30 * nights,
            currency: 'USD',
            city: city,
            country: 'International',
            description: `A beautiful hotel located in ${city}.`,
            amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping'],
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests) || 2,
            nights: nights,
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`
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