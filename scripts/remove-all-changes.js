const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

// Simple HTML template without any extra scripts
function getSimpleTemplate(title, bodyContent) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | RoomRateCompare</title>
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
        ${bodyContent}
    </main>

    <footer>
        <div class="footer-container">
            <div class="footer-column">
                <h3>🏨 RoomRateCompare</h3>
                <p>Compare hotel room rates from 50+ travel sites.</p>
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
                    <li><a href="/contact">Contact Us</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 RoomRateCompare.com. All rights reserved.</p>
        </div>
    </footer>
</body>
</html>`;
}

// Extract body content from HTML file
function extractBodyContent(content) {
    // Try to get content between <main> tags
    let mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch && mainMatch[1]) {
        return mainMatch[1].trim();
    }
    
    // Try to get content between <body> tags
    let bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
        let body = bodyMatch[1];
        // Remove header and footer if they are inside body
        body = body.replace(/<header[\s\S]*?<\/header>/i, '');
        body = body.replace(/<footer[\s\S]*?<\/footer>/i, '');
        return body.trim();
    }
    
    return content;
}

// Get title from HTML file
function getTitle(content) {
    let titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        return titleMatch[1].replace(' | RoomRateCompare', '').replace('RoomRateCompare', '').trim();
    }
    return 'RoomRateCompare';
}

function fixFile(filePath) {
    console.log(`📝 Processing: ${path.basename(filePath)}`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let bodyContent = extractBodyContent(content);
    let title = getTitle(content);
    
    // If bodyContent is empty or too short, try to keep original content
    if (!bodyContent || bodyContent.length < 10) {
        console.log(`   ⚠️ Could not extract content, keeping original`);
        return;
    }
    
    // Create new clean HTML
    const newHtml = getSimpleTemplate(title, bodyContent);
    
    fs.writeFileSync(filePath, newHtml, 'utf8');
    console.log(`   ✅ Fixed: ${path.basename(filePath)}`);
}

function getAllHtmlFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory() && file !== 'uploads' && file !== 'css' && file !== 'js' && file !== 'images') {
            getAllHtmlFiles(filePath, fileList);
        } else if (file.endsWith('.html')) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

console.log('🗑️ Removing all script changes and restoring clean HTML...\n');

const htmlFiles = getAllHtmlFiles(publicDir);
console.log(`📄 Found ${htmlFiles.length} files to process\n`);

htmlFiles.forEach(fixFile);

console.log('\n✅ All files have been cleaned!');
console.log('🔄 Restart your server: npm start');