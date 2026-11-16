/*
 * show some data as table
 */
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { c, t } from 'ttag';

import useLink from './hooks/link.js';
import { cdn } from '../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../utils/media/utils.js';
import { numberToStringFull } from '../core/utils.js';
import MdParagraph from './markdown/MdParagraph.jsx';
import { getStaffIconName } from '../utils/flagMapping.js';

const Table = ({
  rows, columnIds, types, uniqueColumnKey = 0, sortColumnKey = 0,
}) => {
  const [sortAsc, setSortAsc] = useState(true);
  const [sortBy, setSortBy] = useState(sortColumnKey);
  const [expandedAllianceId, setExpandedAllianceId] = useState(null);

  const link = useLink();

  const columnIdToNames = {
    avatar: t`Avatar`,
    flag: t`Flag`,
    title: t`Title`,
    name: t`Name`,
    description: t`Description`,
    /* t: Column title in tables */
    time: t`Time`,
    /* t: Column title of column indicating whether or not a faction is able to be joined in public */
    ispublic: c('statistics-table').t`Public`,
    members: t`Members`,
    role: t`Role`,
    joined: t`Joined`,
    /* eslint-disable camelcase */
    today_rank: t`Daily Rank`,
    today_pixel: t`Daily Pixels`,
    yesterday_rank: t`Rank`,
    yesterday_pixel: t`Pixels`,
    /* eslint-enable camelcase */
    rank: t`Rank`,
    pixel: t`Pixels`,
  };

  if (!columnIds || !rows || !types) {
    return null;
  }

  const factionLabelIndex = columnIds.indexOf('faction_label');
  const visibleColumns = types.filter((type) => type !== 'hidden').length;
  const sortValue = (row) => (
    types[sortBy] === 'faction'
      ? row[factionLabelIndex]?.displayName || row[sortBy]
      : row[sortBy]
  );

  return (
    <table>
      <thead>
        <tr>
          {columnIds.map((col, ind) => {
            if (types[ind] === 'hidden') {
              return null;
            }
            return (
              <th
                key={col}
                style={
                  (sortBy === ind) ? {
                    cursor: 'pointer',
                    fontWeight: 'normal',
                  } : {
                    cursor: 'pointer',
                  }
                }
                onClick={() => {
                  if (sortBy === ind) {
                    setSortAsc(!sortAsc);
                  } else {
                    setSortBy(ind);
                  }
                }}
              >{columnIdToNames[col] || col}</th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.slice().sort((a, b) => {
          a = sortValue(a);
          b = sortValue(b);
          if (typeof a === 'string' && typeof b === 'string') {
            let ret = a.localeCompare(b);
            if (sortAsc) ret *= -1;
            return ret;
          }
          if (!a) a = 0;
          if (!b) b = 0;
          if (a < b) return (sortAsc) ? -1 : 1;
          if (a > b) return (sortAsc) ? 1 : -1;
          return 0;
        }).map((row) => {
          const label = row[factionLabelIndex];
          const expandable = label?.type === 'alliance'
            && Number.isInteger(label.allianceId) && Array.isArray(label.members);
          const expanded = expandable && expandedAllianceId === label.allianceId;
          const toggleAlliance = () => setExpandedAllianceId(
            expanded ? null : label.allianceId,
          );
          return (
            <Fragment key={expandable ? `alliance:${label.allianceId}` : row[uniqueColumnKey]}>
              <tr
                className={expandable ? 'ranking-alliance-row' : undefined}
                onClick={expandable ? toggleAlliance : undefined}
              >
                {row.map((val, ind) => {
                  const type = types[ind];
                  const key = columnIds[ind];
                  if (type === 'hidden') return null;
                  if (!val && val !== 0 && type !== 'user' && type !== 'faction') {
                    return (<td key={key} />);
                  }

                  switch (type) {
                    case 'bool':
                      return <td key={key}>{val && 'X'}</td>;
                    case 'number':
                      return (
                        <td key={key} className="number-cell">
                          {numberToStringFull(val)}
                        </td>
                      );
                    case 'mdstring' :
                      return <td><MdParagraph text={val} /></td>;
                    case 'faction': {
                      if (!val) {
                        return (<td key={key}>{t`Private`}</td>);
                      }
                      const separator = val.lastIndexOf(',');
                      if (separator === -1) {
                        return (<td key={key}>{val}</td>);
                      }
                      const name = val.substring(separator + 1);
                      const displayName = label?.displayName || name;
                      const title = label ? label.title
                        : val.substring(0, separator);
                      return (
                        <td key={key}>
                          {expandable && (
                            <button
                              className="ranking-alliance-toggle"
                              type="button"
                              aria-expanded={expanded}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleAlliance();
                              }}
                            >
                              <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                              {' '}{displayName}
                            </button>
                          )}
                          {!expandable && (label?.type === 'alliance' ? displayName : (
                            <span
                              role="button"
                              tabIndex={-1}
                              className="modallink"
                              onClick={(evt) => {
                                evt.stopPropagation();
                                link('FACTION', {
                                  target: 'blank',
                                  args: { name },
                                });
                              }}
                            >
                              {displayName}
                            </span>
                          ))}
                          {title && <> <span className="faction-badge">{title}</span></>}
                        </td>
                      );
                    }
                    case 'user': {
                      if (!val) {
                        return (<td key={key}>{t`Private`}</td>);
                      }
                      const seperator = val.lastIndexOf(',');
                      if (seperator === -1) {
                        return (<td key={key}>{val}</td>);
                      }
                      const userId = val.substring(seperator + 1);
                      const userLabel = val.substring(0, seperator);
                      const flagSeperator = userLabel.indexOf('|');
                      const flag = flagSeperator === -1
                        ? null
                        : userLabel.substring(0, flagSeperator);
                      const flagIsMedia = flag?.startsWith('media:');
                      const staffIconName = getStaffIconName(flag);
                      const flagSrc = flagIsMedia
                        ? getUrlsFromMediaIdAndName(flag.substring(6))[0]
                        : `/cf/${staffIconName || flag}.${staffIconName ? 'png' : 'gif'}`;
                      const name = flagSeperator === -1
                        ? userLabel
                        : userLabel.substring(flagSeperator + 1);
                      return (
                        <td key={key}>
                          {flag && (
                            <img
                              src={cdn`${flagSrc}`}
                              className={`chatflag ranking-name-flag${
                                staffIconName ? ' staff-icon' : ''
                              }`}
                              alt=""
                            />
                          )}
                          <span
                            role="button"
                            tabIndex={-1}
                            className="modallink"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              link('USER', {
                                target: 'parent',
                                args: { username: userId },
                              });
                            }}
                          >
                            {name}
                          </span>
                        </td>
                      );
                    }
                    case 'mediaId': {
                      let [url,, thumb] = getUrlsFromMediaIdAndName(val);
                      if (thumb) {
                        thumb = `url(${cdn`${thumb}`})`;
                      }
                      return (
                        <td key={key}>
                          <div
                            className="search-media"
                            style={{
                              backgroundImage: thumb || undefined,
                            }}
                            onClick={(url) ? (evt) => {
                              evt.stopPropagation();
                              link('PLAYER', {
                                reuse: true,
                                target: 'blank',
                                args: { uri: url },
                              });
                            } : undefined}
                          />
                        </td>
                      );
                    }
                    case 'flagId': {
                      if (!val) {
                        return (<td key={key} />);
                      }
                      const isMedia = val?.startsWith('media:');
                      const url = isMedia
                        ? getUrlsFromMediaIdAndName(val.substring(6))[0]
                        : `/cf/${val}.gif`;
                      if (url) {
                        return (
                          <td key={key}>
                            <img
                              src={cdn`${url}`}
                              className="chatflag"
                              title={val}
                              alt=""
                            />
                          </td>
                        );
                      }
                      return (<td key={key} />);
                    }
                    case 'ts':
                      return (
                        <td key={key}>{
                          (new Date(val)).toLocaleDateString()
                        }</td>
                      );
                    default:
                      return (<td key={key}>{val}</td>);
                  }
                })}
              </tr>
              {expanded && (
                <tr className="ranking-alliance-members">
                  <td colSpan={visibleColumns}>
                    <div className="ranking-alliance-roster">
                      <strong>{t`Alliance Members`}</strong>
                      {label.members.length ? (
                        <ul>
                          {label.members.map((member) => (
                            <li key={member.id}>
                              <button
                                className="ranking-alliance-toggle"
                                type="button"
                                onClick={() => link('FACTION', {
                                  target: 'blank',
                                  args: { name: member.name },
                                })}
                              >
                                {member.tag && `[${member.tag}] `}{member.displayName}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : <p>{t`No member factions found.`}</p>}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

export default Table;
