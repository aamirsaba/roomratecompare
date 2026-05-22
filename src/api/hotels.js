const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// City to country mapping for accurate display
const cityCountryMap = {
  'oman': { city: 'Muscat', country: 'Oman', displayCity: 'Muscat' },
  'muscat': { city: 'Muscat', country: 'Oman', displayCity: 'Muscat' },
  'salalah': { city: 'Salalah', country: 'Oman', displayCity: 'Salalah' },
  'dubai': { city: 'Dubai', country: 'UAE', displayCity: 'Dubai' },
  'abu dhabi': { city: 'Abu Dhabi', country: 'UAE', displayCity: 'Abu Dhabi' },
  'london': { city: 'London', country: 'United Kingdom', displayCity: 'London' },
  'paris': { city: 'Paris', country: 'France', displayCity: 'Paris' },
  'new york': { city: 'New York', country: 'United States', displayCity: 'New York' },
  'los angeles': { city: 'Los Angeles', country: 'United States', displayCity: 'Los Angeles' },
  'tokyo': { city: 'Tokyo', country: 'Japan', displayCity: 'Tokyo' },
  'singapore': { city: 'Singapore', country: 'Singapore', displayCity: 'Singapore' },
  'bangkok': { city: 'Bangkok', country: 'Thailand', displayCity: 'Bangkok' },
  'kuala lumpur': { city: 'Kuala Lumpur', country: 'Malaysia', displayCity: 'Kuala Lumpur' },
  'sydney': { city: 'Sydney', country: 'Australia', displayCity: 'Sydney' },
  'mumbai': { city: 'Mumbai', country: 'India', displayCity: 'Mumbai' },
  'delhi': { city: 'Delhi', country: 'India', displayCity: 'Delhi' },
  'doha': { city: 'Doha', country: 'Qatar', displayCity: 'Doha' },
  'riyadh': { city: 'Riyadh', country: 'Saudi Arabia', displayCity: 'Riyadh' },
  'kuwait': { city: 'Kuwait City', country: 'Kuwait', displayCity: 'Kuwait City' },
  'cairo': { city: 'Cairo', country: 'Egypt', displayCity: 'Cairo' }
};

