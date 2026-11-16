import path from 'path';
import { existsSync, readFileSync } from 'fs';

const moduleDirectory = import.meta.dirname;

const canvasConfigPaths = [
  path.resolve(process.cwd(), 'canvases.json'),
  path.resolve(moduleDirectory, './canvases.json'),
  path.resolve(moduleDirectory, '../../dist/canvases.json'),
];
const canvasConfigPath = canvasConfigPaths.find((filename) => (
  existsSync(filename)
));
if (!canvasConfigPath) {
  throw new Error(
    `Could not find canvases.json in ${canvasConfigPaths.join(', ')}`,
  );
}

const canvases = JSON.parse(readFileSync(
  canvasConfigPath,
));

export const defaultCanvasForCountry = {};
(function populateDefaultCanvases() {
  for (const [canvasId, canvas] of Object.entries(canvases)) {
    canvas.dcc?.forEach(
      (country) => {
        defaultCanvasForCountry[country.toLowerCase()] = canvasId;
      },
    );
  }
}());

export default canvases;
