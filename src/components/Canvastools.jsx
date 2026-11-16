/*
 * ModCanvastools
 */

import { useEffect, useState } from 'preact/hooks';
import { Fragment } from 'preact';
import { memo } from 'preact/compat';
import {
  useSelector, shallowEqual, useDispatch,
} from '../store/react-redux/index.js';
import { t } from 'ttag';

import useInterval from './hooks/interval.js';
import HistorySelect from './HistorySelect.jsx';
import { coordsFromString } from '../core/utils.js';
import templateLoader from '../ui/templateLoader.js';
import { api } from '../utils/utag.js';
import { selectCanvas } from '../store/actions/index.js';
import { USERLVL } from '../core/constants.js';

const keptState = {
  coords: '',
  tlcoords: '',
  brcoords: '',
  pasteColorTopLeft: '',
  pasteColorBottomRight: '',
  tlrcoords: '',
  brrcoords: '',
  tlccoords: '',
  brccoords: '',
};

async function submitImageAction(
  action,
  canvas,
  coords,
  callback,
) {
  const data = new FormData();
  const fileSel = document.getElementById('imgfile');
  const file = (!fileSel.files || !fileSel.files[0])
    ? null : fileSel.files[0];
  data.append('imageaction', action);
  data.append('image', file);
  data.append('canvasid', canvas);
  data.append('coords', coords);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  callback(await resp.text());
}

async function submitPasteColor(
  canvas,
  topLeft,
  bottomRight,
  colorIndex,
) {
  const data = new FormData();
  data.append('pastecolor', true);
  data.append('canvasid', canvas);
  data.append('ulcoor', topLeft);
  data.append('brcoor', bottomRight);
  data.append('colorindex', colorIndex);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  const message = await resp.text();
  if (!resp.ok) {
    throw new Error(message);
  }
  return message;
}

async function submitProtAction(
  action,
  canvas,
  tlcoords,
  brcoords,
  callback,
) {
  const data = new FormData();
  data.append('protaction', action);
  data.append('canvasid', canvas);
  data.append('ulcoor', tlcoords);
  data.append('brcoor', brcoords);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  callback(await resp.text());
}

async function submitRollback(
  date,
  time,
  canvas,
  topLeft,
  bottomRight,
  callback,
) {
  const data = new FormData();
  data.append('rollbackdate', date);
  data.append('rollbacktime', time);
  data.append('canvasid', canvas);
  data.append('ulcoor', topLeft);
  data.append('brcoor', bottomRight);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  callback(await resp.text());
}

async function submitCanvasCleaner(
  action,
  canvas,
  tlcoords,
  brcoords,
  templateColors,
  callback,
) {
  const data = new FormData();
  data.append('cleaneraction', action);
  data.append('canvasid', canvas);
  data.append('ulcoor', tlcoords);
  data.append('brcoor', brcoords);
  if (templateColors) {
    data.append('templatecolors', templateColors);
  }
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  callback(await resp.text());
}

function encodeBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function createTemplateMask(
  canvasId,
  topLeft,
  bottomRight,
  templateList,
  palette,
) {
  if (!topLeft || !bottomRight || !palette?.rgb) {
    throw new Error('Select valid coordinates and load a canvas palette.');
  }
  const [x, y] = coordsFromString(topLeft) || [];
  const [u, v] = coordsFromString(bottomRight) || [];
  if (![x, y, u, v].every(Number.isInteger) || x > u || y > v) {
    throw new Error('Enter a valid top-left and bottom-right coordinate.');
  }
  const width = u - x + 1;
  const height = v - y + 1;
  if (width * height > 100000) {
    throw new Error('Template cleanup is limited to 100,000 pixels per run.');
  }
  await templateLoader.loadAllMissing();
  const mask = new Uint8Array(width * height);
  const colorIndices = new Map();
  for (let i = 0; i < palette.rgb.length; i += 3) {
    const rgb = `${palette.rgb[i]},${palette.rgb[i + 1]},${palette.rgb[i + 2]}`;
    colorIndices.set(rgb, (i / 3) + 1);
  }

  for (const template of templateList) {
    if (!template.enabled || String(template.canvasId) !== String(canvasId)) {
      continue;
    }
    const image = templateLoader.getTemplateSync(template.imageId);
    if (!image) continue;
    const left = Math.max(x, template.x);
    const top = Math.max(y, template.y);
    const right = Math.min(u + 1, template.x + template.width);
    const bottom = Math.min(v + 1, template.y + template.height);
    if (left >= right || top >= bottom) continue;
    const imageData = image.getContext('2d').getImageData(
      left - template.x,
      top - template.y,
      right - left,
      bottom - top,
    );
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const target = (py - y) * width + px - x;
        if (mask[target]) continue;
        const source = ((py - top) * (right - left) + px - left) * 4;
        if (imageData.data[source + 3] <= 200) continue;
        const rgb = [
          imageData.data[source],
          imageData.data[source + 1],
          imageData.data[source + 2],
        ].join(',');
        const color = colorIndices.get(rgb);
        if (color > 1) mask[target] = color;
      }
    }
  }
  if (!mask.some((color) => color)) {
    throw new Error('No enabled template pixels overlap the selected area.');
  }
  return encodeBase64(mask);
}

