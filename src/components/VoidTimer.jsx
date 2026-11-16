
import { useState, useEffect } from 'preact/hooks';

const VOID_URL = 'https://pixelstates.fun/void';

const VoidTimer = () => {
  const [target, setTarget] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchVoid = async () => {
      try {
        const response = await fetch(VOID_URL, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Request failed');
        }

        const text = await response.text();

        // Get Void countdown
        const match = text.match(
          /Next void at\s+(.+?)(?:\s*<|$)/i,
        );

        if (match) {
          const date = Date.parse(match[1]);

          if (Number.isNaN(date)) {
            throw new Error('Invalid date');
          }

          if (active) {
            setTarget(date);
            setError(false);
          }
        }

        // Get Void coordinates if provided by the endpoint
        const locationMatch = text.match(
          /(?:https?:\/\/pixelstates\.fun)?\/?#d,(-?\d+),(-?\d+),(\d+)/i,
        );

        if (locationMatch && active) {
          const [, x, y, zoom] = locationMatch;

          setLocation(
            `https://pixelstates.fun/#d,${x},${y},${zoom}`,
          );
        } else if (active) {
          setLocation(null);
        }

        if (!match) {
          throw new Error('Invalid date');
        }
      } catch (err) {
        if (active) {
          setError(true);
        }
      }
    };

    fetchVoid();

    const interval = window.setInterval(fetchVoid, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!target) return undefined;

    const update = () => {
      setRemaining(Math.max(0, target - Date.now()));
    };

    update();

    const interval = window.setInterval(update, 1000);

    return () => window.clearInterval(interval);
  }, [target]);

  const formatTime = (ms) => {
    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return [hours, minutes, seconds]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  };

  return (
    <div className="void-timer">
      {error || remaining === null ? (
        <span>Loading Void timer...</span>
      ) : remaining === 0 ? (
        <span>VOID HAS STARTED!</span>
      ) : (
        <>
          <strong>{formatTime(remaining)}</strong>
          <span>left for void</span>
        </>
      )}

      {location && (
        <a
          href={location}
          target="_blank"
          rel="noopener noreferrer"
          className="void-location"
        >
          <span>📍 View Void Location</span>
        </a>
      )}
    </div>
  );
};

export default VoidTimer;
