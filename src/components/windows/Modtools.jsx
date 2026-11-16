/*
 * Modtools
 */
import { useLayoutEffect, useContext, useCallback } from 'preact/hooks';
import { Fragment } from 'preact';
import { memo } from 'preact/compat';
import { t } from 'ttag';
import { useSelector } from '../../store/react-redux/index.js';

import WindowContext from '../context/window.js';
import Canvastools from '../Canvastools.jsx';
import Admintools from '../Admintools.jsx';
import Watchtools from '../Watchtools.jsx';
import ModLogTools from '../ModLogTools.jsx';
import IIDTools from '../IIDTools.jsx';
import ManageVip from '../ManageVip.jsx';
import ChaosTools from '../ChaosTools.jsx';
import CooldownTools from '../CooldownTools.jsx';
import { USERLVL } from '../../core/constants.js';

const CONTENT = {
  Canvas: Canvastools,
  Admin: Admintools,
  Watch: Watchtools,
  IID: IIDTools,
  Logs: ModLogTools,
  'Manage VIP': ManageVip,
  'Chaos Event': ChaosTools,
  Cooldown: CooldownTools,
};

function getPartLabel(part) {
  switch (part) {
    case 'Manage VIP':
      return t`Manage VIP`;
    case 'Chaos Event':
      return t`Chaos Event`;
    case 'Cooldown':
      return t`Cooldown`;
    default:
      return part;
  }
}

function Modtools() {
  const {
    args,
    setArgs,
    setTitle,
  } = useContext(WindowContext);
  const { activeTab } = args;

  const setActiveTab = useCallback((label) => {
    setArgs({
      activeTab: label,
    });
    setTitle(getPartLabel(label));
  }, [setArgs, setTitle]);

  const userlvl = useSelector((state) => state.user.userlvl);

  const parts = Object.keys(CONTENT)
    .filter((part) => {
      switch (part) {
        case 'Admin':
          return userlvl >= USERLVL.ADMIN;
        case 'Watch':
        case 'IID':
          return userlvl >= USERLVL.TRIALMOD;
        case 'Canvas':
          return userlvl >= USERLVL.JANNY;
        case 'Logs':
          return userlvl >= USERLVL.CHATMOD;
        case 'Manage VIP':
        case 'Chaos Event':
        case 'Cooldown':
          return userlvl >= USERLVL.ADMIN;
        default:
          return false;
      }
    });

  useLayoutEffect(() => {
    if (!activeTab || !parts.includes(activeTab)) {
      setActiveTab(parts[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, parts.join(',')]);

  const Content = CONTENT[activeTab];

  return (
    <>
      {(parts.length > 1) && (
        <div
          key="tabm"
          className="content tab-container margin-container"
        >
          {parts.map((part, ind) => (
            <Fragment key={part}>
              <span
                role="button"
                tabIndex={-1}
                className={
                  (activeTab === part) ? 'modallink selected' : 'modallink'
                }
                onClick={() => setActiveTab(part)}
              >{getPartLabel(part)}</span>
              {(ind !== parts.length - 1)
                && <span className="hdivider" />}
            </Fragment>
          ))}
          <div className="modaldivider" />
        </div>
      )}
      {Content && <Content />}
    </>
  );
}

export default memo(Modtools);
