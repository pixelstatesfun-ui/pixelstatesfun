/*
 * Settings for minimap / overlay
 */



import { useState, useCallback, useRef } from 'preact/hooks';
import {
  useSelector, shallowEqual, useDispatch,
} from '../../store/react-redux/index.js';
import fileDownload from 'js-file-download';
import { c, t } from 'ttag';

import TemplateItem from '../TemplateItem.jsx';
import TemplateItemEdit from '../TemplateItemEdit.jsx';
import SettingsItem from '../SettingsItem.jsx';
import SettingsItemSelect from '../SettingsItemSelect.jsx';
import templateLoader from '../../ui/templateLoader.js';
import { selectPencilMode } from '../../store/actions/index.js';
import { PENCIL_MODE } from '../../core/constants.js';
import {
  toggleOVEnabled,
  toggleSmallPxls,
  setOvOpacity,
} from '../../store/actions/templates.js';


const Templates = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [
    list,
    oVEnabled,
    oSmallPxls,
    oOpacity,
    pencilMode,
  ] = useSelector((state) => [
    state.templates.list,
    state.templates.ovEnabled,
    state.templates.oSmallPxls,
    state.templates.oOpacity,
    state.canvas.pencilMode,
  ], shallowEqual);
  const [editingIndices, setEditingIndices] = useState([]);
  const close = useCallback(() => setShowAdd(false), []);
  const importRef = useRef();
  const dispatch = useDispatch();
  const pencilModesAvailable = [t`Selected Color`, t`From Template`];
  if (window.ssv?.backupurl) pencilModesAvailable.push(t`From History`);

  const toggleEditing = useCallback((title) => {
    const index = list.findIndex((z) => z.title === title);
    const ind = editingIndices.indexOf(index);
    setEditingIndices((ind === -1)
      ? [...editingIndices, index]
      : editingIndices.toSpliced(ind, 1),
    );
  }, [list, editingIndices]);

  return (
    <div className="content userarea templates-area">
      <h2>{t`Templates`}</h2>
      <section className="userarea-panel templates-intro">
        <p>
          {
            // eslint-disable-next-line max-len
            t`Tired of always spaming one single color? Want to create art instead, but you have to count pixels from some other image? Templates can help you with that! Templates can show as overlay and you can draw over them. One pixel on the template, should be one pixel on the canvas.`
          }
        </p>
        <p>{t`Shift-drag an overlay to reposition it.`}</p>
      </section>
      <section className="userarea-panel templates-options">
        <SettingsItemSelect
          title={t`Pencil Mode`}
          values={pencilModesAvailable}
          selected={pencilModesAvailable[pencilMode]}
          keyBind={c('keybinds').t`B`}
          onSelect={(mode) => {
            const selectedMode = pencilModesAvailable.indexOf(mode);
            if (selectedMode >= PENCIL_MODE.COLOR) {
              dispatch(selectPencilMode(selectedMode));
            }
          }}
        >
          {
            // eslint-disable-next-line max-len
            t`Choose whether the pencil uses your selected color, enabled templates, or canvas history.`
          }
        </SettingsItemSelect>
        <SettingsItem
          title={t`Enable Overlay`}
          keyBind={c('keybinds').t`T`}
          value={oVEnabled}
          onToggle={() => dispatch(toggleOVEnabled())}
        >
          {t`Show templates as overlays ingame.`}
        </SettingsItem>
        <SettingsItem
          title={t`Small Pixels When Zoomed`}
          value={oSmallPxls}
          onToggle={() => dispatch(toggleSmallPxls())}
        >
          {t`Show overlay as small individual pixels on high zoomlevels.`}
        </SettingsItem>

        <div className="setitem templates-opacity">
          <div className="setrow">
            <h3 className="settitle">
              {t`Overlay Opacity`}
            </h3>
            <div style={{ textAlign: 'right' }}>
              <input
                type="number"
                value={oOpacity}
                style={{ maxWidth: '6em' }}
                step="1"
                min="10"
                max="100"
                onChange={(evt) => dispatch(setOvOpacity(evt.target.value))}
              />
            </div>
          </div>
          <div className="modaldesc">{t`Opacity of Overlay in percent.`}</div>
        </div>
      </section>
      <section className="templates-list">
        {list.map(({
          enabled, imageId, canvasId, title, x, y, width, height,
        }, index) => (editingIndices.includes(index) ? (
          <TemplateItemEdit
            enabled={enabled}
            key={index}
            title={title}
            imageId={imageId}
            canvasId={canvasId}
            x={x}
            y={y}
            stopEditing={toggleEditing}
          />
        ) : (
          <TemplateItem
            enabled={enabled}
            key={index}
            title={title}
            imageId={imageId}
            canvasId={canvasId}
            x={x}
            y={y}
            width={width}
            height={height}
            startEditing={toggleEditing}
          />
        )))}
        {showAdd && <TemplateItemEdit stopEditing={close} />}
      </section>
      <div className="userarea-actions templates-actions">
        <button
          type="button"
          onClick={() => (showAdd ? close() : setShowAdd(true))}
        >
          {showAdd ? t`Cancel adding Template` : t`Add Template`}
        </button>
        {(list.some((z) => z.enabled)) && (
          <button
            type="button"
            onClick={async () => {
              const data = await templateLoader.exportEnabledTemplates();
              if (data) {
                fileDownload(
                  JSON.stringify(data), 'PixelStatesTemplates.json',
                );
              }
            }}
          >{t`Export enabled templates`}</button>
        )}
        <button
          type="button"
          onClick={() => importRef.current?.click()}
        >{t`Import templates`}</button>
        <input
          type="file"
          key="impin"
          ref={importRef}
          style={{ display: 'none' }}
          onChange={(evt) => {
            templateLoader.importTemplates(evt.target.files?.[0]);
          }}
        />
      </div>
    </div>
  );
};

export default Templates;
