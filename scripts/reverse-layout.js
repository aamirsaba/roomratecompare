const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

function getAllHtmlFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory() && file !== 'uploads') {
            getAllHtmlFiles(filePath, fileList);
        } else if (file.endsWith('.html')) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

function reverseFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file has the new structure
    if (!content.includes('mobile-menu-btn')) {
        console.log(`⏭️ Skipping ${path.basename(filePath)} - already original`);
        return;
    }
    
    // Extract main content between <main> tags
    let mainContent = '';
    const mainMatch = content.match(/<main>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
        mainContent = mainMatch[1].trim();
    } else {
        // Fallback: extract body content
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) {
            let body = bodyMatch[1];
            // Remove header, footer, script
            body = body.replace(/<header>[\s\S]*?<\/header>/i, '');
            body = body.replace(/<footer>[\s\S]*?<\/footer>/i, '');
            body = body.replace(/<script>[\s\S]*?<\/script>/i, '');
            mainContent = body.trim();
        }
    }
    
    // Get title
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1] : 'RoomRateCompare';
    
    // Build original HTML structure (without mobile menu)
    const originalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
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
    </header>

    <main>
        ${mainContent}
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
</body>
</html>`;
    
    fs.writeFileSync(filePath, originalHtml, 'utf8');
    console.log(`🔄 Reversed: ${path.basename(filePath)}`);
}

console.log('🔄 Reversing layout changes...');
const htmlFiles = getAllHtmlFiles(publicDir);
console.log(`📄 Found ${htmlFiles.length} files\n`);

htmlFiles.forEach(reverseFile);
console.log('\n✅ All files reversed to original!');