import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getIPQSConnectionType, hasProxyRisk, isConfirmedProxy,
} from './risk.js';

test('only treats a risk score of 95 through 100 as high risk', () => {
  assert.equal(hasProxyRisk(94), false);
  assert.equal(hasProxyRisk(95), true);
  assert.equal(hasProxyRisk(100), true);
  assert.equal(hasProxyRisk(101), false);
});

test('a proxy is confirmed only when the provider vote is a majority', () => {
  assert.equal(isConfirmedProxy({
    risk: 95,
    type: 'VPN',
    proxyVerdict: 'proxy',
  }), true);
  assert.equal(isConfirmedProxy({
    risk: 100,
    type: 'VPN',
    proxyVerdict: 'clean',
  }), false);
  assert.equal(isConfirmedProxy({
    risk: 99,
    type: 'VPN',
    proxyVerdict: 'uncertain',
  }), false);
});

test('IPQS proxy flag does not overwrite a residential connection type', () => {
  const record = {
    isProxy: true,
    isBot: true,
    recentAbuse: true,
    connectionType: 'Residential',
  };
  const type = getIPQSConnectionType(record);

  assert.equal(type, 'Residential');
  assert.equal(isConfirmedProxy({
    risk: 100,
    type,
    confidence: null,
    repetition: 0,
  }), false);
});

test('IPQS explicit VPN, Tor, and hosting signals stay classifiable', () => {
  assert.equal(getIPQSConnectionType({
    isVPN: true,
    connectionType: 'Residential',
  }), 'VPN');
  assert.equal(getIPQSConnectionType({
    activeTOR: true,
    connectionType: 'Residential',
  }), 'Tor');
  assert.equal(getIPQSConnectionType({
    isHostingProvider: true,
    connectionType: 'Residential',
  }), 'Hosting');
});
