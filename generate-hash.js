const bcrypt = require('bcrypt');

async function generateHash() {
    const hash = await bcrypt.hash('admin123', 10);
    console.log('Password hash for admin123:', hash);
}

generateHash();