/*
 * Admintools
 */

/* eslint-disable max-len */

import { useState } from 'preact/hooks';
import { Fragment } from 'preact';
import { memo } from 'preact/compat';
import { useSelector } from '../store/react-redux/index.js';
import { t } from 'ttag';

import { parseInterval } from '../core/utils.js';
import { api } from '../utils/utag.js';
import { USERLVL } from '../core/constants.js';
import useLink from './hooks/link.js';

async function submitIIDAction(
  action,
  iid,
  bid,
  iidoruser,
  identifierList,
  reason,
  duration,
  username,
  discordId = '',
) {
  const data = new FormData();
  data.append('iidaction', action);
  switch (action) {
    case 'givecaptcha':
    case 'whitelist':
    case 'unwhitelist': {
      if (!iid) {
        return t`You must enter an IID`;
      }
      data.append('iid', iid);
      break;
    }
    case 'baninfo': {
      if (!bid) {
        return t`You must enter an BID`;
      }
      data.append('bid', bid);
      break;
    }
    case 'searchalts': {
      const time = parseInterval(duration);
      data.append('time', time);
      // fall through
    }
    case 'status':
    case 'checkFlag': {
      if (!iidoruser) {
        return t`You must enter an IID or UserId`;
      }
      data.append('iidoruser', iidoruser);
      break;
    }
    case 'checktwink': {
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(iidoruser)) {
        return t`You must enter a valid IID`;
      }
      data.append('iidoruser', iidoruser);
      break;
    }
    case 'checkIID': {
      if (!/^[1-9]\d*$/.test(iidoruser)
        || !Number.isSafeInteger(Number(iidoruser))
      ) {
        return t`You must enter a valid User ID`;
      }
      data.append('iidoruser', iidoruser);
      break;
    }
    case 'checkproxy': {
      const isIID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
        .test(iidoruser);
      const isUserId = /^[1-9]\d*$/.test(iidoruser)
        && Number.isSafeInteger(Number(iidoruser));
      if (!isIID && !isUserId) {
        return t`Enter a valid IID or numeric User ID`;
      }
      data.append('iidoruser', iidoruser);
      break;
    }
    case 'changeusername': {
      if (!iidoruser) {
        return t`You must enter a UserId`;
      }
      if (!username) {
        return t`You must enter a username`;
      }
      data.append('iidoruser', iidoruser);
      data.append('username', username);
      break;
    }
    case 'giveNotif': {
      if (!iidoruser) {
        return t`Enter an IID, User ID, or nickname`;
      }
      if (!reason.trim()) {
        return t`Enter a notification message`;
      }
      if (reason.length > 500) {
        return t`Notification messages must be 500 characters or less`;
      }
      data.append('iidoruser', iidoruser);
      data.append('reason', reason);
      break;
    }
    case 'linkdiscord': {
      if (!iidoruser) {
        return t`Enter a User ID, IID, or nickname`;
      }
      if (!/^\d{17,20}$/.test(discordId)) {
        return t`Enter a valid Discord ID`;
      }
      data.append('iidoruser', iidoruser);
      data.append('discordid', discordId);
      break;
    }
    case 'unlinkdiscord': {
      if (!iidoruser && !discordId) {
        return t`Enter either a User ID, IID, nickname, or Discord ID`;
      }
      if (discordId) {
        if (!/^\d{17,20}$/.test(discordId)) {
          return t`Enter a valid Discord ID`;
        }
        data.append('discordid', discordId);
      } else {
        data.append('iidoruser', iidoruser);
      }
      break;
    }
    case 'banid':
    case 'baniid': {
      const time = parseInterval(duration);
      if (!reason) {
        return t`You must enter a reason`;
      }
      data.append('reason', reason);
      data.append('time', time);
      if (!identifierList) {
        return t`You must enter at least one identifier`;
      }
      data.append('identifiers', identifierList);
      break;
    }
    case 'unban': {
      if (!identifierList) {
        return t`You must enter at least one IID, User Id or BID`;
      }
      data.append('identifiers', identifierList);
      break;
    }
    default:
      // nothing
  }
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  if (['checkFlag', 'checktwink', 'checkIID', 'checkproxy', 'searchalts', 'listonline']
    .includes(action)
  ) {
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text || `Request failed (${resp.status})` };
    }
  }
  return resp.text();
}

