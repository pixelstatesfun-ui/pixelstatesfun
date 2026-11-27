import { memo } from 'preact/compat';
import { useSelector } from '../../store/react-redux/index.js';
import { t } from 'ttag';

import { MdPerson } from 'react-icons/md';
import {
  FaFire,
  FaNewspaper,
  FaPaintRoller,
  FaShieldAlt,
} from 'react-icons/fa';
import useLink from '../hooks/link.js';

const QuickAccessButtons = () => {
  const [isLoggedIn, templatesAvailable] = useSelector((state) => [
    Boolean(state.user.name),
    state.templates.available,
  ]);
  const link = useLink();

  return (
    <div className="quickaccess-buttons">
      <button
        type="button"
        id="quickuserarea"
        className="actionbuttons quickaccess-button"
        title={isLoggedIn ? t`User Area` : t`Log in`}
        aria-label={isLoggedIn ? t`User Area` : t`Log in`}
        onClick={() => link('USERAREA', { target: 'parent', reuse: true })}
      >
        <MdPerson />
      </button>

      <button
        type="button"
        id="quickfactions"
        className="actionbuttons quickaccess-button"
        title={t`Factions`}
        aria-label={t`Factions`}
        onClick={() => link('FACTIONS', { target: 'parent', reuse: true })}
      >
        <FaShieldAlt />
      </button>

      <button
        type="button"
        id="quicknews"
        className="actionbuttons quickaccess-button"
        title={t`Diplomatic News`}
        aria-label={t`Diplomatic News`}
        onClick={() => link('FACTIONS', {
          target: 'parent',
          reuse: true,
          args: { page: 'news' },
        })}
      >
        <FaNewspaper />
      </button>

      {templatesAvailable && (
        <button
          type="button"
          id="quicktemplates"
          className="actionbuttons quickaccess-button"
          title={t`Templates`}
          aria-label={t`Templates`}
          onClick={() => link('TEMPLATES', { target: 'parent', reuse: true })}
        >
          <FaPaintRoller />
        </button>
      )}

      <button
        type="button"
        id="quickfire"
        className="actionbuttons quickaccess-button"
        title="Fire"
        aria-label="Fire"
        onClick={() => link('FIRE', {
          target: 'parent',
          reuse: true,
        })}
      >
        <FaFire />
      </button>
    </div>
  );
};

export default memo(QuickAccessButtons);
