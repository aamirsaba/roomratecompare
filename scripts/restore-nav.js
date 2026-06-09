const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

// Correct navigation HTML
const correctNav = `<header>
        <nav>
            <div class="logo">
                <h1>Room<span>Rate</span>Compare</h1>
                <p class="tagline">Compare 1000+ hotels. Find your best room rate.</p>
            </div>
            <div class="nav-links">
                <a href="/">Home</a>
                <a href="/search">Search</a>
                <a href="/agents">Travel Agents</a>
                <a href="/agent-register">Become an Agent</a>
                <a href="/blog">Blog</a>
                <a href="/partners">Partners</a>
            </div>
        </nav>
    </header>`;

// Correct footer HTML
const correctFooter = `<footer>
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
    </footer>`;

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove the problematic mobile menu script
    content = content.replace(/<script>\s*\/\/ =+ MOBILE MENU FUNCTIONALITY[\s\S]*?<\/script>/gi, '');
    content = content.replace(/\(function\(\)\s*\{\s*const menuBtn[\s\S]*?\}\)\);/, '');
    
    // Replace header - find header and replace
    content = content.replace(/<header>[\s\S]*?<\/header>/, correctNav);
    
    // Replace footer - find footer and replace  
    content = content.replace(/<footer>[\s\S]*?<\/footer>/, correctFooter);
    
    // Remove duplicate body tags if any
    content = content.replace(/<\/body><\/body>/, '</body>');
    content = content.replace(/<body><body/, '<body');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${path.basename(filePath)}`);
}

function getAllHtmlFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory() && file !== 'uploads' && file !== 'css' && file !== 'js') {
            getAllHtmlFiles(filePath, fileList);
        } else if (file.endsWith('.html')) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

console.log('🔧 Fixing navigation and footer...\n');
const htmlFiles = getAllHtmlFiles(publicDir);
htmlFiles.forEach(fixFile);
console.log('\n✅ All files fixed! Restart your server: npm start');