/*
 * Form to ask for PPFUN captcha.
 * Offers input for captchas, parent needs to provide a form and
 * get "captcha" and "captchaid" values
 */

/* eslint-disable jsx-a11y/no-autofocus */

import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { memo } from 'preact/compat';
import { t } from 'ttag';
import useInterval from './hooks/interval.js';
import { api } from '../utils/utag.js';
import { getRandomString } from '../core/utils.js';

async function getUrlAndId() {
  const url = api`/captcha.svg`;
  try {
    const resp = await fetch(url, {
      cache: 'no-cache',
    });
    if (resp.ok) {
      const captchaid = resp.headers.get('captcha-id');
      const challengeNeeded = resp.headers.get('challenge-needed') === '1';
      const svg = await resp.text();
      return [svg, captchaid, challengeNeeded];
    }
  } catch {
    // nothing
  }
  return null;
}

/*
 * autoload: Load captcha immediately and autofocus input textbox
 * width: width of the captcha image
 * isOneTime: if its used one single time for a specific action, rather than
 *   cached sitewide
 */
const Captcha = ({
  autoload, width, setLegit, onReadyStateChange, isOneTime,
}) => {
  const [captchaData, setCaptchaData] = useState({});
  const [challengeSolution, setChallengeSolution] = useState(null);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [animationRunning, setAnimationRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  const svgContainerRef = useRef();

  const reloadCaptcha = useCallback(async () => {
    /*
     * load Cahptcha
     */
    if (loading) {
      return;
    }
    setLoading(true);
    setCaptchaData({});
    setAnimationRunning(false);
    const captchaResponse = await getUrlAndId(isOneTime);
    setLoading(false);
    if (!captchaResponse) {
      setErrors([t`Could not load captcha`]);
      return;
    }
    const [svg, captchaid, challengeNeeded] = captchaResponse;

    /*
     * solve JS Challenge in Worker on first load
     */
    if ((challengeNeeded || isOneTime) && challengeSolution === null) {
      const worker = new Worker(`/challenge.js?cb=${getRandomString()}`);
      // TODO Timeout
      worker.onmessage = (e) => {
        setChallengeSolution(e.data);
        worker.terminate();
      };
      // empty string for waiting
      setChallengeSolution('');
    }

    setCaptchaData({ svg, id: captchaid });
    setErrors([]);
  }, [challengeSolution, loading, isOneTime]);

  useEffect(() => {
    /*
     * prepare svg for animated elements
     */
    if (captchaData.svg) {
      const svgElement = svgContainerRef.current.firstChild;
      svgElement.style.width = '100%';
      svgElement.style.height = '100%';
      let cnt = 0;
      const transforms = {};
      svgElement.childNodes.forEach((c) => {
        if (c.tagName === 'path') {
          const tr = c.getAttribute('transform');
          if (tr) {
            /*
            * heavily assume 'rotate(a, x, y)',
            * will break otherwise.
            */
            const [angle, x, y] = tr.slice(7, -1).split(',').map(
              (z) => Number(z),
            );
            let id;
            do {
              id = `ap${cnt}`;
              cnt += 1;
            } while (document.getElementById(id));
            c.id = id;
            transforms[id] = {
              x,
              y,
              clockwise: angle >= 0,
            };
          }
        }
      });
      if (Object.keys(transforms).length > 0) {
        setCaptchaData({ ...captchaData, transforms });
        setAnimationRunning(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captchaData.svg]);

  const stopAnimation = useCallback(() => {
    if (!animationRunning) {
      return;
    }
    setAnimationRunning(false);
    for (const id of Object.keys(captchaData.transforms)) {
      /*
       * heavily assume that first child is trnsformAnimate
       */
      document.getElementById(id).firstChild?.remove();
    }
  }, [animationRunning, captchaData.transforms]);

  const checkAnimationProgress = useCallback(() => {
    if (animationRunning && captchaData.transforms) {
      const firstId = Object.keys(captchaData.transforms)[0];
      const firstAnimatedPathElement = document.getElementById(firstId);
      if (!firstAnimatedPathElement) {
        return;
      }
      const firstPathAnimation = firstAnimatedPathElement.transform.animVal;
      if (firstPathAnimation.length) {
        const angle = Math.round(firstPathAnimation.getItem(0).angle);
        setAnimationProgress(angle);
      }
    }
  }, [animationRunning, captchaData.transforms]);

  useInterval(checkAnimationProgress, 25);

  useEffect(() => {
    if (autoload) {
      reloadCaptcha();
    }
  // intentionally only executed on first render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onReadyStateChange) {
      onReadyStateChange(challengeSolution !== '' && !!captchaData.id);
    }
  }, [challengeSolution, captchaData.id, onReadyStateChange]);

  const contWidth = width || 100;

  return (
    <section className="captcha-widget" aria-label={t`Human verification`}>
      <div className="captcha-heading">
        <div>
          <strong>{t`Human verification`}</strong>
          <p>{t`Enter the characters shown below to continue.`}</p>
        </div>
      </div>
      {errors.map((error) => (
        <p key={error} className="errormessage">
          <span>{t`Error`}</span>:&nbsp;{error}
        </p>
      ))}
      <div
        className="captcha-frame"
        style={{
          width: `${contWidth}%`,
        }}
      >
        {(captchaData.svg) ? (
          <div
            className="captcha-art"
            dangerouslySetInnerHTML={{ __html: captchaData.svg }}
            title="CAPTCHA"
            ref={svgContainerRef}
            key="svgc"
          />
        )
          : (
              <button
                type="button"
                title={t`Load Captcha`}
                className="captcha-placeholder"
                onClick={reloadCaptcha}
                key="caplt"
              >
                {loading ? t`Loading challenge...` : t`Load challenge`}
              </button>
            )}
        {captchaData.transforms && (
          <input
            className="captcha-slider"
            aria-label={t`Rotate the moving characters until they are upright`}
            type="range"
            min="0"
            max="360"
            value={animationProgress}
            onMouseDown={stopAnimation}
            onTouchStart={stopAnimation}
            onChange={(evt) => {
              const { value } = evt.target;
              for (const [id, vals] of Object.entries(captchaData.transforms)) {
                document.getElementById(id).transform.baseVal.getItem(0)
                  .setRotate((vals.clockwise) ? value : -value, vals.x, vals.y);
              }
              setAnimationProgress(value);
            }}
          />
        )}
      </div>
      <input
        className="captcha-answer"
        name="captcha"
        placeholder={t`Enter Characters`}
        type="text"
        maxLength={6}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        aria-label={t`Captcha answer`}
        onChange={() => setLegit && setLegit(true)}
        autoFocus={autoload}
      />
      <input type="hidden" name="captchaid" value={captchaData.id || '0'} />
      <input
        type="hidden"
        name="challengesolution"
        value={challengeSolution || ''}
      />
      <p className="captcha-footnote">
        {t`Characters are not case-sensitive. I and l are treated the same.`}
      </p>
    </section>
  );
};

export default memo(Captcha);
