import { clamp, worldToScreen } from '../core/utils.js';

class PixelNotify {
  static NOTIFICATION_TIME = 1100;

  static MAX_NOTIFICATIONS = 300;

  constructor() {
    this.pixelList = [];
    this.notificationRadius = 150;
    this.notifcircle = document.createElement('canvas');
    this.notifcircle.width = 200;
    this.notifcircle.height = 200;
    const context = this.notifcircle.getContext('2d');
    if (context) {
      context.fillStyle = '#FF000055';
      context.beginPath();
      context.arc(100, 100, 100, 0, 2 * Math.PI);
      context.fill();
    }
  }

  addPixel(x, y) {
    this.pixelList.unshift([Date.now(), x, y]);
    if (this.pixelList.length > PixelNotify.MAX_NOTIFICATIONS) {
      this.pixelList.length = PixelNotify.MAX_NOTIFICATIONS;
    }
  }

  doRender() {
    return this.pixelList.length > 0;
  }

  updateScale(scale) {
    this.notificationRadius = clamp(scale * 10, 20, 400);
  }

  render(viewport, view, scale) {
    const context = viewport.getContext('2d');
    if (!context) return;

    const now = Date.now();
    const { pixelList } = this;
    for (let index = pixelList.length - 1; index >= 0; index -= 1) {
      const [createdAt, x, y] = pixelList[index];
      const elapsed = now - createdAt;
      if (elapsed > PixelNotify.NOTIFICATION_TIME) {
        pixelList.splice(index, 1);
        continue;
      }

      const radius = (elapsed / PixelNotify.NOTIFICATION_TIME)
        * this.notificationRadius;
      const [screenX, screenY] = worldToScreen(
        view,
        scale,
        viewport,
        [x, y],
      );
      if (screenX + radius < 0 || screenX - radius > viewport.width
        || screenY + radius < 0 || screenY - radius > viewport.height
      ) continue;

      context.save();
      context.translate(screenX + scale / 2, screenY + scale / 2);
      context.scale(radius / 100, radius / 100);
      context.drawImage(this.notifcircle, -100, -100);
      context.restore();
    }
  }
}

const pixelNotify = new PixelNotify();

export default pixelNotify;
