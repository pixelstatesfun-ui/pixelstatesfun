/**
 *
 */

import { memo } from 'preact/compat';
import {
  useSelector, shallowEqual, useDispatch,
} from '../store/react-redux/index.js';
import { t } from 'ttag';
import { CANVAS_TYPES } from '../core/constants.js';

import copy from '../utils/clipboard.js';
import { notify } from '../store/actions/thunks.js';
import { getProtectedTerritory } from '../core/factionTerritoryClient.js';


function renderCoordinates(cell) {
  return `(${cell.join(', ')})`;
}


const CoordinatesBox = () => {
  const [view, hover, rendererType] = useSelector((state) => [
    state.canvas.view,
    state.canvas.hover,
    state.canvas.rendererType,
  ], shallowEqual);
  const canvasId = useSelector((state) => state.canvas.canvasId);
  const dispatch = useDispatch();
  const protectedTerritory = hover
    ? getProtectedTerritory(canvasId, hover[0], hover[1]) : null;

  let coords;
  if (hover) {
    coords = hover;
  } else if (rendererType === CANVAS_TYPES.DUMMY) {
    coords = [];
  } else {
    const [x, y, z] = view;
    // eslint-disable-next-line max-len
    coords = (rendererType === CANVAS_TYPES.THREED ? [x, y, z] : [x, y]).map(Math.floor);
  }

  return (
    <div
      className="coorbox"
      onClick={() => {
        copy(window.location.hash);
        dispatch(notify(t`Copied`));
      }}
      role="button"
      title={protectedTerritory
        ? `Территория союзника [${protectedTerritory.tag}] (НАП)`
        : t`Copy to Clipboard`}
      tabIndex="0"
    >{
        renderCoordinates(coords)
      }</div>
  );
};

export default memo(CoordinatesBox);
