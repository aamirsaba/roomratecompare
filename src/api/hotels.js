const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');
const { getUserLocation } = require('../utils/geoLocation');
const { convertPrice } = require('../utils/currencyConverter');

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
let memoryCache = {};
const CACHE_DURATION = 24 * 60 * 60 * 1000;

const currencySymbols = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
    'AED': 'د.إ', 'SAR': '﷼', 'PKR': '₨', 'INR': '₹',
    'OMR': '﷼', 'CAD': 'C$', 'AUD': 'A$', 'CHF': 'CHF', 'CNY': '¥'
};

function getAmenitiesForHotel(hotelName, stars) {
    const name = (hotelName || '').toLowerCase();
    const amenities = ['Free WiFi'];
    if (stars >= 4) {
        amenities.push('Air conditioning', '24/7 front desk', 'Room service');
    } else if (stars >= 3) {
        amenities.push('Air conditioning', '24/7 front desk');
    } else {
        amenities.push('Front desk (limited hours)');
    }
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

function getCacheKey(city, checkin, checkout, guests) {
    return `${city.toLowerCase()}_${checkin}_${checkout}_${guests}`;
}

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    if (!city || !checkin || !checkout) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get user's location for currency
    const userLocation = await getUserLocation();
    const targetCurrency = userLocation?.currencyCode || 'USD';
    const currencySymbol = currencySymbols[targetCurrency] || '$';
    console.log(`🪙 User: ${userLocation?.countryCode || 'Unknown'}, Currency: ${targetCurrency} (${currencySymbol})`);
    
    const cacheKey = getCacheKey(city, checkin, checkout, guests);
    
    // Check memory cache
    if (memoryCache[cacheKey]) {
        let hotels = memoryCache[cacheKey].hotels;
        
        // Convert prices if needed
        if (targetCurrency !== 'USD') {
            hotels = await Promise.all(hotels.map(async (hotel) => ({
                ...hotel,
                price: await convertPrice(hotel.price, targetCurrency),
                price_per_night: await convertPrice(hotel.price_per_night, targetCurrency),
                currency: targetCurrency,
                currencySymbol: currencySymbol
            })));
        }
        
        return res.json({ source: 'cache', hotels, count: hotels.length, currency: targetCurrency, currencySymbol });
    }
    
    // Check database
    try {
        const { data: cached } = await supabase
            .from('hotel_cache')
            .select('data')
            .eq('city', city.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (cached && cached.length > 0 && cached[0].data && cached[0].data.length > 0) {
            let hotels = cached[0].data;
            console.log(`✅ Found ${hotels.length} hotels in DATABASE for ${city}`);
            
            memoryCache[cacheKey] = { hotels, timestamp: Date.now() };
            
            // Convert prices if needed
            if (targetCurrency !== 'USD') {
                hotels = await Promise.all(hotels.map(async (hotel) => ({
                    ...hotel,
                    price: await convertPrice(hotel.price, targetCurrency),
                    price_per_night: await convertPrice(hotel.price_per_night, targetCurrency),
                    currency: targetCurrency,
                    currencySymbol: currencySymbol
                })));
            }
            
            return res.json({ source: 'database', hotels, count: hotels.length, currency: targetCurrency, currencySymbol });
        }
    } catch (err) { console.error('DB error:', err.message); }
    
    // Fetch from Apify
    try {
        console.log(`🚀 Fetching fresh data for ${city}...`);
        
        const run = await apifyClient.actor('roomratecompare/apify-hotel-scraper').call({
            city, checkin, checkout, guests: parseInt(guests)
        });
        
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        let hotelsFromActor = items[0]?.hotels || [];
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        let hotels = hotelsFromActor.slice(0, 30).map((hotel, idx) => ({
            id: idx + 1,
            name: hotel.name,
            stars: hotel.stars || Math.floor(Math.random() * 3) + 3,
            price: (hotel.pricePerNight || 99) * nights,
            price_per_night: hotel.pricePerNight || 99,
            currency: 'USD',
            currencySymbol: '$',
            nights: nights,
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: parseInt(guests),
            amenities: getAmenitiesForHotel(hotel.name, hotel.stars || 4),
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
        }));
        
        if (hotels.length > 0) {
            memoryCache[cacheKey] = { hotels, timestamp: Date.now() };
            await supabase.from('hotel_cache').insert({ 
                city: city.toLowerCase(), 
                check_in: checkin,
                check_out: checkout,
                data: hotels, 
                created_at: new Date() 
            });
        }
        
        // Convert prices if needed
        if (targetCurrency !== 'USD') {
            hotels = await Promise.all(hotels.map(async (hotel) => ({
                ...hotel,
                price: await convertPrice(hotel.price, targetCurrency),
                price_per_night: await convertPrice(hotel.price_per_night, targetCurrency),
                currency: targetCurrency,
                currencySymbol: currencySymbol
            })));
        }
        
        res.json({ source: 'apify', hotels, count: hotels.length, currency: targetCurrency, currencySymbol });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.json({ source: 'error', hotels: [], count: 0 });
    }
});

