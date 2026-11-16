export const PROXY_RISK_THRESHOLD = 95;

export function hasProxyRisk(score) {
  const risk = Number(score);
  return Number.isFinite(risk)
    && risk >= PROXY_RISK_THRESHOLD && risk <= 100;
}

export function getIPQSConnectionType(record) {
  if (record.isVPN || record.activeVPN) {
    return 'VPN';
  }
  if (record.isTOR || record.activeTOR) {
    return 'Tor';
  }
  const connectionType = String(record.connectionType || '').trim();
  const isDataCenter = /data[\s-]*center/i.test(connectionType);
  if (record.isHostingProvider || isDataCenter) {
    return isDataCenter ? 'Data Center' : 'Hosting';
  }
  return connectionType || 'Unknown';
}

export function isConfirmedProxy(data) {
  return data?.proxyVerdict === 'proxy';
}
