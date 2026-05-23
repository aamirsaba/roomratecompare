const axios = require('axios');
const cheerio = require('cheerio');

async function searchHotels(city, checkin, checkout, guests) {
    console.log(`🔍 Custom scraping Booking.com for: ${city}`);
    
    try {
        const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;
        
        console.log(`📡 Fetching: ${searchUrl}`);
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        const hotels = [];
        
        // Try multiple possible selectors (Booking.com changes them often)
        const selectors = [
            '[data-testid="property-card"]',
            '.sr_property_block',
            '.sr_item',
            '.hotel_card'
        ];
        
        let hotelElements = [];
        for (const selector of selectors) {
            hotelElements = $(selector);
            if (hotelElements.length > 0) {
                console.log(`✅ Found hotels using selector: ${selector}`);
                break;
            }
        }
        
        hotelElements.each((index, element) => {
            if (index >= 5) return;
            
            // Try multiple ways to get hotel name
            let name = $(element).find('[data-testid="title"]').text().trim();
            if (!name) name = $(element).find('.sr-hotel__name').text().trim();
            if (!name) name = $(element).find('.hotel_name').text().trim();
            if (!name) name = $(element).find('a[data-testid="property-card-link"]').text().trim();
            
            // Try multiple ways to get price
            let priceText = $(element).find('[data-testid="price-and-discounted-price"]').text().trim();
            if (!priceText) priceText = $(element).find('.prco-valign-middle-helper').text().trim();
            if (!priceText) priceText = $(element).find('.bui-price-display__value').text().trim();
            
            // Extract numeric price
            let price = 0;
            const priceMatch = priceText.match(/(\d+(?:\.\d+)?)/);
            if (priceMatch) price = parseFloat(priceMatch[1]);
            
            // Get hotel URL
            let hotelUrl = $(element).find('a[data-testid="property-card-link"]').attr('href');
            if (!hotelUrl) hotelUrl = $(element).find('.hotel_name_link').attr('href');
            
            if (name && price > 0) {
                hotels.push({
                    name: name,
                    price: price,
                    price_per_night: price,
                    stars: 4,
                    rating: 0,
                    booking_link: hotelUrl ? `https://www.booking.com${hotelUrl}` : null
                });
            }
        });
        
        if (hotels.length === 0) {
            console.log('⚠️ No hotels found, using fallback data');
            return getFallbackHotels(city);
        }
        
        console.log(`✅ Custom scraper found ${hotels.length} hotels`);
        return hotels;
        
    } catch (error) {
        console.error('❌ Custom scraper error:', error.message);
        return getFallbackHotels(city);
    }
}

function getFallbackHotels(city) {
    const cityName = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
    return [
        { name: `${cityName} Grand Hotel`, price: 299, price_per_night: 299, stars: 5, rating: 8.5 },
        { name: `${cityName} Central Hotel`, price: 189, price_per_night: 189, stars: 4, rating: 8.0 },
        { name: `${cityName} Business Inn`, price: 219, price_per_night: 219, stars: 4, rating: 7.5 },
        { name: `${cityName} Beach Resort`, price: 349, price_per_night: 349, stars: 5, rating: 9.0 },
        { name: `${cityName} Economy Lodge`, price: 99, price_per_night: 99, stars: 3, rating: 7.0 }
    ];
}

module.exports = { searchHotels };