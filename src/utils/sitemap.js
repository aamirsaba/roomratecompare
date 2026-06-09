const supabase = require('../db/supabase');
const fs = require('fs');
const path = require('path');

async function generateSitemap() {
    const { data: posts } = await supabase
        .from('blog_posts')
        .select('slug, published_at')
        .eq('status', 'published');
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${process.env.APP_URL}/</loc>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${process.env.APP_URL}/blog</loc>
        <priority>0.9</priority>
    </url>`;
    
    posts.forEach(post => {
        sitemap += `
    <url>
        <loc>${process.env.APP_URL}/blog/${post.slug}</loc>
        <lastmod>${post.published_at}</lastmod>
        <priority>0.8</priority>
    </url>`;
    });
    
    sitemap += `
</urlset>`;
    
    fs.writeFileSync(path.join(__dirname, '../../public/sitemap.xml'), sitemap);
    console.log('✅ Sitemap generated');
}

module.exports = { generateSitemap };