// Hotel details endpoint
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city, checkin, checkout, guests, name } = req.query;
    
    if (!city) return res.status(400).json({ error: 'City required' });
    
    try {
        const userLocation = await getUserLocation();
        const targetCurrency = userLocation?.currencyCode || 'USD';
        const currencySymbol = currencySymbols[targetCurrency] || '$';
        
        const cacheKey = getCacheKey(city, checkin, checkout, guests);
        let hotel = null;
        
        if (memoryCache[cacheKey]) {
            hotel = memoryCache[cacheKey].hotels.find(h => h.id === hotelId);
        }
        
        if (!hotel) {
            const { data: cached } = await supabase
                .from('hotel_cache')
                .select('data')
                .eq('city', city.toLowerCase())
                .order('created_at', { ascending: false })
                .limit(1);
            if (cached && cached.length > 0) {
                hotel = cached[0].data.find(h => h.id === hotelId);
            }
        }
        
        if (hotel) {
            const nights = checkin && checkout ? Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : hotel.nights;
            
            let totalPrice = hotel.price_per_night * nights;
            let originalPrice = Math.round(totalPrice * 1.2);
            
            if (targetCurrency !== 'USD') {
                totalPrice = await convertPrice(totalPrice, targetCurrency);
                originalPrice = await convertPrice(originalPrice, targetCurrency);
            }
            
            return res.json({
                id: hotel.id,
                name: hotel.name,
                stars: hotel.stars || 4,
                total_price: totalPrice,
                original_price: originalPrice,
                savings: originalPrice - totalPrice,
                currency: targetCurrency,
                currencySymbol: currencySymbol,
                city: hotel.city,
                description: `${hotel.name} offers comfortable accommodation.`,
                amenities: hotel.amenities,
                checkin: checkin || hotel.checkin,
                checkout: checkout || hotel.checkout,
                guests: parseInt(guests) || hotel.guests,
                nights: nights,
                booking_link: hotel.booking_link
            });
        }
        
        // Fallback
        const nights = 1;
        res.json({
            id: hotelId,
            name: name ? decodeURIComponent(name) : `${city} Hotel`,
            stars: 4,
            total_price: 150,
            original_price: 180,
            savings: 30,
            currency: targetCurrency,
            currencySymbol: currencySymbol,
            city: city,
            description: `A beautiful hotel in ${city}.`,
            amenities: getAmenitiesForHotel(city, 4),
            nights: nights,
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`
        });
        
    } catch (error) {
        console.error('Hotel detail error:', error.message);
        res.status(500).json({ error: 'Failed to fetch hotel details' });
    }
});

router.post('/click', async (req, res) => {
    try {
        await supabase.from('clicks').insert([{ hotel_id: req.body.hotel_id, site: req.body.site, clicked_at: new Date() }]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

module.exports = router;