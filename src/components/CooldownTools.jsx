import { useState, useEffect, useCallback } from 'preact/hooks';
import { memo } from 'preact/compat';
import { t } from 'ttag';

import { api } from '../utils/utag.js';
import { useSelector } from '../store/react-redux/index.js';
import { USERLVL } from '../core/constants.js';

function formatCooldown(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value)) return '0s';
  const seconds = (value / 1000).toFixed(3).replace(/\.?0+$/, '');
  return seconds + 's';
}

function CooldownTools() {
  const userlvl = useSelector((state) => state.user.userlvl);
  const canvases = useSelector((state) => state.canvas.canvases);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resp, setResp] = useState(null);
  const [canvasId, setCanvasId] = useState('');

  // Permanent state from server
  const [permState, setPermState] = useState({
    isCustom: false,
    userCooldown: 1000,
    vipCooldown: 500,
    cds: 60000,
    baseCooldown: 500,
    vipBaseCooldown: 250,
    vipPlusCooldown: 450,
    vipPlusPlusCooldown: 400,
    updatedAt: null,
  });

  // Form inputs
  const [userCd, setUserCd] = useState(1000);
  const [vipCd, setVipCd] = useState(500);
  const [baseCd, setBaseCd] = useState(500);
  const [vipBaseCd, setVipBaseCd] = useState(250);
  const [cooldownReserve, setCooldownReserve] = useState(60);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [vipPlusCd, setVipPlusCd] = useState(450);
  const [vipPlusPlusCd, setVipPlusPlusCd] = useState(400);

  const loadData = useCallback(async () => {
    try {
      const data = new FormData();
      data.append('getcooldowninfo', 'true');
      data.append('canvasid', canvasId);
      const res = await fetch(api`/api/modtools`, {
        credentials: 'include',
        method: 'POST',
        body: data,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.permanent) {
          const selectedState = json.permanent;
          const nextUserCd = selectedState.userCooldown ?? 1000;
          const nextVipCd = selectedState.vipCooldown ?? 500;
          setPermState(selectedState);
          setUserCd(nextUserCd);
          setVipCd(nextVipCd);
          setBaseCd(selectedState.baseCooldown ?? Math.round(nextUserCd * 0.5));
          setVipBaseCd(
            selectedState.vipBaseCooldown ?? Math.round(nextVipCd * 0.5),
          );
          setCooldownReserve((selectedState.cds ?? 60000) / 1000);
          setVipPlusCd(selectedState.vipPlusCooldown
            ?? Math.round(nextVipCd * 0.9));
          setVipPlusPlusCd(selectedState.vipPlusPlusCooldown
            ?? Math.round(nextVipCd * 0.8));
        }
      }
    } catch (err) {
      console.error('Failed to load cooldown info:', err);
    } finally {
      setLoading(false);
    }
  }, [canvasId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const applyPreset = (u, v) => {
    setUserCd(u);
    setVipCd(v);
    setVipPlusCd(Math.round(v * 0.9));
    setVipPlusPlusCd(Math.round(v * 0.8));
  };

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('setpermanentcooldown', 'true');
      data.append('canvasid', canvasId);
      data.append('usercd', String(userCd));
      data.append('vipcd', String(vipCd));
      data.append('cds', String(Math.round(cooldownReserve * 1000)));
      data.append('basecd', String(baseCd));
      data.append('vipbasecd', String(vipBaseCd));
      data.append('vippluscd', String(vipPlusCd));
      data.append('vippluspluscd', String(vipPlusPlusCd));

      const res = await fetch(api`/api/modtools`, {
        credentials: 'include',
        method: 'POST',
        body: data,
      });
      const text = await res.text();
      setResp(text);
      await loadData();
    } catch (err) {
      setResp(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('resetpermanentcooldown', 'true');
      data.append('canvasid', canvasId);
      const res = await fetch(api`/api/modtools`, {
        credentials: 'include',
        method: 'POST',
        body: data,
      });
      const text = await res.text();
      setResp(text);
      await loadData();
    } catch (err) {
      setResp(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (userlvl < USERLVL.ADMIN) {
    return (
      <div className="content">
        <h1>{t`Not Allowed`}</h1>
      </div>
    );
  }

  return (
    <div className="content margin-container">
      <h3> {t`Permanent Cooldown Settings`}</h3>
      <p>
        {t`Set permanent pixel cooldowns for all canvases or for one selected canvas.`}
      </p>

      <label style={{ display: 'block', margin: '10px 0' }}>
        <strong>{t`Canvas Selection`}:</strong>&nbsp;
        <select
          value={canvasId}
          onChange={(e) => setCanvasId(e.currentTarget.value)}
          disabled={submitting}
        >
          <option value="">{t`All canvases`}</option>
          {Object.entries(canvases || {}).map(([id, canvas]) => (
            <option key={id} value={id}>{canvas.name || id}</option>
          ))}
        </select>
      </label>
      {!Object.keys(canvases || {}).length && (
        <p>{t`Canvas list is not available yet. Please refresh the page.`}</p>
      )}

      {resp && (
        <div className="respbox">
          <p>{resp}</p>
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

      {/* Current Permanent Status Card */}
      <div style={{
        padding: '10px 14px',
        margin: '12px 0',
        backgroundColor: permState.isCustom ? 'rgba(33, 150, 243, 0.15)' : 'rgba(128, 128, 128, 0.15)',
        border: `1px solid ${permState.isCustom ? '#2196F3' : '#888'}`,
        borderRadius: '4px',
      }}>
        <h4 style={{ margin: '0 0 8px 0' }}>
          {t`Current Setting`}:&nbsp;
          {permState.isCustom ? (
            <span style={{ color: '#2196F3', fontWeight: 'bold' }}>
              {t`Custom (Permanent)`}
            </span>
          ) : (
            <span style={{ color: '#aaa', fontWeight: 'bold' }}>
              {t`Default (1s User / 0.5s VIP)`}
            </span>
          )}
        </h4>

        <p style={{ margin: '4px 0' }}>
          <strong>{t`Regular Users Occupied Pixel Cooldown`}:</strong>&nbsp;
          <span>{formatCooldown(permState.userCooldown)}</span>
        </p>

        <p style={{ margin: '4px 0' }}>
          <strong>{t`VIP Cooldown Pixel`}:</strong>&nbsp;
          <span>{formatCooldown(permState.vipCooldown)}</span>
        </p>

        <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#aaa' }}>
          {t`Blank Pixel Cooldown`}: {formatCooldown(permState.baseCooldown)} (VIP: {formatCooldown(permState.vipBaseCooldown)})
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>{t`Cooldown Reserve`}:</strong>&nbsp;
          {formatCooldown(permState.cds)}
        </p>
      </div>

      <div className="modaldivider" />

      <h4> {t`Change Cooldown Permanently`}</h4>

      {/* Preset Quick Buttons */}
      <p style={{ margin: '8px 0' }}>
        <strong>{t`Presets`}:</strong>&nbsp;
        <button
          type="button"
          onClick={() => applyPreset(1000, 500)}
          style={{ marginRight: '6px', fontSize: '0.9em' }}
        >
          {t`Default`} (1s User / 0.5s VIP)
        </button>
        <button
          type="button"
          onClick={() => applyPreset(500, 250)}
          style={{ marginRight: '6px', fontSize: '0.9em' }}
        >
          {t`Fast`} (0.5s / 0.25s VIP)
        </button>
        <button
          type="button"
          onClick={() => applyPreset(2000, 1000)}
          style={{ marginRight: '6px', fontSize: '0.9em' }}
        >
          {t`Slow`} (2s / 1s VIP)
        </button>
      </p>

      {/* Form Fields */}
      <div style={{ margin: '10px 0' }}>
        <label style={{ display: 'block', margin: '8px 0' }}>
          <strong>{t`Regular Users Occupied Pixel Cooldown (ms)`}:</strong><br />
          <input
            type="number"
            min="0"
            max="600000"
            step="50"
            value={userCd}
            onInput={(e) => setUserCd(Number(e.currentTarget.value))}
            style={{ width: '160px', marginTop: '4px' }}
          />&nbsp;ms
          <span style={{ fontSize: '0.85em', color: '#aaa', marginLeft: '8px' }}>
            ({formatCooldown(userCd)})
          </span>
        </label>

        <label style={{ display: 'block', margin: '8px 0' }}>
          <strong>
            {t`VIP Cooldown Pixel (ms)`}:
          </strong><br />
          <input
            type="number"
            min="0"
            max="600000"
            step="50"
            value={vipCd}
            onInput={(e) => setVipCd(Number(e.currentTarget.value))}
            style={{ width: '160px', marginTop: '4px' }}
          />&nbsp;ms
          <span style={{ fontSize: '0.85em', color: '#aaa', marginLeft: '8px' }}>
            ({formatCooldown(vipCd)})
          </span>
        </label>
      </div>

      <label style={{ display: 'block', margin: '8px 0' }}>
        <strong>{t`Cooldown Reserve (seconds)`}:</strong><br />
        <input
          type="number"
          min="0"
          max="600"
          step="0.1"
          value={cooldownReserve}
          onInput={(e) => setCooldownReserve(Number(e.currentTarget.value))}
          style={{ width: '160px', marginTop: '4px' }}
        />&nbsp;s
        <span style={{ fontSize: '0.85em', color: '#aaa', marginLeft: '8px' }}>
          ({formatCooldown(cooldownReserve * 1000)})
        </span>
      </label>

      <p style={{ margin: '4px 0', fontSize: '0.85em', color: '#888' }}>
        {t`Prince (VIP) uses this cooldown as its base.`}<br />
        {t`King and Emperor have separate cooldown settings.`}<br />
        {t`Void applies each tier's multiplier.`}
      </p>

      <div style={{
        margin: '10px 0',
        padding: '10px',
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: '4px',
      }}>
        <strong>{t`Blank Pixel Cooldowns`}</strong>
        <p style={{ margin: '4px 0 8px', color: '#aaa' }}>
          {t`Set blank pixel cooldowns independently from occupied pixel cooldowns.`}
        </p>
        <label style={{ display: 'block', margin: '6px 0' }}>
          {t`Regular users (ms)`}:<br />
          <input
            type="number"
            min="0"
            max="600000"
            step="50"
            value={baseCd}
            onInput={(e) => setBaseCd(Number(e.currentTarget.value))}
            style={{ width: '160px', marginTop: '4px' }}
          />&nbsp;ms <span style={{ color: '#aaa' }}>
            ({formatCooldown(baseCd)})
          </span>
        </label>
        <label style={{ display: 'block', margin: '6px 0' }}>
          {t`Prince (VIP) (ms)`}:<br />
          <input
            type="number"
            min="0"
            max="600000"
            step="50"
            value={vipBaseCd}
            onInput={(e) => setVipBaseCd(Number(e.currentTarget.value))}
            style={{ width: '160px', marginTop: '4px' }}
          />&nbsp;ms <span style={{ color: '#aaa' }}>
            ({formatCooldown(vipBaseCd)})
          </span>
        </label>
        <p style={{ margin: '4px 0', color: '#aaa' }}>
          {t`VIP stack limits: Prince 10 min, King 14 min, Emperor 20 min.`}
        </p>
      </div>

      {/* Advanced Settings Toggle */}
      <div style={{ margin: '14px 0' }}>
        <span
          role="button"
          tabIndex={-1}
          className="modallink"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? `▼ ${t`Hide Advanced Settings`}` : ` ${t`Show Advanced Settings (King, Emperor)`}`}
        </span>

        {showAdvanced && (
          <div style={{
            marginTop: '8px',
            padding: '10px',
            backgroundColor: 'rgba(0,0,0,0.1)',
            borderRadius: '4px',
          }}>
            <label style={{ display: 'block', margin: '6px 0' }}>
              {t`King (VIP+) Cooldown (ms), defaults to about 90% of VIP cooldown`}:
              <br />
              <input
                type="number"
                min="0"
                max="600000"
                placeholder={String(Math.round(vipCd * 0.9))}
                value={vipPlusCd}
                onInput={(e) => setVipPlusCd(Number(e.currentTarget.value))}
                style={{ width: '140px' }}
              />&nbsp;ms<span style={{ fontSize: '0.85em', color: '#aaa', marginLeft: '8px' }}>({formatCooldown(vipPlusCd)})</span>
            </label>

            <label style={{ display: 'block', margin: '6px 0' }}>
              {t`Emperor (VIP++) Cooldown (ms), defaults to about 80% of VIP cooldown`}:
              <br />
              <input
                type="number"
                min="0"
                max="600000"
                placeholder={String(Math.round(vipCd * 0.8))}
                value={vipPlusPlusCd}
                onInput={(e) => setVipPlusPlusCd(Number(e.currentTarget.value))}
                style={{ width: '140px' }}
              />&nbsp;ms<span style={{ fontSize: '0.85em', color: '#aaa', marginLeft: '8px' }}>({formatCooldown(vipPlusPlusCd)})</span>
            </label>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ marginTop: '16px' }}>
        <button
          type="button"
          disabled={submitting || loading || userCd < 0 || vipCd < 0
            || baseCd < 0 || baseCd > 600000
            || vipBaseCd < 0 || vipBaseCd > 600000
            || cooldownReserve < 0 || cooldownReserve > 600}
          onClick={handleSave}
          style={{
            padding: '8px 18px',
            fontSize: '1em',
            fontWeight: 'bold',
            marginRight: '8px',
          }}
        >
          {submitting ? '...' : ` ${t`Apply Permanently`}`}
        </button>

        <button
          type="button"
          disabled={submitting || loading}
          onClick={handleReset}
          style={{
            padding: '8px 14px',
            fontSize: '1em',
          }}
        >
          {submitting ? '...' : ` ${t`Reset to Defaults`}`}
        </button>
      </div>

      <br />
      <p style={{ fontSize: '0.85em', color: '#888' }}>
        {t`These settings are stored permanently and take effect immediately for the selected canvas.`}
      </p>
    </div>
  );
}

export default memo(CooldownTools);
