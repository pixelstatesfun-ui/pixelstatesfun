import { useState, useEffect, useCallback } from 'preact/hooks';
import { memo } from 'preact/compat';
import { t } from 'ttag';

import { api } from '../utils/utag.js';
import { useSelector } from '../store/react-redux/index.js';
import { USERLVL } from '../core/constants.js';

function formatRemainingTime(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatCooldown(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value)) return '0s';
  const seconds = (value / 1000).toFixed(3).replace(/\.?0+$/, '');
  return seconds + 's';
}

function ChaosTools() {
  const userlvl = useSelector((state) => state.user.userlvl);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resp, setResp] = useState(null);

  // Chaos state from server
  const [chaosState, setChaosState] = useState({
    active: false,
    userCooldown: 1000,
    vipCooldown: 1000,
    baseCooldown: 500,
    vipBaseCooldown: 500,
    vipPlusCooldown: 900,
    vipPlusPlusCooldown: 800,
    durationMinutes: 30,
    endsAt: null,
    remainingMs: 0,
  });

  // Form inputs
  const [vipCd, setVipCd] = useState(1000);
  const [userCd, setUserCd] = useState(1000);
  const [duration, setDuration] = useState(30);

  // Advanced options toggle
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [baseCd, setBaseCd] = useState(500);
  const [vipBaseCd, setVipBaseCd] = useState(500);
  const [vipPlusCd, setVipPlusCd] = useState(900);
  const [vipPlusPlusCd, setVipPlusPlusCd] = useState(800);

  // Live timer for remaining time
  const [remainingMs, setRemainingMs] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const data = new FormData();
      data.append('getcooldowninfo', 'true');
      const res = await fetch(api`/api/modtools`, {
        credentials: 'include',
        method: 'POST',
        body: data,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.chaos) {
          setChaosState(json.chaos);
          setBaseCd(json.chaos.baseCooldown ?? 500);
          setVipBaseCd(json.chaos.vipBaseCooldown ?? 500);
          setVipPlusCd(json.chaos.vipPlusCooldown
            ?? Math.round((json.chaos.vipCooldown ?? 1000) * 0.9));
          setVipPlusPlusCd(json.chaos.vipPlusPlusCooldown
            ?? Math.round((json.chaos.vipCooldown ?? 1000) * 0.8));
          if (json.chaos.active && json.chaos.endsAt) {
            setRemainingMs(Math.max(0, json.chaos.endsAt - Date.now()));
          } else {
            setRemainingMs(0);
          }
          if (!json.chaos.active) {
            setVipCd(json.chaos.vipCooldown ?? 1000);
            setUserCd(json.chaos.userCooldown ?? 1000);
            setDuration(json.chaos.durationMinutes ?? 30);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load cooldown info:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update countdown every second when active
  useEffect(() => {
    if (!chaosState.active || !chaosState.endsAt) {
      return undefined;
    }
    const timer = setInterval(() => {
      const left = Math.max(0, chaosState.endsAt - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        clearInterval(timer);
        loadData();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [chaosState.active, chaosState.endsAt, loadData]);

  const applyPreset = (u, v, dur) => {
    setUserCd(u);
    setVipCd(v);
    setDuration(dur);
    setVipPlusCd(Math.round(v * 0.9));
    setVipPlusPlusCd(Math.round(v * 0.8));
  };

  const handleStartChaos = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('startchaos', 'true');
      data.append('usercd', String(userCd));
      data.append('vipcd', String(vipCd));
      data.append('duration', String(duration));
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

  const handleStopChaos = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('stopchaos', 'true');
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
      <h3> {t`Chaos Event`}</h3>
      <p>
        {t`Manage Chaos Event with reduced pixel cooldowns across all canvases.`}
      </p>

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

      {/* Current Event Status */}
      <div style={{
        padding: '10px 14px',
        margin: '12px 0',
        backgroundColor: chaosState.active ? 'rgba(76, 175, 80, 0.15)' : 'rgba(128, 128, 128, 0.15)',
        border: `1px solid ${chaosState.active ? '#4CAF50' : '#888'}`,
        borderRadius: '4px',
      }}>
        <h4 style={{ margin: '0 0 8px 0' }}>
          {t`Event Status`}:&nbsp;
          {chaosState.active ? (
            <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
              {t`Active`}
            </span>
          ) : (
            <span style={{ color: '#888', fontWeight: 'bold' }}>
              {t`Inactive`}
            </span>
          )}
        </h4>

        {chaosState.active ? (
          <div>
            <p style={{ margin: '4px 0' }}>
              <strong>{t`Time Remaining`}:</strong>&nbsp;
              <span style={{ fontSize: '1.15em', fontWeight: 'bold', color: '#FF9800' }}>
                {formatRemainingTime(remainingMs)}
              </span>
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>{t`Prince (VIP) Base Cooldown`}:</strong>&nbsp;
              <span>{formatCooldown(chaosState.vipCooldown)}</span>
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>{t`Regular Users Occupied Pixel Cooldown`}:</strong>&nbsp;
              <span>{formatCooldown(chaosState.userCooldown)}</span>
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#aaa' }}>
              {t`Blank Pixel Cooldowns`}: {formatCooldown(chaosState.baseCooldown)}
              {' / VIP '}{formatCooldown(chaosState.vipBaseCooldown)}
            </p>
            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                style={{ backgroundColor: '#f44336', color: '#fff', padding: '6px 14px' }}
                disabled={submitting}
                onClick={handleStopChaos}
              >
                {submitting ? '...' : ` ${t`Stop Chaos Event`}`}
              </button>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, color: '#aaa' }}>
            {t`Chaos Event is currently turned off. Configure the parameters below and start the event.`}
          </p>
        )}
      </div>

      <div className="modaldivider" />

      {/* Start Chaos Event Form */}
      <h4> {t`Launch Chaos Event`}</h4>

      {/* Preset Quick Buttons */}
      <p style={{ margin: '8px 0' }}>
        <strong>{t`Quick Presets`}:</strong>&nbsp;
        <button
          type="button"
          onClick={() => applyPreset(500, 250, 60)}
          style={{ marginRight: '6px', fontSize: '0.9em' }}
        >
          {t`2x Speed (0.5s / 0.25s VIP, 1h)`}
        </button>
        <button
          type="button"
          onClick={() => applyPreset(200, 100, 30)}
          style={{ marginRight: '6px', fontSize: '0.9em' }}
        >
          {t`Chaos (0.2s / 0.1s VIP, 30m)`}
        </button>
        <button
          type="button"
          onClick={() => applyPreset(100, 50, 15)}
          style={{ marginRight: '6px', fontSize: '0.9em' }}
        >
          {t`Ultra (0.1s / 0.05s VIP, 15m)`}
        </button>
      </p>

      {/* Main Settings */}
      <div style={{ margin: '10px 0' }}>
        <label style={{ display: 'block', margin: '8px 0' }}>
          <strong>
            {t`Prince (VIP) Base Occupied Pixel Cooldown (ms)`}:
          </strong><br />
          <input
            type="number"
            min="0"
            max="600000"
            step="10"
            value={vipCd}
            onInput={(e) => setVipCd(Number(e.currentTarget.value))}
            style={{ width: '160px', marginTop: '4px' }}
          />&nbsp;ms
          <span style={{ fontSize: '0.85em', color: '#aaa', marginLeft: '8px' }}>
            ({formatCooldown(vipCd)})
          </span>
        </label>

        <p style={{ margin: '4px 0', fontSize: '0.85em', color: '#888' }}>
          {t`Chaos applies VIP multipliers to blank and occupied pixels.`}<br />
          {t`Without active Void: Prince 95%, King 90%, Emperor 80%.`}<br />
          {t`During active Void, the configured active Void multipliers apply.`}
        </p>

        <label style={{ display: 'block', margin: '8px 0' }}>
          <strong>{t`Regular Users Occupied Pixel Cooldown (ms)`}:</strong><br />
          <input
            type="number"
            min="0"
            max="600000"
            step="10"
            value={userCd}
            onInput={(e) => setUserCd(Number(e.currentTarget.value))}
            style={{ width: '160px', marginTop: '4px' }}
          />&nbsp;ms
          <span style={{ fontSize: '0.85em', color: '#aaa', marginLeft: '8px' }}>
            ({formatCooldown(userCd)})
          </span>
        </label>

        <label style={{ display: 'block', margin: '8px 0' }}>
          <strong>{t`Event Duration (minutes)`}:</strong><br />
          <input
            type="number"
            min="1"
            max="43200"
            step="5"
            value={duration}
            onInput={(e) => setDuration(Number(e.currentTarget.value))}
            style={{ width: '160px', marginTop: '4px' }}
          />&nbsp;{t`minutes`}
        </label>

        {/* Quick Duration Buttons */}
        <p style={{ margin: '6px 0', fontSize: '0.9em' }}>
          <span style={{ color: '#aaa' }}>{t`Quick duration`}:&nbsp;</span>
          {[15, 30, 60, 120, 360, 1440].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              style={{
                marginRight: '4px',
                padding: '2px 8px',
                fontSize: '0.85em',
                fontWeight: duration === d ? 'bold' : 'normal',
              }}
            >
              {d >= 60 ? `${d / 60}h` : `${d}m`}
            </button>
          ))}
        </p>
      </div>

      <div style={{
        margin: '10px 0',
        padding: '10px',
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: '4px',
      }}>
        <strong>{t`Blank Pixel Cooldowns`}</strong>
        <p style={{ margin: '4px 0 8px', color: '#aaa' }}>
          {t`Blank pixel settings are independent.`}
        </p>
        <label style={{ display: 'block', margin: '6px 0' }}>
          {t`Regular Users Blank Cooldown (ms)`}:<br />
          <input
            type="number"
            min="0"
            max="600000"
            step="10"
            value={baseCd}
            onInput={(e) => setBaseCd(Number(e.currentTarget.value))}
            style={{ width: '140px' }}
          />&nbsp;ms&nbsp;({formatCooldown(baseCd)})
        </label>
        <label style={{ display: 'block', margin: '6px 0' }}>
          {t`VIP Blank Cooldown (ms)`}:<br />
          <input
            type="number"
            min="0"
            max="600000"
            step="10"
            value={vipBaseCd}
            onInput={(e) => setVipBaseCd(Number(e.currentTarget.value))}
            style={{ width: '140px' }}
          />&nbsp;ms&nbsp;({formatCooldown(vipBaseCd)})
        </label>
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

      {/* Start Button */}
      <div style={{ marginTop: '16px' }}>
        <button
          type="button"
          disabled={submitting || loading || userCd < 0 || vipCd < 0 || duration <= 0}
          onClick={handleStartChaos}
          style={{
            padding: '8px 20px',
            fontSize: '1.05em',
            fontWeight: 'bold',
          }}
        >
          {submitting ? '...' : ` ${t`Start Chaos Event`}`}
        </button>
      </div>

      <br />
      <p style={{ fontSize: '0.85em', color: '#888' }}>
        {t`When Chaos Event starts, cooldowns change immediately for all online and offline players on all canvases and revert automatically when time expires.`}
      </p>
    </div>
  );
}

export default memo(ChaosTools);
