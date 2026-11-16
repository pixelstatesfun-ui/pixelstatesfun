import { memo } from 'preact/compat';
import { useDispatch, useSelector } from '../../store/react-redux/index.js';
import { cycleBrushSize } from '../../store/actions/index.js';
import { CANVAS_TYPES } from '../../core/constants.js';
import { t } from 'ttag';

const BrushButton = () => {
  const [brushSize, rendererType, vipTier] = useSelector((state) => [
    state.canvas.brushSize,
    state.canvas.rendererType,
    state.user.vipTier,
  ]);
  const dispatch = useDispatch();

  if (rendererType !== CANVAS_TYPES.TWOD) {
    return null;
  }

  return (
    <button
      id="brushbutton"
      className="actionbuttons"
      type="button"
      onClick={() => dispatch(cycleBrushSize(vipTier))}
      title={t`Brush size: ${brushSize}x${brushSize}. Click to change`}
      aria-label={t`Brush size: ${brushSize}x${brushSize}. Click to change`}
    >
      <span className="brushbutton-icon">{brushSize}x{brushSize}</span>
    </button>
  );
};

export default memo(BrushButton);
