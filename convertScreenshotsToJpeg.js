// convertScreenshotsToJpeg.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function convertPngToJpegInDirectory(directory) {
  if (!fs.existsSync(directory)) {
    console.error('Directory does not exist:', directory);
    return;
  }

  const files = fs.readdirSync(directory);
  const pngFiles = files.filter((f) => f.toLowerCase().endsWith('.png'));

  for (const file of pngFiles) {
    const filePath = path.join(directory, file);
    const jpegPath = path.join(directory, file.replace(/\.png$/i, '.jpeg'));

    try {
      await sharp(filePath)
        .jpeg({ quality: 100 })
        .toFile(jpegPath);
      console.log(`Converted ${file} to ${path.basename(jpegPath)}`);
    } catch (error) {
      console.error(`Failed to convert ${file}:`, error);
    }
  }
}

module.exports = { convertPngToJpegInDirectory };
