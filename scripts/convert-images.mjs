import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const projectRoot = path.resolve(process.cwd());
const publicDir = path.join(projectRoot, 'client', 'public');

const targets = ['image1.jpg', 'image2.jpg', 'image3.jpg'];

async function convertOne(fileName) {
  const inputPath = path.join(publicDir, fileName);
  const base = fileName.replace(/\.jpg$/i, '');
  const webpPath = path.join(publicDir, `${base}.webp`);
  const avifPath = path.join(publicDir, `${base}.avif`);

  if (!fs.existsSync(inputPath)) {
    console.warn(`[skip] not found: ${inputPath}`);
    return;
  }

  try {
    console.log(`[convert] ${fileName} -> webp/avif`);
    await sharp(inputPath).webp({ quality: 70 }).toFile(webpPath);
    await sharp(inputPath).avif({ quality: 60 }).toFile(avifPath);
  } catch (e) {
    console.error(`[error] convert ${fileName}:`, e);
  }
}

async function main() {
  for (const t of targets) {
    // 이미 파일이 있으면 건너뛰지 않고 항상 갱신 (원본 변경 고려)
    await convertOne(t);
  }
  console.log('Done.');
}

main(); 