import { useEffect, useState } from 'preact/hooks';
import { useDispatch } from '../store/react-redux/index.js';
import { t } from 'ttag';

import { api } from '../utils/utag.js';
import { notify } from '../store/actions/thunks.js';

/* eslint-disable jsx-a11y/media-has-caption */

const TimelapseMaker = () => {
  const [canvases, setCanvases] = useState([]);
  const [canvasId, setCanvasId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startXY, setStartXY] = useState('0, 0');
  const [endXY, setEndXY] = useState('100, 100');
  const [fps, setFps] = useState('12');
  const [frameskip, setFrameskip] = useState('3');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, stage: '' });
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const dispatch = useDispatch();

  const getLocalizedStage = (stage) => {
    switch (stage) {
      case 'Preparing history':
        return t`Preparing history`;
      case 'Loading historical frames':
        return t`Loading historical frames`;
      case 'Creating video':
        return t`Creating video`;
      case 'Finishing up':
        return t`Finishing up`;
      case 'Completed':
        return t`Completed`;
      default:
        return stage;
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(api`/api/canvases`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t`Could not load canvases`);
        }
        return response.json();
      })
      .then(({ canvases: data, defaultCanvas }) => {
        if (cancelled) {
          return;
        }
        const available = Object.entries(data)
          .filter(([, canvas]) => !canvas.v && !canvas.hid && !canvas.ed)
          .map(([id, canvas]) => ({
            id,
            title: canvas.title || t`Canvas ${id}`,
          }));
        setCanvases(available);
        setCanvasId(String(defaultCanvas || available[0]?.id || ''));
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
  }, [videoUrl]);

  async function submit(event) {
    event.preventDefault();
    if (loading) {
      return;
    }
    const parseCoordinates = (value) => {
      const match = value.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);
      return match ? [Number(match[1]), Number(match[2])] : null;
    };
    const startCoordinates = parseCoordinates(startXY);
    const endCoordinates = parseCoordinates(endXY);
    if (!startCoordinates || !endCoordinates) {
      setError(t`Enter coordinates as X, Y (for example: 12, 34).`);
      return;
    }
    setLoading(true);
    setProgress({ percent: 0, stage: t`Preparing history` });
    setError('');
    let notificationPermission;
    if ('Notification' in window && Notification.permission === 'default') {
      notificationPermission = Notification.requestPermission().catch(
        (permissionError) => {
          console.error(
            `Could not request notification permission: ${permissionError.message}`,
          );
          return 'denied';
        },
      );
    }
    setVideoUrl((oldUrl) => {
      if (oldUrl) {
        URL.revokeObjectURL(oldUrl);
      }
      return '';
    });
    const progressId = window.crypto.randomUUID();
    const progressTimer = window.setInterval(async () => {
      try {
        const progressResponse = await fetch(
          api`/api/timelapse/progress/${progressId}`,
          { credentials: 'include' },
        );
        if (!progressResponse.ok) {
          return;
        }
        const data = await progressResponse.json();
        setProgress({
          ...data,
          stage: getLocalizedStage(data.stage),
        });
      } catch (progressError) {
        console.error(`Could not read timelapse progress: ${progressError.message}`);
        window.clearInterval(progressTimer);
      }
    }, 1500);
    try {
      const response = await fetch(api`/api/timelapse`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvasId,
          startDate,
          endDate,
          x: startCoordinates[0],
          y: startCoordinates[1],
          endX: endCoordinates[0],
          endY: endCoordinates[1],
          fps: Number(fps),
          frameskip: Number(frameskip),
          progressId,
        }),
      });
      if (!response.ok) {
        let message = t`Could not create the timelapse`;
        try {
          const data = await response.json();
          message = data.errors?.[0] || message;
        } catch {
          // Keep the generic error if the server did not return JSON.
        }
        throw new Error(message);
      }
      const completedVideoUrl = URL.createObjectURL(await response.blob());
      setVideoUrl(completedVideoUrl);
      setProgress({ percent: 100, stage: t`Completed` });
      dispatch(notify(t`Your timelapse is ready to view and download.`));
      if ('Notification' in window) {
        const permission = notificationPermission
          ? await notificationPermission
          : Notification.permission;
        if (permission === 'granted') {
          const browserNotification = new Notification(
            t`Your timelapse is ready`,
            { body: t`Return to the game to watch or download it.` },
          );
          browserNotification.onclick = () => {
            window.focus();
            browserNotification.close();
          };
        }
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      window.clearInterval(progressTimer);
      setLoading(false);
    }
  }

  return (
    <section className="userarea-panel">
      <h3>{t`Timelapse maker`}</h3>
      <p>{t`Choose any area on the canvas and up to 7 days.`}</p>
      <p>{t`A timelapse can be created once every 30 minutes.`}</p>
      <form onSubmit={submit}>
        <label>
          {t`Canvas`}
          <select
            value={canvasId}
            onChange={(event) => setCanvasId(event.currentTarget.value)}
            required
          >
            {canvases.map(({ id, title }) => (
              <option key={id} value={id}>{title}</option>
            ))}
          </select>
        </label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
        >
          <label>
            {t`Start XY`}
            <input
              type="text"
              value={startXY}
              onInput={(event) => setStartXY(event.currentTarget.value)}
              placeholder={t`X, Y`}
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>
          <label>
            {t`End XY`}
            <input
              type="text"
              value={endXY}
              onInput={(event) => setEndXY(event.currentTarget.value)}
              placeholder={t`X, Y`}
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label>
            {t`Start date`}
            <input
              type="date"
              value={startDate}
              onInput={(event) => setStartDate(event.currentTarget.value)}
              required
            />
          </label>
          <label>
            {t`End date`}
            <input
              type="date"
              value={endDate}
              onInput={(event) => setEndDate(event.currentTarget.value)}
              required
            />
          </label>
          <label>
            {t`FPS`}
            <input
              type="number"
              min="1"
              max="30"
              value={fps}
              onInput={(event) => setFps(event.currentTarget.value)}
              required
            />
          </label>
          <label>
            {t`Frame skip`}
            <input
              type="number"
              min="1"
              max="24"
              value={frameskip}
              onInput={(event) => setFrameskip(event.currentTarget.value)}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={loading || !canvases.length}>
          {loading ? t`Creating timelapse...` : t`Create timelapse`}
        </button>
      </form>
      {loading && (
        <div className="timelapse-progress" aria-live="polite">
          <div className="timelapse-progress-label">
            <span>{progress.stage}</span>
            <span>{progress.percent}%</span>
          </div>
          <progress
            max="100"
            value={progress.percent}
            aria-label={t`Timelapse creation progress`}
          />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {videoUrl && (
        <div style={{ marginTop: 16 }}>
          <video
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 512,
              maxHeight: 512,
              marginBottom: 10,
              background: '#111',
              borderRadius: 6,
            }}
          >
            {t`Your browser cannot preview this timelapse video.`}
          </video>
          <a
            href={videoUrl}
            download="pixelstates-timelapse.mp4"
            className="button"
          >
            {t`Download timelapse video`}
          </a>
        </div>
      )}
    </section>
  );
};

export default TimelapseMaker;
