import { BlockList, isIP } from 'node:net';

import { ipSubnetToHex } from './ip.js';

// Keep synchronized with Cloudflare's published proxy ranges.
export const CLOUDFLARE_IP_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

const cloudflareBlockList = new BlockList();

CLOUDFLARE_IP_RANGES.forEach((range) => {
  const [address, prefix] = range.split('/');
  cloudflareBlockList.addSubnet(
    address,
    Number(prefix),
    address.includes(':') ? 'ipv6' : 'ipv4',
  );
});

export function isCloudflareIP(ip) {
  const mappedIPv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip || '');
  const address = mappedIPv4 ? mappedIPv4[1] : ip;
  const family = isIP(address);
  if (!family) {
    return false;
  }
  return cloudflareBlockList.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export function getVisitorIPFromHeaders(headers) {
  const connectingIP = headers['cf-connecting-ip'];
  if (typeof connectingIP === 'string' && isIP(connectingIP.trim())) {
    const address = connectingIP.trim();
    return isCloudflareIP(address) ? null : address;
  }
  const realIP = headers['x-real-ip'];
  if (typeof realIP === 'string' && isIP(realIP.trim())) {
    const address = realIP.trim();
    return isCloudflareIP(address) ? null : address;
  }
  return null;
}

export function getVisitorIPFromRequest(req) {
  const headers = req?.headers || {};
  const remoteAddress = req?.socket?.remoteAddress
    || req?.connection?.remoteAddress
    || null;

  const visitorIP = getVisitorIPFromHeaders(headers);
  if (visitorIP) {
    return visitorIP;
  }

  if (!remoteAddress || isCloudflareIP(remoteAddress)) {
    return null;
  }

  return remoteAddress;
}

export function getCloudflareBinaryRanges() {
  return CLOUDFLARE_IP_RANGES.map((range) => {
    const [[start, end]] = ipSubnetToHex(range);
    return [start, end];
  });
}
