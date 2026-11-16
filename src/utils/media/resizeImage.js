import fs from 'fs';
import sharp from 'sharp';

sharp.cache(false);

export default async function resizeImage(filePath, width, height) {
  try {
    const inputBuffer = fs.readFileSync(filePath);
    const resizedBuffer = await sharp(inputBuffer, { animated: true })
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .toBuffer();
    fs.writeFileSync(filePath, resizedBuffer);
  } catch (error) {
    console.error(
      `MEDIA: Could not resize image ${filePath} ${error.message}`,
    );
    throw new Error('Could not resize image');
  }
}
