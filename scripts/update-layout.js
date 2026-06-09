const fs = require('fs');
const path = require('path');

// ============ HEADER HTML ============
const headerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>RoomRateCompare | Compare Hotel Room Rates</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <nav>
            <div class="logo">
                <h1>Room<span>Rate</span>Compare</h1>
                <p class="tagline">Compare 1000+ hotels. Find your best room rate.</p>
            </div>
            <button class="mobile-menu-btn" id="menuBtn" aria-label="Menu">☰</button>
            <div class="nav-links" id="navLinks">
                <a href="/">Home</a>
                <a href="/search">Search</a>
                <a href="/agents">Travel Agents</a>
                <a href="/agent-register">Become an Agent</a>
                <a href="/blog">Blog</a>
                <a href="/partners">Partners</a>
            </div>
        </nav>
        <div class="menu-overlay" id="menuOverlay"></div>
    </header>`;

// ============ FOOTER HTML ============
const footerHtml = `    <footer>
        <div class="footer-container">
            <div class="footer-column">
                <h3>🏨 RoomRateCompare</h3>
                <p>Compare hotel room rates from 50+ travel sites including Booking.com, Agoda, and Expedia. Find the best price for your stay.</p>
                <p>📍 UK: Aamir Saba Ltd<br>📍 USA: Aamir Saba Inc</p>
            </div>
            
            <div class="footer-column">
                <h3>🔗 Quick Links</h3>
                <ul>
                    <li><a href="/">Home</a></li>
                    <li><a href="/search">Search Hotels</a></li>
                    <li><a href="/agents">Travel Agents</a></li>
                    <li><a href="/agent-register">Become an Agent</a></li>
                    <li><a href="/blog">Travel Blog</a></li>
                    <li><a href="/partners">Affiliate Partners</a></li>
                </ul>
            </div>
            
            <div class="footer-column">
                <h3>⚖️ Legal & Support</h3>
                <ul>
                    <li><a href="/privacy">Privacy Policy</a></li>
                    <li><a href="/terms">Terms & Conditions</a></li>
                    <li><a href="/refund">Refund Policy</a></li>
                    <li><a href="/cookie-policy">Cookie Policy</a></li>
                    <li><a href="/affiliate-disclosure">Affiliate Disclosure</a></li>
                    <li><a href="/disclaimer">Disclaimer</a></li>
                    <li><a href="/agent-agreement">Agent Agreement</a></li>
                    <li><a href="/contact">Contact Us</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 RoomRateCompare.com. All rights reserved. | Compare hotel room rates worldwide.</p>
        </div>
    </footer>

    <script>
        // ============ MOBILE MENU FUNCTIONALITY ============
        (function() {
            const menuBtn = document.getElementById('menuBtn');
            const navLinks = document.getElementById('navLinks');
            const menuOverlay = document.getElementById('menuOverlay');
            
            if (!menuBtn) return;
            
            function toggleMenu() {
                navLinks.classList.toggle('active');
                menuOverlay.classList.toggle('active');
                document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
            }
            
            function closeMenu() {
                navLinks.classList.remove('active');
                menuOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
            
            menuBtn.addEventListener('click', toggleMenu);
            
            if (menuOverlay) {
                menuOverlay.addEventListener('click', closeMenu);
            }
            
            document.querySelectorAll('.nav-links a').forEach(link => {
                link.addEventListener('click', closeMenu);
            });
            
            window.addEventListener('resize', function() {
                if (window.innerWidth > 768) {
                    closeMenu();
                }
            });
            
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                    closeMenu();
                }
            });
        })();
    </script>
