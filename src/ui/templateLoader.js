/*
 * Client overlay template loader wired to Redux templates slice
 */

import store from '../store/store.js';
import {
  addTemplate,
  changeTemplate,
  deleteTemplate,
  setTemplates,
} from '../store/actions/templates.js';

const imageFiles = new Map();

async function getImageDimensions(file) {
  if (!file || typeof createImageBitmap !== 'function') {
    return [64, 64];
  }
  try {
    const bitmap = await createImageBitmap(file);
    const dims = [bitmap.width, bitmap.height];
    bitmap.close();
    return dims;
  } catch {
    return [64, 64];
  }
}

const templateLoader = {
  async addFile(file, title, canvasId, x, y) {
    const imageId = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (file) {
      imageFiles.set(imageId, file);
    }
    const [width, height] = await getImageDimensions(file);
    const entry = {
      enabled: true,
      imageId,
      title,
      canvasId: Number(canvasId) || 0,
      x: Number(x) || 0,
      y: Number(y) || 0,
      width,
      height,
    };
    store.dispatch(addTemplate(entry));
    return entry;
  },

  async getTemplate(imageId) {
    return imageFiles.get(imageId) || null;
  },

  async updateFile(imageId, file) {
    if (file) {
      imageFiles.set(imageId, file);
      const [width, height] = await getImageDimensions(file);
      const current = store.getState().templates.list.find(
        (item) => item.imageId === imageId,
      );
      if (current) {
        store.dispatch(changeTemplate(current.title, { width, height }));
      }
    }
    return imageFiles.get(imageId) || null;
  },

  changeTemplate(title, updates) {
    store.dispatch(changeTemplate(title, updates));
  },

  deleteTemplate(title) {
    const current = store.getState().templates.list.find(
      (item) => item.title === title,
    );
    if (current?.imageId) {
      imageFiles.delete(current.imageId);
    }
    store.dispatch(deleteTemplate(title));
  },

  async exportEnabledTemplates() {
    const enabled = store.getState().templates.list.filter((item) => item.enabled);
    return enabled.map((item) => ({ ...item }));
  },

  async importTemplates(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const existing = store.getState().templates.list;
        store.dispatch(setTemplates([...existing, ...parsed]));
      }
    } catch {
      // Ignore invalid JSON files cleanly.
    }
  },
};

export default templateLoader;
