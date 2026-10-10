const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const publicFiles = ['index.html', 'styles.css', 'app.js'];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of publicFiles) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log(`Đã chuẩn bị ${publicFiles.length} tệp giao diện trong dist/ để Cloudflare Pages triển khai.`);
