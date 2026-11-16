import { useEffect, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { t } from 'ttag';

import PpfunCaptcha from './PpfunCaptcha.jsx';
import TurnstileCaptcha from './TurnstileCaptcha.jsx';
import socketClient from '../socket/SocketClient.js';
import { api } from '../utils/utag.js';

const GlobalCaptcha = ({ close }) => {
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [provider, setProvider] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [legit, setLegit] = useState(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [captKey, setCaptKey] = useState(() => Date.now());
  const formRef = useRef(null);
  const submittedTokenRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    fetch(api`/api/turnstile`, { cache: 'no-store' })
      .then(async (response) => {
        const config = await response.json();
        if (!response.ok) {
          throw new Error(config.error || 'Could not load CAPTCHA settings.');
        }
        if (!['ppfun', 'turnstile'].includes(config.provider)) {
          throw new Error('Unsupported CAPTCHA provider.');
        }
        if (!cancelled) {
          setProvider(config.provider);
        }
      })
      .catch((configLoadError) => {
        if (!cancelled) {
          setConfigError(configLoadError.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (provider === 'turnstile' && ready && token
      && submittedTokenRef.current !== token
    ) {
      submittedTokenRef.current = token;
      formRef.current?.requestSubmit();
    }
  }, [provider, ready, token]);

  return (
    <form
      ref={formRef}
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting || !ready || !provider) {
          return;
        }
        setSubmitting(true);
        try {
          if (provider === 'turnstile') {
            const response = await fetch(api`/api/turnstile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ token }),
            });
            const result = await response.json();
            if (!response.ok) {
              throw new Error(
                result.error || 'Turnstile verification failed.',
              );
            }
          } else {
            if (!legit) {
              throw new Error('Please enter the CAPTCHA answer.');
            }
            const captchaId = event.target.captchaid.value;
            let challengeSolution = event.target.challengesolution.value;
            if (challengeSolution) {
              challengeSolution = Number(challengeSolution);
            }
            const retCode = await socketClient.sendCaptchaSolution(
              event.target.captcha.value.trim(),
              captchaId,
              challengeSolution,
            );
            if (retCode !== 0) {
              const errors = {
                1: t`You took too long, try again.`,
                2: t`You failed your captcha`,
                3: t`No or invalid captcha text`,
                4: t`Your device looks weird`,
                6: t`Your Browser looks shady`,
              };
              throw new Error(errors[retCode] || t`Unknown Captcha Error`);
            }
          }
          close();
          return;
        } catch (submitError) {
          setError(submitError.message);
        }
        setSubmitting(false);
        setReady(false);
        setToken('');
        setLegit(false);
        setCaptKey(Date.now());
      }}
    >
      {(error || configError) && (
        <p className="errormessage" role="alert">
          <span>{t`Error`}</span>:&nbsp;{error || configError}
        </p>
      )}
      {provider === 'turnstile' && (
        <TurnstileCaptcha
          key={captKey}
          onReadyStateChange={setReady}
          onTokenChange={setToken}
        />
      )}
      {provider === 'ppfun' && (
        <PpfunCaptcha
          autoload
          key={captKey}
          onReadyStateChange={setReady}
          setLegit={setLegit}
        />
      )}
      {!provider && !configError && <p>{t`Loading CAPTCHA...`}</p>}
      {provider !== 'turnstile' && (
        <p>
          <button type="button" onClick={close}>
            {t`Cancel`}
          </button>
          &nbsp;
          <button
            type="submit"
            disabled={submitting || !ready || !provider}
          >
            {(submitting || !ready || !provider) ? '...' : t`Verify`}
          </button>
        </p>
      )}
    </form>
  );
};

export default memo(GlobalCaptcha);
