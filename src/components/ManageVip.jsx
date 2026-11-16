import { useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { t } from 'ttag';

import { VIP_TIER } from '../core/vip.js';
import { api } from '../utils/utag.js';
import { useSelector } from '../store/react-redux/index.js';

function ManageVip() {
  const [target, setTarget] = useState('');
  const [tier, setTier] = useState(VIP_TIER.VIP);
  const [duration, setDuration] = useState('30d');
  const [reason, setReason] = useState('');
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const vipEnabled = useSelector((state) => state.user.vipEnabled);

  const submit = async (action) => {
    if (submitting || !target.trim() || !reason.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('managevip', 'true');
      data.append('vipaction', action);
      data.append('viptarget', target.trim());
      data.append('viptier', String(tier));
      data.append('vipduration', duration.trim());
      data.append('vipreason', reason.trim());
      const resp = await fetch(api`/api/modtools`, {
        credentials: 'include',
        method: 'POST',
        body: data,
      });
      setResponse(await resp.text());
    } catch (error) {
      setResponse(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="content margin-container">
      <h3>{t`Manage VIP`}</h3>
      {!vipEnabled && (
        <p>{t`VIP perks are currently disabled by server configuration.`}</p>
      )}
      <p>{t`Target a user by UID, IID, username, or nickname.`}</p>
      <label>
        {t`User`}:&nbsp;
        <input
          value={target}
          maxLength={100}
          onInput={(event) => setTarget(event.currentTarget.value)}
        />
      </label>
      <p>
        {t`Tier`}:&nbsp;
        <select
          value={tier}
          onChange={(event) => setTier(Number(event.currentTarget.value))}
        >
          <option value={VIP_TIER.PRINCE}>{t`Prince (VIP)`}</option>
          <option value={VIP_TIER.KING}>{t`King (VIP+)`}</option>
          <option value={VIP_TIER.EMPEROR}>{t`Emperor (VIP++)`}</option>
        </select>
      </p>
      <label>
        {t`Duration`}:&nbsp;
        <input
          value={duration}
          maxLength={20}
          placeholder={t`30d / 12h / permanent`}
          onInput={(event) => setDuration(event.currentTarget.value)}
        />
      </label>
      <p>{t`Use d, h, or m units (up to 10 years), or permanent.`}</p>
      <label>
        {t`Reason`}:&nbsp;
        <input
          value={reason}
          maxLength={200}
          onInput={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      <p>
        <button
          type="button"
          disabled={submitting || !target.trim()
            || !reason.trim() || !vipEnabled}
          onClick={() => submit('grant')}
        >
          {submitting ? '...' : t`Grant VIP`}
        </button>
        {' '}
        <button
          type="button"
          disabled={submitting || !target.trim()
            || !reason.trim() || !vipEnabled}
          onClick={() => submit('revoke')}
        >
          {submitting ? '...' : t`Revoke VIP`}
        </button>
      </p>
      {response && <p role="status">{response}</p>}
    </div>
  );
}

export default memo(ManageVip);