async function getCleanerStats(
  callback,
) {
  const data = new FormData();
  data.append('cleanerstat', true);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  if (resp.ok) {
    callback(await resp.json());
  } else {
    callback({
    });
  }
}

async function getCleanerCancel(
  callback,
) {
  const data = new FormData();
  data.append('cleanercancel', true);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  if (resp.ok) {
    callback(await resp.text());
  } else {
    callback('');
  }
}

function ModCanvastools() {
  const [imageAction, selectImageAction] = useState('build');
  const [pasteColorIndex, setPasteColorIndex] = useState(null);
  const [cleanAction, selectCleanAction] = useState('spare');
  const [cleanUsingTemplate, setCleanUsingTemplate] = useState(false);
  const [protAction, selectProtAction] = useState('protect');
  const [resp, setResp] = useState(null);
  const [cleanerstats, setCleanerStats] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [
    userlvl,
    canvasId,
    canvases,
    templateList,
    palette,
    selectedColor,
    historicalDate,
    historicalTime,
  ] = useSelector((state) => [
    state.user.userlvl,
    state.canvas.canvasId,
    state.canvas.canvases,
    state.templates.list,
    state.canvas.palette,
    state.canvas.selectedColor,
    state.canvas.historicalDate,
    state.canvas.historicalTime,
  ], shallowEqual);

  const dispatch = useDispatch();

  let descAction;
  switch (imageAction) {
    case 'build':
      descAction = t`Build image on canvas.`;
      break;
    case 'rollback':
      descAction = t`Restore this area of the canvas from history.`;
      break;
    case 'protect':
      descAction = t`Build image and set it to protected.`;
      break;
    case 'wipe':
      // eslint-disable-next-line max-len
      descAction = t`Build image using all canvas colors, including OSM/background colors; nearby shades are matched to the closest palette color.`;
      break;
    case 'pastecolor':
      descAction = t`Fill the selected area with one palette color.`;
      break;
    default:
      // nothing
  }

  let descCleanAction;
  switch (cleanUsingTemplate ? 'template' : cleanAction) {
    case 'spare':
      // eslint-disable-next-line max-len
      descCleanAction = t`Clean spare pixels that are surrounded by unset pixels`;
      break;
    case 'spareext':
      // eslint-disable-next-line max-len
      descCleanAction = t`Clean spare pixels that are surrounded by unset pixels and up to 1 other set pixels`;
      break;
    case 'spareextu':
      // eslint-disable-next-line max-len
      descCleanAction = t`Clean spare pixels that are surrounded by a single other color or unset pixels (VERY AGGRESSIVE ON CANVASES THAT ALLOW UNSET PIXELS (where there are two cooldowns)!)`;
      break;
    case 'makenull':
      // eslint-disable-next-line max-len
      descCleanAction = t`Turn every pixel in area to 0 (YOU REALLY SHOULDN'T DO THAT ON ANY AREA THAT ISN'T ALREADY MOSTLY 0)`;
      break;
    case 'template':
      // eslint-disable-next-line max-len
      descCleanAction = t`Replace mismatched set pixels with enabled template colors. Empty pixels are left untouched.`;
      break;
    default:
      // nothing
  }

  useInterval(() => {
    getCleanerStats((stats) => setCleanerStats(stats));
  }, 10000);

  useEffect(() => {
    if (userlvl < USERLVL.MOD && imageAction !== 'rollback') {
      selectImageAction('rollback');
    }
  }, [imageAction, userlvl]);

  useEffect(() => {
    setPasteColorIndex(null);
  }, [canvasId]);

  if (userlvl < USERLVL.JANNY) {
    return (<div className="content"><h1>{t`Not Allowed`}</h1></div>);
  }

  const cleanerStatusString = (!cleanerstats.running)
    ? t`Status: Not running`
  // eslint-disable-next-line max-len
    : `Status: ${cleanerstats.method} from ${cleanerstats.tl} to ${cleanerstats.br} on canvas ${canvases[cleanerstats.canvasId].ident} to ${cleanerstats.percent} done`;

  return (
    <div className="content">
      {resp && (
        <div className="respbox">
          {resp.split('\n').map((line) => (
            <p key={line.slice(0, 3)}>
              {line}
            </p>
          ))}
          <span
            role="button"
            tabIndex={-1}
            className="modallink"
            onClick={() => setResp(null)}
          >
            {t`Close`}
          </span>
        </div>
      )}
      <p>{t`Choose Canvas`}:&nbsp;
        <select
          value={canvasId}
          onChange={(e) => {
            const sel = e.target;
            dispatch(selectCanvas(sel.options[sel.selectedIndex].value));
          }}
        >
          {Object.keys(canvases).filter((c) => !canvases[c].v).map((canvas) => (
            <option
              key={canvas}
              value={canvas}
            >
              {canvases[canvas].title}
            </option>
          ))}
        </select>
      </p>
      {(userlvl >= USERLVL.JANNY) && (
        <Fragment key="imgup">
          <div className="modaldivider" />
          <h3>{t`Image Upload`}</h3>
          {(userlvl >= USERLVL.MOD) && (
            <p>{t`Upload images to canvas`}</p>
          )}
          <select
            value={imageAction}
            onChange={(e) => {
              const sel = e.target;
              selectImageAction(sel.options[sel.selectedIndex].value);
            }}
          >
            {[
              ...(userlvl >= USERLVL.MOD
                ? ['build', 'protect', 'wipe', 'pastecolor'] : []),
              'rollback',
            ].map((opt) => (
              <option
                key={opt}
                value={opt}
              >
                {opt === 'pastecolor' ? 'PasteColor' : opt}
              </option>
            ))}
          </select>
          {(imageAction !== 'rollback' && imageAction !== 'pastecolor') && (
            <p>
              {t`File`}:&nbsp;
              <input type="file" name="image" id="imgfile" />
            </p>
          )}
          <p>{descAction}</p>
          {(imageAction === 'pastecolor') && (
            <>
              <p>{t`Color palette`}</p>
              <div
                role="group"
                aria-label={t`Color palette`}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                }}
              >
                {palette.colors.slice(1).map((color, index) => {
                  const colorIndex = index + 1;
                  const isSelected = colorIndex === (
                    pasteColorIndex
                    ?? (selectedColor > 0 ? selectedColor : 1)
                  );
                  return (
                    <button
                      key={`${color}-${colorIndex}`}
                      type="button"
                      aria-label={`Color ${colorIndex}`}
                      aria-pressed={isSelected}
                      title={`Color ${colorIndex}`}
                      onClick={() => setPasteColorIndex(colorIndex)}
                      style={{
                        width: '24px',
                        height: '24px',
                        padding: 0,
                        backgroundColor: color,
                        border: isSelected
                          ? '2px solid currentColor' : '1px solid #888',
                        cursor: 'pointer',
                      }}
                    />
                  );
                })}
              </div>
              <p>
                {t`Top-left corner`}:&nbsp;
                <input
                  defaultValue={keptState.pasteColorTopLeft}
                  style={{
                    display: 'inline-block',
                    width: '100%',
                    maxWidth: '15em',
                  }}
                  type="text"
                  placeholder="X_Y or URL"
                  onChange={(evt) => {
                    let coords = evt.target.value.trim();
                    const parsed = coordsFromString(coords);
                    if (parsed) {
                      coords = parsed.join('_');
                      evt.target.value = coords;
                    }
                    keptState.pasteColorTopLeft = coords;
                  }}
                />
              </p>
              <p>
                {t`Bottom-right corner`}:&nbsp;
                <input
                  defaultValue={keptState.pasteColorBottomRight}
                  style={{
                    display: 'inline-block',
                    width: '100%',
                    maxWidth: '15em',
                  }}
                  type="text"
                  placeholder="X_Y or URL"
                  onChange={(evt) => {
                    let coords = evt.target.value.trim();
                    const parsed = coordsFromString(coords);
                    if (parsed) {
                      coords = parsed.join('_');
                      evt.target.value = coords;
                    }
                    keptState.pasteColorBottomRight = coords;
                  }}
                />
              </p>
            </>
          )}
          {(imageAction === 'rollback' && window.ssv?.backupurl) && (
            <>
              <HistorySelect />
              <p>
                {t`Top-left corner`}:&nbsp;
                <input
                  defaultValue={keptState.tlrcoords}
                  style={{
                    display: 'inline-block',
                    width: '100%',
                    maxWidth: '15em',
                  }}
                  type="text"
                  placeholder="X_Y or URL"
                  onChange={(evt) => {
                    let coords = evt.target.value.trim();
                    const parsed = coordsFromString(coords);
                    if (parsed) {
                      coords = parsed.join('_');
                      evt.target.value = coords;
                    }
                    keptState.tlrcoords = coords;
                  }}
                />
              </p>
              <p>
                {t`Bottom-right corner`}:&nbsp;
                <input
                  defaultValue={keptState.brrcoords}
                  style={{
                    display: 'inline-block',
                    width: '100%',
                    maxWidth: '15em',
                  }}
                  type="text"
                  placeholder="X_Y or URL"
                  onChange={(evt) => {
                    let coords = evt.target.value.trim();
                    const parsed = coordsFromString(coords);
                    if (parsed) {
                      coords = parsed.join('_');
                      evt.target.value = coords;
                    }
                    keptState.brrcoords = coords;
                  }}
                />
              </p>
            </>
          )}
          {(imageAction === 'rollback' && !window.ssv?.backupurl) && (
            <p className="warn">
              {t`No history backups are configured; rollback is unavailable.`}
            </p>
          )}
          <p>
            {(imageAction !== 'rollback' && imageAction !== 'pastecolor') && (
              <>
                {t`Coordinates:`}&nbsp;
                <input
                  defaultValue={keptState.coords}
                  style={{
                    display: 'inline-block',
                    width: '100%',
                    maxWidth: '15em',
                  }}
                  type="text"
                  placeholder="X_Y or URL"
                  onChange={(evt) => {
                    let co = evt.target.value.trim();
                    co = coordsFromString(co);
                    if (co) {
                      co = co.join('_');
                      evt.target.value = co;
                    }
                    keptState.coords = co;
                  }}
                />
              </>
            )}
          </p>
          <button
            type="button"
            disabled={
              submitting
              || (imageAction === 'rollback' && !window.ssv?.backupurl)
            }
            onClick={() => {
              if (submitting
                || (imageAction === 'rollback' && !window.ssv?.backupurl)
              ) {
                return;
              }
              setSubmitting(true);
              if (imageAction === 'rollback') {
                submitRollback(
                  historicalDate,
                  historicalTime,
                  canvasId,
                  keptState.tlrcoords,
                  keptState.brrcoords,
                  (ret) => {
                    setSubmitting(false);
                    setResp(ret);
                  },
                ).catch((error) => {
                  setSubmitting(false);
                  setResp(error.message);
                });
              } else if (imageAction === 'pastecolor') {
                const colorIndex = pasteColorIndex
                  ?? (selectedColor > 0 ? selectedColor : 1);
                submitPasteColor(
                  canvasId,
                  keptState.pasteColorTopLeft,
                  keptState.pasteColorBottomRight,
                  colorIndex,
                ).then((message) => {
                  setResp(message);
                }).catch((error) => {
                  setResp(error.message);
                }).finally(() => {
                  setSubmitting(false);
                });
              } else {
                submitImageAction(
                  imageAction,
                  canvasId,
                  keptState.coords,
                  (ret) => {
                    setSubmitting(false);
                    setResp(ret);
                  },
                );
              }
            }}
          >
            {(submitting) ? '...' : t`Submit`}
          </button>
          <br />
        </Fragment>
      )}
      <div className="modaldivider" />
      <h3>{t`Pixel Protection`}</h3>
      <p>
        {
          // eslint-disable-next-line max-len
          t`Set protection of areas (if you need finer grained control, use protect with image upload and alpha layers)`
        }
      </p>
      <select
        value={protAction}
        onChange={(e) => {
          const sel = e.target;
          selectProtAction(sel.options[sel.selectedIndex].value);
        }}
      >
        {['protect', 'unprotect'].map((opt) => (
          <option
            key={opt}
            value={opt}
          >
            {opt}
          </option>
        ))}
      </select>
      <p>
        {t`Top-left corner`}:&nbsp;
        <input
          defaultValue={keptState.tlcoords}
          style={{
            display: 'inline-block',
            width: '100%',
            maxWidth: '15em',
          }}
          type="text"
          placeholder="X_Y or URL"
          onChange={(evt) => {
            let co = evt.target.value.trim();
            co = coordsFromString(co);
            if (co) {
              co = co.join('_');
              evt.target.value = co;
            }
            keptState.tlcoords = co;
          }}
        />
      </p>
      <p>
        {t`Bottom-right corner`}:&nbsp;
        <input
          defaultValue={keptState.brcoords}
          style={{
            display: 'inline-block',
            width: '100%',
            maxWidth: '15em',
          }}
          type="text"
          placeholder="X_Y or URL"
          onChange={(evt) => {
            let co = evt.target.value.trim();
            co = coordsFromString(co);
            if (co) {
              co = co.join('_');
              evt.target.value = co;
            }
            keptState.brcoords = co;
          }}
        />
      </p>
      <button
        type="button"
        onClick={() => {
          if (submitting) {
            return;
          }
          setSubmitting(true);
          submitProtAction(
            protAction,
            canvasId,
            keptState.tlcoords,
            keptState.brcoords,
            (ret) => {
              setSubmitting(false);
              setResp(ret);
            },
          );
        }}
      >
        {(submitting) ? '...' : t`Submit`}
      </button>
      <br />
      {(userlvl >= USERLVL.MOD) && (
        <Fragment key="cnvcln">
          <div className="modaldivider" />
          <h3>{t`Canvas Cleaner`}</h3>
          <p>
            {t`Apply a filter to clean trash in large canvas areas.`}
          </p>
          <select
            value={cleanAction}
            disabled={cleanUsingTemplate}
            onChange={(e) => {
              const sel = e.target;
              selectCleanAction(sel.options[sel.selectedIndex].value);
            }}
          >
            {['spare', 'spareext', 'spareextu', 'makenull'].map((opt) => (
              <option
                key={opt}
                value={opt}
              >
                {opt}
              </option>
            ))}
          </select>
          <p>
            <label>
              <input
                type="checkbox"
                checked={cleanUsingTemplate}
                onChange={(evt) => setCleanUsingTemplate(evt.target.checked)}
              />
              {t`Fix pixels using enabled template colors`}
            </label>
          </p>
          <p>{descCleanAction}</p>
          <p style={{ fontWeight: 'bold' }}>
            {cleanerStatusString}
          </p>
          <p>
            {t`Top-left corner`}:&nbsp;
            <input
              defaultValue={keptState.tlccoords}
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: '15em',
              }}
              type="text"
              placeholder="X_Y or URL"
              onChange={(evt) => {
                let co = evt.target.value.trim();
                co = coordsFromString(co);
                if (co) {
                  co = co.join('_');
                  evt.target.value = co;
                }
                keptState.tlccoords = co;
              }}
            />
          </p>
          <p>
            {t`Bottom-right corner`}:&nbsp;
            <input
              defaultValue={keptState.brccoords}
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: '15em',
              }}
              type="text"
              placeholder="X_Y or URL"
              onChange={(evt) => {
                let co = evt.target.value.trim();
                co = coordsFromString(co);
                if (co) {
                  co = co.join('_');
                  evt.target.value = co;
                }
                keptState.brccoords = co;
              }}
            />
          </p>
          <button
            type="button"
            onClick={() => {
              if (submitting) {
                return;
              }
              setSubmitting(true);
              (async () => {
                try {
                  const selectedMethod = cleanUsingTemplate
                    ? 'template' : cleanAction;
                  const templateColors = cleanUsingTemplate
                    ? await createTemplateMask(
                        canvasId,
                        keptState.tlccoords,
                        keptState.brccoords,
                        templateList,
                        palette,
                      ) : '';
                  await submitCanvasCleaner(
                    selectedMethod,
                    canvasId,
                    keptState.tlccoords,
                    keptState.brccoords,
                    templateColors,
                    (ret) => {
                      setCleanerStats({
                        running: true,
                        percent: 'N/A',
                        method: selectedMethod,
                        tl: keptState.tlccoords,
                        br: keptState.brccoords,
                        canvasId,
                      });
                      setResp(ret);
                    },
                  );
                } catch (error) {
                  setResp(error.message);
                } finally {
                  setSubmitting(false);
                }
              })();
            }}
          >
            {(submitting) ? '...' : t`Submit`}
          </button>
          <button
            type="button"
            onClick={() => {
              if (submitting) {
                return;
              }
              setSubmitting(true);
              getCleanerCancel(
                (ret) => {
                  setCleanerStats({});
                  setSubmitting(false);
                  setResp(ret);
                },
              );
            }}
          >
            {(submitting) ? '...' : t`Stop Cleaner`}
          </button>
        </Fragment>
      )}
    </div>
  );
}

export default memo(ModCanvastools);