function countryFlag(country) {
  if (!/^[a-z]{2}$/i.test(country || '') || country.toLowerCase() === 'xx') {
    return '🏳️';
  }
  return String.fromCodePoint(
    ...country.toUpperCase().split('').map((char) => 127397 + char.charCodeAt(0)),
  );
}

function getRiskLabel(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return null;
  }
  if (score >= 85) return 'High';
  if (score >= 60) return 'Elevated';
  if (score >= 30) return 'Moderate';
  return 'Low';
}

const IID_ACTION_LABELS = {
  status: t`Status`,
  baninfo: t`Ban information`,
  banid: t`Ban by ID (BANID)`,
  baniid: t`Ban by IID (BANIID)`,
  unban: t`Unban`,
  whitelist: t`Add to whitelist`,
  unwhitelist: t`Remove from whitelist`,
  givecaptcha: t`Give CAPTCHA`,
  changeusername: t`Change username`,
  listonline: t`List online users`,
  searchalts: t`Search alternate accounts`,
  checkFlag: t`Check flag`,
  checktwink: t`Check linked accounts`,
  checkIID: t`Check IID`,
  checkproxy: t`Check proxy`,
  giveNotif: t`Give Notification`,
  linkdiscord: t`Link Discord ID`,
  unlinkdiscord: t`Unlink Discord account`,
};

function getIIDActionLabel(action) {
  return IID_ACTION_LABELS[action] || action;
}

