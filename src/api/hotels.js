const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Memory cache
let memoryCache = {};
const MEMORY_CACHE_DURATION = 24 * 60 * 60 * 1000;

// Helper: Get cache key
function getCacheKey(city, checkin, checkout, guests) {
    return `${city.toLowerCase()}_${checkin}_${checkout}_${guests}`;
}

// Helper: Dynamic amenities based on hotel name and stars
function getAmenitiesForHotel(hotelName, stars) {
    const name = (hotelName || '').toLowerCase();
    const amenities = ['Free WiFi'];
    
    // Star-based amenities
    if (stars >= 4) {
        amenities.push('Air conditioning', '24/7 front desk', 'Room service');
    } else if (stars >= 3) {
        amenities.push('Air conditioning', '24/7 front desk');
    } else {
        amenities.push('Front desk (limited hours)');
    }
    
    // Name-based amenities
    if (name.includes('resort') || name.includes('spa')) {
        amenities.push('Spa', 'Swimming pool', 'Fitness center');
    }
    if (name.includes('suite') || name.includes('luxury')) {
        amenities.push('Mini bar', 'Premium bedding');
    }
    if (name.includes('inn') || name.includes('lodge')) {
        amenities.push('Breakfast included', 'Free parking');
    }
    if (name.includes('airport')) {
        amenities.push('Airport shuttle');
    }
    if (name.includes('beach')) {
        amenities.push('Beach access');
    }
    if (name.includes('business')) {
        amenities.push('Business center', 'Meeting rooms');
    }
    
    amenities.push('Housekeeping', 'Elevator', 'Luggage storage');
    return [...new Set(amenities)].slice(0, 8);
}

// Search hotels
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
        
        const { data: cached } = await supabase
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
        }
    } catch (dbError) {
        console.error('Database read error:', dbError.message);
    }
    
    // Call Apify Actor
    try {
        console.log(`🚀 Calling Apify Actor for ${city}...`);
        
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
            amenities: getAmenitiesForHotel(hotel.name, hotel.stars || 4),
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
        }));
        
        if (formattedHotels.length > 0) {
            memoryCache[cacheKey] = {
                hotels: formattedHotels,
                timestamp: Date.now()
            };
            
            await supabase
                .from('hotel_cache')
                .insert({ 
                    city: city.toLowerCase(), 
                    check_in: checkin,
                    check_out: checkout,
                    data: formattedHotels, 
                    created_at: new Date() 
                });
        }
        
        if (formattedHotels.length === 0) {
            return res.json({ source: 'error', hotels: [], count: 0 });
        }
        
        res.json({ source: 'apify', hotels: formattedHotels, count: formattedHotels.length });
        
    } catch (error) {
        console.error(`❌ Error for ${city}:`, error.message);
        res.json({ source: 'error', hotels: [], count: 0 });
    }
});

// Get single hotel details
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city, checkin, checkout, guests, name } = req.query;
    
    console.log(`🔍 Fetching hotel ID: ${hotelId} for city: ${city}`);
    
    if (!city) {
        return res.status(400).json({ error: 'City is required' });
    }
    
    try {
        const cacheKey = getCacheKey(city, checkin, checkout, guests);
        let hotel = null;
        
        // Check memory cache
        if (memoryCache[cacheKey]) {
            hotel = memoryCache[cacheKey].hotels.find(h => h.id === hotelId);
        }
        
        // Check database
        if (!hotel) {
            const { data: cached } = await supabase
                .from('hotel_cache')
                .select('data')
                .eq('city', city.toLowerCase())
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (cached && cached.length > 0 && cached[0].data) {
                hotel = cached[0].data.find(h => h.id === hotelId);
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
                description: `${hotel.name} offers comfortable accommodation in ${hotel.city}.`,
                amenities: hotel.amenities || getAmenitiesForHotel(hotel.name, hotel.stars || 4),
                checkin: checkin || hotel.checkin,
                checkout: checkout || hotel.checkout,
                guests: parseInt(guests) || hotel.guests || 2,
                nights: nights,
                booking_link: hotel.booking_link
            });
        }
        
        // Fallback using name parameter
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
                amenities: getAmenitiesForHotel(decodedName, 4),
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
            amenities: getAmenitiesForHotel(city, 4),
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
        res.json({ success: false });
    }
});

module.exports = router;