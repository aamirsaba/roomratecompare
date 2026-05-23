const { ApifyClient } = require('apify-client');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const apifyClient = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Popular cities to pre-populate
const POPULAR_CITIES = [
    'Dubai', 'London', 'Paris', 'New York', 'Singapore', 
    'Bangkok', 'Tokyo', 'Sydney', 'Rome', 'Barcelona',
    'Karachi', 'Lahore', 'Mumbai', 'Delhi', 'Muscat'
];

// Default dates (tomorrow for 2 nights)
const getDates = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return {
        checkin: tomorrow.toISOString().split('T')[0],
        checkout: dayAfter.toISOString().split('T')[0]
    };
};

async function prepopulateCity(city) {
    const { checkin, checkout } = getDates();
    const cacheKey = `${city.toLowerCase()}_${checkin}_${checkout}_2`;
    
    console.log(`🔄 Pre-populating ${city}...`);
    
    try {
        const input = {
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: 2
        };
        
        const run = await apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
        }
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        const formattedHotels = hotels.slice(0, 15).map((hotel, idx) => ({
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
            guests: 2,
            booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=2`
        }));
        
        if (formattedHotels.length > 0) {
            // Store in Supabase
            await supabase
                .from('hotel_cache')
                .upsert({ 
                    city: city.toLowerCase(), 
                    check_in: checkin,
                    check_out: checkout,
                    data: formattedHotels, 
                    created_at: new Date() 
                });
            console.log(`✅ Pre-populated ${city} with ${formattedHotels.length} hotels`);
        } else {
            console.log(`⚠️ No hotels found for ${city}`);
        }
        
    } catch (error) {
        console.error(`❌ Failed to prepopulate ${city}:`, error.message);
    }
}

async function runPrepopulation() {
    console.log(`🚀 Starting cache prepopulation for ${POPULAR_CITIES.length} cities...`);
    console.log(`📅 Using dates: ${getDates().checkin} to ${getDates().checkout}`);
    
    for (const city of POPULAR_CITIES) {
        await prepopulateCity(city);
        // Wait 5 seconds between cities to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log('✅ Cache prepopulation complete!');
    process.exit(0);
}

runPrepopulation();