function ModIIDtools() {
  const [iIDAction, selectIIDAction] = useState('status');
  const [iid, selectIid] = useState('');
  const [bid, selectBid] = useState('');
  const [iidOrUser, selectIidOrUser] = useState('');
  const [identifierList, setIdentifierList] = useState('');
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [duration, setDuration] = useState('3d');
  const [resp, setResp] = useState('');
  const [actionResults, setActionResults] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const link = useLink();


  const userlvl = useSelector((state) => state.user.userlvl);
  if (userlvl < USERLVL.TRIALMOD) {
    return (<div className="content"><h1>{t`Not Allowed`}</h1></div>);
  }
  const iidActionOptions = [
    'status', 'baninfo', 'banid', 'baniid', 'unban',
    'whitelist', 'unwhitelist',
    'givecaptcha', 'changeusername', 'listonline', 'searchalts',
    'checkFlag', 'checktwink', 'checkIID', 'checkproxy', 'giveNotif',
    ...(userlvl >= USERLVL.MOD ? ['linkdiscord', 'unlinkdiscord'] : []),
  ].filter((action) => (
    userlvl !== USERLVL.TRIALMOD
    || !['baniid', 'givecaptcha', 'changeusername'].includes(action)
  ));

  async function toggleIPWhitelist(entry) {
    if (!entry.iid || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const action = entry.isWhitelisted ? 'unwhitelist' : 'whitelist';
      const result = await submitIIDAction(
        action, entry.iid, '', '', '', '', '', '',
      );
      let isWhitelisted;
      if (result.includes('whitelisted')) {
        isWhitelisted = true;
      } else if (result.includes('removed user from whitelist')
        || result.includes('not on whitelist')
      ) {
        isWhitelisted = false;
      } else {
        throw new Error(result || 'Whitelist update failed');
      }
      setActionResults((previous) => (previous ? {
        ...previous,
        entries: previous.entries.map((item) => (
          item.ip === entry.ip ? { ...item, isWhitelisted } : item
        )),
      } : previous));
    } catch (error) {
      setActionResults((previous) => (
        previous ? { ...previous, error: error.message } : previous
      ));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="content">
      <form
        onSubmit={async (evt) => {
          evt.preventDefault();
          if (submitting) {
            return;
          }
          if (iIDAction === 'unlinkdiscord'
            && !window.confirm(
              t`Unlink the Discord account from the selected user?`,
            )
          ) {
            return;
          }
          setSubmitting(true);
          try {
            const ret = await submitIIDAction(
              iIDAction, iid, bid, iidOrUser, identifierList,
              reason, duration, username, discordId,
            );
            if (['checkFlag', 'checktwink', 'checkIID', 'checkproxy', 'searchalts']
              .includes(iIDAction)
            ) {
              setActionResults(ret);
              setOnlineUsers([]);
              setResp('');
            } else if (iIDAction === 'listonline') {
              setOnlineUsers(Array.isArray(ret) ? ret : []);
              setActionResults(null);
              setResp(Array.isArray(ret)
                ? '' : ret.error || ret.errors?.[0] || t`Unknown Error`);
            } else {
              setOnlineUsers([]);
              setActionResults(null);
              setResp(ret);
            }
          } catch (error) {
            const isResultsAction = [
              'checkFlag', 'checktwink', 'checkIID', 'checkproxy', 'searchalts',
            ].includes(iIDAction);
            if (iIDAction === 'listonline') {
              setOnlineUsers([]);
            }
            setActionResults(isResultsAction
              ? { error: error.message } : null);
            setResp(isResultsAction ? '' : error.message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h3>{t`IID Actions`}</h3>
        <select
          value={iIDAction}
          onChange={(e) => {
            const sel = e.target;
            selectIIDAction(sel.options[sel.selectedIndex].value);
            setActionResults(null);
            setOnlineUsers([]);
            setResp('');
          }}
        >
          {iidActionOptions.map((opt) => (
            <option
              key={opt}
              value={opt}
            >
              {getIIDActionLabel(opt)}
            </option>
          ))}
        </select>
        {(iIDAction === 'banid' || iIDAction === 'baniid') && (
          <Fragment key="ban">
            <p>{t`Reason`}</p>
            <input
              maxLength="200"
              style={{
                width: '100%',
              }}
              value={reason}
              placeholder={t`Enter Reason`}
              onChange={(evt) => setReason(evt.target.value)}
            />
          </Fragment>
        )}
        {iIDAction === 'listonline' && (
          <>
            {resp && <p className="errormessage">{resp}</p>}
            <div className="modtools-flag-table-wrap">
              <table className="modtools-flag-table">
                <thead>
                  <tr>
                    <th>IID</th>
                    <th>ID</th>
                    <th>{t`Nickname`}</th>
                  </tr>
                </thead>
                <tbody>
                  {onlineUsers.map(({ iid: onlineIid, id, nickname }) => (
                    <tr key={`${onlineIid}-${id}`}>
                      <td>{onlineIid}</td>
                      <td>{id}</td>
                      <td>
                        <span
                          role="button"
                          tabIndex={0}
                          className="modallink"
                          onClick={() => link('USER', {
                            target: 'parent',
                            args: { username: id },
                          })}
                        >
                          {nickname}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {(iIDAction === 'whitelist' || iIDAction === 'unwhitelist' || iIDAction === 'givecaptcha' || iIDAction === 'ipstatus') && (
          <p key="iidactions">
            IID:&nbsp;
            <input
              value={iid}
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: '37em',
              }}
              type="text"
              placeholder="xxxx-xxxxx-xxxx"
              onChange={(evt) => {
                selectIid(evt.target.value.trim());
              }}
            />
          </p>
        )}
        {(iIDAction === 'baninfo') && (
          <p key="baninfo">
            BID:&nbsp;
            <input
              value={bid}
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: '37em',
              }}
              type="text"
              placeholder="xxxx-xxxxx-xxxx"
              onChange={(evt) => {
                selectBid(evt.target.value.trim());
              }}
            />
          </p>
        )}
        {(iIDAction === 'status' || iIDAction === 'searchalts'
          || iIDAction === 'checkFlag' || iIDAction === 'checktwink'
          || iIDAction === 'checkIID' || iIDAction === 'checkproxy'
          || iIDAction === 'linkdiscord'
          || iIDAction === 'unlinkdiscord') && (
          <p key="status">
            {iIDAction === 'linkdiscord' || iIDAction === 'unlinkdiscord'
              ? iIDAction === 'unlinkdiscord'
                ? t`User ID / IID / Nickname (or use Discord ID below):`
                : t`User ID / IID / Nickname:`
              : iIDAction === 'checkproxy'
                ? 'IID or User ID:'
                : iIDAction === 'checktwink' ? 'IID:'
                  : iIDAction === 'checkIID'
                    ? 'User ID:'
                    : 'IID, UserID or Name:'}&nbsp;
            <input
              value={iidOrUser}
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: '37em',
              }}
              type="text"
              onChange={(evt) => {
                selectIidOrUser(evt.target.value.trim());
              }}
            />
          </p>
        )}
        {(iIDAction === 'linkdiscord' || iIDAction === 'unlinkdiscord') && (
          <p key="discordid">
            {iIDAction === 'unlinkdiscord'
              ? t`Discord ID (use instead of the account identifier above):`
              : t`Discord ID:`}
            <input
              value={discordId}
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: '37em',
              }}
              type="text"
              inputMode="numeric"
              placeholder="123456789012345678"
              onChange={(evt) => setDiscordId(evt.target.value.trim())}
            />
          </p>
        )}
        {(iIDAction === 'banid' || iIDAction === 'baniid'
          || iIDAction === 'searchalts') && (
          <Fragment key="duration">
            <p>
              {`${t`Duration`}: `}
              <input
                style={{
                  display: 'inline-block',
                  width: '100%',
                  maxWidth: '7em',
                }}
                value={duration}
                placeholder="0"
                onChange={(evt) => {
                  setDuration(evt.target.value.trim());
                }}
              />
              {t`(0 = infinite)`}
            </p>
          </Fragment>
        )}
        {(iIDAction === 'changeusername') && (
          <Fragment key="changeusername">
            <p>
              UserID or Name:
              <input
                value={iidOrUser}
                style={{
                  display: 'inline-block',
                  width: '100%',
                  maxWidth: '37em',
                }}
                type="text"
                onChange={(evt) => {
                  selectIidOrUser(evt.target.value.trim());
                }}
              />
            </p>
            <p>{t`Username`}</p>
            <input
              maxLength="200"
              style={{
                width: '100%',
              }}
              value={username}
              placeholder={t`Enter Reason`}
              onChange={(evt) => setUsername(evt.target.value)}
            />
          </Fragment>
        )}
        {iIDAction === 'giveNotif' && (
          <Fragment key="giveNotif">
            <p>
              {t`IID, ID, or nickname:`}
              <input
                maxLength="100"
                value={iidOrUser}
                style={{ display: 'inline-block', width: '100%', maxWidth: '37em' }}
                type="text"
                onChange={(evt) => selectIidOrUser(evt.target.value.trim())}
              />
            </p>
            <p>{t`Notification message`}</p>
            <textarea
              maxLength="500"
              style={{ width: '100%', maxWidth: '37em' }}
              rows="4"
              value={reason}
              onChange={(evt) => setReason(evt.target.value)}
            />
          </Fragment>
        )}
        {(iIDAction === 'banid' || iIDAction === 'baniid'
          || iIDAction === 'unban') && (
          <p key="banunban">
            {iIDAction === 'banid'
              ? t`Account ID (UID):`
              : iIDAction === 'baniid'
                ? t`IID:`
                : t`IID, UID or BID:`}
            <br />
            <textarea
              style={{
                width: '100%',
                maxWidth: '37em',
              }}
              rows="10"
              cols="17"
              value={identifierList}
              placeholder={iIDAction === 'banid'
                ? '12345'
                : iIDAction === 'baniid'
                  ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
                  : ''}
              onChange={(e) => setIdentifierList(e.target.value)}
            />
          </p>
        )}
        <p>
          <button type="submit">
            {(submitting) ? '...' : t`Submit`}
          </button>
        </p>
      </form>
      {!['checkFlag', 'checktwink', 'checkIID', 'checkproxy', 'searchalts', 'listonline']
        .includes(iIDAction) && (
        <textarea
          style={{ width: '100%' }}
          rows={(resp) ? resp.split('\n').length : 10}
          value={resp}
          readOnly
        />
      )}
      {(actionResults) && (
        <section className="modtools-flag-results">
          <h3>
            {actionResults.target?.name
              || actionResults.target?.iid
              || (actionResults.target?.id
                ? `Account #${actionResults.target.id}`
                : 'Account')}
          </h3>
          {actionResults.error && <p>{actionResults.error}</p>}
          {actionResults.type === 'checkproxy'
            && !actionResults.providerEnabled && (
            <p>
              {t`No proxy reputation provider is enabled. Configure IPQS or ProxyCheck to see detection results.`}
            </p>
          )}
          {!actionResults.error && !actionResults.entries?.length && (
            <p>
              {actionResults.type === 'searchalts'
                ? t`No alternate accounts or IIDs found.`
                : actionResults.type === 'checktwink'
                  ? t`No recorded IP history found for this IID.`
                  : actionResults.type === 'checkIID'
                    ? t`No recorded IP history found for this account.`
                    : actionResults.type === 'checkproxy'
                      ? t`No recorded IP history found for this target.`
                      : t`No recorded IP history found.`}
            </p>
          )}
          {!!actionResults.entries?.length && (
            <div className="modtools-flag-table-wrap">
              <table className="modtools-flag-table">
                <thead>
                  {actionResults.type === 'searchalts' ? (
                    <tr>
                      <th>{t`Type`}</th>
                      <th>{t`Identifier`}</th>
                    </tr>
                  ) : actionResults.type === 'checkproxy' ? (
                    <tr>
                      <th>Country</th>
                      <th>IP</th>
                      <th>Proxy detection</th>
                      <th>Risk / fraud score</th>
                      <th>Connection</th>
                      <th>Provider / ASN</th>
                      <th>Signals</th>
                      <th>Whitelist</th>
                      <th>Provider record</th>
                    </tr>
                  ) : (actionResults.type === 'checktwink'
                    || actionResults.type === 'checkIID') ? (
                        <tr>
                          <th>{t`Country`}</th>
                          <th>IP</th>
                          <th>
                            {actionResults.type === 'checkIID'
                              ? t`IID`
                              : t`Alt accounts`}
                          </th>
                        </tr>
                      ) : (
                        <tr>
                          <th>{t`Country`}</th>
                          <th>IP</th>
                          <th>{t`Last seen`}</th>
                          <th>{t`Proxy check`}</th>
                          <th>{t`Network`}</th>
                        </tr>
                      )}
                </thead>
                <tbody>
                  {actionResults.entries.map((entry) => {
                    const key = `${entry.ip}-${entry.iid}`;
                    if (actionResults.type === 'searchalts') {
                      return (
                        <tr key={`${entry.kind}-${entry.identifier}`}>
                          <td>
                            {entry.kind === 'account' ? t`Account` : t`IID`}
                          </td>
                          <td>{entry.identifier}</td>
                        </tr>
                      );
                    }
                    if (actionResults.type === 'checkproxy') {
                      const info = entry.ipqs || {};
                      const signals = [
                        ['isProxy', 'Proxy'],
                        ['isVPN', 'VPN'],
                        ['isTOR', 'TOR'],
                        ['isCrawler', 'Crawler'],
                        ['isBot', 'Bot'],
                        ['recentAbuse', 'Recent abuse'],
                        ['isBlacklisted', 'Blacklisted'],
                        ['isPrivate', 'Private IP'],
                        ['isMobile', 'Mobile'],
                        ['hasOpenPorts', 'Open ports'],
                        ['isHostingProvider', 'Hosting'],
                        ['isDataCenter', 'Data center'],
                        ['activeVPN', 'Active VPN'],
                        ['activeTOR', 'Active TOR'],
                        ['publicAccessPoint', 'Public access point'],
                        ['frequentAbuser', 'Frequent abuser'],
                        ['trustedApplication', 'Trusted application'],
                        ['securityScanner', 'Security scanner'],
                        ['sharedIP', 'Shared IP'],
                        ['dynamicIP', 'Dynamic IP'],
                      ].filter(([field]) => info[field])
                        .map(([, label]) => label);
                      const rawRiskScore = info.fraudScore ?? entry.risk;
                      const riskLabel = getRiskLabel(rawRiskScore);
                      const riskScore = riskLabel
                        ? Math.max(0, Math.min(100, Number(rawRiskScore)))
                        : null;
                      return (
                        <tr key={key}>
                          <td>
                            <span aria-label={entry.country}>
                              {countryFlag(entry.country)}
                            </span>
                            &nbsp;
                            {(entry.country || 'xx').toUpperCase()}
                          </td>
                          <td>{entry.ip}</td>
                          <td>
                            {(info.found || entry.hasResult)
                              ? entry.proxy ? t`Flagged` : t`No signal`
                              : entry.source
                                ? t`No database record`
                                : t`No provider result`}
                          </td>
                          <td>
                            {riskScore === null
                              ? '—'
                              : `${riskScore}/100 · ${riskLabel}`}
                            {info.strictFraudScore !== null
                              && info.strictFraudScore !== undefined
                              ? ` / ${info.strictFraudScore}` : ''}
                            {riskScore !== null && (
                              <div
                                role="img"
                                aria-label={`Fraud risk score ${riskScore} out of 100`}
                                style={{
                                  background: '#555',
                                  height: '0.45em',
                                  marginTop: '0.3em',
                                  maxWidth: '12em',
                                }}
                              >
                                <div
                                  style={{
                                    background: riskScore >= 85 ? '#d44'
                                      : riskScore >= 60 ? '#e90'
                                        : riskScore >= 30 ? '#db4' : '#4a6',
                                    height: '100%',
                                    width: `${riskScore}%`,
                                  }}
                                />
                              </div>
                            )}
                            {entry.confidence !== null
                              && entry.confidence !== undefined
                              && `Confidence: ${entry.confidence}%`}
                          </td>
                          <td>
                            {entry.type || info.connectionType || '—'}
                            {info.abuseVelocity
                              ? ` · abuse ${info.abuseVelocity}` : ''}
                          </td>
                          <td>
                            {entry.organization || entry.provider
                              || info.organization || entry.proxyOperator || '—'}
                            {(entry.asn || info.asn)
                              ? ` · AS${entry.asn || info.asn}` : ''}
                            {(info.city || entry.city)
                              ? ` · ${info.city || entry.city}` : ''}
                            {(info.region || entry.region)
                              ? `, ${info.region || entry.region}` : ''}
                          </td>
                          <td>{signals.length ? signals.join(', ') : '—'}</td>
                          <td>
                            <strong>
                              {entry.isWhitelisted
                                ? t`Whitelisted` : t`Not whitelisted`}
                            </strong>
                            {entry.iid && (
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => toggleIPWhitelist(entry)}
                              >
                                {entry.isWhitelisted
                                  ? t`Remove` : t`Whitelist`}
                              </button>
                            )}
                          </td>
                          <td>
                            <details>
                              <summary>
                                {info.city || info.region || info.isp || 'Details'}
                              </summary>
                              <pre style={{ whiteSpace: 'pre-wrap' }}>
                                {JSON.stringify(info, null, 2)}
                              </pre>
                            </details>
                            <small>
                              {entry.source || t`No provider result`}
                              {(entry.expiresTs || info.expiresTs)
                                && ` · cached until ${new Date(
                                  entry.expiresTs || info.expiresTs,
                                ).toLocaleString()}`}
                            </small>
                          </td>
                        </tr>
                      );
                    }
                    if (actionResults.type === 'checktwink'
                      || actionResults.type === 'checkIID'
                    ) {
                      return (
                        <tr key={key}>
                          <td>
                            <span aria-label={entry.country}>
                              {countryFlag(entry.country)}
                            </span>
                            &nbsp;{(entry.country || 'xx').toUpperCase()}
                          </td>
                          <td>{entry.ip}</td>
                          <td>
                            {actionResults.type === 'checkIID'
                              ? entry.iid || '—'
                              : entry.accountIds?.length
                                ? entry.accountIds.map((accountId, index) => (
                                    <Fragment key={accountId}>
                                      {index > 0 && ', '}
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        className="modallink"
                                        onClick={() => link('USER', {
                                          target: 'parent',
                                          args: { username: accountId },
                                        })}
                                        onKeyDown={(evt) => {
                                          if (evt.key === 'Enter'
                                            || evt.key === ' '
                                          ) {
                                            evt.preventDefault();
                                            link('USER', {
                                              target: 'parent',
                                              args: { username: accountId },
                                            });
                                          }
                                        }}
                                      >
                                        {accountId}
                                      </span>
                                    </Fragment>
                                  ))
                                : '—'}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={key}>
                        <td>
                          <span aria-label={entry.country}>
                            {countryFlag(entry.country)}
                          </span>
                          &nbsp;{(entry.country || 'xx').toUpperCase()}
                        </td>
                        <td>{entry.ip}</td>
                        <td>
                          {entry.lastSeen
                            ? new Date(entry.lastSeen).toLocaleString()
                            : '—'}
                        </td>
                        <td>
                          <strong>
                            {entry.proxy ? t`Flagged` : t`No signal`}
                          </strong>
                          <br />
                          <small>{entry.proxySource}</small>
                          {entry.proxyType
                            && <small>{` · ${entry.proxyType}`}</small>}
                          {entry.proxyRisk !== null
                            && <small>{` · risk ${entry.proxyRisk}`}</small>}
                        </td>
                        <td>
                          {entry.organization || '—'}
                          {entry.asn ? ` · AS${entry.asn}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default memo(ModIIDtools);
