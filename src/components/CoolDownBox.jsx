/**
 *
 */

import { memo } from 'preact/compat';
import { useSelector } from '../store/react-redux/index.js';

import {
  cooldownToString,
} from '../core/utils.js';


function formatActiveCooldown(coolDown) {
  if (!coolDown || coolDown <= 0) return '';
  return cooldownToString(coolDown);
}

const CoolDownBox = () => {
  const coolDown = useSelector((state) => state.user.coolDown);

  return (
    <div
      className={(coolDown && coolDown >= 50)
        ? 'cooldownbox show' : 'cooldownbox'}
    >
      {formatActiveCooldown(coolDown)}
    </div>
  );
};

export default memo(CoolDownBox);
