const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Memory cache for instant repeat searches
let memoryCache = {};
const MEMORY_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Fallback hotels for cities when API fails
const FALLBACK_HOTELS = {
    'paris': [
        { name: 'Eiffel Tower View Hotel', pricePerNight: 180, stars: 4 },
        { name: 'Paris Central Hotel', pricePerNight: 150, stars: 4 },
        { name: 'Louvre Residence', pricePerNight: 200, stars: 5 },
        { name: 'Montmartre Boutique Hotel', pricePerNight: 120, stars: 3 },
        { name: 'Seine River Inn', pricePerNight: 140, stars: 4 }
    ],
    'lahore': [
        { name: 'Pearl Continental Hotel Lahore', pricePerNight: 120, stars: 5 },
        { name: 'Nishat Hotel', pricePerNight: 95, stars: 4 },
        { name: 'Avari Hotel Lahore', pricePerNight: 110, stars: 5 },
        { name: 'Rose Palace Hotel', pricePerNight: 45, stars: 3 },
        { name: 'The Residency Hotel', pricePerNight: 35, stars: 3 }
    ],
    'karachi': [
        { name: 'Pearl Continental Hotel Karachi', pricePerNight: 145, stars: 5 },
        { name: 'Karachi Marriott Hotel', pricePerNight: 134, stars: 5 },
        { name: 'Movenpick Hotel Karachi', pricePerNight: 128, stars: 4 },
        { name: 'Avari Tower Karachi', pricePerNight: 115, stars: 4 },
        { name: 'Ramada Plaza Karachi', pricePerNight: 90, stars: 4 }
    ],
    'dubai': [
        { name: 'Atlantis The Palm', pricePerNight: 350, stars: 5 },
        { name: 'Burj Al Arab', pricePerNight: 1200, stars: 5 },
        { name: 'Jumeirah Beach Hotel', pricePerNight: 280, stars: 5 },
        { name: 'Armani Hotel Dubai', pricePerNight: 400, stars: 5 },
        { name: 'Palm Jumeirah Hotel', pricePerNight: 250, stars: 4 }
    ],
    'london': [
        { name: 'The Ritz London', pricePerNight: 600, stars: 5 },
        { name: 'Hilton London', pricePerNight: 200, stars: 4 },
        { name: 'Marriott London', pricePerNight: 180, stars: 4 },
        { name: 'Premier Inn London', pricePerNight: 120, stars: 3 }
    ],
    'muscat': [
        { name: 'Kempinski Hotel Muscat', pricePerNight: 219, stars: 5 },
        { name: 'Jumeirah Muscat Bay', pricePerNight: 868, stars: 5 },
        { name: 'DoubleTree By Hilton Muscat', pricePerNight: 237, stars: 4 },
        { name: 'Grand Hyatt Muscat', pricePerNight: 200, stars: 5 }
    ]
};

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city}`);
    
    if (!city || !checkin || !checkout) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const cacheKey = `${city.toLowerCase()}_${checkin}_${checkout}_${guests}`;
    
    // Check memory cache first
    if (memoryCache[cacheKey] && (Date.now() - memoryCache[cacheKey].timestamp) < MEMORY_CACHE_DURATION) {
        console.log(`⚡ Returning cached results for ${city}`);
        return res.json({ 
            source: 'cache', 
            hotels: memoryCache[cacheKey].hotels,
            count: memoryCache[cacheKey].hotels.length
        });
    }
    
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Search timeout')), 30000)
        );
        
        const input = {
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests)
        };
        
        console.log(`🚀 Calling Actor for ${city}...`);
        
        const runPromise = apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const run = await Promise.race([runPromise, timeoutPromise]);
        
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
            console.log(`✅ Actor returned ${hotels.length} hotels for ${city}`);
        }
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        let formattedHotels = [];
        
        // Use real hotels if available
        if (hotels.length > 0) {
            formattedHotels = hotels.slice(0, 30).map((hotel, idx) => ({
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
            console.log(`✅ Using ${formattedHotels.length} real hotels for ${city}`);
        }
        
        // If no hotels from API, use fallback
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
                console.log(`⚠️ Using fallback (${formattedHotels.length} hotels) for ${city}`);
            }
        }
        
        // Store in cache
        if (formattedHotels.length > 0) {
            memoryCache[cacheKey] = {
                hotels: formattedHotels,
                timestamp: Date.now()
            };
            
            // Also store in Supabase for persistence
            try {
                await supabase
                    .from('hotel_cache')
                    .upsert({ 
                        city: city.toLowerCase(), 
                        check_in: checkin,
                        check_out: checkout,
                        data: formattedHotels, 
                        created_at: new Date() 
                    });
            } catch (dbError) {
                console.log('DB cache error:', dbError.message);
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
            source: hotels.length > 0 ? 'api' : 'fallback', 
            hotels: formattedHotels,
            count: formattedHotels.length
        });
        
    } catch (error) {
        console.error(`❌ Error for ${city}:`, error.message);
        
        // Try fallback on error
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
            
            memoryCache[cacheKey] = {
                hotels: formattedHotels,
                timestamp: Date.now()
            };
            
            return res.json({ 
                source: 'fallback', 
                hotels: formattedHotels,
                count: formattedHotels.length
            });
        }
        
        res.json({ source: 'error', hotels: [], count: 0, error: error.message });
    }
});

// Get single hotel details
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city, checkin, checkout, guests, name } = req.query;
    
    console.log(`🔍 Fetching hotel ID: ${hotelId} for city: ${city}`);
    
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
                Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 
                (hotel.nights || 1);
            
            const totalPrice = hotel.price_per_night * nights;
            const originalPrice = Math.round(totalPrice * 1.2);
            const savings = originalPrice - totalPrice;
            
            console.log(`✅ Found hotel: ${hotel.name}, price: $${hotel.price_per_night}/night`);
            
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
        
        // If hotel not found but we have name
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
                city: city || 'City',
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
            name: `${city || 'Grand'} Hotel`,
            stars: 4,
            price_per_night: 150,
            total_price: 150 * nights,
            original_price: 180 * nights,
            savings: 30 * nights,
            currency: 'USD',
            city: city || 'City',
            country: 'International',
            description: `A beautiful hotel located in ${city || 'the city'}.`,
            amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping'],
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests) || 2,
            nights: nights,
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'hotel')}`
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