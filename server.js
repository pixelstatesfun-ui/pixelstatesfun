/*
 * Express 5 server for PixelStates preview runtime (port 3000, in-memory data).
 * Supports Factions, Unions, Coalitions, Multiple Bilateral Pacts,
 * Multi-Condition Treaties with Coalition Leader Forced Dissolution,
 * Advanced Territory Protection, Shared Union Coordination Drawing,
 * Union/Coalition Settings, and Public Diplomatic News.
 */
/* eslint-disable max-len, camelcase */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import fileUpload from 'express-fileupload';
import webpack from 'webpack';
import previewWebpackConfig from './webpack.config.preview.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, 'public');
const distAssetsDir = path.resolve(currentDir, 'dist/public/assets');
const bundleFile = path.resolve(distAssetsDir, 'preview.js');

function ensureClientBundle() {
  if (fs.existsSync(bundleFile)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const compiler = webpack({
      ...previewWebpackConfig,
      mode: 'development',
    });
    compiler.run((err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats.hasErrors()) {
        const info = stats.toJson({ errors: true });
        reject(new Error(info.errors.map((e) => e.message).join('\n')));
        return;
      }
      compiler.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve();
      });
    });
  });
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmblemSvg(tag, primary, secondary, shape = 'shield') {
  const safeTag = escapeXml(String(tag || 'PS').slice(0, 5));
  const bg = escapeXml(primary || '#1e3a8a');
  const fg = escapeXml(secondary || '#f59e0b');
  if (shape === 'banner') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 160">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="${fg}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="160" fill="url(#g)"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-weight="800" font-size="42" letter-spacing="4">${safeTag}</text>
    </svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <defs>
      <linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
    </defs>
    <rect width="128" height="128" rx="18" fill="url(#s)"/>
    <path d="M64 14 L106 30 V66 C106 92 86 108 64 116 C42 108 22 92 22 66 V30 Z" fill="${bg}" stroke="${fg}" stroke-width="6"/>
    <text x="64" y="72" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-weight="800" font-size="26">${safeTag}</text>
  </svg>`;
}

const currentUser = {
  id: 101,
  name: 'CommanderVex',
  userlvl: 2,
  country: 'us',
  totalPixels: 68290,
  dailyTotalPixels: 1840,
};

const factions = [
  {
    id: 1,
    name: 'Northern_Vanguard',
    title: 'Northern Vanguard',
    tag: 'NVG',
    rankTitle: 'Empire',
    description: 'Defenders of the boreal frontier and precision pixel art.',
    color: '#2563eb',
    secondaryColor: '#facc15',
    avatarId: 'emblem-nvg:svg',
    bannerId: 'banner-nvg:svg',
    isPublic: true,
    isPrivate: false,
    openJoin: true,
    memberCount: 42,
    totalPixels: 1284500,
    todayPixels: 46200,
    createdAt: '2025-04-12T10:30:00.000Z',
    ownerId: 101,
  },
  {
    id: 2,
    name: 'Solaris_Imperium',
    title: 'Solaris Imperium',
    tag: 'SOL',
    rankTitle: 'Kingdom',
    description: 'Builders of monumental golden citadels across Canvas 0.',
    color: '#d97706',
    secondaryColor: '#fde047',
    avatarId: 'emblem-sol:svg',
    bannerId: 'banner-sol:svg',
    isPublic: true,
    isPrivate: false,
    openJoin: true,
    memberCount: 38,
    totalPixels: 1120800,
    todayPixels: 54900,
    createdAt: '2025-05-03T14:15:00.000Z',
    ownerId: 102,
  },
  {
    id: 3,
    name: 'Crimson_Legion',
    title: 'Crimson Legion',
    tag: 'CRM',
    rankTitle: 'Duchy',
    description: 'Rapid-response territorial coalition and map painters.',
    color: '#dc2626',
    secondaryColor: '#fb923c',
    avatarId: 'emblem-crm:svg',
    bannerId: 'banner-crm:svg',
    isPublic: true,
    isPrivate: false,
    openJoin: false,
    memberCount: 29,
    totalPixels: 894200,
    todayPixels: 39850,
    createdAt: '2025-06-19T09:00:00.000Z',
    ownerId: 103,
  },
  {
    id: 4,
    name: 'Emerald_Syndicate',
    title: 'Emerald Syndicate',
    tag: 'EMR',
    rankTitle: 'Republic',
    description: 'Cartographers, trade stewards, and cooperative muralists.',
    color: '#059669',
    secondaryColor: '#34d399',
    avatarId: 'emblem-emr:svg',
    bannerId: 'banner-emr:svg',
    isPublic: true,
    isPrivate: false,
    openJoin: true,
    memberCount: 24,
    totalPixels: 642300,
    todayPixels: 31400,
    createdAt: '2025-08-01T18:40:00.000Z',
    ownerId: 104,
  },
  {
    id: 5,
    name: 'Obsidian_Order',
    title: 'Obsidian Order',
    tag: 'OBS',
    rankTitle: 'Principality',
    description: 'Night-watch architects holding the southern archipelago.',
    color: '#6d28d9',
    secondaryColor: '#c084fc',
    avatarId: 'emblem-obs:svg',
    bannerId: 'banner-obs:svg',
    isPublic: true,
    isPrivate: false,
    openJoin: true,
    memberCount: 19,
    totalPixels: 491700,
    todayPixels: 22150,
    createdAt: '2025-09-14T21:10:00.000Z',
    ownerId: 105,
  },
];

// Unions & Coalitions group on leaderboards (with distinct Union vs Coalition badges).
// Bilateral pacts ('alliance') can be held in multiples and are NEVER grouped on leaderboards.
let alliances = [
  {
    id: 10,
    name: 'Boreal Union',
    tag: 'BRU',
    allianceType: 'union',
    description: 'Long-term northern Union with shared coordination layer and mutual defense.',
    terms: [
      'Shared northern defense and canvas coordination layer.',
      'Joint approval required for territorial expansion treaties.',
    ],
    avatarFileName: 'union-10.svg',
    bannerFileName: 'union-banner-10.svg',
    avatarUrl: '/api/factions/alliances/10/image/avatar',
    bannerUrl: '/api/factions/alliances/10/image/banner',
    founderFactionId: 1,
    leaderFactionId: 1,
    targetFactionId: null,
    memberFactionIds: [1, 4],
    sharedCoordinationEnabled: true,
    coordinationDrawMode: 'all_members',
    color: '#0284c7',
    secondaryColor: '#38bdf8',
    createdAt: '2025-10-01T12:00:00.000Z',
  },
  {
    id: 11,
    name: 'Iron Pact Coalition',
    tag: 'IPC',
    allianceType: 'coalition',
    description: 'War coalition led by Solaris Imperium against Northern Vanguard.',
    terms: [
      'Coordinated campaigns against [NVG] northern sectors.',
      'Coalition dissolves if the Coalition Leader accepts a sever-coalition peace term.',
    ],
    avatarFileName: 'coalition-11.svg',
    bannerFileName: 'coalition-banner-11.svg',
    avatarUrl: '/api/factions/alliances/11/image/avatar',
    bannerUrl: '/api/factions/alliances/11/image/banner',
    founderFactionId: 2,
    leaderFactionId: 2,
    targetFactionId: 1,
    memberFactionIds: [2, 3],
    sharedCoordinationEnabled: false,
    coordinationDrawMode: 'founders_only',
    color: '#b91c1c',
    secondaryColor: '#f59e0b',
    createdAt: '2025-10-18T16:20:00.000Z',
  },
  {
    id: 12,
    name: 'Northern-Obsidian Accord',
    tag: 'NOA',
    allianceType: 'alliance',
    description: 'Bilateral maritime & pixel-art protection pact (remains separate on leaderboards).',
    terms: [
      'Mutual non-interference across southern archipelago artwork.',
    ],
    avatarFileName: 'bilateral-12.svg',
    bannerFileName: 'bilateral-banner-12.svg',
    avatarUrl: '/api/factions/alliances/12/image/avatar',
    bannerUrl: '/api/factions/alliances/12/image/banner',
    founderFactionId: 1,
    leaderFactionId: 1,
    targetFactionId: null,
    memberFactionIds: [1, 5],
    sharedCoordinationEnabled: false,
    coordinationDrawMode: 'founders_only',
    color: '#6d28d9',
    secondaryColor: '#38bdf8',
    createdAt: '2025-11-04T09:15:00.000Z',
  },
  {
    id: 13,
    name: 'Boreal-Crimson Trade Pact',
    tag: 'BCT',
    allianceType: 'alliance',
    description: 'Second simultaneous bilateral pact demonstrating multi-bilateral support.',
    terms: [
      'Preserve heritage emblems along border corridor.',
    ],
    avatarFileName: 'bilateral-13.svg',
    bannerFileName: 'bilateral-banner-13.svg',
    avatarUrl: '/api/factions/alliances/13/image/avatar',
    bannerUrl: '/api/factions/alliances/13/image/banner',
    founderFactionId: 1,
    leaderFactionId: 1,
    targetFactionId: null,
    memberFactionIds: [1, 3],
    sharedCoordinationEnabled: false,
    coordinationDrawMode: 'founders_only',
    color: '#0f766e',
    secondaryColor: '#fb923c',
    createdAt: '2025-11-11T14:40:00.000Z',
  },
];

let nextAllianceId = 20;
let nextNapId = 510;
let nextWarId = 710;
let nextTreatyId = 810;
let nextNewsId = 910;
let nextMarkId = 1010;

let myFactionIds = [1];

const factionMembers = {
  1: [
    {
      id: 101, uid: 101, name: 'CommanderVex', role: 'owner',
      total: 68290, today: 1840, totalPixels: 68290, dailyPixels: 1840,
      joinedAt: '2025-04-12T10:30:00.000Z',
      permissions: {
        manageFaction: true, manageNaps: true, manageTemplates: true,
        manageConfigs: true, manageRanks: true, manageApplications: true,
        manageMembers: true, drawCoordination: true,
      },
    },
    {
      id: 106, uid: 106, name: 'FrostByte', role: 'leader',
      total: 39410, today: 1420, totalPixels: 39410, dailyPixels: 1420,
      joinedAt: '2025-04-14T16:10:00.000Z',
      permissions: { manageTemplates: true, manageApplications: true, drawCoordination: true },
    },
    {
      id: 107, uid: 107, name: 'AuroraLine', role: 'officer',
      total: 27150, today: 980, totalPixels: 27150, dailyPixels: 980,
      joinedAt: '2025-05-02T08:45:00.000Z',
      permissions: { manageApplications: true, drawCoordination: true },
    },
  ],
  2: [
    {
      id: 102, uid: 102, name: 'SolariusRex', role: 'owner',
      total: 92100, today: 3120, totalPixels: 92100, dailyPixels: 3120,
      joinedAt: '2025-05-03T14:15:00.000Z',
    },
    {
      id: 208, uid: 208, name: 'HeliosGuard', role: 'deputy',
      total: 51400, today: 1890, totalPixels: 51400, dailyPixels: 1890,
      joinedAt: '2025-05-09T11:20:00.000Z',
    },
  ],
  3: [
    {
      id: 103, uid: 103, name: 'CrimsonMarshal', role: 'owner',
      total: 74500, today: 2410, totalPixels: 74500, dailyPixels: 2410,
      joinedAt: '2025-06-19T09:00:00.000Z',
    },
  ],
  4: [
    {
      id: 104, uid: 104, name: 'VerdantScribe', role: 'owner',
      total: 61200, today: 1960, totalPixels: 61200, dailyPixels: 1960,
      joinedAt: '2025-08-01T18:40:00.000Z',
    },
  ],
  5: [
    {
      id: 105, uid: 105, name: 'NocturneArch', role: 'owner',
      total: 44800, today: 1320, totalPixels: 44800, dailyPixels: 1320,
      joinedAt: '2025-09-14T21:10:00.000Z',
    },
  ],
};

let wars = [
  {
    id: 701,
    factionA: 1,
    factionB: 2,
    tagA: 'NVG',
    nameA: 'Northern Vanguard',
    tagB: 'SOL',
    nameB: 'Solaris Imperium',
    createdAt: '2026-11-18T11:20:00.000Z',
  },
];

const peaceTreaties = [];

let naps = [
  {
    id: 501,
    sourceFactionId: 1,
    targetFactionId: 5,
    tagA: 'NVG',
    nameA: 'Northern Vanguard',
    tagB: 'OBS',
    nameB: 'Obsidian Order',
    sourceFactionName: 'Northern Vanguard',
    sourceFactionTag: 'NVG',
    targetFactionName: 'Obsidian Order',
    targetFactionTag: 'OBS',
    status: 'active',
    startDate: '2026-11-01',
    endDate: '2026-12-31',
    createdAt: '2026-11-01T10:00:00.000Z',
    territory: {
      mode: 'polygon',
      canvasId: 0,
      x1: -120,
      y1: -80,
      x2: 140,
      y2: 95,
      polygon: [[-120, -60], [20, -80], [140, -10], [95, 95], [-90, 75]],
    },
    terms: [
      {
        type: 'cease_activity',
        description: 'No overwriting pixels inside the southern archipelago border polygon.',
      },
      {
        type: 'abandon_territory',
        description: 'Respect neutral buffer canal at [-40, 20].',
      },
    ],
  },
];

const diplomaticNews = [
  {
    id: 901,
    type: 'war_declared',
    headline: '[NVG] Northern Vanguard and [SOL] Solaris Imperium enter formal war',
    summary: 'Hostilities began over the central meridian mural zone.',
    factions: [
      { id: 1, tag: 'NVG', name: 'Northern_Vanguard', title: 'Northern Vanguard' },
      { id: 2, tag: 'SOL', name: 'Solaris_Imperium', title: 'Solaris Imperium' },
    ],
    terms: [],
    createdAt: '2026-11-18T11:20:00.000Z',
  },
  {
    id: 902,
    type: 'coalition_formed',
    headline: 'Coalition formed: Iron Pact Coalition [IPC] led by [SOL] Solaris Imperium',
    summary: 'Coalition members [SOL] and [CRM] coordinate campaigns targeting [NVG].',
    factions: [
      { id: 2, tag: 'SOL', name: 'Solaris_Imperium', title: 'Solaris Imperium' },
      { id: 3, tag: 'CRM', name: 'Crimson_Legion', title: 'Crimson Legion' },
    ],
    terms: [],
    createdAt: '2026-11-16T16:20:00.000Z',
  },
  {
    id: 903,
    type: 'bilateral_formed',
    headline: 'Bilateral Pact signed: Northern-Obsidian Accord between [NVG] and [OBS]',
    summary: 'Mutual maritime artwork protection pact (factions remain independent on leaderboards).',
    factions: [
      { id: 1, tag: 'NVG', name: 'Northern_Vanguard', title: 'Northern Vanguard' },
      { id: 5, tag: 'OBS', name: 'Obsidian_Order', title: 'Obsidian Order' },
    ],
    terms: [],
    createdAt: '2026-11-04T09:15:00.000Z',
  },
  {
    id: 904,
    type: 'nap_signed',
    headline: 'Non-Aggression Pact ratified between [NVG] Northern Vanguard and [OBS] Obsidian Order',
    summary: 'Protected custom polygon territory on Canvas #0 with 2 treaty clauses.',
    factions: [
      { id: 1, tag: 'NVG', name: 'Northern_Vanguard', title: 'Northern Vanguard' },
      { id: 5, tag: 'OBS', name: 'Obsidian_Order', title: 'Obsidian Order' },
    ],
    terms: [
      { label: 'Cease activity', summary: 'No overwriting pixels inside the southern archipelago border polygon.' },
      { label: 'Abandon territory', summary: 'Respect neutral buffer canal at [-40, 20].' },
    ],
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 905,
    type: 'union_formed',
    headline: 'Union proclaimed: Boreal Union [BRU] uniting [NVG] and [EMR]',
    summary: 'Long-term Union with shared leaderboard standing and shared Union Coordination drawing canvas.',
    factions: [
      { id: 1, tag: 'NVG', name: 'Northern_Vanguard', title: 'Northern Vanguard' },
      { id: 4, tag: 'EMR', name: 'Emerald_Syndicate', title: 'Emerald Syndicate' },
    ],
    terms: [],
    createdAt: '2026-10-01T12:00:00.000Z',
  },
];

// Coordination drawing marks keyed by "faction:<id>" or "union:<allianceId>"
const coordinationMarks = {
  'faction:1': [
    {
      id: 1001,
      canvasId: 0,
      tool: 'arrow',
      color: '#38bdf8',
      width: 4,
      opacity: 90,
      author: 'CommanderVex [NVG]',
      points: [[120, 140], [260, 190]],
    },
  ],
  'union:10': [
    {
      id: 1002,
      canvasId: 0,
      tool: 'brush',
      color: '#34d399',
      width: 4,
      opacity: 90,
      author: 'VerdantScribe [EMR]',
      points: [[220, 260], [270, 240], [330, 255], [380, 220]],
    },
    {
      id: 1003,
      canvasId: 0,
      tool: 'arrow',
      color: '#facc15',
      width: 4,
      opacity: 95,
      author: 'CommanderVex [NVG]',
      points: [[380, 220], [470, 175]],
    },
  ],
};

function findFaction(id) {
  return factions.find((f) => Number(f.id) === Number(id)) || null;
}

function factionChip(f) {
  if (!f) return null;
  return { id: f.id, tag: f.tag, name: f.name, title: f.title };
}

function pushNews(entry) {
  diplomaticNews.unshift({
    id: nextNewsId,
    createdAt: new Date().toISOString(),
    terms: [],
    factions: [],
    ...entry,
  });
  nextNewsId += 1;
}

function enrichAlliance(a) {
  const members = factions
    .filter((f) => a.memberFactionIds.includes(f.id))
    .map((f) => ({
      ...formatFactionDto(f),
      factionId: f.id,
      factionName: f.title,
    }));
  return {
    ...a,
    memberCount: members.length,
    members,
  };
}

function getAlliancesForFaction(fid) {
  return alliances
    .filter((a) => a.memberFactionIds.includes(Number(fid)))
    .map(enrichAlliance);
}

function enforceTreatyTerms(targetFactionId, terms = [], initiatorFaction = null) {
  const targetFaction = findFaction(targetFactionId);
  if (!targetFaction || !Array.isArray(terms)) return [];
  const effects = [];

  terms.forEach((term) => {
    if (!term || typeof term !== 'object' || term.type !== 'sever_ally') return;
    let pact = null;
    if (term.targetPactId) {
      pact = alliances.find((a) => Number(a.id) === Number(term.targetPactId));
    } else if (term.severKind) {
      pact = alliances.find((a) => {
        if (!a.memberFactionIds.includes(Number(targetFactionId))) return false;
        if (term.severKind === 'union') return a.allianceType === 'union';
        if (term.severKind === 'coalition') return a.allianceType === 'coalition';
        return a.allianceType === 'alliance';
      });
    }
    if (!pact) return;

    const isCoalitionLeader = pact.allianceType === 'coalition'
      && Number(pact.founderFactionId || pact.leaderFactionId) === Number(targetFactionId);

    if (isCoalitionLeader) {
      const dissolvedMembers = pact.memberFactionIds
        .map((id) => factionChip(findFaction(id)))
        .filter(Boolean);
      alliances = alliances.filter((a) => a.id !== pact.id);
      effects.push(`Coalition ${pact.name} dissolved (leader forced to exit).`);
      pushNews({
        type: 'coalition_dissolved',
        headline: `Coalition dissolved: ${pact.name} [${pact.tag}] collapsed under treaty terms`,
        summary: `[${targetFaction.tag}] ${targetFaction.title} (Coalition Leader) accepted a sever-coalition clause${initiatorFaction ? ` with [${initiatorFaction.tag}] ${initiatorFaction.title}` : ''}, automatically dissolving the entire coalition.`,
        factions: [
          ...(initiatorFaction ? [factionChip(initiatorFaction)] : []),
          ...dissolvedMembers,
        ],
      });
      return;
    }

    pact.memberFactionIds = pact.memberFactionIds.filter(
      (id) => Number(id) !== Number(targetFactionId),
    );
    const pactLabel = pact.allianceType === 'union'
      ? 'Union'
      : pact.allianceType === 'coalition' ? 'Coalition' : 'Bilateral Pact';

    if (pact.memberFactionIds.length < 2 && pact.allianceType === 'alliance') {
      alliances = alliances.filter((a) => a.id !== pact.id);
    } else if (Number(pact.leaderFactionId) === Number(targetFactionId) && pact.memberFactionIds.length > 0) {
      pact.leaderFactionId = pact.memberFactionIds[0];
      pact.founderFactionId = pact.memberFactionIds[0];
    }

    effects.push(`[${targetFaction.tag}] severed ${pactLabel}: ${pact.name}`);
    pushNews({
      type: 'pact_severed',
      headline: `[${targetFaction.tag}] ${targetFaction.title} exited ${pactLabel} "${pact.name}"`,
      summary: `Severed under treaty terms${initiatorFaction ? ` agreed with [${initiatorFaction.tag}] ${initiatorFaction.title}` : ''}.`,
      factions: [
        factionChip(targetFaction),
        ...(initiatorFaction ? [factionChip(initiatorFaction)] : []),
      ],
    });
  });

  return effects;
}

function buildRankingsPayload() {
  // ONLY Unions and Coalitions group on leaderboards!
  // Bilateral pacts ('alliance') remain separate individual faction rows.
  const groupedBlocs = alliances.filter(
    (a) => (a.allianceType === 'union' || a.allianceType === 'coalition')
      && a.memberFactionIds.length > 0,
  );
  const groupedMemberSet = new Set(groupedBlocs.flatMap((a) => a.memberFactionIds));
  const entities = [];

  groupedBlocs.forEach((bloc) => {
    const memberFactions = factions.filter((f) => bloc.memberFactionIds.includes(f.id));
    if (!memberFactions.length) return;
    const totalPixels = memberFactions.reduce((sum, f) => sum + f.totalPixels, 0);
    const todayPixels = memberFactions.reduce((sum, f) => sum + f.todayPixels, 0);
    const blocTitle = bloc.allianceType === 'union' ? 'Union' : 'Coalition';
    entities.push({
      id: bloc.id,
      name: bloc.name.replace(/\s+/g, '_'),
      title: blocTitle,
      allianceType: bloc.allianceType,
      tag: bloc.tag,
      displayName: bloc.name,
      avatarId: bloc.avatarUrl,
      totalPixels,
      todayPixels,
      type: 'alliance',
      members: memberFactions.map((mf) => ({
        id: mf.id,
        name: mf.name,
        title: mf.title,
        tag: mf.tag,
        avatarId: mf.avatarId,
        totalPixels: mf.totalPixels,
        todayPixels: mf.todayPixels,
      })),
    });
  });

  factions.forEach((f) => {
    if (!groupedMemberSet.has(f.id)) {
      entities.push({
        id: f.id,
        name: f.name,
        title: f.rankTitle || f.tag,
        tag: f.tag,
        displayName: f.title,
        avatarId: f.avatarId,
        totalPixels: f.totalPixels,
        todayPixels: f.todayPixels,
        type: 'faction',
      });
    }
  });

  const byTotal = entities.slice().sort((a, b) => b.totalPixels - a.totalPixels);
  const byDaily = entities.slice().sort((a, b) => b.todayPixels - a.todayPixels);

  const totalRankMap = new Map(byTotal.map((e, idx) => [`${e.type}:${e.id}`, idx + 1]));
  const dailyRankMap = new Map(byDaily.map((e, idx) => [`${e.type}:${e.id}`, idx + 1]));

  const factionRankingRows = byTotal.map((e) => {
    const key = `${e.type}:${e.id}`;
    return [
      totalRankMap.get(key),
      e.avatarId,
      `${e.tag || e.title},${e.name}`,
      e.totalPixels,
      dailyRankMap.get(key),
      e.todayPixels,
      {
        displayName: e.displayName,
        title: e.title,
        allianceType: e.allianceType || null,
        type: e.type,
        ...(e.members ? { allianceId: e.id, members: e.members } : {}),
      },
    ];
  });

  const dailyFactionRankingRows = byDaily.map((e) => {
    const key = `${e.type}:${e.id}`;
    return [
      dailyRankMap.get(key),
      e.avatarId,
      `${e.tag || e.title},${e.name}`,
      e.todayPixels,
      totalRankMap.get(key),
      e.totalPixels,
      {
        displayName: e.displayName,
        title: e.title,
        allianceType: e.allianceType || null,
        type: e.type,
        ...(e.members ? { allianceId: e.id, members: e.members } : {}),
      },
    ];
  });

  const users = [
    { id: 201, name: 'PixelKaiser', cc: 'de', total: 412900, daily: 14210 },
    { id: 202, name: 'SoraCanvas', cc: 'jp', total: 389450, daily: 16920 },
    { id: 203, name: 'ValkyrieArt', cc: 'pl', total: 351200, daily: 11840 },
    { id: 204, name: 'AtlasGrid', cc: 'us', total: 298700, daily: 9740 },
    { id: 205, name: 'NordicBrush', cc: 'se', total: 264100, daily: 8910 },
    { id: 101, name: 'CommanderVex', cc: 'us', total: 68290, daily: 1840 },
  ];
  const usersByTotal = users.slice().sort((a, b) => b.total - a.total);
  const usersByDaily = users.slice().sort((a, b) => b.daily - a.daily);
  const uTotalRank = new Map(usersByTotal.map((u, i) => [u.id, i + 1]));
  const uDailyRank = new Map(usersByDaily.map((u, i) => [u.id, i + 1]));

  return {
    ranking: {
      columnIds: ['rank', 'name', 'pixel', 'today_rank', 'today_pixel'],
      types: ['number', 'user', 'number', 'number', 'number'],
      uniqueColumnKey: 0,
      rows: usersByTotal.map((u) => [
        uTotalRank.get(u.id),
        `${u.cc}|${u.name},${u.id}`,
        u.total,
        uDailyRank.get(u.id),
        u.daily,
      ]),
    },
    dailyRanking: {
      columnIds: ['today_rank', 'name', 'today_pixel', 'rank', 'pixel'],
      types: ['number', 'user', 'number', 'number', 'number'],
      uniqueColumnKey: 0,
      rows: usersByDaily.map((u) => [
        uDailyRank.get(u.id),
        `${u.cc}|${u.name},${u.id}`,
        u.daily,
        uTotalRank.get(u.id),
        u.total,
      ]),
    },
    prevTop: {
      columnIds: ['yesterday_rank', 'name', 'yesterday_pixel'],
      types: ['number', 'user', 'number'],
      uniqueColumnKey: 0,
      rows: usersByDaily.slice(0, 5).map((u, idx) => [
        idx + 1,
        `${u.cc}|${u.name},${u.id}`,
        Math.round(u.daily * 0.92),
      ]),
    },
    factionRanking: {
      columnIds: [
        'rank', 'avatar', 'name', 'pixel', 'today_rank', 'today_pixel', 'faction_label',
      ],
      types: [
        'number', 'mediaId', 'faction', 'number', 'number', 'number', 'hidden',
      ],
      uniqueColumnKey: 0,
      rows: factionRankingRows,
    },
    dailyFactionRanking: {
      columnIds: [
        'today_rank', 'avatar', 'name', 'today_pixel', 'rank', 'pixel', 'faction_label',
      ],
      types: [
        'number', 'mediaId', 'faction', 'number', 'number', 'number', 'hidden',
      ],
      uniqueColumnKey: 0,
      rows: dailyFactionRankingRows,
    },
    dailyCRanking: [
      { cc: 'us', px: 92400 },
      { cc: 'de', px: 78100 },
      { cc: 'pl', px: 64300 },
      { cc: 'jp', px: 59800 },
      { cc: 'br', px: 47200 },
      { cc: 'fr', px: 38900 },
    ],
    cHourlyStats: [
      { cc: 'us', px: 4820 },
      { cc: 'de', px: 3910 },
      { cc: 'jp', px: 3440 },
      { cc: 'pl', px: 2980 },
    ],
    onlineStats: [148, 162, 175, 190, 210, 205, 194, 180, 172, 165, 158, 169],
    pHourlyStats: [18200, 19400, 21500, 24100, 26800, 25300, 23900, 22400, 21000, 19800, 18900, 20400],
    pDailyStats: [312000, 348000, 329000, 381000, 405000, 392000, 418000],
    cHistStats: [
      [{ cc: 'us', px: 92400 }, { cc: 'de', px: 78100 }, { cc: 'jp', px: 59800 }],
      [{ cc: 'us', px: 88200 }, { cc: 'de', px: 74900 }, { cc: 'jp', px: 62100 }],
      [{ cc: 'us', px: 85100 }, { cc: 'de', px: 79300 }, { cc: 'jp', px: 58400 }],
      [{ cc: 'us', px: 90600 }, { cc: 'de', px: 71200 }, { cc: 'jp', px: 55900 }],
      [{ cc: 'us', px: 84300 }, { cc: 'de', px: 69800 }, { cc: 'jp', px: 61200 }],
    ],
    histStats: {
      users: usersByTotal.slice(0, 4).map((u) => ({ id: u.id, name: u.name })),
      stats: [
        [{ id: 201, px: 14210 }, { id: 202, px: 16920 }, { id: 203, px: 11840 }, { id: 204, px: 9740 }],
        [{ id: 201, px: 13800 }, { id: 202, px: 15100 }, { id: 203, px: 12400 }, { id: 204, px: 10120 }],
        [{ id: 201, px: 15400 }, { id: 202, px: 14700 }, { id: 203, px: 10900 }, { id: 204, px: 9300 }],
        [{ id: 201, px: 12900 }, { id: 202, px: 13200 }, { id: 203, px: 11500 }, { id: 204, px: 8900 }],
      ],
    },
    cooldownChanges: {},
  };
}

function formatFactionDto(f) {
  const isOwner = f.ownerId === currentUser.id;
  const isMember = myFactionIds.includes(f.id);
  const role = isMember ? (isOwner ? 'owner' : 'member') : null;
  const fullPerms = {
    manageFaction: true,
    manageFactionAppearance: true,
    manageApplications: true,
    manageInvites: true,
    manageMembers: true,
    manageRanks: true,
    manageTemplates: true,
    manageConfigs: true,
    manageNaps: true,
    manageCoordination: true,
    drawCoordination: true,
  };
  const factionAlliances = alliances
    .filter((a) => a.memberFactionIds.includes(f.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      tag: a.tag,
      allianceType: a.allianceType,
    }));
  const primaryBloc = factionAlliances.find(
    (a) => a.allianceType === 'union' || a.allianceType === 'coalition',
  );
  return {
    id: f.id,
    name: f.name,
    title: f.title,
    tag: f.tag,
    rankTitle: f.rankTitle || 'Chiefdom',
    description: f.description,
    color: f.color,
    avatarId: f.avatarId,
    avatar: f.avatarId,
    bannerId: f.bannerId,
    banner: f.bannerId,
    isPublic: f.isPublic,
    isPrivate: Boolean(f.isPrivate),
    openJoin: f.openJoin,
    memberCount: f.memberCount,
    totalPixels: f.totalPixels,
    todayPixels: f.todayPixels,
    dailyPixels: f.todayPixels,
    createdAt: f.createdAt,
    ownerId: f.ownerId,
    allianceId: primaryBloc ? primaryBloc.id : null,
    alliances: factionAlliances,
    role,
    myRole: role,
    permissions: isOwner ? fullPerms : {},
    myPermissions: isOwner ? fullPerms : {},
  };
}

function formatNapForFaction(nap, fid) {
  const isSource = Number(nap.sourceFactionId) === Number(fid);
  const other = findFaction(isSource ? nap.targetFactionId : nap.sourceFactionId);
  return {
    ...nap,
    incoming: !isSource,
    otherFaction: other ? {
      id: other.id,
      tag: other.tag,
      name: other.title,
      flagUrl: `/api/media/${other.avatarId}/avatar`,
    } : {
      id: isSource ? nap.targetFactionId : nap.sourceFactionId,
      tag: isSource ? nap.tagB : nap.tagA,
      name: isSource ? nap.nameB : nap.nameA,
    },
  };
}

const app = express();
app.use(compression());
app.use(express.json({ limit: '6mb' }));
app.use(fileUpload({ limits: { fileSize: 6 * 1024 * 1024 } }));

// Dynamic SVG emblems so avatars & banners never break
app.get('/api/media/:id/:name', (req, res) => {
  const { id } = req.params;
  const matched = factions.find(
    (f) => f.avatarId === id || f.bannerId === id,
  );
  const isBanner = String(id).startsWith('banner-');
  const svg = renderEmblemSvg(
    matched ? matched.tag : 'PS',
    matched ? matched.color : '#0f766e',
    matched ? matched.secondaryColor : '#38bdf8',
    isBanner ? 'banner' : 'shield',
  );
  res.type('image/svg+xml').send(svg);
});

app.get('/api/factions/alliances/:id/image/:kind', (req, res) => {
  const alliance = alliances.find((a) => a.id === Number(req.params.id));
  const isBanner = req.params.kind === 'banner';
  const defaultPrimary = alliance?.allianceType === 'union'
    ? '#0284c7'
    : alliance?.allianceType === 'coalition'
      ? '#b91c1c'
      : '#6d28d9';
  const svg = renderEmblemSvg(
    alliance ? alliance.tag : 'ALY',
    alliance?.color || defaultPrimary,
    alliance?.secondaryColor || '#facc15',
    isBanner ? 'banner' : 'shield',
  );
  res.type('image/svg+xml').send(svg);
});

// Core API routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/me', (_req, res) => {
  res.json(currentUser);
});

app.get('/api/profile', (_req, res) => {
  const userFactions = factions
    .filter((f) => myFactionIds.includes(f.id))
    .map(formatFactionDto);
  res.json({
    user: currentUser,
    factions: userFactions,
    invites: [],
    activeFaction: userFactions[0] || null,
  });
});

app.post('/api/profile', (req, res) => {
  const userFactions = factions
    .filter((f) => myFactionIds.includes(f.id))
    .map(formatFactionDto);
  res.json({
    user: { ...currentUser, ...(req.body || {}) },
    factions: userFactions,
    invites: [],
    activeFaction: userFactions[0] || null,
  });
});

app.get('/api/emojis', (_req, res) => {
  res.json([]);
});

app.get('/api/ranking', (_req, res) => {
  res.json(buildRankingsPayload());
});

// Public Diplomatic News
app.get('/api/factions/diplomatic-news', (_req, res) => {
  res.json({ news: diplomaticNews });
});

// Factions & Diplomacy API routes
app.get('/api/factions/mine', (_req, res) => {
  const mine = factions
    .filter((f) => myFactionIds.includes(f.id))
    .map(formatFactionDto);
  res.json({ factions: mine });
});

app.get('/api/factions/my', (req, res) => {
  const id = Number(req.query.factionId) || myFactionIds[0];
  const faction = factions.find((f) => f.id === id) || factions[0];
  res.json({
    faction: formatFactionDto(faction),
    members: factionMembers[faction.id] || [],
  });
});

app.get('/api/factions/my/member-stats', (req, res) => {
  const id = Number(req.query.factionId) || myFactionIds[0];
  res.json({
    members: factionMembers[id] || factionMembers[1] || [],
  });
});

app.get('/api/factions/members', (req, res) => {
  const id = Number(req.query.factionId) || myFactionIds[0];
  res.json({
    members: factionMembers[id] || factionMembers[1] || [],
  });
});

app.get('/api/factions/applications', (_req, res) => {
  res.json({ applications: [] });
});

app.get('/api/factions/list', (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const filtered = factions
    .filter((f) => {
      if (!search) return true;
      return f.title.toLowerCase().includes(search)
        || f.name.toLowerCase().includes(search)
        || f.tag.toLowerCase().includes(search);
    })
    .map(formatFactionDto);
  res.json({
    factions: filtered,
    total: filtered.length,
    page: 1,
    pageSize: 50,
  });
});

app.get('/api/factions/naps/status', (_req, res) => {
  res.json({ enabled: true });
});

app.get('/api/factions/wars/status', (_req, res) => {
  res.json({ enabled: true });
});

app.get('/api/factions/naps/review', (_req, res) => {
  res.json({ naps });
});

app.get('/api/factions/configs/active', (_req, res) => {
  res.json({ config: null, template: null });
});

// Alliances, Unions, Coalitions, Bilateral Pacts & Settings
app.get('/api/factions/alliances', (_req, res) => {
  res.json({ alliances: alliances.map(enrichAlliance) });
});

app.get('/api/factions/alliances/eligible-factions', (_req, res) => {
  const mine = factions
    .filter((f) => myFactionIds.includes(f.id))
    .map(formatFactionDto);
  res.json({ factions: mine.length ? mine : [formatFactionDto(factions[0])] });
});

app.get('/api/factions/alliances/requests/mine', (_req, res) => {
  res.json({ requests: [] });
});

app.get('/api/factions/alliances/requests', (_req, res) => {
  res.json({ requests: [] });
});

app.get('/api/factions/alliances/invites/mine', (_req, res) => {
  res.json({ invites: [] });
});

app.get('/api/factions/alliances/:id/stats', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  if (!pact) {
    res.status(404).json({ error: 'Pact not found.' });
    return;
  }
  const members = factions.filter((f) => pact.memberFactionIds.includes(f.id));
  res.json({
    id: pact.id,
    name: pact.name,
    allianceType: pact.allianceType,
    totalPixels: members.reduce((sum, f) => sum + f.totalPixels, 0),
    todayPixels: members.reduce((sum, f) => sum + f.todayPixels, 0),
    members: members.map((f) => ({
      id: f.id,
      tag: f.tag,
      name: f.title,
      totalPixels: f.totalPixels,
      todayPixels: f.todayPixels,
    })),
  });
});

app.post('/api/factions/alliances/create', (req, res) => {
  const body = req.body || {};
  const factionId = Number(body.factionId) || myFactionIds[0] || 1;
  const founder = findFaction(factionId);
  if (!founder) {
    res.status(400).json({ error: 'Founder faction not found.' });
    return;
  }
  const allianceType = ['union', 'coalition', 'alliance'].includes(body.allianceType)
    ? body.allianceType
    : 'alliance';

  // Multiple bilateral pacts are always allowed. Only prevent multiple Unions/Coalitions.
  if (allianceType === 'union' || allianceType === 'coalition') {
    const alreadyInBloc = alliances.some(
      (a) => (a.allianceType === 'union' || a.allianceType === 'coalition')
        && a.memberFactionIds.includes(factionId),
    );
    if (alreadyInBloc) {
      res.status(400).json({ error: 'Your faction is already in a Union or Coalition. Bilateral pacts can still be created freely.' });
      return;
    }
  }

  let parsedTerms = [];
  if (Array.isArray(body.terms)) {
    parsedTerms = body.terms;
  } else if (typeof body.terms === 'string') {
    try {
      const json = JSON.parse(body.terms);
      parsedTerms = Array.isArray(json) ? json : [body.terms];
    } catch {
      parsedTerms = body.terms.split('\n').map((s) => s.trim()).filter(Boolean);
    }
  }

  const name = String(body.name || '').trim() || `New ${allianceType}`;
  const tag = String(body.tag || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)).toUpperCase() || 'PCT';
  const id = nextAllianceId;
  nextAllianceId += 1;

  const created = {
    id,
    name,
    tag,
    allianceType,
    description: parsedTerms[0] || '',
    terms: parsedTerms,
    avatarFileName: `pact-${id}.svg`,
    bannerFileName: `pact-banner-${id}.svg`,
    avatarUrl: `/api/factions/alliances/${id}/image/avatar`,
    bannerUrl: `/api/factions/alliances/${id}/image/banner`,
    founderFactionId: factionId,
    leaderFactionId: factionId,
    targetFactionId: allianceType === 'coalition' ? (Number(body.targetFactionId) || null) : null,
    memberFactionIds: [factionId],
    sharedCoordinationEnabled: allianceType === 'union',
    coordinationDrawMode: 'all_members',
    color: allianceType === 'union' ? '#0284c7' : allianceType === 'coalition' ? '#b91c1c' : '#6d28d9',
    secondaryColor: '#facc15',
    createdAt: new Date().toISOString(),
  };

  alliances.push(created);
  const targetFaction = created.targetFactionId ? findFaction(created.targetFactionId) : null;
  pushNews({
    type: allianceType === 'union'
      ? 'union_formed'
      : allianceType === 'coalition' ? 'coalition_formed' : 'bilateral_formed',
    headline: allianceType === 'union'
      ? `Union proclaimed: ${created.name} [${created.tag}] by [${founder.tag}] ${founder.title}`
      : allianceType === 'coalition'
        ? `Coalition formed: ${created.name} [${created.tag}] targeting ${targetFaction ? `[${targetFaction.tag}] ${targetFaction.title}` : `#${created.targetFactionId}`}`
        : `Bilateral Pact created: ${created.name} [${created.tag}] by [${founder.tag}] ${founder.title}`,
    summary: parsedTerms.join(' · ') || 'New diplomatic pact established.',
    factions: [
      factionChip(founder),
      ...(targetFaction ? [factionChip(targetFaction)] : []),
    ],
  });

  res.json({ alliance: enrichAlliance(created) });
});

app.post('/api/factions/alliances/:id/join', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  const fid = Number(req.body?.factionId) || myFactionIds[0] || 1;
  if (!pact) {
    res.status(404).json({ error: 'Pact not found.' });
    return;
  }
  if (pact.allianceType === 'alliance' && pact.memberFactionIds.length >= 2) {
    res.status(400).json({ error: 'This bilateral pact already has two factions.' });
    return;
  }
  if ((pact.allianceType === 'union' || pact.allianceType === 'coalition')
    && alliances.some((a) => (a.allianceType === 'union' || a.allianceType === 'coalition')
      && a.id !== pact.id && a.memberFactionIds.includes(fid))) {
    res.status(400).json({ error: 'Your faction is already in a Union or Coalition.' });
    return;
  }
  if (!pact.memberFactionIds.includes(fid)) {
    pact.memberFactionIds.push(fid);
  }
  res.json({ ok: true, pendingApproval: false, alliance: enrichAlliance(pact) });
});

app.post('/api/factions/alliances/:id/invite', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  const targetId = Number(req.body?.targetFactionId);
  if (!pact || !targetId) {
    res.status(400).json({ error: 'Invalid invitation target.' });
    return;
  }
  if (pact.allianceType === 'alliance' && pact.memberFactionIds.length >= 2) {
    res.status(400).json({ error: 'Bilateral pact already has 2 factions.' });
    return;
  }
  if (!pact.memberFactionIds.includes(targetId)) {
    pact.memberFactionIds.push(targetId);
  }
  res.json({ ok: true, alliance: enrichAlliance(pact) });
});

app.patch('/api/factions/alliances/:id/settings', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  if (!pact) {
    res.status(404).json({ error: 'Pact not found.' });
    return;
  }
  const {
    name, tag, terms, sharedCoordinationEnabled, coordinationDrawMode,
  } = req.body || {};
  if (typeof name === 'string' && name.trim()) pact.name = name.trim();
  if (typeof tag === 'string' && tag.trim()) pact.tag = tag.trim().toUpperCase().slice(0, 5);
  if (Array.isArray(terms)) pact.terms = terms;
  if (typeof sharedCoordinationEnabled === 'boolean') {
    pact.sharedCoordinationEnabled = sharedCoordinationEnabled;
  }
  if (typeof coordinationDrawMode === 'string') {
    pact.coordinationDrawMode = coordinationDrawMode;
  }
  res.json({ ok: true, alliance: enrichAlliance(pact) });
});

app.post('/api/factions/alliances/:id/transfer-leadership', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  const newLeaderId = Number(req.body?.newLeaderFactionId);
  if (!pact || !pact.memberFactionIds.includes(newLeaderId)) {
    res.status(400).json({ error: 'New leader must be a member faction.' });
    return;
  }
  pact.founderFactionId = newLeaderId;
  pact.leaderFactionId = newLeaderId;
  res.json({ ok: true, alliance: enrichAlliance(pact) });
});

app.delete('/api/factions/alliances/:id/members/:memberId', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  const memberId = Number(req.params.memberId);
  if (!pact) {
    res.status(404).json({ error: 'Pact not found.' });
    return;
  }
  pact.memberFactionIds = pact.memberFactionIds.filter((id) => id !== memberId);
  res.json({ ok: true, alliance: enrichAlliance(pact) });
});

app.delete('/api/factions/alliances/:id/leave', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  const fid = Number(req.body?.factionId) || myFactionIds[0] || 1;
  if (!pact) {
    res.status(404).json({ error: 'Pact not found.' });
    return;
  }
  if (Number(pact.founderFactionId) === fid || pact.memberFactionIds.length <= 1) {
    alliances = alliances.filter((a) => a.id !== pact.id);
    pushNews({
      type: pact.allianceType === 'coalition' ? 'coalition_dissolved' : 'pact_severed',
      headline: `${pact.allianceType === 'union' ? 'Union' : pact.allianceType === 'coalition' ? 'Coalition' : 'Bilateral Pact'} dissolved: ${pact.name}`,
      summary: 'Disbanded by its founder faction.',
      factions: [factionChip(findFaction(fid))].filter(Boolean),
    });
  } else {
    pact.memberFactionIds = pact.memberFactionIds.filter((id) => id !== fid);
  }
  res.json({ ok: true });
});

app.delete('/api/factions/alliances/:id', (req, res) => {
  const pact = alliances.find((a) => a.id === Number(req.params.id));
  if (!pact) {
    res.status(404).json({ error: 'Pact not found.' });
    return;
  }
  const memberChips = pact.memberFactionIds.map((id) => factionChip(findFaction(id))).filter(Boolean);
  alliances = alliances.filter((a) => a.id !== pact.id);
  pushNews({
    type: pact.allianceType === 'coalition' ? 'coalition_dissolved' : 'pact_severed',
    headline: `${pact.allianceType === 'union' ? 'Union' : pact.allianceType === 'coalition' ? 'Coalition' : 'Pact'} dissolved: ${pact.name} [${pact.tag}]`,
    summary: 'Formally dissolved via Union / Coalition Settings.',
    factions: memberChips,
  });
  res.json({ ok: true });
});

// NAPs & Multi-Condition Treaties
app.post('/api/factions/naps/propose', (req, res) => {
  const {
    factionId, targetFactionId, territory = null, terms = [], startDate, endDate,
  } = req.body || {};
  const source = findFaction(factionId || myFactionIds[0] || 1);
  const target = findFaction(targetFactionId);
  if (!source || !target) {
    res.status(400).json({ error: 'Both source and target factions are required.' });
    return;
  }
  const created = {
    id: nextNapId,
    sourceFactionId: source.id,
    targetFactionId: target.id,
    tagA: source.tag,
    nameA: source.title,
    tagB: target.tag,
    nameB: target.title,
    sourceFactionName: source.title,
    sourceFactionTag: source.tag,
    targetFactionName: target.title,
    targetFactionTag: target.tag,
    status: 'pending',
    startDate: startDate || new Date().toISOString().slice(0, 10),
    endDate: endDate || null,
    createdAt: new Date().toISOString(),
    territory,
    terms: Array.isArray(terms) ? terms : [],
  };
  nextNapId += 1;
  naps.unshift(created);
  pushNews({
    type: 'nap_proposed',
    headline: `NAP / Treaty proposed: [${source.tag}] ${source.title} → [${target.tag}] ${target.title}`,
    summary: `${created.terms.length} clause(s)${territory ? ` · Protected area on Canvas #${territory.canvasId ?? 0}` : ''}.`,
    factions: [factionChip(source), factionChip(target)],
    terms: created.terms.map((term) => ({
      label: term.type || 'Clause',
      summary: term.targetPactName
        ? `${term.forcesCoalitionDissolution ? 'Dissolve Coalition' : 'Sever Pact'}: ${term.targetPactName}`
        : (term.description || term.restrictions || ''),
    })),
  });
  res.json({ nap: formatNapForFaction(created, source.id) });
});

app.post('/api/factions/:id/naps/request', (req, res) => {
  const source = findFaction(req.params.id);
  const {
    otherTag, startDate, endDate, territory = null, terms = [],
  } = req.body || {};
  const target = factions.find(
    (f) => f.tag.toUpperCase() === String(otherTag || '').trim().toUpperCase(),
  );
  if (!source || !target) {
    res.status(404).json({ error: `Faction with tag [${otherTag}] not found.` });
    return;
  }
  const created = {
    id: nextNapId,
    sourceFactionId: source.id,
    targetFactionId: target.id,
    tagA: source.tag,
    nameA: source.title,
    tagB: target.tag,
    nameB: target.title,
    sourceFactionName: source.title,
    sourceFactionTag: source.tag,
    targetFactionName: target.title,
    targetFactionTag: target.tag,
    status: 'pending',
    startDate: startDate || new Date().toISOString().slice(0, 10),
    endDate: endDate || null,
    createdAt: new Date().toISOString(),
    territory,
    terms: Array.isArray(terms) ? terms : [],
  };
  nextNapId += 1;
  naps.unshift(created);
  pushNews({
    type: 'nap_proposed',
    headline: `NAP proposed between [${source.tag}] ${source.title} and [${target.tag}] ${target.title}`,
    summary: territory?.mode === 'template_mask'
      ? `Template auto-protection (${territory.pixelCount?.toLocaleString() || 0} exact pixels) with ${created.terms.length} clause(s).`
      : `${created.terms.length} treaty clause(s) attached.`,
    factions: [factionChip(source), factionChip(target)],
    terms: created.terms.map((term) => ({
      label: term.type || 'Clause',
      summary: term.targetPactName
        ? `${term.forcesCoalitionDissolution ? 'Dissolve Coalition' : 'Sever Pact'}: ${term.targetPactName}`
        : (term.description || term.restrictions || ''),
    })),
  });
  res.json({ nap: formatNapForFaction(created, source.id) });
});

app.post('/api/factions/naps/:id/approve', (req, res) => {
  const nap = naps.find((n) => n.id === Number(req.params.id));
  if (!nap) {
    res.status(404).json({ error: 'NAP proposal not found.' });
    return;
  }
  nap.status = 'active';
  const source = findFaction(nap.sourceFactionId);
  const target = findFaction(nap.targetFactionId);
  const effects = enforceTreatyTerms(nap.targetFactionId, nap.terms, source);
  pushNews({
    type: 'nap_signed',
    headline: `NAP ratified: [${nap.tagA}] ${nap.nameA} ⇄ [${nap.tagB}] ${nap.nameB}`,
    summary: effects.length
      ? `Enacted terms: ${effects.join(' | ')}`
      : 'Agreement ratified and territory protection active.',
    factions: [factionChip(source), factionChip(target)].filter(Boolean),
    terms: (nap.terms || []).map((term) => ({
      label: typeof term === 'string' ? 'Clause' : (term.type || 'Clause'),
      summary: typeof term === 'string'
        ? term
        : (term.targetPactName
            ? `${term.forcesCoalitionDissolution ? 'Dissolved Coalition' : 'Severed Pact'}: ${term.targetPactName}`
            : (term.description || term.restrictions || '')),
    })),
  });
  res.json({ ok: true, nap, effects });
});

app.post('/api/factions/naps/:id/reject', (req, res) => {
  const nap = naps.find((n) => n.id === Number(req.params.id));
  if (!nap) {
    res.status(404).json({ error: 'NAP proposal not found.' });
    return;
  }
  nap.status = 'rejected';
  res.json({ ok: true, nap });
});

app.delete('/api/factions/:fid/naps/:id', (req, res) => {
  const napId = Number(req.params.id);
  naps = naps.filter((n) => n.id !== napId);
  res.json({ ok: true });
});

// Wars & Multi-Condition Peace Treaties
app.post('/api/factions/diplomacy/declare-war', (req, res) => {
  const { factionId, targetFactionId } = req.body || {};
  const source = findFaction(factionId || myFactionIds[0] || 1);
  const target = findFaction(targetFactionId);
  if (!source || !target || source.id === target.id) {
    res.status(400).json({ error: 'Choose a valid target faction.' });
    return;
  }
  const exists = wars.some(
    (w) => (w.factionA === source.id && w.factionB === target.id)
      || (w.factionA === target.id && w.factionB === source.id),
  );
  if (exists) {
    res.status(400).json({ error: 'These factions are already at war.' });
    return;
  }
  const created = {
    id: nextWarId,
    factionA: source.id,
    factionB: target.id,
    tagA: source.tag,
    nameA: source.title,
    tagB: target.tag,
    nameB: target.title,
    createdAt: new Date().toISOString(),
  };
  nextWarId += 1;
  wars.unshift(created);
  pushNews({
    type: 'war_declared',
    headline: `War Declared: [${source.tag}] ${source.title} ⚔ [${target.tag}] ${target.title}`,
    summary: `[${source.tag}] formally declared war on [${target.tag}].`,
    factions: [factionChip(source), factionChip(target)],
  });
  res.json({ war: created });
});

app.post('/api/factions/diplomacy/peace', (req, res) => {
  const {
    factionId, targetFactionId, terms = [], notes = '',
  } = req.body || {};
  const source = findFaction(factionId || myFactionIds[0] || 1);
  const target = findFaction(targetFactionId);
  if (!source || !target) {
    res.status(400).json({ error: 'Choose a valid target faction.' });
    return;
  }
  wars = wars.filter(
    (w) => !((w.factionA === source.id && w.factionB === target.id)
      || (w.factionA === target.id && w.factionB === source.id)),
  );
  const normalizedTerms = Array.isArray(terms)
    ? terms
    : (typeof terms === 'string' && terms.trim()
        ? [{ type: 'surrender_restrictions', description: terms.trim() }]
        : []);
  const effects = enforceTreatyTerms(target.id, normalizedTerms, source);
  const treaty = {
    id: nextTreatyId,
    factionA: source.id,
    factionB: target.id,
    tagA: source.tag,
    nameA: source.title,
    tagB: target.tag,
    nameB: target.title,
    notes: String(notes || '').trim(),
    terms: normalizedTerms,
    effects,
    createdAt: new Date().toISOString(),
  };
  nextTreatyId += 1;
  peaceTreaties.unshift(treaty);
  pushNews({
    type: 'peace_signed',
    headline: `Peace Treaty signed: [${source.tag}] ${source.title} 🕊 [${target.tag}] ${target.title}`,
    summary: effects.length
      ? `${notes ? `${notes} · ` : ''}${effects.join(' | ')}`
      : (notes || `Signed with ${normalizedTerms.length} binding condition(s).`),
    factions: [factionChip(source), factionChip(target)],
    terms: normalizedTerms.map((term) => ({
      label: term.type || 'Clause',
      summary: term.targetPactName
        ? `${term.forcesCoalitionDissolution ? 'Dissolved Coalition' : 'Severed Pact'}: ${term.targetPactName}`
        : (term.description || term.restrictions || ''),
    })),
  });
  res.json({ ok: true, treaty, effects });
});

// Shared Union & Private Faction Coordination Drawing Endpoints
app.get('/api/factions/coordination/union/:allianceId', (req, res) => {
  const allianceId = Number(req.params.allianceId);
  const pact = alliances.find((a) => a.id === allianceId && a.allianceType === 'union');
  if (!pact) {
    res.status(404).json({ error: 'Union not found.' });
    return;
  }
  const key = `union:${allianceId}`;
  res.json({
    scope: 'union',
    allianceId,
    unionName: pact.name,
    canDraw: pact.sharedCoordinationEnabled !== false,
    marks: coordinationMarks[key] || [],
  });
});

app.post('/api/factions/coordination/union/:allianceId', (req, res) => {
  const allianceId = Number(req.params.allianceId);
  const pact = alliances.find((a) => a.id === allianceId && a.allianceType === 'union');
  if (!pact) {
    res.status(404).json({ error: 'Union not found.' });
    return;
  }
  if (pact.sharedCoordinationEnabled === false) {
    res.status(403).json({ error: 'Shared Union coordination is disabled in Union Settings.' });
    return;
  }
  const key = `union:${allianceId}`;
  if (!coordinationMarks[key]) coordinationMarks[key] = [];
  const mark = {
    id: nextMarkId,
    canvasId: Number(req.body?.canvasId) || 0,
    tool: req.body?.tool || 'brush',
    color: req.body?.color || '#34d399',
    width: Number(req.body?.width) || 4,
    opacity: Number(req.body?.opacity) || 95,
    author: `${currentUser.name} [NVG]`,
    points: Array.isArray(req.body?.points) ? req.body.points : [],
  };
  nextMarkId += 1;
  coordinationMarks[key].push(mark);
  res.json({ id: mark.id, mark });
});

app.delete('/api/factions/coordination/union/:allianceId', (req, res) => {
  const key = `union:${Number(req.params.allianceId)}`;
  coordinationMarks[key] = [];
  res.json({ ok: true });
});

app.delete('/api/factions/coordination/union/:allianceId/marks/:markId', (req, res) => {
  const key = `union:${Number(req.params.allianceId)}`;
  const mid = Number(req.params.markId);
  coordinationMarks[key] = (coordinationMarks[key] || []).filter((m) => m.id !== mid);
  res.json({ ok: true });
});

app.get('/api/factions/coordination/:id', (req, res) => {
  const fid = Number(req.params.id);
  const key = `faction:${fid}`;
  res.json({
    scope: 'faction',
    factionId: fid,
    canDraw: true,
    marks: coordinationMarks[key] || [],
  });
});

app.post('/api/factions/coordination/:id', (req, res) => {
  const fid = Number(req.params.id);
  const key = `faction:${fid}`;
  if (!coordinationMarks[key]) coordinationMarks[key] = [];
  const mark = {
    id: nextMarkId,
    canvasId: Number(req.body?.canvasId) || 0,
    tool: req.body?.tool || 'brush',
    color: req.body?.color || '#38bdf8',
    width: Number(req.body?.width) || 4,
    opacity: Number(req.body?.opacity) || 95,
    author: `${currentUser.name} [NVG]`,
    points: Array.isArray(req.body?.points) ? req.body.points : [],
  };
  nextMarkId += 1;
  coordinationMarks[key].push(mark);
  res.json({ id: mark.id, mark });
});

app.delete('/api/factions/coordination/:id', (req, res) => {
  const key = `faction:${Number(req.params.id)}`;
  coordinationMarks[key] = [];
  res.json({ ok: true });
});

app.delete('/api/factions/coordination/:id/marks/:markId', (req, res) => {
  const key = `faction:${Number(req.params.id)}`;
  const mid = Number(req.params.markId);
  coordinationMarks[key] = (coordinationMarks[key] || []).filter((m) => m.id !== mid);
  res.json({ ok: true });
});

// Unified Faction Info & Profile endpoints
app.get('/api/factions/info/:name', (req, res) => {
  const needle = decodeURIComponent(req.params.name || '').toLowerCase();
  const faction = factions.find(
    (f) => f.name.toLowerCase() === needle
      || String(f.id) === needle
      || f.tag.toLowerCase() === needle,
  ) || factions[0];
  res.json({
    faction: {
      ...formatFactionDto(faction),
      members: factionMembers[faction.id] || [],
    },
    members: factionMembers[faction.id] || [],
    alliances: getAlliancesForFaction(faction.id),
    powerlvl: faction.ownerId === currentUser.id ? 2 : 0,
    myUid: currentUser.id,
  });
});

app.get('/api/factions/:id/profile', (req, res) => {
  const faction = factions.find((f) => f.id === Number(req.params.id)) || factions[0];
  res.json({
    faction: formatFactionDto(faction),
    members: factionMembers[faction.id] || [],
    alliances: getAlliancesForFaction(faction.id),
  });
});

app.get('/api/factions/:id/territory', (_req, res) => {
  res.json({ territory: null, bbox: null });
});

app.get('/api/factions/:id/templates', (_req, res) => {
  res.json({ templates: [] });
});

app.get('/api/factions/:id/naps/mine', (req, res) => {
  const fid = Number(req.params.id);
  const mine = naps
    .filter((n) => n.sourceFactionId === fid || n.targetFactionId === fid)
    .map((n) => formatNapForFaction(n, fid));
  res.json({ naps: mine });
});

app.get('/api/factions/:id/diplomacy', (req, res) => {
  const fid = Number(req.params.id);
  res.json({
    naps: naps
      .filter((n) => n.sourceFactionId === fid || n.targetFactionId === fid)
      .map((n) => formatNapForFaction(n, fid)),
    wars: wars.filter((w) => w.factionA === fid || w.factionB === fid),
    treaties: peaceTreaties.filter((tr) => tr.factionA === fid || tr.factionB === fid),
    alliances: getAlliancesForFaction(fid),
  });
});

app.get('/api/factions/:id/members', (req, res) => {
  const fid = Number(req.params.id);
  res.json({ members: factionMembers[fid] || factionMembers[1] || [] });
});

app.get('/api/factions/:id/bans', (_req, res) => {
  res.json({ bans: [] });
});

app.get('/api/factions/:id/invites', (_req, res) => {
  res.json({ invites: [] });
});

app.post('/api/factions/create', (req, res) => {
  const {
    name, title, description, isPublic = true, tag, color = '#0ea5e9',
  } = req.body || {};
  const nextId = factions.reduce((m, f) => Math.max(m, f.id), 0) + 1;
  const cleanTitle = (title || name || `Faction ${nextId}`).trim();
  const cleanName = (name || cleanTitle).trim().replace(/\s+/g, '_');
  const cleanTag = (tag || cleanName.slice(0, 3)).toUpperCase();
  const created = {
    id: nextId,
    name: cleanName,
    title: cleanTitle,
    tag: cleanTag,
    rankTitle: 'Chiefdom',
    description: description || '',
    color,
    secondaryColor: '#f8fafc',
    avatarId: `emblem-${nextId}:svg`,
    bannerId: `banner-${nextId}:svg`,
    isPublic: Boolean(isPublic),
    isPrivate: !isPublic,
    openJoin: Boolean(isPublic),
    memberCount: 1,
    totalPixels: 1000,
    todayPixels: 250,
    createdAt: new Date().toISOString(),
    ownerId: currentUser.id,
  };
  factions.push(created);
  myFactionIds = [created.id];
  factionMembers[created.id] = [{
    id: currentUser.id,
    uid: currentUser.id,
    name: currentUser.name,
    role: 'owner',
    total: currentUser.totalPixels,
    today: currentUser.dailyTotalPixels,
    totalPixels: currentUser.totalPixels,
    dailyPixels: currentUser.dailyTotalPixels,
    joinedAt: created.createdAt,
    permissions: { manageFaction: true },
  }];
  res.json({ faction: formatFactionDto(created) });
});

app.post('/api/factions/join', (req, res) => {
  const fid = Number(req.body?.factionId);
  const faction = factions.find((f) => f.id === fid);
  if (!faction) {
    res.status(404).json({ error: 'Faction not found.' });
    return;
  }
  if (!myFactionIds.includes(fid)) {
    myFactionIds = [fid];
  }
  res.json({ faction: formatFactionDto(faction) });
});

app.post('/api/factions/leave', (req, res) => {
  const fid = Number(req.body?.factionId);
  myFactionIds = myFactionIds.filter((id) => id !== fid);
  res.json({ ok: true });
});

app.post('/api/factions/apply', (_req, res) => {
  res.json({ ok: true, status: 'pending' });
});

app.patch('/api/factions/:id', (req, res) => {
  const fid = Number(req.params.id);
  const faction = factions.find((f) => f.id === fid);
  if (!faction) {
    res.status(404).json({ error: 'Faction not found.' });
    return;
  }
  Object.assign(faction, req.body || {});
  res.json({ faction: formatFactionDto(faction) });
});

// Static assets
app.use('/assets', express.static(distAssetsDir));
app.use(express.static(publicDir));

// Main HTML entry
app.get('/', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PixelStates</title>
  <meta name="description" content="Unlimited planet canvas for placing pixels, factions, diplomacy, and leaderboards." />
  <link rel="stylesheet" href="/styles/default.css" />
  <link rel="stylesheet" href="/preview.css" />
  <script>
    window.ssv = {
      basename: '',
      lang: 'en',
      langs: {
        en: 'gb',
        tr: 'tr',
        de: 'de',
        fr: 'fr',
        ru: 'ru',
      },
      contactAddress: 'contact@pixelstates.fun',
      authServices: [],
      availableStyles: {
        default: '/styles/default.css',
        dark: '/styles/theme-dark.css',
        'dark-round': '/styles/theme-dark-round.css',
        'light-round': '/styles/theme-light-round.css',
        arkeros: '/styles/theme-arkeros.css',
        'dark-spooky': '/styles/theme-dark-spooky.css',
        'dark-sstraight': '/styles/theme-dark-sstraight.css',
      },
    };
  </script>
</head>
<body>
  <div id="app"></div>
  <script src="/assets/preview.js" defer></script>
</body>
</html>`);
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

ensureClientBundle()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`PixelStates server listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to build preview bundle:', err);
    process.exit(1);
  });
