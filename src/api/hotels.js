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

// Search hotels using Google Hotels Scraper (MUCH cheaper!)
router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city}`);
    
    if (!city) {
        return res.status(400).json({ error: 'City is required' });
    }

    try {
        // Google Hotels Scraper input format
        const input = {
            searches: [
                { 
                    location: city, 
                    checkInDate: checkin || '2026-06-01', 
                    checkOutDate: checkout || '2026-06-04' 
                }
            ],
            adults: parseInt(guests),
            rooms: 1,
            currency: 'USD',
            maxResults: 20,
            includeDetails: true,      // Get full details (prices, amenities, booking links)
            includeReviews: false      // Skip reviews for speed and cost savings
        };
        
        console.log('🚀 Running Google Hotels Scraper (cheaper!)...');
        const run = await apifyClient.actor('kaix/google-hotels-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        console.log(`✅ Got ${items.length} hotels from Google Hotels`);
        
        const nights = Math.ceil((new Date(checkout || '2026-06-04') - new Date(checkin || '2026-06-01')) / (1000 * 60 * 60 * 24));
        
        // Get country using geoUtils
        const countryName = await getCountryFromCityAsync(city);
        
        const hotels = items.slice(0, 20).map((hotel, idx) => {
            // Extract best price from bookingLinks if available
            let bestPrice = hotel.pricePerNight || hotel.totalPrice || 100;
            let bestBookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`;
            
            if (hotel.bookingLinks && hotel.bookingLinks.length > 0) {
                // Find the cheapest option
                const cheapest = hotel.bookingLinks.reduce((min, link) => 
                    (link.price && link.price < min.price) ? link : min, 
                    { price: Infinity, url: null }
                );
                if (cheapest.url) {
                    bestBookingUrl = cheapest.url;
                    bestPrice = cheapest.price || bestPrice;
                }
            }
            
            return {
                id: idx + 1,
                name: hotel.name || `${city} Hotel`,
                stars: hotel.starRating || 4,
                price: bestPrice * nights,
                price_per_night: bestPrice,
                currency: hotel.currency || 'USD',
                rating: hotel.reviewScore || 8,
                reviewCount: hotel.reviewCount || 0,
                nights: nights,
                city: city.charAt(0).toUpperCase() + city.slice(1).toLowerCase(),
                country: countryName,
                checkin: checkin || '2026-06-01',
                checkout: checkout || '2026-06-04',
                guests: parseInt(guests),
                booking_link: bestBookingUrl,
                // Store full data for detail page
                fullData: {
                    description: hotel.description || '',
                    amenities: hotel.amenities || [],
                    address: hotel.address || '',
                    phone: hotel.phone || '',
                    checkInTime: hotel.checkInTime || '2:00 PM',
                    checkOutTime: hotel.checkOutTime || '12:00 PM',
                    photos: hotel.photos || [],
                    bookingLinks: hotel.bookingLinks || [],
                    nearbyPlaces: hotel.nearbyPlaces || [],
                    propertyType: hotel.propertyType || '',
                    latitude: hotel.latitude,
                    longitude: hotel.longitude
                }
            };
        });
        
        // Store in memory for detail page
        recentSearchResults[city.toLowerCase()] = hotels;
        
        res.json({ 
            source: 'google-hotels', 
            hotels: hotels,
            count: hotels.length
        });
        
    } catch (error) {
        console.error('❌ Google Hotels error:', error.message);
        console.error('💡 Using fallback mock data...');
        
        const nights = Math.ceil((new Date(checkout || '2026-06-04') - new Date(checkin || '2026-06-01')) / (1000 * 60 * 60 * 24));
        const countryName = await getCountryFromCityAsync(city);
        const cityName = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
        
        const fallbackHotels = [
            { 
                id: 1, name: `${cityName} Grand Hotel`, stars: 5, 
                price: 299 * nights, price_per_night: 299, currency: 'USD', 
                nights: nights, city: cityName, country: countryName 
            },
            { 
                id: 2, name: `${cityName} Central Plaza`, stars: 4, 
                price: 189 * nights, price_per_night: 189, currency: 'USD', 
                nights: nights, city: cityName, country: countryName 
            },
            { 
                id: 3, name: `${cityName} Beach Resort`, stars: 5, 
                price: 349 * nights, price_per_night: 349, currency: 'USD', 
                nights: nights, city: cityName, country: countryName 
            },
            { 
                id: 4, name: `${cityName} Business Hotel`, stars: 4, 
                price: 219 * nights, price_per_night: 219, currency: 'USD', 
                nights: nights, city: cityName, country: countryName 
            },
            { 
                id: 5, name: `${cityName} Comfort Inn`, stars: 3, 
                price: 99 * nights, price_per_night: 99, currency: 'USD', 
                nights: nights, city: cityName, country: countryName 
            }
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
            
            // Get amenities from fullData or use defaults
            const amenities = hotel.fullData?.amenities || 
                ['Free WiFi', 'Air conditioning', '24/7 front desk', 'Housekeeping', 'Elevator', 'Luggage storage'];
            
            const description = hotel.fullData?.description || 
                `${hotel.name} offers comfortable accommodation in ${hotel.city || city}.`;
            
            const cityFormatted = (hotel.city || city || 'City').charAt(0).toUpperCase() + 
                (hotel.city || city || 'City').slice(1).toLowerCase();
            
            return res.json({
                id: hotel.id,
                name: hotel.name,
                stars: hotel.stars,
                price_per_night: hotel.price_per_night,
                total_price: totalPrice,
                currency: hotel.currency || 'USD',
                city: cityFormatted,
                country: countryName,
                description: description,
                amenities: amenities,
                checkin: checkin || hotel.checkin,
                checkout: checkout || hotel.checkout,
                guests: parseInt(guests) || hotel.guests || 2,
                nights: nights,
                checkInTime: hotel.fullData?.checkInTime || '2:00 PM',
                checkOutTime: hotel.fullData?.checkOutTime || '12:00 PM',
                address: hotel.fullData?.address || `${cityFormatted}, ${countryName}`,
                phone: hotel.fullData?.phone || '',
                photos: hotel.fullData?.photos || [],
                booking_link: hotel.booking_link,
                bookingLinks: hotel.fullData?.bookingLinks || []
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
            checkInTime: '2:00 PM',
            checkOutTime: '12:00 PM',
            address: `${cityName}, ${countryName}`,
            phone: '',
            photos: [],
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'Muscat')}&checkin=${checkin || '2026-06-01'}&checkout=${checkout || '2026-06-04'}&group_adults=${guests || 2}`,
            bookingLinks: []
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

// Get list of all countries (for autocomplete)
router.get('/countries', async (req, res) => {
    try {
        const countries = await getCountryList();
        res.json({ countries: countries.slice(0, 50) });
    } catch (error) {
        console.error('Countries error:', error.message);
        res.json({ countries: [] });
    }
});

module.exports = router;