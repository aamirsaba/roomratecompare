const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

// Initialize Apify client
const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

// Search hotels by city using Apify (REAL DATA)
router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching real hotels for: ${city}`);
    
    if (!city || !checkin || !checkout) {
        return res.status(400).json({ error: 'Missing required fields: city, checkin, checkout' });
    }

    try {
        // Calculate nights for pricing
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        // Prepare input for Apify scraper
        const input = {
            search: city,
            maxResults: 20,
            checkIn: checkin,
            checkOut: checkout,
            adults: parseInt(guests),
            currency: 'USD',
            locale: 'en-gb',
            includeDetails: true,
            sortBy: 'best_reviewed_and_lowest_price'
        };
        
        console.log(`🚀 Running Apify scraper for ${city}...`);
        
        // Run the actor
        const run = await apifyClient.actor('voyager/booking-scraper').call(input);
        
        // Fetch results
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        console.log(`✅ Found ${items.length} real hotels for ${city}`);
        
        // Format hotels for response
        const hotels = items.map((hotel, index) => {
            // Calculate total price for the stay
            const pricePerNight = hotel.price || hotel.pricePerNight || 100;
            const totalPrice = pricePerNight * nights;
            
            return {
                id: index + 1,
                name: hotel.name || hotel.title || `${city} Hotel`,
                stars: hotel.stars || Math.floor(Math.random() * 3) + 3,
                price: totalPrice,
                price_per_night: pricePerNight,
                currency: hotel.currency || 'USD',
                rating: hotel.rating || hotel.reviewScore || 0,
                rating_label: hotel.ratingLabel || 'Good',
                reviews_count: hotel.reviews || hotel.reviewsCount || 0,
                description: hotel.description || `Beautiful hotel in ${city}`,
                address: hotel.address || `${city}, ${city}`,
                images: hotel.images || [],
                url: hotel.url || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`,
                checkin,
                checkout,
                guests: parseInt(guests),
                nights: nights,
                total_price: totalPrice,
                booking_link: hotel.url || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}&aid=482713`
            };
        });
        
        // Cache in Supabase
        try {
            await supabase
                .from('hotel_cache')
                .upsert([{ 
                    city: city.toLowerCase(), 
                    data: hotels, 
                    created_at: new Date() 
                }]);
        } catch (dbError) {
            console.log('Cache error (non-critical):', dbError.message);
        }
        
        res.json({ 
            source: 'apify', 
            hotels: hotels,
            count: hotels.length,
            brand: 'RoomRateCompare',
            search_city: city
        });
        
    } catch (error) {
        console.error('❌ Apify search error:', error);
        
        // Fallback to mock data if API fails
        const mockHotels = generateMockFallback(city, checkin, checkout, guests);
        res.json({ 
            source: 'fallback', 
            hotels: mockHotels,
            count: mockHotels.length,
            brand: 'RoomRateCompare',
            warning: 'Using fallback data - API limit reached'
        });
    }
});

// Get single hotel details
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const { city, checkin, checkout, guests } = req.query;
    
    try {
        // Try to get from cache first
        const { data: cached } = await supabase
            .from('hotel_cache')
            .select('data')
            .eq('city', (city || 'muscat').toLowerCase())
            .single();
        
        if (cached && cached.data) {
            const hotel = cached.data.find(h => h.id == id);
            if (hotel) {
                return res.json(hotel);
            }
        }
        
        // If not in cache, run a quick search
        const input = {
            search: city || 'Muscat',
            maxResults: 1,
            checkIn: checkin || '2026-06-01',
            checkOut: checkout || '2026-06-04',
            adults: parseInt(guests) || 2
        };
        
        const run = await apifyClient.actor('voyager/booking-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        if (items && items[0]) {
            const hotel = items[0];
            const nights = checkin && checkout ? Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
            
            return res.json({
                id: parseInt(id),
                name: hotel.name,
                stars: hotel.stars || 4,
                price_per_night: hotel.price || 199,
                total_price: (hotel.price || 199) * nights,
                currency: 'USD',
                city: city || hotel.address || 'Muscat',
                country: 'Oman',
                description: hotel.description,
                images: hotel.images || [],
                booking_link: hotel.url,
                checkin,
                checkout,
                guests: parseInt(guests) || 2,
                nights: nights
            });
        }
        
        // Final fallback
        res.json({
            id: parseInt(id),
            name: `${city || 'Grand'} Plaza Hotel`,
            stars: 4,
            price_per_night: 199,
            total_price: 199,
            currency: 'USD',
            city: city || 'Muscat',
            country: 'Oman',
            description: 'Luxury hotel with great amenities',
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'Muscat')}`
        });
        
    } catch (error) {
        console.error('Hotel detail error:', error);
        res.status(500).json({ error: 'Failed to fetch hotel details' });
    }
});

// Track clicks
router.post('/click', async (req, res) => {
    const { hotel_id, user_id, price, checkin, checkout } = req.body;
    
    try {
        await supabase
            .from('clicks')
            .insert([{
                hotel_id: hotel_id,
                user_id: user_id || 'anonymous',
                price: price,
                checkin: checkin,
                checkout: checkout,
                clicked_at: new Date()
            }]);
        res.json({ success: true });
    } catch (error) {
        console.error('Click tracking error:', error);
        res.json({ success: false });
    }
});

// Fallback mock data generator
function generateMockFallback(city, checkin, checkout, guests) {
    const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
    const hotels = [
        { id: 1, name: `${city} Grand Plaza`, stars: 5, pricePerNight: 299 },
        { id: 2, name: `${city} Central Hotel`, stars: 4, pricePerNight: 189 },
        { id: 3, name: `${city} Comfort Inn`, stars: 3, pricePerNight: 99 }
    ];
    
    return hotels.map(h => ({
        ...h,
        total_price: h.pricePerNight * nights,
        nights: nights,
        checkin, checkout, guests,
        currency: 'USD',
        booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`
    }));
}

module.exports = router;