// Search hotels by city
router.get('/search', async (req, res) => {
  const { city, checkin, checkout, guests = 2 } = req.query;
  
  console.log(`Search request: city=${city}, checkin=${checkin}, checkout=${checkout}`);
  
  if (!city || !checkin || !checkout) {
    return res.status(400).json({ error: 'Missing required fields: city, checkin, checkout' });
  }

  try {
    // Get correct location data
    const searchTerm = city.toLowerCase().trim();
    const location = cityCountryMap[searchTerm] || { 
      city: city.charAt(0).toUpperCase() + city.slice(1), 
      country: 'International',
      displayCity: city.charAt(0).toUpperCase() + city.slice(1)
    };
    
    // Generate hotels based on the searched city with correct location
    const hotels = generateHotelsByCity(searchTerm, location, checkin, checkout, guests);
    
    // Cache the results in Supabase
    try {
      await supabase
        .from('hotel_cache')
        .upsert([{ city: searchTerm, data: hotels, created_at: new Date() }]);
    } catch (dbError) {
      console.log('Cache error (non-critical):', dbError.message);
    }

    res.json({ 
      source: 'api', 
      hotels: hotels,
      count: hotels.length,
      brand: 'RoomRateCompare',
      location: location
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to fetch room rates', details: error.message });
  }
});

// Get single hotel by ID
router.get('/:id', async (req, res) => {
  const hotelId = req.params.id;
  const { checkin, checkout, guests, city } = req.query;
  
  console.log(`Fetching hotel details for ID: ${hotelId}, city: ${city}`);
  
  try {
    // Get location data
    const searchTerm = (city || '').toLowerCase().trim();
    const location = cityCountryMap[searchTerm] || { 
      city: city || 'Hotel', 
      country: 'International',
      displayCity: city || 'Hotel'
    };
    
    // Calculate nights
    const nights = checkin && checkout ? Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)) : 1;
    const guestCount = parseInt(guests) || 2;
    
    // Generate hotel based on ID and location
    const hotelData = {
      1: { name: 'Grand Plaza', stars: 5, price_per_night: 299 },
      2: { name: 'Central Hotel', stars: 4, price_per_night: 189 },
      3: { name: 'Comfort Inn', stars: 3, price_per_night: 99 },
      4: { name: 'Luxury Tower', stars: 5, price_per_night: 459 },
      5: { name: 'Business Hotel', stars: 4, price_per_night: 219 },
      6: { name: 'Beach Resort', stars: 5, price_per_night: 349 },
      7: { name: 'Boutique Stay', stars: 4, price_per_night: 159 },
      8: { name: 'Economy Lodge', stars: 2, price_per_night: 69 }
    };
    
    const data = hotelData[hotelId];
    if (!data) {
      return res.status(404).json({ error: 'Hotel not found' });
    }
    
    const hotel = {
      id: parseInt(hotelId),
      name: `${location.displayCity} ${data.name}`,
      stars: data.stars,
      price_per_night: data.price_per_night,
      currency: 'USD',
      city: location.displayCity,
      country: location.country
    };
    
    const totalPrice = hotel.price_per_night * nights;
    
    res.json({
      ...hotel,
      checkin,
      checkout,
      guests: guestCount,
      nights: nights,
      total_price: totalPrice,
      booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(location.displayCity)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guestCount}&aid=${process.env.BOOKING_AFFILIATE_ID || '482713'}`
    });
    
  } catch (error) {
    console.error('Hotel detail error:', error);
    res.status(500).json({ error: 'Failed to fetch hotel details' });
  }
});

// Track user click for analytics
router.post('/click', async (req, res) => {
  const { hotel_id, user_id, price, checkin, checkout, room_type } = req.body;

  try {
    await supabase
      .from('clicks')
      .insert([{
        hotel_id: hotel_id,
        user_id: user_id || 'anonymous',
        price: price,
        checkin: checkin,
        checkout: checkout,
        room_type: room_type || 'unknown',
        clicked_at: new Date()
      }]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Click tracking error:', error);
    res.json({ success: false });
  }
});

// Helper: Generate hotels based on city with correct location
function generateHotelsByCity(searchTerm, location, checkin, checkout, guests) {
  const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
  const cityName = location.displayCity;
  const countryName = location.country;
  
  const hotels = [
    { id: 1, name: `${cityName} Grand Plaza`, stars: 5, pricePerNight: 299 },
    { id: 2, name: `${cityName} Central Hotel`, stars: 4, pricePerNight: 189 },
    { id: 3, name: `${cityName} Comfort Inn`, stars: 3, pricePerNight: 99 },
    { id: 4, name: `${cityName} Luxury Tower`, stars: 5, pricePerNight: 459 },
    { id: 5, name: `${cityName} Business Hotel`, stars: 4, pricePerNight: 219 },
    { id: 6, name: `${cityName} Beach Resort`, stars: 5, pricePerNight: 349 },
    { id: 7, name: `${cityName} Boutique Stay`, stars: 4, pricePerNight: 159 },
    { id: 8, name: `${cityName} Economy Lodge`, stars: 2, pricePerNight: 69 }
  ];
  
  return hotels.map(h => ({
    id: h.id,
    name: h.name,
    stars: h.stars,
    price: h.pricePerNight * nights,
    price_per_night: h.pricePerNight,
    currency: 'USD',
    city: cityName,
    country: countryName,
    checkin,
    checkout,
    guests: parseInt(guests),
    nights: nights,
    total_price: h.pricePerNight * nights,
    booking_link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(cityName)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}&aid=${process.env.BOOKING_AFFILIATE_ID || '482713'}`
  }));
}

module.exports = router;