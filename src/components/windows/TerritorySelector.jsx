/*
 * Advanced NAP Territory Protection & Selection Tool.
 * Supports:
 * 1. Point-Click Polygon Lasso (irregular borders via mouse clicks)
 * 2. Freehand Brush / Lasso (drag custom shapes)
 * 3. Classic Rectangle selection
 * 4. Template + Coordinates Auto-Protect (scans non-transparent pixels of
 *    uploaded or active template image and auto-protects only those pixels)
 */
/* eslint-disable max-len */

import {
  useCallback, useEffect, useRef, useState,
} from 'preact/hooks';
import { t } from 'ttag';

function simplifyPoints(pts, minDist = 6) {
  if (pts.length <= 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const prev = out[out.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) >= minDist) {
      out.push(pts[i]);
    }
  }
  return out;
}

function computeConvexHull(points) {
  if (points.length <= 3) return points;
  const sorted = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

const TerritorySelector = ({
  value,
  onChange,
  activeTemplate = null,
}) => {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [tool, setTool] = useState('polygon');
  const [canvasId, setCanvasId] = useState(Number(activeTemplate?.canvasId) || 0);
  const [originX, setOriginX] = useState(Number(activeTemplate?.x) || 0);
  const [originY, setOriginY] = useState(Number(activeTemplate?.y) || 0);
  const [previewSrc, setPreviewSrc] = useState(activeTemplate?.templateUrl || null);
  const [imgMeta, setImgMeta] = useState({ width: 320, height: 220 });
  const [polygonPts, setPolygonPts] = useState([]);
  const [freehandPts, setFreehandPts] = useState([]);
  const [dragRect, setDragRect] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [autoMaskInfo, setAutoMaskInfo] = useState(null);
  const [hasLoadedImage, setHasLoadedImage] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const formattedAutoMaskCount = autoMaskInfo?.opaqueCount.toLocaleString();

  const toWorldCoords = useCallback((pt, canvas) => {
    const scaleX = imgMeta.width / canvas.width;
    const scaleY = imgMeta.height / canvas.height;
    return [
      Math.round(originX + pt.x * scaleX),
      Math.round(originY + pt.y * scaleY),
    ];
  }, [imgMeta, originX, originY]);

  const toCanvasCoords = useCallback((worldPt, canvas) => {
    const scaleX = canvas.width / imgMeta.width;
    const scaleY = canvas.height / imgMeta.height;
    return {
      x: (worldPt[0] - originX) * scaleX,
      y: (worldPt[1] - originY) * scaleY,
    };
  }, [imgMeta, originX, originY]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Neutral classic PixelStates grid backdrop
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, w, h);
    }

    // Existing saved selection
    if (value?.polygon && value.polygon.length >= 3) {
      ctx.save();
      ctx.beginPath();
      value.polygon.forEach((wp, idx) => {
        const cp = toCanvasCoords(wp, canvas);
        if (idx === 0) ctx.moveTo(cp.x, cp.y);
        else ctx.lineTo(cp.x, cp.y);
      });
      ctx.closePath();
      ctx.fillStyle = value.mode === 'template_mask'
        ? 'rgba(16, 185, 129, 0.28)'
        : 'rgba(59, 130, 246, 0.28)';
      ctx.strokeStyle = value.mode === 'template_mask' ? '#10b981' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (value && Number.isFinite(value.x1) && Number.isFinite(value.x2)) {
      const p1 = toCanvasCoords([value.x1, value.y1], canvas);
      const p2 = toCanvasCoords([value.x2, value.y2], canvas);
      ctx.save();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.restore();
    }

    // In-progress point-click polygon
    if (polygonPts.length > 0) {
      ctx.save();
      ctx.beginPath();
      polygonPts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      polygonPts.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, idx === 0 ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#22c55e' : '#facc15';
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      ctx.restore();
    }

    // In-progress freehand lasso
    if (freehandPts.length > 1) {
      ctx.save();
      ctx.beginPath();
      freehandPts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // In-progress drag rectangle
    if (dragRect) {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillRect(dragRect.x1, dragRect.y1, dragRect.x2 - dragRect.x1, dragRect.y2 - dragRect.y1);
      ctx.strokeRect(dragRect.x1, dragRect.y1, dragRect.x2 - dragRect.x1, dragRect.y2 - dragRect.y1);
      ctx.restore();
    }
  }, [value, polygonPts, freehandPts, dragRect, toCanvasCoords]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const extractAutoTemplateMask = useCallback((img, cId, ox, oy) => {
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const octx = off.getContext('2d');
    octx.drawImage(img, 0, 0);
    const { data, width, height } = octx.getImageData(
      0, 0, Math.max(1, off.width), Math.max(1, off.height),
    );

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let opaqueCount = 0;
    const boundarySamples = [];

    for (let y = 0; y < height; y += 1) {
      let rowFirst = -1;
      let rowLast = -1;
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 20) {
          opaqueCount += 1;
          if (rowFirst === -1) rowFirst = x;
          rowLast = x;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (rowFirst !== -1) {
        boundarySamples.push({ x: rowFirst, y });
        if (rowLast !== rowFirst) boundarySamples.push({ x: rowLast, y });
      }
    }

    if (opaqueCount === 0) {
      setStatusNote(t`Template has no opaque pixels to protect.`);
      return;
    }

    const hull = computeConvexHull(boundarySamples);
    const worldPolygon = hull.map((p) => [ox + p.x, oy + p.y]);
    const selection = {
      mode: 'template_mask',
      canvasId: cId,
      x1: ox + minX,
      y1: oy + minY,
      x2: ox + maxX,
      y2: oy + maxY,
      pixelCount: opaqueCount,
      polygon: worldPolygon,
      templateWidth: width,
      templateHeight: height,
    };
    setAutoMaskInfo({ opaqueCount, width, height });
    const formattedOpaqueCount = opaqueCount.toLocaleString();
    setStatusNote(
      t`Auto-protected ${formattedOpaqueCount} opaque template pixels at Canvas #${cId} (${ox}, ${oy}).`,
    );
    onChange(selection);
  }, [onChange]);

  const loadTemplateImage = useCallback((src, autoProtect = false) => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setHasLoadedImage(true);
      setImgMeta({ width: img.naturalWidth || 320, height: img.naturalHeight || 220 });
      if (autoProtect) {
        extractAutoTemplateMask(img, canvasId, originX, originY);
      } else {
        drawCanvas();
      }
    };
    img.src = src;
  }, [canvasId, originX, originY, extractAutoTemplateMask, drawCanvas]);

  useEffect(() => {
    if (previewSrc) {
      loadTemplateImage(previewSrc, false);
    }
  }, [previewSrc, loadTemplateImage]);

  const handleFileChange = (e) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setPreviewSrc(dataUrl);
      loadTemplateImage(dataUrl, true);
    };
    reader.readAsDataURL(file);
  };

  const getPt = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, ((e.clientX - rect.left) * canvas.width) / rect.width)),
      y: Math.max(0, Math.min(canvas.height, ((e.clientY - rect.top) * canvas.height) / rect.height)),
    };
  };

  const commitPolygon = (pts, modeName) => {
    const canvas = canvasRef.current;
    if (!canvas || pts.length < 3) return;
    const worldPolygon = pts.map((p) => toWorldCoords(p, canvas));
    const xs = worldPolygon.map((p) => p[0]);
    const ys = worldPolygon.map((p) => p[1]);
    onChange({
      mode: modeName,
      canvasId,
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
      polygon: worldPolygon,
    });
    setStatusNote(
      modeName === 'polygon'
        ? t`Protected polygon with ${worldPolygon.length} vertices.`
        : t`Protected freehand territory (${worldPolygon.length} border points).`,
    );
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    const pt = getPt(e);
    if (tool === 'polygon') {
      // Close polygon if clicking near first vertex with >= 3 points
      if (polygonPts.length >= 3
        && Math.hypot(pt.x - polygonPts[0].x, pt.y - polygonPts[0].y) < 12) {
        commitPolygon(polygonPts, 'polygon');
        setPolygonPts([]);
        return;
      }
      setPolygonPts((prev) => [...prev, pt]);
      return;
    }
    setIsDragging(true);
    if (tool === 'rect') {
      setDragRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    } else if (tool === 'freehand') {
      setFreehandPts([pt]);
    }
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const pt = getPt(e);
    if (tool === 'rect' && dragRect) {
      setDragRect((prev) => ({ ...prev, x2: pt.x, y2: pt.y }));
    } else if (tool === 'freehand') {
      setFreehandPts((prev) => [...prev, pt]);
    }
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (tool === 'rect' && dragRect) {
      const p1 = toWorldCoords({ x: Math.min(dragRect.x1, dragRect.x2), y: Math.min(dragRect.y1, dragRect.y2) }, canvas);
      const p2 = toWorldCoords({ x: Math.max(dragRect.x1, dragRect.x2), y: Math.max(dragRect.y1, dragRect.y2) }, canvas);
      if (Math.abs(p2[0] - p1[0]) >= 2 && Math.abs(p2[1] - p1[1]) >= 2) {
        onChange({
          mode: 'rect',
          canvasId,
          x1: p1[0],
          y1: p1[1],
          x2: p2[0],
          y2: p2[1],
          polygon: [
            [p1[0], p1[1]],
            [p2[0], p1[1]],
            [p2[0], p2[1]],
            [p1[0], p2[1]],
          ],
        });
        setStatusNote(t`Protected rectangular territory.`);
      }
      setDragRect(null);
    } else if (tool === 'freehand' && freehandPts.length >= 3) {
      const simplified = simplifyPoints(freehandPts, 8);
      if (simplified.length >= 3) {
        commitPolygon(simplified, 'freehand');
      }
      setFreehandPts([]);
    }
  };

  return (
    <div className="faction-system-section territory-selector">
      <div className="faction-alliance-tabs territory-tool-bar" role="toolbar" aria-label={t`Territory selection tools`}>
        <button
          type="button"
          className={tool === 'polygon' ? 'selected active' : ''}
          onClick={() => setTool('polygon')}
        >
          {t`Polygon Click`}
        </button>
        <button
          type="button"
          className={tool === 'freehand' ? 'selected active' : ''}
          onClick={() => setTool('freehand')}
        >
          {t`Freehand Lasso`}
        </button>
        <button
          type="button"
          className={tool === 'rect' ? 'selected active' : ''}
          onClick={() => setTool('rect')}
        >
          {t`Rectangle`}
        </button>
        <button
          type="button"
          className={tool === 'template' ? 'selected active' : ''}
          onClick={() => setTool('template')}
        >
          {t`Template Auto-Protect`}
        </button>
      </div>

      <div className="territory-coords-bar">
        <label>
          <span>{t`Canvas`}</span>
          <input
            type="number"
            value={canvasId}
            onInput={(e) => setCanvasId(Number(e.currentTarget.value) || 0)}
          />
        </label>
        <label>
          <span>{t`Origin X`}</span>
          <input
            type="number"
            value={originX}
            onInput={(e) => setOriginX(Number(e.currentTarget.value) || 0)}
          />
        </label>
        <label>
          <span>{t`Origin Y`}</span>
          <input
            type="number"
            value={originY}
            onInput={(e) => setOriginY(Number(e.currentTarget.value) || 0)}
          />
        </label>
      </div>

      {tool === 'template' && (
        <div className="territory-template-upload">
          <label>
            <span>{t`Upload template image (.png / .webp) to auto-protect only its non-transparent pixels:`}</span>
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              onChange={handleFileChange}
            />
          </label>
          {hasLoadedImage && (
            <button
              type="button"
              onClick={() => {
                if (imgRef.current) {
                  extractAutoTemplateMask(imgRef.current, canvasId, originX, originY);
                }
              }}
            >
              {t`Re-scan Template Pixels`}
            </button>
          )}
          {autoMaskInfo && (
            <small className="territory-mask-summary">
              {t`Detected ${formattedAutoMaskCount} exact template pixels (${autoMaskInfo.width}×${autoMaskInfo.height}).`}
            </small>
          )}
        </div>
      )}

      <div className="territory-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={520}
          height={280}
          className="territory-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      <div className="territory-actions-row">
        {tool === 'polygon' && polygonPts.length > 0 && (
          <>
            <button
              type="button"
              disabled={polygonPts.length < 3}
              onClick={() => {
                commitPolygon(polygonPts, 'polygon');
                setPolygonPts([]);
              }}
            >
              {t`Close Polygon (${polygonPts.length} pts)`}
            </button>
            <button
              type="button"
              onClick={() => setPolygonPts((prev) => prev.slice(0, -1))}
            >
              {t`Undo Point`}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setPolygonPts([]);
            setFreehandPts([]);
            setDragRect(null);
            setAutoMaskInfo(null);
            setStatusNote('');
            onChange(null);
          }}
        >
          {t`Clear Selection`}
        </button>
      </div>

      {statusNote && <p className="territory-status-note">{statusNote}</p>}
      {value && (
        <div className="territory-selected-readout">
          <strong>{t`Protected Area`}:</strong>{' '}
          Canvas #{value.canvasId} · [{value.x1}, {value.y1}]–[{value.x2}, {value.y2}]
          {value.mode === 'template_mask' && value.pixelCount
            ? ` · ${t`Exact Template Mask`} (${value.pixelCount.toLocaleString()} px)`
            : value.polygon?.length
              ? ` · ${value.mode === 'freehand' ? t`Freehand Lasso` : value.mode === 'polygon' ? t`Polygon` : t`Rectangle`} (${value.polygon.length} pts)`
              : ''}
        </div>
      )}
    </div>
  );
};

export default TerritorySelector;
