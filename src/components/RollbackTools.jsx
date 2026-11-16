import { useMemo, useState } from 'preact/hooks';
import {
  useDispatch, useSelector, shallowEqual,
} from '../store/react-redux/index.js';
import { t } from 'ttag';

import HistorySelect from './HistorySelect.jsx';
import { coordsFromString } from '../core/utils.js';
import { selectCanvas } from '../store/actions/index.js';
import { api } from '../utils/utag.js';

async function postRollbackPreview(
  date, time, canvasId, topLeft, bottomRight,
) {
  const form = new FormData();
  form.append('rollbackpreview', 'true');
  form.append('previewdate', date);
  form.append('previewtime', time);
  form.append('canvasid', canvasId);
  form.append('ulcoor', topLeft);
  form.append('brcoor', bottomRight);
  const response = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function confirmRollback(token) {
  const form = new FormData();
  form.append('rollbacktoken', token);
  const response = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: form,
  });
  const message = await response.text();
  if (!response.ok) {
    throw new Error(message);
  }
  return message;
}

function normalizeCoordinates(value) {
  const coordinates = coordsFromString(value.trim());
  return coordinates ? coordinates.join('_') : value.trim();
}

function RollbackTools() {
  const [canvasId, canvases, historicalDate, historicalTime] = useSelector(
    (state) => [
      state.canvas.canvasId,
      state.canvas.canvases,
      state.canvas.historicalDate,
      state.canvas.historicalTime,
    ],
    shallowEqual,
  );
  const [topLeft, setTopLeft] = useState('');
  const [bottomRight, setBottomRight] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dispatch = useDispatch();

  const selectionKey = useMemo(() => [
    canvasId,
    historicalDate,
    historicalTime,
    topLeft,
    bottomRight,
  ].join('|'), [
    canvasId, historicalDate, historicalTime, topLeft, bottomRight,
  ]);
  const previewIsCurrent = preview?.selectionKey === selectionKey;

  const requestPreview = async () => {
    setBusy(true);
    setMessage('');
    setPreview(null);
    try {
      const result = await postRollbackPreview(
        historicalDate,
        historicalTime,
        canvasId,
        topLeft,
        bottomRight,
      );
      setPreview({ ...result, selectionKey });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const commitRollback = async () => {
    if (!previewIsCurrent || !preview?.token
      || !window.confirm(t`Confirm rollback of this area?`)
    ) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      setMessage(await confirmRollback(preview.token));
      setPreview(null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content">
      <h2>{t`Rollback to date`}</h2>
      <p>{t`Choose the area and a backup date/time. Preview both images before confirming.`}</p>
      {!window.ssv?.backupurl && (
        <p className="warn">
          {t`No history backups are configured; rollback is unavailable.`}
        </p>
      )}
      <p>
        {t`Choose Canvas`}:&nbsp;
        <select
          value={canvasId}
          onChange={(event) => {
            dispatch(selectCanvas(event.target.value));
            setPreview(null);
            setMessage('');
          }}
        >
          {Object.keys(canvases)
            .filter((id) => !canvases[id].v)
            .map((id) => (
              <option key={id} value={id}>{canvases[id].title}</option>
            ))}
        </select>
      </p>
      <h3>{t`Backup date and time`}</h3>
      <HistorySelect id="rollback-history-select" />
      <p>
        {t`Top-left corner`}:&nbsp;
        <input
          value={topLeft}
          style={{ display: 'inline-block', width: '100%', maxWidth: '15em' }}
          type="text"
          placeholder="X_Y or URL"
          onInput={(event) => {
            setTopLeft(normalizeCoordinates(event.target.value));
            setPreview(null);
            setMessage('');
          }}
        />
      </p>
      <p>
        {t`Bottom-right corner`}:&nbsp;
        <input
          value={bottomRight}
          style={{ display: 'inline-block', width: '100%', maxWidth: '15em' }}
          type="text"
          placeholder="X_Y or URL"
          onInput={(event) => {
            setBottomRight(normalizeCoordinates(event.target.value));
            setPreview(null);
            setMessage('');
          }}
        />
      </p>
      <p>
        <button
          type="button"
          disabled={busy || !canvasId || !window.ssv?.backupurl
            || !historicalDate || !historicalTime || !topLeft || !bottomRight}
          onClick={requestPreview}
        >
          {busy ? t`Loading` : t`Preview`}
        </button>
      </p>
      {preview && (
        <>
          <p>
            {`${preview.width}×${preview.height} · `}
            {t`Pixels that will change`}: {preview.changedPixels}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            <section>
              <h3>{t`Before`}</h3>
              <img
                src={preview.before}
                alt={t`Current canvas area`}
                style={{
                  display: 'block',
                  imageRendering: 'pixelated',
                  maxHeight: '60vh',
                  maxWidth: '100%',
                  objectFit: 'contain',
                }}
              />
            </section>
            <section>
              <h3>{t`After`}</h3>
              <img
                src={preview.after}
                alt={t`Canvas area after rollback`}
                style={{
                  display: 'block',
                  imageRendering: 'pixelated',
                  maxHeight: '60vh',
                  maxWidth: '100%',
                  objectFit: 'contain',
                }}
              />
            </section>
          </div>
          {!previewIsCurrent && (
            <p className="warn">
              {t`Selection changed. Generate a new preview before confirming.`}
            </p>
          )}
          <p>
            <button
              type="button"
              disabled={busy || !previewIsCurrent}
              onClick={commitRollback}
            >
              {t`Confirm rollback`}
            </button>
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export default RollbackTools;
