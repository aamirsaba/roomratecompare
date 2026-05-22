// RoomRateCompare - Main Frontend JavaScript

// Set default dates (today and tomorrow)
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const checkinInput = document.getElementById('checkin');
const checkoutInput = document.getElementById('checkout');

if (checkinInput) {
    checkinInput.value = today.toISOString().split('T')[0];
}
if (checkoutInput) {
    checkoutInput.value = tomorrow.toISOString().split('T')[0];
}

// Handle search form
const searchForm = document.getElementById('searchForm');
if (searchForm) {
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const city = document.getElementById('city').value;
        const checkin = document.getElementById('checkin').value;
        const checkout = document.getElementById('checkout').value;
        const guests = document.getElementById('guests').value;
        
        if (!city) {
            alert('Please enter a city or destination');
            return;
        }
        
        // Store search params in sessionStorage
        sessionStorage.setItem('roomratecompare_search', JSON.stringify({
            city, checkin, checkout, guests
        }));
        
        // Redirect to search results page
        window.location.href = `/search?city=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`;
    });
}

// Login button placeholder
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        alert('🔐 Sign in with Google or Email coming soon to RoomRateCompare!');
    });
}

// Track page view
console.log('🏨 RoomRateCompare loaded - Compare room rates instantly');

// Auto-populate search if coming back to homepage
const savedSearch = sessionStorage.getItem('roomratecompare_search');
if (savedSearch && !window.location.pathname.includes('/search')) {
    const search = JSON.parse(savedSearch);
    if (document.getElementById('city')) {
        document.getElementById('city').value = search.city || '';
        document.getElementById('checkin').value = search.checkin || today.toISOString().split('T')[0];
        document.getElementById('checkout').value = search.checkout || tomorrow.toISOString().split('T')[0];
        document.getElementById('guests').value = search.guests || '2';
    }
}