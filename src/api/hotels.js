const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const supabase = require('../db/supabase');

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

router.get('/search', async (req, res) => {
    const { city, checkin, checkout, guests = 2 } = req.query;
    
    console.log(`🔍 Searching for: ${city}`);
    
    if (!city) {
        return res.status(400).json({ error: 'City is required' });
    }

    try {
        // Call YOUR custom Actor
        const input = {
            city: city,
            checkin: checkin || '2026-06-01',
            checkout: checkout || '2026-06-04',
            guests: parseInt(guests)
        };
        
        console.log(`🚀 Calling your Actor for ${city}...`);
        
        const run = await apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
        }
        
        console.log(`✅ Got ${hotels.length} real hotels from your Actor`);
        
        const nights = Math.ceil((new Date(checkout || '2026-06-04') - new Date(checkin || '2026-06-01')) / (1000 * 60 * 60 * 24));
        
        const formattedHotels = hotels.slice(0, 20).map((hotel, idx) => ({
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
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`
        }));
        
        res.json({ 
            source: 'custom-actor', 
            hotels: formattedHotels,
            count: formattedHotels.length
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.json({ source: 'error', hotels: [], error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const { city, checkin, checkout, guests } = req.query;
    
    res.json({
        id: parseInt(id),
        name: `${city || 'Grand'} Hotel`,
        stars: 4,
        price_per_night: 199,
        total_price: 199,
        currency: 'USD',
        city: city || 'Muscat',
        country: 'Oman',
        booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city || 'Muscat')}`
    });
});

router.post('/click', async (req, res) => {
    try {
        await supabase.from('clicks').insert([{
            hotel_id: req.body.hotel_id,
            clicked_at: new Date()
        }]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

module.exports = router;