</body>
</html>`;

// ============ SCRIPT TO UPDATE FILES ============

const publicDir = path.join(__dirname, '../public');

function getAllHtmlFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            getAllHtmlFiles(filePath, fileList);
        } else if (file.endsWith('.html')) {
            fileList.push(filePath);
        }
    });
    
    return fileList;
}

function getPageTitle(filePath) {
    const fileName = path.basename(filePath, '.html');
    const titles = {
        'index': 'Home',
        'search': 'Search Hotels',
        'agents': 'Travel Agents',
        'hotel': 'Hotel Details',
        'agent-register': 'Become a Travel Agent',
        'agent-login': 'Agent Login',
        'agent-dashboard': 'Agent Dashboard',
        'blog': 'Travel Blog',
        'partners': 'Affiliate Partners',
        'privacy': 'Privacy Policy',
        'terms': 'Terms & Conditions',
        'refund': 'Refund Policy',
        'cookie-policy': 'Cookie Policy',
        'affiliate-disclosure': 'Affiliate Disclosure',
        'disclaimer': 'Disclaimer',
        'agent-agreement': 'Agent Agreement',
        'contact': 'Contact Us'
    };
    return titles[fileName] || 'RoomRateCompare';
}

function getBodyContent(content) {
    // Extract body content between <body> and </body>
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
        let bodyContent = bodyMatch[1];
        
        // Remove existing header and footer if present
        bodyContent = bodyContent.replace(/<header>[\s\S]*?<\/header>/i, '');
        bodyContent = bodyContent.replace(/<footer>[\s\S]*?<\/footer>/i, '');
        bodyContent = bodyContent.replace(/<script>[\s\S]*?<\/script>/i, '');
        
        return bodyContent.trim();
    }
    return content;
}

function updateFile(filePath) {
    console.log(`📝 Processing: ${path.basename(filePath)}`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    const pageTitle = getPageTitle(filePath);
    
    // Get the body content (without header/footer)
    let bodyContent = getBodyContent(content);
    
    // If we couldn't extract body content properly, try to keep original content
    if (!bodyContent || bodyContent.length < 10) {
        // Remove header and footer using regex
        bodyContent = content.replace(/<header>[\s\S]*?<\/header>/i, '');
        bodyContent = bodyContent.replace(/<footer>[\s\S]*?<\/footer>/i, '');
        bodyContent = bodyContent.replace(/<script>[\s\S]*?<\/script>/, '');
        
        // Remove DOCTYPE, html, head, body tags
        bodyContent = bodyContent.replace(/<!DOCTYPE[^>]*>/i, '');
        bodyContent = bodyContent.replace(/<html[^>]*>/i, '');
        bodyContent = bodyContent.replace(/<head>[\s\S]*?<\/head>/i, '');
        bodyContent = bodyContent.replace(/<body[^>]*>/i, '');
        bodyContent = bodyContent.replace(/<\/body>/i, '');
        bodyContent = bodyContent.replace(/<\/html>/i, '');
        bodyContent = bodyContent.trim();
    }
    
    // Build new HTML
    const newHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>${pageTitle} | RoomRateCompare</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <nav>
            <div class="logo">
                <h1>Room<span>Rate</span>Compare</h1>
                <p class="tagline">Compare 1000+ hotels. Find your best room rate.</p>
            </div>
            <button class="mobile-menu-btn" id="menuBtn" aria-label="Menu">☰</button>
            <div class="nav-links" id="navLinks">
                <a href="/">Home</a>
                <a href="/search">Search</a>
                <a href="/agents">Travel Agents</a>
                <a href="/agent-register">Become an Agent</a>
                <a href="/blog">Blog</a>
                <a href="/partners">Partners</a>
            </div>
        </nav>
        <div class="menu-overlay" id="menuOverlay"></div>
    </header>

    <main>
        ${bodyContent}
    </main>

    <footer>
        <div class="footer-container">
            <div class="footer-column">
                <h3>🏨 RoomRateCompare</h3>
                <p>Compare hotel room rates from 50+ travel sites including Booking.com, Agoda, and Expedia. Find the best price for your stay.</p>
                <p>📍 UK: Aamir Saba Ltd<br>📍 USA: Aamir Saba Inc</p>
            </div>
            
            <div class="footer-column">
                <h3>🔗 Quick Links</h3>
                <ul>
                    <li><a href="/">Home</a></li>
                    <li><a href="/search">Search Hotels</a></li>
                    <li><a href="/agents">Travel Agents</a></li>
                    <li><a href="/agent-register">Become an Agent</a></li>
                    <li><a href="/blog">Travel Blog</a></li>
                    <li><a href="/partners">Affiliate Partners</a></li>
                </ul>
            </div>
            
            <div class="footer-column">
                <h3>⚖️ Legal & Support</h3>
                <ul>
                    <li><a href="/privacy">Privacy Policy</a></li>
                    <li><a href="/terms">Terms & Conditions</a></li>
                    <li><a href="/refund">Refund Policy</a></li>
                    <li><a href="/cookie-policy">Cookie Policy</a></li>
                    <li><a href="/affiliate-disclosure">Affiliate Disclosure</a></li>
                    <li><a href="/disclaimer">Disclaimer</a></li>
                    <li><a href="/agent-agreement">Agent Agreement</a></li>
                    <li><a href="/contact">Contact Us</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 RoomRateCompare.com. All rights reserved. | Compare hotel room rates worldwide.</p>
        </div>
    </footer>

    <script>
        // ============ MOBILE MENU FUNCTIONALITY ============
        (function() {
            const menuBtn = document.getElementById('menuBtn');
            const navLinks = document.getElementById('navLinks');
            const menuOverlay = document.getElementById('menuOverlay');
            
            if (!menuBtn) return;
            
            function toggleMenu() {
                navLinks.classList.toggle('active');
                menuOverlay.classList.toggle('active');
                document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
            }
            
            function closeMenu() {
                navLinks.classList.remove('active');
                menuOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
            
            menuBtn.addEventListener('click', toggleMenu);
            
            if (menuOverlay) {
                menuOverlay.addEventListener('click', closeMenu);
            }
            
            document.querySelectorAll('.nav-links a').forEach(link => {
                link.addEventListener('click', closeMenu);
            });
            
            window.addEventListener('resize', function() {
                if (window.innerWidth > 768) {
                    closeMenu();
                }
            });
            
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                    closeMenu();
                }
            });
        })();
    </script>
</body>
</html>`;
    
    // Write the new HTML
    fs.writeFileSync(filePath, newHtml, 'utf8');
    console.log(`✅ Updated: ${path.basename(filePath)}`);
}

// Main execution
console.log('🔍 Finding all HTML files...');
const htmlFiles = getAllHtmlFiles(publicDir);
console.log(`📄 Found ${htmlFiles.length} HTML files\n`);

htmlFiles.forEach(updateFile);

console.log('\n🎉 All files updated successfully!');
console.log('📱 Now responsive with mobile menu and 3-column footer');