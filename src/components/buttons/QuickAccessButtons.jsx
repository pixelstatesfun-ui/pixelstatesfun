import { memo } from 'preact/compat';
import { useSelector } from '../../store/react-redux/index.js';
import { t } from 'ttag';

import FaPaintRoller from '../../icons/FaPaintRoller.svg';
import MdPerson from '../../icons/MdPerson.svg';
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
    </div>
  );
};

export default memo(QuickAccessButtons);
