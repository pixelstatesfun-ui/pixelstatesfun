/**
 *
 */

import { Fragment } from 'preact';
import { t } from 'ttag';

import { cdn } from '../utils/utag.js';
import { THREE_CANVAS_HEIGHT } from '../core/constants.js';
import { getVipCooldownMultiplier } from '../core/vip.js';


function formatCooldown(ms) {
  if (ms === null || ms === undefined) return '0s';
  const value = Number(ms);
  if (!Number.isFinite(value)) return '0s';
  return `${Number((value / 1000).toFixed(3))}s`;
}

const CanvasItem = ({
  canvasId, canvas, selCanvas, online, vipTier, vipEnabled,
  voidActive,
  vipCooldownMultiplier, vipPlusCooldownMultiplier,
  vipPlusPlusCooldownMultiplier,
  vipBaseCooldownMultiplier, vipPlusBaseCooldownMultiplier,
  vipPlusPlusBaseCooldownMultiplier,
}) => {
  const vipMultiplier = getVipCooldownMultiplier(
    vipTier, vipEnabled,
    vipCooldownMultiplier, vipPlusCooldownMultiplier,
    vipPlusPlusCooldownMultiplier,
  );
  const vipBaseMultiplier = getVipCooldownMultiplier(
    vipTier,
    vipEnabled,
    vipBaseCooldownMultiplier ?? vipCooldownMultiplier,
    vipPlusBaseCooldownMultiplier ?? vipPlusCooldownMultiplier,
    vipPlusPlusBaseCooldownMultiplier ?? vipPlusPlusCooldownMultiplier,
  );
  const cooldownsByVipTier = canvas.cooldownsByVipTier;
  const currentTier = vipEnabled ? vipTier : 0;
  const currentCooldowns = cooldownsByVipTier?.[currentTier] ?? null;
  const regularVoidMultiplier = (!vipEnabled || vipTier <= 0)
    && voidActive && String(canvasId) === '0' ? 0.5 : 1;
  const baseCooldown = currentCooldowns
    ? currentCooldowns.bcd : canvas.bcd * (
      vipEnabled && vipTier > 0 ? vipBaseMultiplier : regularVoidMultiplier
    );
  const hasPixelCooldown = canvas.pcd !== null && canvas.pcd !== undefined;
  const pixelCooldown = currentCooldowns
    ? currentCooldowns.pcd
    : hasPixelCooldown
      ? canvas.pcd * (
        vipEnabled && vipTier > 0 ? vipMultiplier : regularVoidMultiplier
      )
      : baseCooldown;
  return (
    <div
      className="cvbtn"
      onClick={() => selCanvas(canvasId)}
      role="button"
      tabIndex={0}
    >
      <img
        className="cvimg"
        alt="preview"
        src={cdn`/preview${canvasId}.png`}
      />
      <div className="modalcvtext">
        <h4>{canvas.title}</h4>
        {(online) && (
          <Fragment key="online">
            {t`Online Users`}:&nbsp;
            <span className="modalinfo">{online}</span><br />
          </Fragment>
        )}
        <span className="modalinfo">{canvas.desc}</span><br />
        {t`Cooldown`}:&nbsp;
        <span className="modalinfo">
          {(hasPixelCooldown && baseCooldown !== pixelCooldown)
            ? (
                <span key="cdf">
                  {formatCooldown(baseCooldown)} / {
                    formatCooldown(pixelCooldown)
                  }
                </span>
              )
            : <span key="cd"> {formatCooldown(baseCooldown)}</span>}
        </span><br />
        {t`Stacking till`}:&nbsp;
        <span className="modalinfo">
          {formatCooldown(canvas.cds ?? 60000)}
        </span><br />
        {t`Ranked`}:&nbsp;
        <span className="modalinfo">{
          (canvas.ranked) ? t`Yes` : t`No`
        }
        </span><br />
        {(canvas.req !== undefined) && (
          <Fragment key="req">
            <span>
              {t`Requirements`}:<br />
              <span className="modalinfo">
                {(typeof canvas.req === 'number')
                  ? <span>{t`User Account`} </span> : null}
                {(canvas.req > 0)
                  ? <span> {t`and ${canvas.req} Pixels set`} </span>
                  : null}
                {(canvas.req === 'top')
                  && <span>{t`Top 10 Daily Ranking`}</span>}
              </span>
            </span>
            <br />
          </Fragment>
        )}
        {t`Dimensions`}:&nbsp;
        <span className="modalinfo"> {canvas.size} x {canvas.size}
          {(canvas.v)
            ? <span key="voxsize"> x {THREE_CANVAS_HEIGHT} Voxels</span>
            : <span key="pxlsize"> Pixels</span>}
        </span>
      </div>
    </div>
  );
};

export default CanvasItem;
