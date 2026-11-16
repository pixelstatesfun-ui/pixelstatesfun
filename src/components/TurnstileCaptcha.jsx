import { useEffect, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { t } from 'ttag';
import getTurnstileSiteKey from '../utils/turnstileSiteKey.js';
import { api } from '../utils/utag.js';

let turnstileLoader;

function loadTurnstile() {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (!turnstileLoader) {
    turnstileLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error('Turnstile did not load.'));
        }
      };
      script.onerror = () => reject(new Error('Could not load Turnstile.'));
      document.head.appendChild(script);
    }).catch((error) => {
      turnstileLoader = null;
      throw error;
    });
  }
  return turnstileLoader;
}

const TurnstileCaptcha = ({ onReadyStateChange, onTokenChange }) => {
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    onReadyStateChange(false);
    onTokenChange('');

    async function initializeWidget() {
      try {
        const configResponse = await fetch(api`/api/turnstile`, {
          cache: 'no-store',
          credentials: 'include',
        });
        const config = await configResponse.json();
        if (!configResponse.ok) {
          throw new Error(config.error || 'Could not load Turnstile settings.');
        }
        const sitekey = getTurnstileSiteKey();
        if (!sitekey) {
          throw new Error(
            'Turnstile site key is missing from this client build. '
            + 'Rebuild after configuring TURNSTILE_SITE_KEY.',
          );
        }
        const turnstile = await loadTurnstile();
        if (cancelled || !containerRef.current) {
          return;
        }
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey,
          action: config.action,
          callback: (token) => {
            onTokenChange(token);
            onReadyStateChange(true);
          },
          'expired-callback': () => {
            onTokenChange('');
            onReadyStateChange(false);
          },
          'error-callback': () => {
            onTokenChange('');
            onReadyStateChange(false);
            setError(t`Turnstile could not verify this browser. Please retry.`);
          },
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    initializeWidget();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [onReadyStateChange, onTokenChange]);

  return (
    <section
      className="captcha-widget turnstile-captcha"
      aria-label={t`Human verification`}
    >
      {error && (
        <p className="errormessage" role="alert">
          <span>{t`Error`}</span>:&nbsp;{error}
        </p>
      )}
      <div className="captcha-frame">
        <div ref={containerRef} />
      </div>
    </section>
  );
};

export default memo(TurnstileCaptcha);
