/*
 * user faction overview
 */
import { useMemo, useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import {
  useDispatch, useSelector, shallowEqual,
} from '../../store/react-redux/index.js';
import { t } from 'ttag';
import { USERLVL } from '../../core/constants.js';

import {
  validateFactionName, validateFactionTag, validateFactionTitle, validateDescription,
} from '../../utils/validation.js';
import { api, cdn } from '../../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../../utils/media/utils.js';
import {
  changeProfile, fetchStats,
} from '../../store/actions/thunks.js';
import {
  requestCreateFaction, requestLeaveFaction,
} from '../../store/actions/fetch.js';
import {
  applyPatches,
} from '../../store/actions/index.js';
import FileUpload from '../FileUpload.jsx';
import useProfile from '../hooks/useProfile.js';
import Table from '../Table.jsx';
import FactionBrowser from './FactionBrowser.jsx';
import FactionSystemTab from './FactionSystemTab.jsx';
import templateLoader from '../../ui/templateLoader.js';
import { toggleOVEnabled } from '../../store/actions/templates.js';

function formatPixels(num) {
  if (!num || Number.isNaN(Number(num))) return '0';
  const n = Number(num);
  if (n >= 1000000) {
    const m = (n / 1000000).toFixed(2).replace(/\.?0+$/, '');
    return `${m}M`;
  }
  if (n >= 1000) {
    const k = (n / 1000).toFixed(n >= 10000 ? 0 : 2).replace(/\.?0+$/, '');
    return `${k}k`;
  }
  return String(n);
}

function formatFactionDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return String(dateVal);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateOnly(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return String(dateVal).split('T')[0];
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function requestJson(route, options = {}) {
  const response = await fetch(api`${route}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const responseText = await response.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    const detail = response.ok
      ? t`The server returned a non-JSON response.`
      : t`The server returned a non-JSON response (HTTP ${response.status}).`;
    throw new Error(detail);
  }
  if (!response.ok) throw new Error(result.error || result.errors?.[0] || t`Request failed.`);
  return result;
}

function resolveAvatarUrl(avatarVal) {
  if (!avatarVal) return null;
  if (avatarVal.startsWith('/') || avatarVal.startsWith('http')) return avatarVal;
  const [url] = getUrlsFromMediaIdAndName(avatarVal, 'avatar');
  return url ? cdn`${url}` : null;
}

const ROLE_NAMES = {
  owner: t`Owner`,
  leader: t`Leader`,
  deputy: t`Deputy`,
  officer: t`Officer`,
  member: t`Member`,
};

const PERMISSION_CONFIG = [
  { key: 'manageFaction', label: t`Manage Faction Settings`, desc: t`Edit title, description, privacy, and open join` },
  { key: 'manageFactionAppearance', label: t`Manage Faction Appearance`, desc: t`Change the faction avatar and banner` },
  { key: 'manageApplications', label: t`Manage Applications`, desc: t`Review and accept/reject join applications` },
  { key: 'manageInvites', label: t`Manage Invitations`, desc: t`Invite players to the faction` },
  { key: 'manageMembers', label: t`Manage Members`, desc: t`Kick lower-ranked members` },
  { key: 'manageRanks', label: t`Manage Admin & Roles`, desc: t`Promote/demote and configure member permissions` },
  { key: 'manageTemplates', label: t`Manage Templates`, desc: t`Upload, set, and delete faction canvas templates` },
  { key: 'manageConfigs', label: t`Manage Configurations`, desc: t`Configure canvas coordination and settings` },
  { key: 'manageNaps', label: t`Manage NAPs`, desc: t`Propose and manage Non-Aggression Pacts` },
  { key: 'manageCoordination', label: t`Manage Coordination`, desc: t`Configure coordination IDs` },
  { key: 'drawCoordination', label: t`Canvas Planning Access`, desc: t`Use the faction drawing tool to add private plans and arrows that only faction members can see` },
];

const DEFAULT_ROLE_PERMS = {
  member: {},
  officer: { manageApplications: true },
  deputy: { manageApplications: true, manageInvites: true, manageMembers: true, manageTemplates: true },
  leader: {
    manageFaction: true, manageApplications: true, manageInvites: true, manageMembers: true,
    manageRanks: true, manageTemplates: true, manageConfigs: true, manageNaps: true, manageCoordination: true,
  },
};

const MyFactions = () => {
  const [page, setPage] = useState('list');
  const [subTab, setSubTab] = useState('home');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copiedTag, setCopiedTag] = useState(false);
  const [myFactionDetails, setMyFactionDetails] = useState(null);
  const [membersList, setMembersList] = useState([]);
  const [memberStatsError, setMemberStatsError] = useState('');
  const [applicationsList, setApplicationsList] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applicationActionId, setApplicationActionId] = useState(null);
  const [napsList, setNapsList] = useState([]);
  const [napsEnabled, setNapsEnabled] = useState(false);
  const [showNapReview, setShowNapReview] = useState(false);
  const canReviewNaps = useSelector((state) => state.user.userlvl >= USERLVL.MOD);
  const [warsEnabled, setWarsEnabled] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);

  const [showUploadTemplateModal, setShowUploadTemplateModal] = useState(false);
  const [showNewNapModal, setShowNewNapModal] = useState(false);
  const [showFullscreenTerritoryModal, setShowFullscreenTerritoryModal] = useState(false);
  const [showEditInfoModal, setShowEditInfoModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberRole, setMemberRole] = useState('member');
  const [memberPerms, setMemberPerms] = useState({});
  const [savingMemberPerms, setSavingMemberPerms] = useState(false);
  const [memberModalError, setMemberModalError] = useState('');

  const [showDisbandModal, setShowDisbandModal] = useState(false);
  const [disbandConfirmName, setDisbandConfirmName] = useState('');
  const [disbanding, setDisbanding] = useState(false);
  const [disbandError, setDisbandError] = useState('');

  const [templateFile, setTemplateFile] = useState(null);
  const [templateCanvasId, setTemplateCanvasId] = useState(0);
  const [templateX, setTemplateX] = useState(0);
  const [templateY, setTemplateY] = useState(0);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  const [napTargetTag, setNapTargetTag] = useState('');
  const [targetTemplate, setTargetTemplate] = useState(null);
  const [loadingTargetTemplate, setLoadingTargetTemplate] = useState(false);
  const [targetTemplateError, setTargetTemplateError] = useState('');
  const [napStartDate, setNapStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [napEndDate, setNapEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [targetBBox, setTargetBBox] = useState(null);
  const [myBBox, setMyBBox] = useState(null);
  const [activeTerritoryTab, setActiveTerritoryTab] = useState('my');
  const editorTemplate = activeTerritoryTab === 'target'
    ? (targetTemplate || activeTemplate)
    : activeTemplate;
  const [selectionTool, setSelectionTool] = useState('rect');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  const [dragStartPoint, setDragStartPoint] = useState(null);
  const [currentDragRect, setCurrentDragRect] = useState(null);
  const [submittingNap, setSubmittingNap] = useState(false);
  const [napModalError, setNapModalError] = useState('');

  const openNewNapModal = () => {
    setNapModalError('');
    setTargetTemplate(null);
    setTargetTemplateError('');
    setActiveTerritoryTab('my');
    setTargetBBox(null);
    setMyBBox(null);
    setShowNewNapModal(true);
  };

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const lassoCanvasRef = useRef(null);
  const templateImgRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, naturalWidth: 800 });
  const uploadRef = useRef();
  const bannerUploadRef = useRef();
  const factionAvatarEditRef = useRef();
  const factionBannerEditRef = useRef();
  const dispatch = useDispatch();

  const [profileFactions, fetched] = useProfile((profile) => [
    profile.factions,
  ]);

  const [totalPixels, factionRanking, currentUserId, userTemplatesList, ovEnabled] = useSelector((state) => [
    state.ranks.totalPixels,
    state.ranks.factionRanking,
    state.user.id,
    state.templates?.list || [],
    state.templates?.ovEnabled || false,
  ], shallowEqual);

  const [installingTemplate, setInstallingTemplate] = useState(false);
  const [installSuccessMessage, setInstallSuccessMessage] = useState('');

  const canCreateFaction = totalPixels >= 50000;

  const loadMyFaction = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const mineResult = await requestJson('/api/factions/mine');
      const own = mineResult.factions?.[0];
      if (own?.id) {
        const detailResult = await requestJson(`/api/factions/my?factionId=${own.id}`);
        setMyFactionDetails(detailResult.faction || null);
      } else if (profileFactions?.length > 0) {
        // Fallback to profile faction data
        const fallback = profileFactions[0];
        setMyFactionDetails({
          id: fallback.id || null,
          name: fallback.title || fallback.name,
          title: fallback.title || fallback.name,
          tag: fallback.tag || fallback.name?.slice(0, 5)?.toUpperCase() || '',
          description: fallback.description || '',
          avatarId: fallback.avatarId,
          flag: fallback.avatarId,
          memberCount: fallback.memberCount || 1,
          createdAt: fallback.createdAt || null,
          totalPixels: 0,
          todayPixels: 0,
          permissions: {},
        });
      } else {
        setMyFactionDetails(null);
      }
    } catch {
      if (profileFactions?.length > 0) {
        const fallback = profileFactions[0];
        setMyFactionDetails({
          id: fallback.id || null,
          name: fallback.title || fallback.name,
          title: fallback.title || fallback.name,
          tag: fallback.tag || fallback.name?.slice(0, 5)?.toUpperCase() || '',
          description: fallback.description || '',
          avatarId: fallback.avatarId,
          flag: fallback.avatarId,
          memberCount: fallback.memberCount || 1,
          createdAt: fallback.createdAt || null,
          totalPixels: 0,
          todayPixels: 0,
          permissions: {},
        });
      } else {
        setMyFactionDetails(null);
      }
    }
  }, [currentUserId, profileFactions]);

  useEffect(() => {
    loadMyFaction();
  }, [loadMyFaction]);

  useEffect(() => {
    const handleMembershipChange = () => loadMyFaction();
    window.addEventListener('factionmembershipchange', handleMembershipChange);
    return () => {
      window.removeEventListener(
        'factionmembershipchange', handleMembershipChange,
      );
    };
  }, [loadMyFaction]);

  const loadMembers = useCallback(async () => {
    if (!myFactionDetails?.id) return;
    setMemberStatsError('');
    try {
      const res = await requestJson(`/api/factions/my/member-stats?factionId=${myFactionDetails.id}`);
      setMembersList(res.members || []);
    } catch (statsError) {
      setMemberStatsError(statsError.message);
      try {
        const res = await requestJson(`/api/factions/members?factionId=${myFactionDetails.id}`);
        setMembersList(res.members || []);
      } catch (membersError) {
        setMemberStatsError(membersError.message);
        setMembersList([]);
      }
    }
  }, [myFactionDetails]);

  const loadApplications = useCallback(async () => {
    if (!myFactionDetails?.id) return;
    setLoadingApplications(true);
    try {
      const res = await requestJson(
        `/api/factions/applications?factionId=${myFactionDetails.id}`,
      );
      setApplicationsList(res.applications || []);
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setLoadingApplications(false);
    }
  }, [myFactionDetails?.id]);

  const loadNaps = useCallback(async () => {
    if (!napsEnabled) {
      setNapsList([]);
      return;
    }
    if (!myFactionDetails?.id) return;
    try {
      const res = await requestJson(`/api/factions/${myFactionDetails.id}/naps/mine`);
      setNapsList(res.naps || []);
    } catch {
      setNapsList([]);
    }
  }, [myFactionDetails, napsEnabled]);

  useEffect(() => {
    requestJson('/api/factions/naps/status')
      .then((res) => setNapsEnabled(Boolean(res.enabled)))
      .catch(() => setNapsEnabled(false));
    requestJson('/api/factions/wars/status')
      .then((res) => setWarsEnabled(Boolean(res.enabled)))
      .catch(() => setWarsEnabled(false));
  }, []);

  useEffect(() => {
    if (!warsEnabled && ['alliances', 'diplomacy'].includes(subTab)) {
      setSubTab('home');
    }
  }, [subTab, warsEnabled]);

  const loadTemplate = useCallback(async () => {
    if (!myFactionDetails?.id) return;
    try {
      const res = await requestJson(`/api/factions/configs/active?factionId=${myFactionDetails.id}`);
      setActiveTemplate(res.config || null);
    } catch {
      setActiveTemplate(null);
    }
  }, [myFactionDetails]);

  useEffect(() => {
    if (subTab === 'members') loadMembers();
    else if (subTab === 'notifications') loadApplications();
    else if (subTab === 'naps') loadNaps();
    else if (subTab === 'templates' || subTab === 'config') loadTemplate();
  }, [subTab, loadMembers, loadApplications, loadNaps, loadTemplate]);

  const bboxToCanvasCoords = useCallback((bbox, canvas, img) => {
    if (!bbox || !canvas || !img || !editorTemplate) return null;
    const originX = Number(editorTemplate.x) || 0;
    const originY = Number(editorTemplate.y) || 0;
    const imgMinX = bbox.x1 - originX;
    const imgMaxX = bbox.x2 - originX;
    const imgMinY = bbox.y1 - originY;
    const imgMaxY = bbox.y2 - originY;

    const scaleX = canvas.width / img.naturalWidth;
    const scaleY = canvas.height / img.naturalHeight;

    const x = Math.max(0, Math.min(canvas.width, imgMinX * scaleX));
    const y = Math.max(0, Math.min(canvas.height, imgMinY * scaleY));
    const w = Math.max(2, Math.min(canvas.width - x, (imgMaxX - imgMinX + 1) * scaleX));
    const h = Math.max(2, Math.min(canvas.height - y, (imgMaxY - imgMinY + 1) * scaleY));
    return { x, y, w, h };
  }, [editorTemplate]);

  const computeBBoxFromCanvasCoords = useCallback((minX, maxX, minY, maxY) => {
    const canvas = lassoCanvasRef.current;
    const img = templateImgRef.current;
    if (!canvas || !img || !editorTemplate) return null;

    const scaleX = img.naturalWidth / canvas.width;
    const scaleY = img.naturalHeight / canvas.height;
    const imgMinX = Math.round(minX * scaleX);
    const imgMaxX = Math.round(maxX * scaleX);
    const imgMinY = Math.round(minY * scaleY);
    const imgMaxY = Math.round(maxY * scaleY);

    const originX = Number(editorTemplate.x) || 0;
    const originY = Number(editorTemplate.y) || 0;
    const canvasMinX = originX + imgMinX;
    const canvasMaxX = originX + imgMaxX;
    const canvasMinY = originY + imgMinY;
    const canvasMaxY = originY + imgMaxY;

    return {
      canvasId: Number(editorTemplate.canvasId) || 0,
      x1: Math.min(canvasMinX, canvasMaxX),
      y1: Math.min(canvasMinY, canvasMaxY),
      x2: Math.max(canvasMinX, canvasMaxX),
      y2: Math.max(canvasMinY, canvasMaxY),
    };
  }, [editorTemplate]);

  const redrawTerritoryCanvas = useCallback(() => {
    const canvas = lassoCanvasRef.current;
    const img = templateImgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Outer boundary of template image (red outline)
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // 1. Target Faction Territory (Red/Coral)
    if (activeTerritoryTab === 'target' && targetBBox) {
      const rect = bboxToCanvasCoords(targetBBox, canvas, img);
      if (rect) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

        const targetTag = napTargetTag.trim() || t`TARGET`;
        const label = t`[${targetTag}] Their Territory`;
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(20, 20, 26, 0.9)';
        ctx.fillRect(rect.x + 4, Math.max(4, rect.y + 4), tw + 12, 20);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 4, Math.max(4, rect.y + 4), tw + 12, 20);
        ctx.fillStyle = '#fca5a5';
        ctx.fillText(label, rect.x + 10, Math.max(4, rect.y + 4) + 14);
      }
    }

    // 2. Your Faction Territory (Blue)
    if (activeTerritoryTab === 'my' && myBBox) {
      const rect = bboxToCanvasCoords(myBBox, canvas, img);
      if (rect) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

        const factionTag = myFactionDetails?.tag || t`YOU`;
        const label = t`[${factionTag}] Your Territory`;
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(20, 20, 26, 0.9)';
        ctx.fillRect(rect.x + 4, Math.max(4, rect.y + 4), tw + 12, 20);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 4, Math.max(4, rect.y + 4), tw + 12, 20);
        ctx.fillStyle = '#93c5fd';
        ctx.fillText(label, rect.x + 10, Math.max(4, rect.y + 4) + 14);
      }
    }

    // Active live drawing
    if (isDrawing) {
      const isTarget = activeTerritoryTab === 'target';
      const strokeCol = isTarget ? '#ef4444' : '#3b82f6';
      const fillCol = isTarget ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)';

      if (selectionTool === 'rect' && currentDragRect) {
        const rx = Math.min(currentDragRect.x1, currentDragRect.x2);
        const ry = Math.min(currentDragRect.y1, currentDragRect.y2);
        const rw = Math.abs(currentDragRect.x2 - currentDragRect.x1);
        const rh = Math.abs(currentDragRect.y2 - currentDragRect.y1);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 2;
        ctx.fillStyle = fillCol;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      } else if (selectionTool === 'lasso' && drawPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
        for (let i = 1; i < drawPoints.length; i += 1) {
          ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
        }
        ctx.closePath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = fillCol;
        ctx.fill();
      }
    }
  }, [
    targetBBox,
    myBBox,
    isDrawing,
    activeTerritoryTab,
    selectionTool,
    currentDragRect,
    drawPoints,
    napTargetTag,
    myFactionDetails?.tag,
    bboxToCanvasCoords,
  ]);

  useEffect(() => {
    redrawTerritoryCanvas();
  }, [redrawTerritoryCanvas]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    const tag = napTargetTag.trim().toUpperCase();
    setTargetBBox(null);
    if (!showNewNapModal || !myFactionDetails?.id || !/^[A-Z0-9]{2,3}$/.test(tag)) {
      setTargetTemplate(null);
      setLoadingTargetTemplate(false);
      setTargetTemplateError('');
      return () => {};
    }

    setTargetTemplate(null);
    setLoadingTargetTemplate(true);
    setTargetTemplateError('');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          api`/api/factions/naps/template-preview?sourceFactionId=${myFactionDetails.id}&targetTag=${encodeURIComponent(tag)}`,
          { credentials: 'include' },
        );
        if (!response.ok) {
          let errorMessage = t`Could not load the target faction template.`;
          try {
            const errorResponse = await response.json();
            errorMessage = errorResponse.error || errorMessage;
          } catch {
            // Keep the template preview error when the response is not JSON.
          }
          throw new Error(errorMessage);
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setTargetTemplate({
          templateUrl: objectUrl,
          canvasId: Number(response.headers.get('X-Template-Canvas-Id')) || 0,
          x: Number(response.headers.get('X-Template-X')) || 0,
          y: Number(response.headers.get('X-Template-Y')) || 0,
          tag: response.headers.get('X-Template-Faction-Tag') || tag,
        });
      } catch (error) {
        if (!cancelled) setTargetTemplateError(error.message);
      } finally {
        if (!cancelled) setLoadingTargetTemplate(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [napTargetTag, showNewNapModal, myFactionDetails?.id]);

  useEffect(() => {
    templateImgRef.current = null;
    if ((!showNewNapModal && !showFullscreenTerritoryModal) || !editorTemplate?.templateUrl) {
      const canvas = lassoCanvasRef.current;
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      return () => {};
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const src = editorTemplate.templateUrl.startsWith('http')
      || editorTemplate.templateUrl.startsWith('/')
      || editorTemplate.templateUrl.startsWith('blob:')
      ? editorTemplate.templateUrl
      : cdn`${editorTemplate.templateUrl}`;
    img.src = src;
    img.onload = () => {
      if (cancelled) return;
      templateImgRef.current = img;
      const canvas = lassoCanvasRef.current;
      if (canvas) {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (showFullscreenTerritoryModal) {
          const targetW = Math.min(window.innerWidth - 100, 1400);
          const targetH = Math.min(window.innerHeight - 260, 850);
          const scale = Math.min(targetW / w, targetH / h);
          w = Math.max(200, Math.round(w * scale));
          h = Math.max(150, Math.round(h * scale));
        } else {
          const maxWidth = Math.min(window.innerWidth - 64, 440);
          const maxHeight = 500;
          const ratio = w / h;
          if (w > maxWidth) {
            w = maxWidth;
            h = Math.round(w / ratio);
          }
          if (h > maxHeight) {
            h = maxHeight;
            w = Math.round(h * ratio);
          }
        }
        canvas.width = Math.max(100, Math.round(w));
        canvas.height = Math.max(100, Math.round(h));
        setCanvasSize({ width: canvas.width, naturalWidth: img.naturalWidth });
        redrawTerritoryCanvas();
      }
    };
    return () => {
      cancelled = true;
    };
  }, [showNewNapModal, showFullscreenTerritoryModal, editorTemplate, redrawTerritoryCanvas]);

  const getCanvasPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(
        canvas.width - 1,
        ((clientX - rect.left) * canvas.width) / rect.width,
      )),
      y: Math.max(0, Math.min(
        canvas.height - 1,
        ((clientY - rect.top) * canvas.height) / rect.height,
      )),
    };
  };

  const handleCanvasMouseDown = (e) => {
    if (e.button === 2) return;
    e.preventDefault();
    const canvas = lassoCanvasRef.current;
    if (!canvas || !templateImgRef.current) return;
    const { x, y } = getCanvasPoint(e, canvas);

    setIsDrawing(true);
    if (selectionTool === 'rect') {
      setDragStartPoint({ x, y });
      setCurrentDragRect({ x1: x, y1: y, x2: x, y2: y });
    } else {
      setDrawPoints([{ x, y }]);
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = lassoCanvasRef.current;
    if (!canvas || !templateImgRef.current) return;
    const { x, y } = getCanvasPoint(e, canvas);

    if (selectionTool === 'rect' && dragStartPoint) {
      setCurrentDragRect({ x1: dragStartPoint.x, y1: dragStartPoint.y, x2: x, y2: y });
    } else if (selectionTool === 'lasso') {
      setDrawPoints((prev) => [...prev, { x, y }]);
    }
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = lassoCanvasRef.current;
    const img = templateImgRef.current;
    if (!canvas || !img) return;

    if (selectionTool === 'rect' && currentDragRect) {
      const minX = Math.min(currentDragRect.x1, currentDragRect.x2);
      const maxX = Math.max(currentDragRect.x1, currentDragRect.x2);
      const minY = Math.min(currentDragRect.y1, currentDragRect.y2);
      const maxY = Math.max(currentDragRect.y1, currentDragRect.y2);
      if (maxX - minX >= 2 && maxY - minY >= 2) {
        const bbox = computeBBoxFromCanvasCoords(minX, maxX, minY, maxY);
        if (bbox) {
          if (activeTerritoryTab === 'target') setTargetBBox(bbox);
          else setMyBBox(bbox);
        }
      }
      setCurrentDragRect(null);
      setDragStartPoint(null);
    } else if (selectionTool === 'lasso' && drawPoints.length >= 2) {
      const minX = Math.min(...drawPoints.map((p) => p.x));
      const maxX = Math.max(...drawPoints.map((p) => p.x));
      const minY = Math.min(...drawPoints.map((p) => p.y));
      const maxY = Math.max(...drawPoints.map((p) => p.y));
      if (maxX - minX >= 2 && maxY - minY >= 2) {
        const bbox = computeBBoxFromCanvasCoords(minX, maxX, minY, maxY);
        if (bbox) {
          if (activeTerritoryTab === 'target') setTargetBBox(bbox);
          else setMyBBox(bbox);
        }
      }
      setDrawPoints([]);
    }
  };

  const handleSelectFullTemplateForCurrentTab = () => {
    const img = templateImgRef.current;
    if (!img || !editorTemplate) return;
    const originX = Number(editorTemplate.x) || 0;
    const originY = Number(editorTemplate.y) || 0;
    const bbox = {
      canvasId: Number(editorTemplate.canvasId) || 0,
      x1: originX,
      y1: originY,
      x2: originX + img.naturalWidth - 1,
      y2: originY + img.naturalHeight - 1,
    };
    if (activeTerritoryTab === 'target') setTargetBBox(bbox);
    else setMyBBox(bbox);
  };

  const handleClearCurrentTab = () => {
    if (activeTerritoryTab === 'target') setTargetBBox(null);
    else setMyBBox(null);
    setCurrentDragRect(null);
    setDrawPoints([]);
  };

  const handleClearBoth = () => {
    setTargetBBox(null);
    setMyBBox(null);
    setCurrentDragRect(null);
    setDrawPoints([]);
  };

  const getCounterBadgeText = () => {
    const totalW = canvasSize.naturalWidth || 800;
    if (isDrawing && currentDragRect && canvasSize.width) {
      const scaleX = totalW / canvasSize.width;
      const curW = Math.round(Math.abs(currentDragRect.x2 - currentDragRect.x1) * scaleX);
      return `${curW}/${totalW}`;
    }
    const currentBBox = activeTerritoryTab === 'target' ? targetBBox : myBBox;
    if (currentBBox) {
      const curW = Math.abs(currentBBox.x2 - currentBBox.x1) + 1;
      return `${curW}/${totalW}`;
    }
    return `0/${totalW}`;
  };

  const handleTemplateUploadSubmit = async (e) => {
    e.preventDefault();
    if (!templateFile) {
      setErrors([t`Please select an image file to upload.`]);
      return;
    }
    setUploadingTemplate(true);
    setErrors([]);
    try {
      const formData = new FormData();
      formData.append('image', templateFile);
      formData.append('canvasId', String(templateCanvasId));
      formData.append('x', String(templateX));
      formData.append('y', String(templateY));

      const response = await fetch(api`/api/factions/template`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.errors?.[0] || t`Template upload failed.`);
      }
      setShowUploadTemplateModal(false);
      setTemplateFile(null);
      await loadTemplate();
      if (myFactionDetails?.id) await loadMyFaction();
    } catch (err) {
      setErrors([err.message]);
    }
    setUploadingTemplate(false);
  };

  const handleNewNapSubmit = async (e) => {
    e.preventDefault();
    const tag = napTargetTag.trim().toUpperCase();
    if (tag.length < 2) {
      setNapModalError(t`Please enter a target faction tag (2-3 characters).`);
      return;
    }
    if (!activeTemplate) {
      setNapModalError(t`Your faction must have an active template.`);
      return;
    }
    setSubmittingNap(true);
    setNapModalError('');
    try {
      const territoryPayload = (targetBBox || myBBox) ? {
        canvasId: Number(targetBBox?.canvasId ?? myBBox?.canvasId ?? activeTemplate.canvasId) || 0,
        targetTerritory: targetBBox || undefined,
        myTerritory: myBBox || undefined,
      } : undefined;

      await requestJson(`/api/factions/${myFactionDetails.id}/naps/request`, {
        method: 'POST',
        body: JSON.stringify({
          otherTag: tag,
          startDate: napStartDate,
          endDate: napEndDate,
          territory: territoryPayload,
        }),
      });
      setShowNewNapModal(false);
      setNapTargetTag('');
      setTargetBBox(null);
      setMyBBox(null);
      setDrawPoints([]);
      setCurrentDragRect(null);
      window.dispatchEvent(new Event('factionnapupdate'));
      await loadNaps();
    } catch (err) {
      setNapModalError(err.message);
    }
    setSubmittingNap(false);
  };

  const handleTogglePrivacy = async () => {
    if (!myFactionDetails?.id) return;
    try {
      await requestJson(`/api/factions/${myFactionDetails.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrivate: !myFactionDetails.isPrivate }),
      });
      await loadMyFaction();
    } catch (err) {
      setErrors([err.message]);
    }
  };

  const handleToggleOpenJoin = async () => {
    if (!myFactionDetails?.id) return;
    try {
      await requestJson(`/api/factions/${myFactionDetails.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ openJoin: !myFactionDetails.openJoin }),
      });
      await loadMyFaction();
    } catch (err) {
      setErrors([err.message]);
    }
  };

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    if (!myFactionDetails?.id) return;
    setSavingDetails(true);
    try {
      await requestJson(`/api/factions/${myFactionDetails.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editTitle.trim(),
          description: editDescription.trim(),
        }),
      });
      setShowEditInfoModal(false);
      await loadMyFaction();
    } catch (err) {
      setErrors([err.message]);
    }
    setSavingDetails(false);
  };

  const updateFactionAppearance = async (field, uploadRefForField, clear = false) => {
    if (!myFactionDetails?.id) return;
    setSubmitting(true);
    setErrors([]);
    try {
      let mediaId = null;
      if (!clear) {
        const [file] = (await uploadRefForField.current?.()) || [];
        if (!file) throw new Error(t`Choose an image and wait for it to upload.`);
        mediaId = file.shortId && file.extension
          ? `${file.shortId}:${file.extension}` : file.mediaId;
        if (!mediaId) throw new Error(t`The image upload did not return a media ID.`);
      }
      await requestJson(`/api/factions/${myFactionDetails.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: mediaId }),
      });
      await loadMyFaction();
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisbandFaction = async (e) => {
    e.preventDefault();
    if (!myFactionDetails?.id) return;
    const currentName = myFactionDetails.name || myFactionDetails.title;
    if (disbandConfirmName.trim() !== currentName) {
      setDisbandError(t`Confirmation name does not match the faction name.`);
      return;
    }
    setDisbanding(true);
    setDisbandError('');
    try {
      await requestJson(`/api/factions/${myFactionDetails.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmName: disbandConfirmName.trim() }),
      });
      setShowDisbandModal(false);
      setMyFactionDetails(null);
      await loadMyFaction();
      changePage('directory')();
    } catch (err) {
      setDisbandError(err.message);
    } finally {
      setDisbanding(false);
    }
  };

  const openMemberPermissionsModal = (member) => {
    setSelectedMember(member);
    setMemberRole(member.role || 'member');
    setMemberPerms(member.permissions || DEFAULT_ROLE_PERMS[member.role] || {});
    setMemberModalError('');
    setShowMemberModal(true);
  };

  const handleRoleChange = (newRole) => {
    setMemberRole(newRole);
    setMemberPerms((prev) => ({
      ...prev,
      ...(DEFAULT_ROLE_PERMS[newRole] || {}),
    }));
  };

  const handleSaveMemberPermissions = async (e) => {
    e.preventDefault();
    if (!selectedMember || !myFactionDetails?.id) return;
    setSavingMemberPerms(true);
    setMemberModalError('');
    try {
      await requestJson('/api/factions/members/permissions', {
        method: 'POST',
        body: JSON.stringify({
          factionId: myFactionDetails.id,
          userId: selectedMember.id,
          role: memberRole,
          permissions: memberPerms,
        }),
      });
      setShowMemberModal(false);
      await loadMembers();
    } catch (err) {
      setMemberModalError(err.message);
    }
    setSavingMemberPerms(false);
  };

  const handleKickMember = async () => {
    if (!selectedMember || !myFactionDetails?.id) return;
    const memberName = selectedMember.name || selectedMember.username;
    if (!window.confirm(t`Are you sure you want to kick ${memberName} from the faction?`)) return;
    setSavingMemberPerms(true);
    try {
      await requestJson(`/api/factions/${myFactionDetails.id}/members/${selectedMember.id}`, {
        method: 'DELETE',
      });
      setShowMemberModal(false);
      await loadMembers();
    } catch (err) {
      setMemberModalError(err.message);
    }
    setSavingMemberPerms(false);
  };

  const handleApplicationDecision = async (application, accepted) => {
    if (applicationActionId !== null || !myFactionDetails?.id) return;
    setApplicationActionId(application.id);
    setErrors([]);
    try {
      await requestJson(
        `/api/factions/applications/${accepted ? 'accept' : 'reject'}`,
        {
          method: 'POST',
          body: JSON.stringify({ applicationId: application.id }),
        },
      );
      await loadApplications();
      if (accepted) await loadMembers();
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setApplicationActionId(null);
    }
  };

  const factionTemplateTitle = useMemo(() => {
    const tag = myFactionDetails?.tag || '';
    return tag ? `[${tag}] Faction Template` : 'Faction Template';
  }, [myFactionDetails?.tag]);

  const isTemplateInstalled = useMemo(() => {
    return (userTemplatesList || []).some((templateItem) => templateItem.title === factionTemplateTitle);
  }, [userTemplatesList, factionTemplateTitle]);

  const handleInstallToMyTemplates = async () => {
    if (!activeTemplate?.templateUrl) return;
    setInstallingTemplate(true);
    setInstallSuccessMessage('');
    try {
      const src = activeTemplate.templateUrl.startsWith('http') || activeTemplate.templateUrl.startsWith('/')
        ? activeTemplate.templateUrl
        : cdn`${activeTemplate.templateUrl}`;
      const response = await fetch(src);
      if (!response.ok) throw new Error(t`Failed to download template image.`);
      const blob = await response.blob();
      const ext = blob.type?.includes('png') ? 'png' : 'webp';
      const file = new File([blob], `faction-template.${ext}`, { type: blob.type || 'image/png' });

      const title = factionTemplateTitle;
      const canvasId = Number(activeTemplate.canvasId) || 0;
      const x = Number(activeTemplate.x) || 0;
      const y = Number(activeTemplate.y) || 0;

      const existing = (userTemplatesList || []).find((templateItem) => templateItem.title === title);
      if (existing) {
        if (existing.imageId) {
          await templateLoader.updateFile(existing.imageId, file);
        }
        templateLoader.changeTemplate(title, {
          title,
          canvasId,
          x,
          y,
          enabled: true,
        });
      } else {
        await templateLoader.addFile(file, title, canvasId, x, y);
      }

      if (!ovEnabled) {
        dispatch(toggleOVEnabled());
      }
      setInstallSuccessMessage(`✓ ${t`Installed to your templates!`}`);
      setTimeout(() => setInstallSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Install template error:', err);
      setErrors([`${t`Failed to install template`}: ${err.message}`]);
    }
    setInstallingTemplate(false);
  };

  const changePage = useCallback((newPage) => () => {
    setSubmitting(false);
    setErrors([]);
    setPage(newPage);
  }, []);

  const showFactionStats = useCallback(() => {
    dispatch(fetchStats());
    setPage('stats');
  }, [dispatch]);

  const handleCopyTag = useCallback(async () => {
    const tag = myFactionDetails?.tag;
    if (!tag) return;
    try {
      await navigator.clipboard.writeText(`[${tag}]`);
    } catch {
      const field = document.createElement('textarea');
      field.value = `[${tag}]`;
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopiedTag(true);
    setTimeout(() => setCopiedTag(false), 1500);
  }, [myFactionDetails]);

  const handleLeaveFaction = useCallback(async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      setTimeout(() => setConfirmLeave(false), 6000);
      return;
    }
    setSubmitting(true);
    setErrors([]);
    try {
      if (myFactionDetails?.id) {
        await requestJson('/api/factions/leave', {
          method: 'POST',
          body: JSON.stringify({ factionId: myFactionDetails.id }),
        });
      }
      if (myFactionDetails?.name) {
        await requestLeaveFaction(myFactionDetails.name);
      }
      setMyFactionDetails(null);
      setConfirmLeave(false);
      dispatch(changeProfile({ activeFactionRole: null }));
      await loadMyFaction();
    } catch (err) {
      setErrors([err.message]);
    }
    setSubmitting(false);
  }, [confirmLeave, myFactionDetails, dispatch, loadMyFaction]);

  const submitCreateFaction = useCallback(async (evt) => {
    evt.preventDefault();
    if (submitting) return;

    const name = evt.target.name.value.trim();
    const tag = evt.target.tag.value.trim().toUpperCase();
    const title = evt.target.title.value.trim();
    const description = evt.target.description.value.trim();
    const isPrivate = evt.target.isprivate.checked;
    const isPublic = evt.target.ispublic.checked;

    const valErrors = [];
    let error = validateFactionName(name);
    if (error) valErrors.push(error);
    error = validateFactionTag(tag);
    if (error) valErrors.push(error);
    error = validateFactionTitle(title);
    if (error) valErrors.push(error);
    error = validateDescription(description);
    if (error) valErrors.push(error);
    if (valErrors.length) {
      setErrors(valErrors);
      return;
    }

    setSubmitting(true);
    try {
      const [avatarFiles, bannerFiles] = await Promise.all([
        uploadRef.current?.() || [],
        bannerUploadRef.current?.() || [],
      ]);
      if (avatarFiles.length !== 1 || bannerFiles.length !== 1) {
        setErrors([t`You must select both an avatar and a banner for your faction`]);
        return;
      }

      const getMediaId = ({ mediaId, shortId, extension }) => (
        shortId && extension ? `${shortId}:${extension}` : mediaId
      );
      const avatarId = getMediaId(avatarFiles[0]);
      const bannerId = getMediaId(bannerFiles[0]);
      if (!avatarId || !bannerId) {
        setErrors([t`Your faction avatar and banner must finish uploading first`]);
        return;
      }

      const { errors: respErrors, patches } = await requestCreateFaction(
        name, tag, title, description, isPrivate, isPublic, avatarId, bannerId,
      );
      if (patches) {
        dispatch(applyPatches(patches));
      }
      if (respErrors) {
        setErrors(respErrors);
      } else {
        setErrors([]);
        setPage('list');
        setSubTab('home');
        await loadMyFaction();
      }
    } catch (requestError) {
      setErrors([requestError.message]);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, dispatch, loadMyFaction]);

  const factionTabs = (
    <nav className="faction-tabs" aria-label={t`Faction sections`}>
      <button
        type="button"
        className={page === 'list' || page === 'create' ? 'active' : ''}
        onClick={changePage('list')}
      >
        {t`My Faction`}
      </button>
      <button
        type="button"
        className={page === 'directory' ? 'active' : ''}
        onClick={changePage('directory')}
      >
        {t`Faction List`}
      </button>
      <button
        type="button"
        className={page === 'stats' ? 'active' : ''}
        onClick={showFactionStats}
      >
        {t`Faction Statistics`}
      </button>
    </nav>
  );

  if (showNapReview && canReviewNaps && napsEnabled) {
    return (
      <div className="content userarea faction-userarea">
        <button type="button" onClick={() => setShowNapReview(false)}>{t`Back`}</button>
        <FactionSystemTab tab="napReview" />
      </div>
    );
  }

  if (!fetched) {
    return (<div className="content" key="loading"><h3>{t`Loading...`}</h3></div>);
  }

  if (page === 'directory') {
    return (
      <div className="content userarea faction-userarea" key="directory">
        <h2 className="faction-header-title">{t`Factions`}</h2>
        {factionTabs}
        <FactionBrowser />
      </div>
    );
  }

  if (page === 'stats') {
    return (
      <div className="content userarea faction-userarea" key="stats">
        <h2 className="faction-header-title">{t`Factions`}</h2>
        {factionTabs}
        <div className="faction-stats">
          <h3>{t`Top Factions by Total Pixels`}</h3>
          <Table
            rows={factionRanking.rows}
            columnIds={factionRanking.columnIds}
            types={factionRanking.types}
            uniqueColumnKey={factionRanking.uniqueColumnKey}
            sortColumnKey={0}
          />
        </div>
      </div>
    );
  }

  if (page === 'create') {
    return (
      <div className="content userarea faction-userarea" key="create">
        <h2 className="faction-header-title">{t`Create Faction`}</h2>
        {factionTabs}
        <p className="faction-requirement">
          {t`Creating a faction requires at least 50,000 placed pixels.`}
          {` ${totalPixels.toLocaleString()} / 50,000`}
        </p>
        <form onSubmit={submitCreateFaction} className="client-form">
          <div className="form-group">
            <label>{t`Name`}:
              <input
                type="text"
                name="name"
                placeholder={t`name`}
                required
              /></label>
            <small>{t`Name of your faction (this can not be changed later)`} [a-z][A-Z][0-9].-_</small>
          </div>

          <div className="form-group">
            <label>{t`Tag`}:
              <input
                type="text"
                name="tag"
                placeholder={t`TAG (e.g. PXF)`}
                maxLength={3}
                required
              /></label>
            <small>{t`Tag of your faction (2-3 uppercase latin letters or numbers, e.g. PXF)`}</small>
          </div>

          <div className="form-group form-group-avatar">
            <span>{t`Avatar`}:
              <FileUpload
                acceptedTypes="image/*"
                keepFiles
                maxFiles={1}
                uploadRef={uploadRef}
                preflightRoute="avatarpreflight"
                uploadRoute="avatarupload"
                size={60}
              /></span>
            <small>{t`An image representing your faction (automatically fitted)`}</small>
          </div>

          <div className="form-group form-group-avatar">
            <span>{t`Banner`}:
              <FileUpload
                acceptedTypes="image/*"
                keepFiles
                maxFiles={1}
                uploadRef={bannerUploadRef}
                preflightRoute="preflight"
                uploadRoute="upload"
                size={60}
              /></span>
            <small>{t`A wide image displayed on your faction home and in chat`}</small>
          </div>

          <div className="form-group">
            <label htmlFor="title">{t`Title`}:
              <input
                type="text"
                name="title"
                placeholder={t`title`}
                required
              /></label>
            <small>{t`Title of your faction`}</small>
          </div>

          <div className="form-group">
            <label>{t`Description`}:
              <textarea
                name="description"
                placeholder={t`Enter a little text that describes your faction`}
                rows="3"
                required
              /></label>
            <small>{t`Description of your faction`}</small>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="isprivate"
                defaultChecked={false}
              />
              <span className="checkmark" />
              {t`Don't show faction in search`}
            </label>
            <small>{t`Don't let people find this faction in public search or look at its profile.`}</small>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="ispublic"
                defaultChecked={false}
              />
              <span className="checkmark" />
              {t`Let everyone join this faction`}
            </label>
            <small>{t`Let people join this faction without needing an invite.`}</small>
          </div>

          {errors.map((error) => (
            <p key={error} className="errormessage">
              <span>{t`Error`}</span>:&nbsp;{error}</p>
          ))}
          <div className="form-actions">
            <button
              type="submit"
              disabled={submitting || !canCreateFaction}
            >
              {t`Submit`}
            </button>
            <button
              type="button"
              onClick={changePage('list')}
            >
              {t`Cancel`}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Page is 'list' ("My Faction")
  const avatarUrl = resolveAvatarUrl(myFactionDetails?.avatarId || myFactionDetails?.flag || myFactionDetails?.flagUrl);
  const bannerUrl = resolveAvatarUrl(myFactionDetails?.bannerId);
  const factionTag = myFactionDetails?.tag || '';
  const factionTitle = myFactionDetails?.name || myFactionDetails?.title || '';
  const factionId = myFactionDetails?.id || '';
  const totalPixelsCount = myFactionDetails?.totalPixels || 0;
  const todayPixelsCount = myFactionDetails?.todayPixels || 0;
  const memberCount = myFactionDetails?.memberCount || 1;
  const createdDate = myFactionDetails?.createdAt;
  const descriptionText = myFactionDetails?.description || '';
  const isOwner = myFactionDetails?.role === 'owner' || myFactionDetails?.ownerId === currentUserId;
  const canManageAppearance = isOwner
    || !!myFactionDetails?.permissions?.manageFactionAppearance;
  const canManageTemplates = isOwner || !!myFactionDetails?.permissions?.manageTemplates;
  const canManageNaps = isOwner || !!myFactionDetails?.permissions?.manageNaps;
  const canManageConfigs = isOwner || !!myFactionDetails?.permissions?.manageConfigs;
  const canManageRanks = isOwner || !!myFactionDetails?.permissions?.manageRanks;
  const canManageApplications = isOwner
    || !!myFactionDetails?.permissions?.manageApplications;
  const canManageMembers = isOwner || !!myFactionDetails?.permissions?.manageMembers;

  return (
    <div className="content userarea faction-userarea" key="list">
      <h2 className="faction-header-title">{t`Factions`}</h2>
      {factionTabs}
      {canReviewNaps && napsEnabled && (
        <button type="button" onClick={() => setShowNapReview(true)}>{t`Review NAP proposals`}</button>
      )}

      {errors.map((error) => (
        <p key={error} className="errormessage">
          <span>{t`Error`}</span>:&nbsp;{error}
        </p>
      ))}

      {myFactionDetails ? (
        <div className="my-faction-container">
          <nav className="faction-subtabs">
            <button
              type="button"
              className={subTab === 'home' ? 'active' : ''}
              onClick={() => setSubTab('home')}
            >
              {t`Home`}
            </button>
            <button
              type="button"
              className={subTab === 'members' ? 'active' : ''}
              onClick={() => setSubTab('members')}
            >
              {t`Members`}
            </button>
            {canManageApplications && (
              <button
                type="button"
                className={subTab === 'notifications' ? 'active' : ''}
                onClick={() => setSubTab('notifications')}
              >
                {t`Notifications`}
                {applicationsList.length > 0
                  ? ` (${applicationsList.length})` : ''}
              </button>
            )}
            <button
              type="button"
              className={subTab === 'stats' ? 'active' : ''}
              onClick={() => setSubTab('stats')}
            >
              {t`Stats`}
            </button>
            <button
              type="button"
              className={subTab === 'templates' ? 'active' : ''}
              onClick={() => setSubTab('templates')}
            >
              {t`Templates`}
            </button>
            {(isOwner || canManageConfigs || canManageTemplates || canManageNaps) && (
              <button
                type="button"
                className={subTab === 'config' ? 'active' : ''}
                onClick={() => setSubTab('config')}
              >
                {t`Config`}
              </button>
            )}
            <button
              type="button"
              className={subTab === 'naps' ? 'active' : ''}
              onClick={() => setSubTab('naps')}
            >
              {t`NAPs`} {!napsEnabled && <span className="faction-badge faction-badge-soon">{t`SOON`}</span>}
            </button>
            {warsEnabled && (
              <>
                <button
                  type="button"
                  className={subTab === 'diplomacy' ? 'active' : ''}
                  onClick={() => setSubTab('diplomacy')}
                >
                  {t`Wars & Treaties`}
                </button>
                <button
                  type="button"
                  className={subTab === 'alliances' ? 'active' : ''}
                  onClick={() => setSubTab('alliances')}
                >
                  {t`Alliances`}
                </button>
              </>
            )}
          </nav>

          {subTab === 'diplomacy' && (
            <FactionSystemTab faction={myFactionDetails} tab="diplomacy" />
          )}
          {subTab === 'alliances' && (
            <FactionSystemTab faction={myFactionDetails} tab="alliances" />
          )}

          {subTab === 'home' && (
            <div className="faction-home-card faction-home-profile-card">
              <div
                className="faction-home-card-banner"
                style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : undefined}
              >
                {canManageAppearance && (
                  <div className="faction-home-media-editor faction-home-banner-editor">
                    <span>{t`Change banner`}</span>
                    <FileUpload
                      acceptedTypes="image/*"
                      keepFiles
                      maxFiles={1}
                      uploadRef={factionBannerEditRef}
                      preflightRoute="preflight"
                      uploadRoute="upload"
                      size={36}
                    />
                    <button
                      type="button"
                      className="faction-btn primary"
                      disabled={submitting}
                      onClick={() => updateFactionAppearance('bannerId', factionBannerEditRef)}
                    >{t`Save`}</button>
                    {myFactionDetails?.bannerId && (
                      <button
                        type="button"
                        className="faction-btn"
                        disabled={submitting}
                        onClick={() => updateFactionAppearance('bannerId', factionBannerEditRef, true)}
                      >{t`Remove`}</button>
                    )}
                  </div>
                )}
              </div>
              <div className="faction-home-avatar-wrap">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    className="faction-home-avatar"
                    alt=""
                  />
                ) : (
                  <div className="faction-home-avatar faction-home-avatar-placeholder">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm0 2.3L6 8.7v6.6l6 3.4 6-3.4V8.7l-6-3.4Z" />
                    </svg>
                  </div>
                )}
                {canManageAppearance && (
                  <div className="faction-home-media-editor faction-home-avatar-editor">
                    <span>{t`Change avatar`}</span>
                    <FileUpload
                      acceptedTypes="image/*"
                      keepFiles
                      maxFiles={1}
                      uploadRef={factionAvatarEditRef}
                      preflightRoute="preflight"
                      uploadRoute="upload"
                      size={36}
                    />
                    <button
                      type="button"
                      className="faction-btn primary"
                      disabled={submitting}
                      onClick={() => updateFactionAppearance('avatarId', factionAvatarEditRef)}
                    >{t`Save`}</button>
                    {myFactionDetails?.avatarId && (
                      <button
                        type="button"
                        className="faction-btn"
                        disabled={submitting}
                        onClick={() => updateFactionAppearance('avatarId', factionAvatarEditRef, true)}
                      >{t`Remove`}</button>
                    )}
                  </div>
                )}
              </div>

              <div className="faction-home-info">
                <div className="faction-home-title">
                  <span>[{factionTag}] {factionTitle} #{factionId}</span>
                  <button
                    type="button"
                    className="faction-icon-btn"
                    title={t`Copy faction tag`}
                    onClick={handleCopyTag}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                      <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                    </svg>
                  </button>
                  {copiedTag && <span className="faction-copied-hint">{t`Copied!`}</span>}
                </div>

                <div className="faction-home-stat">{t`Pixels`}: {formatPixels(totalPixelsCount)}</div>
                <div className="faction-home-stat">{t`Today placed pixels`}: {formatPixels(todayPixelsCount)}</div>
                <div className="faction-home-stat">{t`Members`}: {memberCount}</div>
                <div className="faction-home-stat">{t`Created date`}: {formatFactionDate(createdDate)}</div>
                <div className="faction-home-desc">{descriptionText}</div>
              </div>

              <button
                type="button"
                className={`faction-leave-btn${confirmLeave ? ' confirm' : ''}`}
                onClick={handleLeaveFaction}
                disabled={submitting}
              >
                {confirmLeave ? t`Confirm` : t`Leave`}
              </button>
            </div>
          )}

          {subTab === 'members' && (
            <div className="faction-subpanel">
              {memberStatsError && (
                <p className="errormessage" role="alert">
                  {t`Member pixel statistics could not be loaded:`} {memberStatsError}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>{t`Members`} ({membersList.length || memberCount})</h3>
                {canManageRanks && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--caption-txt-color, #6b7280)' }}>
                    {t`Click a member to manage role & permissions`}
                  </span>
                )}
              </div>
              {membersList.length > 0 ? (
                <table className="faction-subpanel-table">
                  <thead>
                    <tr>
                      <th>{t`Member`}</th>
                      <th>{t`Role`}</th>
                      <th>{t`Total Pixels`}</th>
                      <th>{t`Today`}</th>
                      {canManageRanks && <th>{t`Action`}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {membersList.map((member) => {
                      const memberAvatar = resolveAvatarUrl(member.avatar);
                      const isOwnerRole = member.role === 'owner';
                      const canEditThisMember = canManageRanks && !isOwnerRole;
                      return (
                        <tr
                          key={member.id}
                        >
                          <td>
                            <div className="faction-member-row">
                              {memberAvatar ? (
                                <img src={memberAvatar} className="faction-member-avatar" alt="" />
                              ) : (
                                <div className="faction-member-avatar faction-home-avatar-placeholder" />
                              )}
                              {canEditThisMember ? (
                                <button
                                  type="button"
                                  className="faction-member-name-button"
                                  onClick={() => openMemberPermissionsModal(member)}
                                  title={t`Manage this member's role and permissions`}
                                >
                                  {member.name || member.username}
                                </button>
                              ) : (
                                <span>{member.name || member.username}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`faction-role-pill ${member.role || 'member'}`}>
                              {ROLE_NAMES[member.role] || member.role}
                            </span>
                          </td>
                          <td>{member.total === undefined ? '—' : formatPixels(member.total)}</td>
                          <td>{member.today === undefined ? '—' : formatPixels(member.today)}</td>
                          {canManageRanks && (
                            <td>
                              {canEditThisMember ? (
                                <button
                                  type="button"
                                  className="faction-btn sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMemberPermissionsModal(member);
                                  }}
                                >
                                  {t`Manage`}
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="faction-empty">{t`Loading...`}</p>
              )}
            </div>
          )}

          {subTab === 'notifications' && canManageApplications && (
            <div className="faction-subpanel">
              <h3>{t`Join Applications`}</h3>
              {loadingApplications ? (
                <p className="faction-empty">{t`Loading...`}</p>
              ) : applicationsList.length ? (
                <div className="faction-applications-list">
                  {applicationsList.map((application) => (
                    <article
                      className="faction-application"
                      key={application.id}
                    >
                      <div>
                        <strong>
                          {application.name || application.username}
                        </strong>
                        <small>
                          {formatFactionDate(application.createdAt)}
                        </small>
                        {application.message && <p>{application.message}</p>}
                      </div>
                      <div className="faction-application-actions">
                        <button
                          type="button"
                          className="faction-btn primary"
                          disabled={applicationActionId !== null}
                          onClick={() => handleApplicationDecision(
                            application, true,
                          )}
                        >
                          {applicationActionId === application.id
                            ? t`Processing...` : t`Accept`}
                        </button>
                        <button
                          type="button"
                          className="faction-btn danger"
                          disabled={applicationActionId !== null}
                          onClick={() => handleApplicationDecision(
                            application, false,
                          )}
                        >
                          {t`Reject`}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="faction-empty">
                  {t`There are no pending join applications.`}
                </p>
              )}
            </div>
          )}

          {subTab === 'stats' && (
            <div className="faction-subpanel">
              <h3>{t`Faction Statistics`}</h3>
              {bannerUrl && (
                <img
                  className="faction-stats-banner"
                  src={bannerUrl}
                  alt={t`${factionTitle} banner`}
                />
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
                <div className="faction-nap-warning" style={{ textAlign: 'center' }}>
                  <h4>{t`Total Pixels`}</h4>
                  <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{totalPixelsCount.toLocaleString()}</p>
                </div>
                <div className="faction-nap-warning" style={{ textAlign: 'center' }}>
                  <h4>{t`Pixels Today`}</h4>
                  <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{todayPixelsCount.toLocaleString()}</p>
                </div>
                <div className="faction-nap-warning" style={{ textAlign: 'center' }}>
                  <h4>{t`Members`}</h4>
                  <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{memberCount}</p>
                </div>
              </div>
            </div>
          )}

          {subTab === 'templates' && (
            <div className="faction-subpanel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>{t`Faction Templates`}</h3>
                {canManageTemplates && (
                  <button
                    type="button"
                    className="faction-btn primary"
                    onClick={() => {
                      setTemplateX(activeTemplate?.x || 0);
                      setTemplateY(activeTemplate?.y || 0);
                      setTemplateCanvasId(activeTemplate?.canvasId || 0);
                      setShowUploadTemplateModal(true);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
                    </svg>
                    {t`Set Template`}
                  </button>
                )}
              </div>
              {activeTemplate ? (
                <div className="faction-home-card" style={{ marginTop: '12px', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <p>
                    <strong>{t`Active Template`}:</strong> {t`Canvas`} {activeTemplate.canvasId}, X: {activeTemplate.x}, Y: {activeTemplate.y}
                  </p>
                  {activeTemplate.templateUrl && (
                    <img
                      src={cdn`${activeTemplate.templateUrl}`}
                      alt={t`Template`}
                      style={{ maxWidth: '300px', maxHeight: '200px', objectFit: 'contain', margin: '10px 0', borderRadius: '8px', border: '1px solid #eee' }}
                    />
                  )}

                  <div style={{ margin: '14px 0 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      className="faction-btn primary"
                      style={{ padding: '8px 22px', fontSize: '0.95rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                      disabled={installingTemplate}
                      onClick={handleInstallToMyTemplates}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                      </svg>
                      {installingTemplate
                        ? t`Installing...`
                        : isTemplateInstalled
                          ? t`Update in My Templates`
                          : t`Install to My Templates`}
                    </button>
                    {installSuccessMessage && (
                      <span style={{ color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>
                        {installSuccessMessage}
                      </span>
                    )}
                    <small style={{ color: 'var(--caption-txt-color, #6b7280)', fontSize: '0.8rem' }}>
                      {t`Adds this template to your personal game overlay`} ({t`Canvas`} {activeTemplate.canvasId}, X: {activeTemplate.x}, Y: {activeTemplate.y})
                    </small>
                  </div>

                  {canManageTemplates && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button
                        type="button"
                        className="faction-btn"
                        onClick={() => {
                          setTemplateX(activeTemplate?.x || 0);
                          setTemplateY(activeTemplate?.y || 0);
                          setTemplateCanvasId(activeTemplate?.canvasId || 0);
                          setShowUploadTemplateModal(true);
                        }}
                      >
                        {t`Change Template`}
                      </button>
                      <button
                        type="button"
                        className="faction-leave-btn confirm"
                        onClick={async () => {
                          try {
                            await requestJson(`/api/factions/${myFactionDetails.id}/template`, { method: 'DELETE' });
                            loadTemplate();
                          } catch (err) {
                            setErrors([err.message]);
                          }
                        }}
                      >
                        {t`Remove Template`}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                  <p className="faction-empty" style={{ margin: '0 0 16px' }}>{t`No active template for this faction.`}</p>
                  {canManageTemplates && (
                    <button
                      type="button"
                      className="faction-btn primary"
                      onClick={() => {
                        setTemplateX(0);
                        setTemplateY(0);
                        setTemplateCanvasId(0);
                        setShowUploadTemplateModal(true);
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
                      </svg>
                      {t`Set Template`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {subTab === 'config' && (
            <div className="faction-subpanel">
              <h3>{t`Faction Settings & Actions`}</h3>
              <div className="faction-config-grid">
                <div className="faction-config-card">
                  <div className="faction-config-info">
                    <strong>{t`Template Management`}</strong>
                    <p>{t`Upload a new image template to establish your faction canvas territory.`}</p>
                    <span className="faction-badge">
                      {activeTemplate ? `${t`Active`}: ${t`Canvas`} ${activeTemplate.canvasId} (${activeTemplate.x}, ${activeTemplate.y})` : t`No active template`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="faction-btn primary"
                    disabled={!canManageTemplates}
                    title={!canManageTemplates ? t`Only owner or members with template permissions can upload` : undefined}
                    onClick={() => {
                      setTemplateX(activeTemplate?.x || 0);
                      setTemplateY(activeTemplate?.y || 0);
                      setTemplateCanvasId(activeTemplate?.canvasId || 0);
                      setShowUploadTemplateModal(true);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" /></svg>
                    {t`Upload Template`}
                  </button>
                </div>

                <div className="faction-config-card">
                  <div className="faction-config-info">
                    <strong>{t`Non-Aggression Pact (NAP)`}</strong>
                    <p>{napsEnabled
                      ? t`Propose a non-aggression pact with another faction protecting defined territories.`
                      : t`This feature will be available soon.`}</p>
                    <span className="faction-badge">
                      <span className={!napsEnabled ? 'faction-badge-soon' : undefined}>
                        {napsEnabled ? `${napsList.filter((n) => n.status === 'active').length} ${t`Active NAPs`}` : t`SOON`}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="faction-btn primary"
                    disabled={!napsEnabled || !canManageNaps || !activeTemplate}
                    title={!napsEnabled ? t`NAP feature is coming soon.` : (!activeTemplate ? t`Your faction must have an active template to propose NAPs` : undefined)}
                    onClick={openNewNapModal}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 11.2h-2.2V9c0-1.7-1.3-3-3-3H7c-1.7 0-3 1.3-3 3v6c0 1.7 1.3 3 3 3h2v2c0 1.7 1.3 3 3 3h6c1.7 0 3-1.3 3-3v-6c0-1.7-1.3-2.8-3-2.8z" /></svg>
                    {napsEnabled ? t`New NAP` : t`SOON`}
                  </button>
                </div>

                <div className="faction-config-card">
                  <div className="faction-config-info">
                    <strong>{t`Search Privacy`}</strong>
                    <p>{t`Control whether your faction appears in public search and list.`}</p>
                    <span className="faction-badge">
                      {myFactionDetails?.isPrivate ? t`Hidden from search` : t`Visible in search`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="faction-btn"
                    disabled={!canManageConfigs}
                    onClick={handleTogglePrivacy}
                  >
                    {myFactionDetails?.isPrivate ? t`Make Public` : t`Make Hidden`}
                  </button>
                </div>

                <div className="faction-config-card">
                  <div className="faction-config-info">
                    <strong>{t`Membership Access`}</strong>
                    <p>{t`Allow anyone to join freely or require invitations/applications.`}</p>
                    <span className="faction-badge">
                      {myFactionDetails?.openJoin ? t`Anyone can join` : t`Invite only`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="faction-btn"
                    disabled={!canManageConfigs}
                    onClick={handleToggleOpenJoin}
                  >
                    {myFactionDetails?.openJoin ? t`Set to Invite Only` : t`Allow Open Join`}
                  </button>
                </div>

                <div className="faction-config-card">
                  <div className="faction-config-info">
                    <strong>{t`Faction Details`}</strong>
                    <p>{t`Tag`}: [{factionTag}] | {t`Name`}: {factionTitle}</p>
                    <p className="faction-desc-preview">{descriptionText || t`No description provided.`}</p>
                  </div>
                  <button
                    type="button"
                    className="faction-btn"
                    disabled={!canManageConfigs}
                    onClick={() => {
                      setEditTitle(factionTitle);
                      setEditDescription(descriptionText);
                      setShowEditInfoModal(true);
                    }}
                  >
                    {t`Edit Details`}
                  </button>
                </div>

                {isOwner && (
                  <div className="faction-config-card" style={{ borderColor: 'rgba(239, 68, 68, 0.45)', background: 'rgba(239, 68, 68, 0.04)' }}>
                    <div className="faction-config-info">
                      <strong style={{ color: '#dc2626' }}>{t`Disband Faction`}</strong>
                      <p>{t`Permanently delete your faction, channels, templates, and pacts. This action cannot be undone.`}</p>
                      <span className="faction-badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                        {t`Owner Only`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="faction-btn danger"
                      onClick={() => {
                        setDisbandConfirmName('');
                        setDisbandError('');
                        setShowDisbandModal(true);
                      }}
                    >
                      {t`Delete Faction`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {subTab === 'naps' && (
            <div className="faction-subpanel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>{t`Non-Aggression Pacts (NAPs)`}</h3>
                {canManageNaps && (
                  <button
                    type="button"
                    className="faction-btn primary"
                    disabled={!napsEnabled || !activeTemplate}
                    title={!napsEnabled ? t`NAP feature is coming soon.` : (!activeTemplate ? t`Your faction must have an active template to propose NAPs` : undefined)}
                    onClick={openNewNapModal}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                    {napsEnabled ? t`New NAP Proposal` : t`SOON`}
                  </button>
                )}
              </div>

              {!napsEnabled ? (
                <div className="faction-nap-warning" role="status" style={{ textAlign: 'center', padding: '24px' }}>
                  <strong className="faction-badge faction-badge-soon">{t`SOON`}</strong>
                  <p>{t`NAP functionality is temporarily unavailable and will be added soon.`}</p>
                </div>
              ) : napsList.length > 0 ? (
                <div style={{ display: 'grid', gap: '14px', marginTop: '12px' }}>
                  {napsList.map((nap) => {
                    const isPending = nap.status === 'pending';
                    const isIncoming = Boolean(nap.incoming);
                    const isOutgoing = isPending && !isIncoming;
                    const myBreakApproval = nap.incoming
                      ? nap.breakBApproved : nap.breakAApproved;
                    const otherBreakApproval = nap.incoming
                      ? nap.breakAApproved : nap.breakBApproved;
                    const otherAvatar = resolveAvatarUrl(nap.otherFaction?.flagUrl);

                    return (
                      <div
                        key={nap.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          padding: '16px',
                          background: 'var(--control-bg, #f9fafb)',
                          border: '1px solid var(--border-seperator-color, #e5e7eb)',
                          borderRadius: '12px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                        }}
                      >
                        {/* Header: Faction details & Status Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {otherAvatar ? (
                              <img
                                src={otherAvatar}
                                alt=""
                                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #d1d5db' }}
                              />
                            ) : (
                              <div
                                className="faction-home-avatar-placeholder"
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: '#3b82f6',
                                  color: '#fff',
                                  fontWeight: 'bold',
                                  fontSize: '0.85rem',
                                }}
                              >
                                {nap.otherFaction?.tag || 'NAP'}
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--control-txt-color, #111827)' }}>
                                [{nap.otherFaction?.tag}] {nap.otherFaction?.name}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--caption-txt-color, #6b7280)' }}>
                                {t`Faction ID`}: #{nap.otherFaction?.id}
                              </div>
                            </div>
                          </div>

                          <div>
                            {nap.status === 'active' && (
                              <div style={{ display: 'grid', justifyItems: 'end', gap: '5px' }}>
                                <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ✓ {t`Active NAP`}
                                </span>
                                {(myBreakApproval || otherBreakApproval) && (
                                  <small>
                                    {t`Termination approvals`}: {t`your faction`} {myBreakApproval ? '✓' : '—'} / {t`other faction`} {otherBreakApproval ? '✓' : '—'}
                                  </small>
                                )}
                              </div>
                            )}
                            {isIncoming && isPending && (
                              <span style={{ background: '#fef3c7', color: '#b45309', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                ⏳ {t`Awaiting moderator review`}
                              </span>
                            )}
                            {isOutgoing && (
                              <span style={{ background: '#e0e7ff', color: '#4338ca', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                📤 {t`Awaiting moderator review`}
                              </span>
                            )}
                            {nap.status === 'rejected' && (
                              <span style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', fontSize: '0.8rem' }}>
                                ✕ {t`Denied`}
                              </span>
                            )}
                            {nap.status === 'broken' && (
                              <span style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', fontSize: '0.8rem' }}>
                                {t`Terminated`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle Info: Dates and Territory */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                            gap: '12px',
                            padding: '12px 14px',
                            background: 'var(--window-bg, #ffffff)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-seperator-color, #f3f4f6)',
                            fontSize: '0.85rem',
                          }}
                        >
                          <div>
                            <span style={{ color: 'var(--caption-txt-color, #6b7280)', display: 'block', fontSize: '0.78rem', marginBottom: '2px' }}>
                              {t`Validity Period`}
                            </span>
                            <strong>
                              {nap.startDate ? `${formatDateOnly(nap.startDate)} — ${formatDateOnly(nap.endDate)}` : t`Indefinite duration`}
                            </strong>
                          </div>

                          <div>
                            <span style={{ color: 'var(--caption-txt-color, #6b7280)', display: 'block', fontSize: '0.78rem', marginBottom: '2px' }}>
                              {t`Protected Territory`}
                            </span>
                            {nap.territory ? (
                              <strong style={{ color: '#2563eb' }}>
                                {[nap.territory.myTerritory, nap.territory.targetTerritory].filter(Boolean)
                                  .map((area) => `#${area.canvasId} [${area.x1}, ${area.y1}]–[${area.x2}, ${area.y2}]`).join(' / ')
                                  || `#${nap.territory.canvasId} [${nap.territory.x1}, ${nap.territory.y1}]–[${nap.territory.x2}, ${nap.territory.y2}]`}
                              </strong>
                            ) : (
                              <span style={{ color: 'var(--caption-txt-color, #6b7280)' }}>
                                {t`Full active template territory`}
                              </span>
                            )}
                          </div>

                          <div>
                            <span style={{ color: 'var(--caption-txt-color, #6b7280)', display: 'block', fontSize: '0.78rem', marginBottom: '2px' }}>
                              {t`Date Created`}
                            </span>
                            <span>{formatFactionDate(nap.createdAt)}</span>
                          </div>
                        </div>

                        {/* Bottom Actions: Accept | Denied */}
                        {canManageNaps && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {isOutgoing && (
                              <button
                                type="button"
                                className="faction-btn danger sm"
                                onClick={async () => {
                                  if (!window.confirm(t`Cancel this pending NAP proposal?`)) return;
                                  try {
                                    await requestJson(`/api/factions/${myFactionDetails.id}/naps/${nap.id}`, {
                                      method: 'DELETE',
                                    });
                                    loadNaps();
                                  } catch (err) {
                                    setErrors([err.message]);
                                  }
                                }}
                              >
                                {t`Cancel Proposal`}
                              </button>
                            )}

                            {nap.status === 'active' && (
                              <button
                                type="button"
                                className="faction-btn danger sm"
                                disabled={myBreakApproval}
                                onClick={async () => {
                                  const message = otherBreakApproval
                                    ? `The other faction has approved ending the NAP with [${nap.otherFaction?.tag}]. Approve termination?`
                                    : `Request termination of the NAP with [${nap.otherFaction?.tag}]? The other faction must also approve.`;
                                  if (!window.confirm(message)) return;
                                  try {
                                    await requestJson(`/api/factions/${myFactionDetails.id}/naps/${nap.id}`, {
                                      method: 'DELETE',
                                    });
                                    loadNaps();
                                  } catch (err) {
                                    setErrors([err.message]);
                                  }
                                }}
                              >
                                {myBreakApproval
                                  ? t`Awaiting Other Faction`
                                  : otherBreakApproval ? t`Approve Termination` : t`Request Termination`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '28px 12px' }}>
                  <p className="faction-empty" style={{ margin: '0 0 16px' }}>
                    {t`No active or incoming non-aggression pacts.`}
                  </p>
                  {canManageNaps && (
                    <button
                      type="button"
                      className="faction-btn primary"
                      disabled={!activeTemplate}
                      title={!activeTemplate ? 'Your faction must have an active template to propose NAPs' : undefined}
                      onClick={openNewNapModal}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                      </svg>
                      {t`Propose New NAP`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {showUploadTemplateModal && (
            <div className="faction-modal-overlay" onClick={() => setShowUploadTemplateModal(false)}>
              <div className="faction-modal-window" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="faction-modal-close" onClick={() => setShowUploadTemplateModal(false)}>✕</button>
                <h3>{t`Upload Faction Template`}</h3>
                <form onSubmit={handleTemplateUploadSubmit}>
                  <div className="faction-modal-field">
                    <label>{t`Template Image (.png, .webp, .jpeg)`}</label>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      required
                      onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <div className="faction-modal-field">
                    <label>{t`Target Canvas`}</label>
                    <select value={templateCanvasId} onChange={(e) => setTemplateCanvasId(Number(e.target.value))}>
                      <option value={0}>{t`Canvas 0 (Earth)`}</option>
                      <option value={1}>{t`Canvas 1 (Moon)`}</option>
                      <option value={2}>{t`Canvas 2 (135M)`}</option>
                      <option value={7}>{t`Canvas 7 (3D)`}</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="faction-modal-field">
                      <label>{t`Origin X`}</label>
                      <input
                        type="number"
                        value={templateX}
                        required
                        onChange={(e) => setTemplateX(Number(e.target.value))}
                      />
                    </div>
                    <div className="faction-modal-field">
                      <label>{t`Origin Y`}</label>
                      <input
                        type="number"
                        value={templateY}
                        required
                        onChange={(e) => setTemplateY(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="faction-modal-actions">
                    <button type="button" className="faction-btn" onClick={() => setShowUploadTemplateModal(false)}>
                      {t`Cancel`}
                    </button>
                    <button type="submit" className="faction-btn primary" disabled={uploadingTemplate || !templateFile}>
                      {uploadingTemplate ? t`Uploading...` : t`Upload Template`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showNewNapModal && (
            <div className="faction-modal-overlay" onClick={() => setShowNewNapModal(false)}>
              <div className="faction-modal-window" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="faction-modal-close" onClick={() => setShowNewNapModal(false)}>✕</button>
                <h3>{t`Propose Non-Aggression Pact (NAP)`}</h3>
                {napModalError && (
                  <p className="errormessage" style={{ marginBottom: '14px' }}>
                    <span>{t`Error`}</span>:&nbsp;{napModalError}
                  </p>
                )}
                <form onSubmit={handleNewNapSubmit}>
                  <div className="faction-modal-field">
                    <label>{t`Your Faction`}</label>
                    <input
                      type="text"
                      readOnly
                      value={`[${factionTag}] ${factionTitle}`}
                    />
                  </div>

                  <div className="faction-modal-field">
                    <label>{t`Target Faction (TAG)`}</label>
                    <input
                      type="text"
                      maxLength={3}
                      placeholder={t`e.g. PXF`}
                      required
                      value={napTargetTag}
                      onInput={(e) => {
                        setNapTargetTag(e.currentTarget.value.toUpperCase());
                        setTargetTemplate(null);
                        setTargetBBox(null);
                        setTargetTemplateError('');
                      }}
                    />
                    <small style={{ color: 'var(--caption-txt-color, #6b7280)', fontSize: '0.8rem' }}>{t`Enter the 2-3 letter tag of the other faction.`}</small>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="faction-modal-field">
                      <label>{t`Start Date`}</label>
                      <input
                        type="date"
                        value={napStartDate}
                        required
                        onChange={(e) => setNapStartDate(e.target.value)}
                      />
                    </div>
                    <div className="faction-modal-field">
                      <label>{t`End Date`}</label>
                      <input
                        type="date"
                        value={napEndDate}
                        min={napStartDate}
                        required
                        onChange={(e) => setNapEndDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="faction-modal-field">
                    <label>{t`Territory Distribution & Protection`}</label>

                    {activeTemplate ? (
                      <div className="territory-config-summary-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ fontSize: '0.84rem', color: 'var(--caption-txt-color, #6b7280)' }}>
                            {t`Select the protected area for either faction. An unselected side uses its full active template.`}
                          </span>
                          <button
                            type="button"
                            className="faction-btn primary sm"
                            onClick={() => setShowFullscreenTerritoryModal(true)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <span>⛶</span> {t`Open Fullscreen Territory Editor`}
                          </button>
                        </div>

                        {loadingTargetTemplate && (
                          <p style={{ margin: '8px 0 0', fontSize: '0.82rem' }}>
                            {t`Loading the target faction's active template…`}
                          </p>
                        )}
                        {targetTemplateError && (
                          <p className="errormessage" style={{ margin: '8px 0 0' }}>
                            {targetTemplateError}
                          </p>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                            <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem' }}>
                              {t`Target`} [{napTargetTag.trim() || t`TARGET`}]:
                            </span>
                            <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: '#b91c1c' }}>
                              {targetBBox
                                ? `${t`Canvas`} ${targetBBox.canvasId}: [${targetBBox.x1}, ${targetBBox.y1}] to [${targetBBox.x2}, ${targetBBox.y2}] (${targetBBox.x2 - targetBBox.x1 + 1}×${targetBBox.y2 - targetBBox.y1 + 1} px)`
                                : t`Full template default`}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                            <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.85rem' }}>
                              {t`Your Faction`} [{myFactionDetails?.tag || t`YOU`}]:
                            </span>
                            <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: '#1d4ed8' }}>
                              {myBBox
                                ? `${t`Canvas`} ${myBBox.canvasId}: [${myBBox.x1}, ${myBBox.y1}] to [${myBBox.x2}, ${myBBox.y2}] (${myBBox.x2 - myBBox.x1 + 1}×${myBBox.y2 - myBBox.y1 + 1} px)`
                                : t`Full template default`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="errormessage">
                        {t`Your faction does not have an active template. Upload a template first to define NAP territory.`}
                      </p>
                    )}
                  </div>

                  <div className="faction-modal-actions">
                    <button type="button" className="faction-btn" onClick={() => setShowNewNapModal(false)}>
                      {t`Cancel`}
                    </button>
                    <button
                      type="submit"
                      className="faction-btn primary"
                      disabled={submittingNap || !activeTemplate || napTargetTag.trim().length < 2}
                    >
                      {submittingNap ? t`Submitting...` : t`Submit for moderator approval`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showFullscreenTerritoryModal && activeTemplate && typeof document !== 'undefined' && createPortal(
            <div className="territory-fullscreen-overlay">
              <header className="territory-fullscreen-header">
                <div className="territory-fullscreen-title">
                  <span>⛶</span> {t`NAP Territory Distribution & Protection`}
                </div>

                <div className="territory-switcher-tabs" style={{ maxWidth: '600px', margin: 0 }}>
                  <button
                    type="button"
                    className={`territory-tab-btn target ${activeTerritoryTab === 'target' ? 'active' : ''}`}
                    onClick={() => setActiveTerritoryTab('target')}
                  >
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                    1. {t`Target Faction`} [{napTargetTag.trim() || t`TARGET`}]{targetBBox ? ' ✓' : ''}
                  </button>
                  <button
                    type="button"
                    className={`territory-tab-btn my ${activeTerritoryTab === 'my' ? 'active' : ''}`}
                    onClick={() => setActiveTerritoryTab('my')}
                  >
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />
                    2. {t`Your Faction`} [{myFactionDetails?.tag || t`YOU`}]
                    {myBBox ? ' ✓' : ''}
                  </button>
                </div>

                <div>
                  <button
                    type="button"
                    className="faction-btn primary"
                    onClick={() => setShowFullscreenTerritoryModal(false)}
                  >
                    ✓ {t`Apply & Return`}
                  </button>
                </div>
              </header>

              <div className="territory-fullscreen-body">
                {activeTerritoryTab === 'target' && !targetTemplate && (
                  <p
                    role="status"
                    style={{
                      margin: '8px 16px 0',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(245, 158, 11, 0.12)',
                      color: 'var(--main-color, #b45309)',
                    }}
                  >
                    {loadingTargetTemplate
                      ? t`Loading the target template. You can already select its territory using the displayed template.`
                      : targetTemplateError || t`Target template preview is unavailable. The selected coordinates will be checked against the target faction template when you submit.`}
                  </p>
                )}
                <div className="territory-top-controls">
                  <div className="territory-floating-toolbar">
                    <button
                      type="button"
                      className={`territory-tool-btn ${selectionTool === 'rect' ? 'active' : ''}`}
                      onClick={() => setSelectionTool('rect')}
                      title={t`Rectangle Tool`}
                    >
                      □
                    </button>
                    <button
                      type="button"
                      className={`territory-tool-btn ${selectionTool === 'lasso' ? 'active' : ''}`}
                      onClick={() => setSelectionTool('lasso')}
                      title={t`Lasso Tool`}
                    >
                      ⬡
                    </button>
                    <span>{t`Drag to select area`}</span>
                    <span className="territory-counter-badge">{getCounterBadgeText()}</span>
                    <span className="territory-help-text">{t`Double-click to apply | Right-click to cancel`}</span>
                  </div>
                </div>

                <div className="territory-fullscreen-canvas-box">
                  <canvas
                    ref={lassoCanvasRef}
                    className="lasso-canvas"
                    style={{
                      maxHeight: '75vh',
                      maxWidth: '94vw',
                      cursor: 'crosshair',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                      imageRendering: 'pixelated',
                    }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onTouchStart={handleCanvasMouseDown}
                    onTouchMove={handleCanvasMouseMove}
                    onTouchEnd={handleCanvasMouseUp}
                    onDoubleClick={handleSelectFullTemplateForCurrentTab}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleClearCurrentTab();
                    }}
                  />
                </div>
              </div>

              <footer className="territory-fullscreen-footer">
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" className="faction-btn" onClick={handleSelectFullTemplateForCurrentTab}>
                    {t`Select Entire Template for`} {activeTerritoryTab === 'target' ? t`Target` : t`Your Faction`}
                  </button>
                  <button type="button" className="faction-btn" onClick={handleClearCurrentTab}>
                    {t`Clear`} {activeTerritoryTab === 'target' ? t`Target` : t`Your`} {t`Selection`}
                  </button>
                  <button type="button" className="faction-btn" onClick={handleClearBoth}>
                    {t`Reset Both`}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                  <span style={{ color: '#f87171' }}>
                    <strong>{t`Target`} [{napTargetTag.trim() || t`TARGET`}]:</strong>{' '}
                    {targetBBox
                      ? `[${targetBBox.x1}, ${targetBBox.y1}] to [${targetBBox.x2}, ${targetBBox.y2}] (${targetBBox.x2 - targetBBox.x1 + 1}×${targetBBox.y2 - targetBBox.y1 + 1} px)`
                      : t`Full template`}
                  </span>
                  <span style={{ color: '#60a5fa' }}>
                    <strong>{t`Your Faction`} [{myFactionDetails?.tag || t`YOU`}]:</strong>{' '}
                    {myBBox
                      ? `[${myBBox.x1}, ${myBBox.y1}] to [${myBBox.x2}, ${myBBox.y2}] (${myBBox.x2 - myBBox.x1 + 1}×${myBBox.y2 - myBBox.y1 + 1} px)`
                      : t`Full template`}
                  </span>
                </div>

                <div>
                  <button
                    type="button"
                    className="faction-btn primary"
                    onClick={() => setShowFullscreenTerritoryModal(false)}
                  >
                    ✓ {t`Save & Return`}
                  </button>
                </div>
              </footer>
            </div>,
            document.body,
          )}

          {showEditInfoModal && (
            <div className="faction-modal-overlay" onClick={() => setShowEditInfoModal(false)}>
              <div className="faction-modal-window" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="faction-modal-close" onClick={() => setShowEditInfoModal(false)}>✕</button>
                <h3>{t`Edit Faction Details`}</h3>
                <form onSubmit={handleSaveDetails}>
                  <div className="faction-modal-field">
                    <label>{t`Faction Title / Name`}</label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="faction-modal-field">
                    <label>{t`Description`}</label>
                    <textarea
                      rows={4}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  </div>
                  <div className="faction-modal-actions">
                    <button type="button" className="faction-btn" onClick={() => setShowEditInfoModal(false)}>
                      {t`Cancel`}
                    </button>
                    <button type="submit" className="faction-btn primary" disabled={savingDetails}>
                      {savingDetails ? t`Saving...` : t`Save Changes`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showDisbandModal && (
            <div className="faction-modal-overlay" onClick={() => setShowDisbandModal(false)}>
              <div className="faction-modal-window" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="faction-modal-close" onClick={() => setShowDisbandModal(false)}>✕</button>
                <h3 style={{ color: '#dc2626' }}>{t`Disband Faction`}</h3>

                {disbandError && (
                  <p className="errormessage" style={{ marginBottom: '14px' }}>
                    <span>{t`Error`}</span>:&nbsp;{disbandError}
                  </p>
                )}

                <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: '0 0 14px' }}>
                  {t`This will`} <strong>{t`permanently delete`}</strong> {t`the faction`}{' '}
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>[{factionTag}] {factionTitle}</span>,
                  {t`including all member associations, channel messages, uploaded templates, and non-aggression pacts.`}
                </p>

                <form onSubmit={handleDisbandFaction}>
                  <div className="faction-modal-field">
                    <label>
                      {t`To confirm, type your faction name`}: <strong>{factionTitle}</strong>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={factionTitle}
                      value={disbandConfirmName}
                      onChange={(e) => setDisbandConfirmName(e.target.value)}
                    />
                  </div>

                  <div className="faction-modal-actions">
                    <button type="button" className="faction-btn" onClick={() => setShowDisbandModal(false)}>
                      {t`Cancel`}
                    </button>
                    <button
                      type="submit"
                      className="faction-btn danger"
                      disabled={disbanding || disbandConfirmName.trim() !== factionTitle}
                    >
                      {disbanding ? t`Disbanding...` : t`Permanently Delete Faction`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showMemberModal && selectedMember && (
            <div className="faction-modal-overlay" onClick={() => setShowMemberModal(false)}>
              <div className="faction-modal-window" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="faction-modal-close" onClick={() => setShowMemberModal(false)}>✕</button>
                <h3>{t`Manage Member Permissions`}</h3>

                {memberModalError && (
                  <p className="errormessage" style={{ marginBottom: '14px' }}>
                    <span>{t`Error`}</span>:&nbsp;{memberModalError}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '10px', background: 'var(--control-bg, #f9fafb)', borderRadius: '8px' }}>
                  {resolveAvatarUrl(selectedMember.avatar) ? (
                    <img src={resolveAvatarUrl(selectedMember.avatar)} className="faction-member-avatar" alt="" style={{ width: '40px', height: '40px' }} />
                  ) : (
                    <div className="faction-member-avatar faction-home-avatar-placeholder" style={{ width: '40px', height: '40px' }} />
                  )}
                  <div>
                    <strong style={{ fontSize: '1rem', display: 'block' }}>{selectedMember.name || selectedMember.username}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--caption-txt-color, #6b7280)' }}>
                      {t`Current Role`}: {ROLE_NAMES[selectedMember.role] || selectedMember.role}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSaveMemberPermissions}>
                  <div className="faction-modal-field">
                    <label>{t`Role / Rank`}</label>
                    <select
                      value={memberRole}
                      onChange={(e) => handleRoleChange(e.target.value)}
                    >
                      <option value="member">{t`Member (Regular)`}</option>
                      <option value="officer">{t`Officer (Moderator)`}</option>
                      <option value="deputy">{t`Deputy (Administrator)`}</option>
                      <option value="leader">{t`Leader (Co-Leader)`}</option>
                    </select>
                    <small style={{ color: 'var(--caption-txt-color, #6b7280)', fontSize: '0.78rem' }}>
                      {t`Changing role automatically updates default permission presets below.`}
                    </small>
                  </div>

                  <div className="faction-modal-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0 }}>{t`Custom Permissions`}</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="faction-btn sm"
                          onClick={() => {
                            const allPerms = {};
                            PERMISSION_CONFIG.forEach((p) => { allPerms[p.key] = true; });
                            setMemberPerms(allPerms);
                          }}
                        >
                          {t`Allow All`}
                        </button>
                        <button
                          type="button"
                          className="faction-btn sm"
                          onClick={() => setMemberPerms({})}
                        >
                          {t`Deny All`}
                        </button>
                      </div>
                    </div>

                    <div className="faction-perm-grid">
                      {PERMISSION_CONFIG.map((perm) => (
                        <label key={perm.key} className="faction-perm-item">
                          <input
                            type="checkbox"
                            checked={!!memberPerms[perm.key]}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMemberPerms((prev) => ({
                                ...prev,
                                [perm.key]: checked,
                              }));
                            }}
                          />
                          <div className="faction-perm-text">
                            <strong>{perm.label}</strong>
                            <p>{perm.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="faction-modal-actions" style={{ justifyContent: 'space-between' }}>
                    <div>
                      {canManageMembers && selectedMember.role !== 'owner' && (
                        <button
                          type="button"
                          className="faction-btn danger"
                          disabled={savingMemberPerms}
                          onClick={handleKickMember}
                        >
                          {t`Kick Member`}
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="button" className="faction-btn" onClick={() => setShowMemberModal(false)}>
                        {t`Cancel`}
                      </button>
                      <button type="submit" className="faction-btn primary" disabled={savingMemberPerms}>
                        {savingMemberPerms ? t`Saving...` : t`Save Permissions`}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="my-faction-container faction-empty-state">
          <p>{t`You are not a member of any faction yet.`}</p>
          <div className="faction-empty-actions">
            <button
              type="button"
              className="faction-leave-btn"
              onClick={changePage('directory')}
            >
              {t`Faction List`}
            </button>
            <button
              type="button"
              className="faction-leave-btn"
              disabled={!canCreateFaction}
              title={!canCreateFaction ? t`Need 50,000 pixels to create` : undefined}
              onClick={changePage('create')}
            >
              {t`Create Faction`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyFactions;
