const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');
const { getCountryByCity, getCountryList } = require('../utils/geoUtils');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Store recent search results in memory
let recentSearchResults = {};

// Helper to get country from city (async, uses real API)
async function getCountryFromCityAsync(city) {
    if (!city) return 'International';
    
    try {
        const result = await getCountryByCity(city);
        if (result && result.countryName) {
            return result.countryName;
        }
    } catch (error) {
        console.error('Geo lookup error:', error.message);
    }
    
    return 'International';
}

// Search hotels by city
router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city}`);
    
    if (!city) {
        return res.status(400).json({ error: 'City is required' });
    }

    try {
        const input = {
            search: city,
            maxResults: 10,
            checkIn: checkin || '2026-06-01',
            checkOut: checkout || '2026-06-04',
            adults: parseInt(guests),
            currency: 'USD'
        };
        
        console.log('🚀 Running FAST Booking Scraper...');
        const run = await apifyClient.actor('voyager/fast-booking-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        console.log(`✅ Got ${items.length} hotels from Apify`);
        
        const nights = Math.ceil((new Date(checkout || '2026-06-04') - new Date(checkin || '2026-06-01')) / (1000 * 60 * 60 * 24));
        
        // Get country for this city using real API
        const countryName = await getCountryFromCityAsync(city);
        
        const hotels = items.slice(0, 10).map((hotel, idx) => ({
            id: idx + 1,
            name: hotel.name || `${city} Hotel`,
            stars: hotel.stars || Math.floor(Math.random() * 3) + 3,
            price: (hotel.price || 100) * nights,
            price_per_night: hotel.price || 100,
            currency: 'USD',
            rating: hotel.rating || 8,
            nights: nights,
            city: city.charAt(0).toUpperCase() + city.slice(1).toLowerCase(),
            country: countryName,
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests),
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin || '2026-06-01'}&checkout=${checkout || '2026-06-04'}&group_adults=${guests || 2}`
        }));
        
        // Store in memory for detail page
        recentSearchResults[city.toLowerCase()] = hotels;
        
        res.json({ 
            source: 'apify-fast', 
            hotels: hotels,
            count: hotels.length
        });
        
    } catch (error) {
        console.error('❌ Apify error:', error.message);
        
        const nights = Math.ceil((new Date(checkout || '2026-06-04') - new Date(checkin || '2026-06-01')) / (1000 * 60 * 60 * 24));
        const countryName = await getCountryFromCityAsync(city);
        
        const fallbackHotels = [
            { id: 1, name: `${city} Grand Hotel`, stars: 5, price: 299 * nights, price_per_night: 299, currency: 'USD', nights: nights, city: city, country: countryName },
            { id: 2, name: `${city} Central Plaza`, stars: 4, price: 189 * nights, price_per_night: 189, currency: 'USD', nights: nights, city: city, country: countryName },
            { id: 3, name: `${city} Beach Resort`, stars: 5, price: 349 * nights, price_per_night: 349, currency: 'USD', nights: nights, city: city, country: countryName },
            { id: 4, name: `${city} Business Hotel`, stars: 4, price: 219 * nights, price_per_night: 219, currency: 'USD', nights: nights, city: city, country: countryName },
            { id: 5, name: `${city} Comfort Inn`, stars: 3, price: 99 * nights, price_per_night: 99, currency: 'USD', nights: nights, city: city, country: countryName }
        ];
        
        recentSearchResults[city.toLowerCase()] = fallbackHotels;
        
        res.json({ 
            source: 'fallback', 
            hotels: fallbackHotels,
            count: fallbackHotels.length
        });
    }
});

// Get single hotel details
router.get('/:id', async (req, res) => {
    const hotelId = parseInt(req.params.id);
    const { city, checkin, checkout, guests } = req.query;
    
    console.log(`🔍 Fetching hotel ID: ${hotelId}, City: ${city}`);
    
    try {
        let hotel = null;
        const searchKey = (city || 'muscat').toLowerCase();
        
        // Try to find hotel in recent search results
        if (recentSearchResults[searchKey]) {
            hotel = recentSearchResults[searchKey].find(h => h.id === hotelId);
        }
        
        if (hotel) {
            const nights = checkin && checkout ? 
                Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 
                (hotel.nights || 1);
            const totalPrice = (hotel.price_per_night || hotel.price / nights) * nights;
            
            // Get country using real API
            const countryName = await getCountryFromCityAsync(city || hotel.city);
            
            return res.json({
                id: hotel.id,
                name: hotel.name,
                stars: hotel.stars,
                price_per_night: hotel.price_per_night,
                total_price: totalPrice,
                currency: hotel.currency || 'USD',
                city: (hotel.city || city || 'City').charAt(0).toUpperCase() + (hotel.city || city || 'City').slice(1).toLowerCase(),
                country: countryName,
                description: `${hotel.name} offers comfortable accommodation in ${hotel.city || city}.`,
                amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping', 'Elevator', 'Luggage storage'],
                checkin: checkin || hotel.checkin,
                checkout: checkout || hotel.checkout,
                guests: parseInt(guests) || hotel.guests || 2,
                nights: nights,
                booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.city || city || 'City')}&checkin=${checkin || '2026-06-01'}&checkout=${checkout || '2026-06-04'}&group_adults=${guests || 2}`
            });
        }
        
        // Fallback hotel if not found
        const nights = checkin && checkout ? 
            Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
        
        const countryName = await getCountryFromCityAsync(city);
        const cityName = (city || 'Muscat').charAt(0).toUpperCase() + (city || 'Muscat').slice(1).toLowerCase();
        
        res.json({
            id: hotelId,
            name: `${cityName} Grand Hotel`,
            stars: 4,
            price_per_night: 199,
            total_price: 199 * nights,
            currency: 'USD',
            city: cityName,
            country: countryName,
            description: `A beautiful hotel located in the heart of ${cityName}. Great service and amenities.`,
            amenities: ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Restaurant', 'Parking', 'Room service'],
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests) || 2,
            nights: nights,
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'Muscat')}&checkin=${checkin || '2026-06-01'}&checkout=${checkout || '2026-06-04'}&group_adults=${guests || 2}`
        });
        
    } catch (error) {
        console.error('❌ Hotel detail error:', error.message);
        res.status(500).json({ error: 'Failed to fetch hotel details' });
    }
});

// Track user clicks
router.post('/click', async (req, res) => {
    const { hotel_id, room_type, price } = req.body;
    
    try {
        await supabase
            .from('clicks')
            .insert([{
                hotel_id: hotel_id,
                room_type: room_type || 'unknown',
                price: price,
                clicked_at: new Date()
            }]);
        res.json({ success: true });
    } catch (error) {
        console.error('Click tracking error:', error.message);
        res.json({ success: false });
    }
});

// Get list of all countries (optional - for autocomplete)
router.get('/countries', async (req, res) => {
    try {
        const countries = await getCountryList();
        res.json({ countries: countries.slice(0, 50) }); // Return top 50
    } catch (error) {
        console.error('Countries error:', error.message);
        res.json({ countries: [] });
    }
});

module.exports = router;