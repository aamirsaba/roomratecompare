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
    'Karachi', 'Lahore', 'Mumbai', 'Delhi', 'Muscat',
    'Kuala Lumpur', 'Istanbul', 'Hong Kong', 'Shanghai', 'Los Angeles'
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

// Helper: Illustrative stars based on price
function getIllustrativeStars(pricePerNight) {
    if (pricePerNight >= 150) return 5;
    if (pricePerNight >= 100) return 4;
    if (pricePerNight >= 60) return 3;
    if (pricePerNight >= 35) return 2;
    return 1;
}

// Helper: Dynamic amenities
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

async function prepopulateCity(city) {
    const { checkin, checkout } = getDates();
    const cacheKey = `${city.toLowerCase()}_${checkin}_${checkout}_2`;
    
    console.log(`🔄 Pre-populating ${city}...`);
    
    try {
        // Force USD currency by adding it to the input
        const input = {
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: 2,
            currency: 'USD'  // FORCE USD - NO CONVERSION
        };
        
        const run = await apifyClient.actor('roomratecompare/apify-hotel-scraper').call(input);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        let hotels = [];
        if (items && items.length > 0 && items[0].hotels) {
            hotels = items[0].hotels;
        }
        
        const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
        
        // Store prices in USD (no conversion)
        const formattedHotels = hotels.slice(0, 30).map((hotel, idx) => {
            const usdPricePerNight = hotel.pricePerNight || 99;
            const illustrativeStars = getIllustrativeStars(usdPricePerNight);
            
            return {
                id: idx + 1,
                name: hotel.name,
                stars: illustrativeStars,
                price_per_night: usdPricePerNight,
                price: usdPricePerNight * nights,
                currency: 'USD',
                currencySymbol: '$',
                nights: nights,
                city: city,
                checkin: checkin,
                checkout: checkout,
                guests: 2,
                amenities: getAmenitiesForHotel(hotel.name, illustrativeStars),
                booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name)}&checkin=${checkin}&checkout=${checkout}&group_adults=2`
            };
        });
        
        if (formattedHotels.length > 0) {
            // Store in Supabase with USD
            await supabase
                .from('hotel_cache')
                .upsert({ 
                    city: city.toLowerCase(), 
                    check_in: checkin,
                    check_out: checkout,
                    data: formattedHotels, 
                    created_at: new Date() 
                });
            console.log(`✅ Pre-populated ${city} with ${formattedHotels.length} hotels (USD prices)`);
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
    console.log(`💰 Storing prices in USD (will convert to user's currency on the fly)`);
    
    for (const city of POPULAR_CITIES) {
        await prepopulateCity(city);
        // Wait 3 seconds between cities to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log('✅ Cache prepopulation complete!');
    console.log('💡 Prices are stored in USD. Users will see converted prices based on their location.');
    process.exit(0);
}

runPrepopulation();