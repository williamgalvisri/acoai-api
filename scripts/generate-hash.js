const bcrypt = require('bcryptjs');

const pin = process.argv[2];

if (!pin) {
    console.error('❌ Error: No PIN provided.');
    console.log('Usage: node scripts/generate-hash.js <YOUR_6_DIGIT_PIN>');
    process.exit(1);
}

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(pin, salt);

console.log('\n✅ Password Hash Generated Successfully');
console.log('----------------------------------------');
console.log(`PIN:  ${pin}`);
console.log(`Hash: ${hash}`);
console.log('----------------------------------------');
console.log('Copy the "Hash" value and update the "passwordHash" field in your MongoDB ClientPersona document.\n');
