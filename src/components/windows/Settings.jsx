/**
 *
 */

import { memo, useState } from 'preact/compat';
import {
  useSelector, shallowEqual, useDispatch,
} from '../../store/react-redux/index.js';
import { t } from 'ttag';

import SettingsItem from '../SettingsItem.jsx';
import SettingsItemSelect from '../SettingsItemSelect.jsx';
import LanguageSelect from '../LanguageSelect.jsx';
import {
  toggleGrid,
  togglePixelNotify,
  toggleActiveZones,
  toggleBrushAnimation,
  toggleMvmCtrls,
  toggleMute,
  toggleAutoZoomIn,
  toggleCompactPalette,
  toggleChatNotify,
  toggleCursor,
  togglePotatoMode,
  toggleLightGrid,
  toggleHistoricalView,
  selectStyle,
  setAudioVolume,
  setSoundVolume,
  setKeyBinding,
} from '../../store/actions/index.js';

const categories = [
  t`Display`,
  t`Controls`,
  t`Interface`,
  t`Sound`,
  t`Performance`,
  t`Other`,
  t`Key Bindings`,
];

const defaultKeyBindings = {
  grid: 'KeyG',
  pixelNotify: 'KeyX',
  historicalView: 'KeyH',
  mute: 'KeyM',
  copyCoordinates: 'KeyR',
  overlay: 'KeyT',
  easterEgg: 'KeyL',
  pencilMode: 'KeyB',
};

const bindings = [
  ['grid', t`Toggle Grid`],
  ['pixelNotify', t`Toggle Pixel Activity`],
  ['historicalView', t`Toggle Historical View`],
  ['mute', t`Toggle Sound`],
  ['copyCoordinates', t`Copy Coordinates`],
  ['overlay', t`Toggle Template Overlay`],
  ['easterEgg', t`Toggle Easter Egg`],
  ['pencilMode', t`Toggle Pencil Mode`],
];

function formatKey(code) {
  if (!code) return t`Not set`;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const labels = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
  };
  return labels[code] || code;
}

const toggleEntry = (opts) => ({
  cat: opts.cat,
  key: opts.key,
  title: opts.title,
  render: () => (
    <SettingsItem
      title={opts.title}
      value={opts.value}
      onToggle={opts.onToggle}
      deactivated={opts.deactivated}
    >
      {opts.children !== undefined ? opts.children : opts.desc}
    </SettingsItem>
  ),
});

const Settings = () => {
  const [category, setCategory] = useState(categories[0]);
  const [search, setSearch] = useState('');
  const [recordingBinding, setRecordingBinding] = useState(null);
  const [bindingError, setBindingError] = useState('');
  const [
    isGridShown,
    isPixelNotifyShown,
    areActiveZonesShown,
    animateBrush,
    isMvmCtrlsShown,
    autoZoomIn,
    compactPalette,
    isPotato,
    isLightGrid,
    selectedStyle,
    isMuted,
    chatNotify,
    cursor,
    isHistoricalView,
    audioVolume,
    soundVolumes,
    storedKeyBindings,
  ] = useSelector((state) => [
    state.gui.showGrid,
    state.gui.showPixelNotify,
    state.gui.showActiveZones,
    state.gui.animateBrush,
    state.gui.showMvmCtrls,
    state.gui.autoZoomIn,
    state.gui.compactPalette,
    state.gui.isPotato,
    state.gui.isLightGrid,
    state.gui.style,
    state.gui.mute,
    state.gui.chatNotify,
    state.gui.cursor,
    state.canvas.isHistoricalView,
    state.gui.audioVolume ?? 100,
    state.gui.soundVolumes,
    state.gui.keyBindings,
  ], shallowEqual);
  const dispatch = useDispatch();
  const audioAvailable = window.AudioContext
    || window.webkitAudioContext;
  const keyBindings = {
    ...defaultKeyBindings,
    ...storedKeyBindings,
  };

  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  const volumeItem = (title, value, onChange, desc, sound) => (
    <div className="setitem">
      <div className="setrow">
        <h3 className="settitle">{title}</h3>
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <input
            type="range"
            min="0"
            max="100"
            value={value}
            aria-label={title}
            onInput={(e) => onChange(Number(e.currentTarget.value))}
            disabled={!audioAvailable}
          />
          <span>{value}%</span>
        </label>
        {sound && (
          <button
            type="button"
            onClick={() => dispatch({ type: 's/PREVIEW_SOUND', sound })}
            disabled={!audioAvailable || isMuted}
          >
            {t`Preview`}
          </button>
        )}
      </div>
      <div className="modaldesc">{desc}</div>
    </div>
  );

  const keyBindingItem = ([binding, title]) => {
    const currentCode = keyBindings[binding];
    const recording = recordingBinding === binding;

    const recordKey = (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setRecordingBinding(null);
        setBindingError('');
        return;
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return;
      }

      const assigned = bindings.find(([otherBinding]) => (
        otherBinding !== binding
        && keyBindings[otherBinding] === event.code
      ));
      if (assigned) {
        setBindingError(t`That key is already assigned.`);
        return;
      }

      dispatch(setKeyBinding(binding, event.code));
      setRecordingBinding(null);
      setBindingError('');
    };

    return (
      <div className="setitem" key={binding}>
        <div className="setrow">
          <h3 className="settitle">{title}</h3>
          <button
            type="button"
            aria-label={title}
            onClick={() => {
              setBindingError('');
              setRecordingBinding(recording ? null : binding);
            }}
            onKeyDown={recordKey}
          >
            {recording ? t`Press a key…` : formatKey(currentCode)}
          </button>
        </div>
        {recording && (
          <div className="modaldesc">
            {t`Press Escape to cancel.`}
          </div>
        )}
        {bindingError && recording && (
          <div className="modaldesc warn">{bindingError}</div>
        )}
      </div>
    );
  };

  // ---------- Build searchable list of items ----------

  const items = [];

  // Display
  items.push(toggleEntry({
    cat: categories[0],
    key: 'grid',
    title: t`Show Grid`,
    desc: t`Turn on grid to highlight pixel borders.`,
    value: isGridShown,
    onToggle: () => dispatch(toggleGrid()),
  }));
  items.push(toggleEntry({
    cat: categories[0],
    key: 'pixelNotify',
    title: t`Show Pixel Activity`,
    desc: t`Show circles where pixels are placed.`,
    value: isPixelNotifyShown,
    onToggle: () => dispatch(togglePixelNotify()),
  }));
  items.push(toggleEntry({
    cat: categories[0],
    key: 'activeZones',
    title: t`Show Active Zones`,
    desc: t`Show fire markers for recent pixel activity.`,
    value: areActiveZonesShown,
    onToggle: () => dispatch(toggleActiveZones()),
  }));
  items.push(toggleEntry({
    cat: categories[0],
    key: 'lightGrid',
    title: t`Light Grid`,
    desc: t`Show Grid in white instead of black.`,
    value: isLightGrid,
    onToggle: () => dispatch(toggleLightGrid()),
  }));
  items.push(toggleEntry({
    cat: categories[0],
    key: 'cursor',
    title: t`Custom Cursor`,
    desc: t`Use our custom cursor`,
    value: cursor,
    onToggle: () => dispatch(toggleCursor()),
  }));
  if (window.ssv?.backupurl) {
    items.push(toggleEntry({
      cat: categories[0],
      key: 'historicalView',
      title: t`Historical View`,
      desc: t`Check out past versions of the canvas.`,
      value: isHistoricalView,
      onToggle: () => dispatch(toggleHistoricalView()),
    }));
  }

  // Controls
  items.push(toggleEntry({
    cat: categories[1],
    key: 'mvmCtrls',
    title: t`Always show Movement Controls`,
    desc: t`Always show movement control buttons`,
    value: isMvmCtrlsShown,
    onToggle: () => dispatch(toggleMvmCtrls()),
  }));
  items.push(toggleEntry({
    cat: categories[1],
    key: 'autoZoomIn',
    title: t`Auto Zoom In`,
    desc: t`Zoom in on canvas taps instead of placing pixels.`,
    value: autoZoomIn,
    onToggle: () => dispatch(toggleAutoZoomIn()),
  }));

  // Interface
  items.push(toggleEntry({
    cat: categories[2],
    key: 'compactPalette',
    title: t`Compact Palette`,
    desc: t`Display the palette in a compact form.`,
    value: compactPalette,
    onToggle: () => dispatch(toggleCompactPalette()),
  }));
  if (window.ssv?.availableStyles) {
    items.push({
      cat: categories[2],
      key: 'themes',
      title: t`Themes`,
      render: () => (
        <SettingsItemSelect
          title={t`Themes`}
          values={Object.keys(window.ssv.availableStyles)}
          selected={selectedStyle}
          onSelect={(style) => dispatch(selectStyle(style))}
        >
          {t`How PixelStates should look.`}
        </SettingsItemSelect>
      ),
    });
  }

  // Sound
  items.push(toggleEntry({
    cat: categories[3],
    key: 'mute',
    title: t`Disable Game Sounds`,
    value: !audioAvailable || isMuted,
    deactivated: !audioAvailable,
    onToggle: () => dispatch(toggleMute()),
    children: [
      t`All sound effects will be disabled.`,
      (!audioAvailable) && (
        <p className="warn">
          {t`AudioContext is unavailable; check privacy settings.`}
        </p>
      ),
    ],
  }));
  items.push(toggleEntry({
    cat: categories[3],
    key: 'chatNotify',
    title: t`Enable chat notifications`,
    desc: t`Play a sound when new chat messages arrive`,
    value: chatNotify,
    onToggle: () => dispatch(toggleChatNotify()),
  }));

  const soundVolumeSettings = [
    ['colorSelect', t`Color selection sound`],
    ['pixelPlacement', t`Pixel placement sound`],
    ['notification', t`Notification sound`],
    ['captchaAlert', t`Captcha alert sound`],
    ['infoAlert', t`Information alert sound`],
    ['errorAlert', t`Error alert sound`],
    ['stackFull', t`Pixel stack full sound`],
    ['cooldownEnd', t`Cooldown ready sound`],
    ['chatMessage', t`Chat message sound`],
  ];
  items.push({
    cat: categories[3],
    key: 'audioVolume',
    title: t`Game volume`,
    render: () => volumeItem(
      t`Game volume`,
      audioVolume,
      (v) => dispatch(setAudioVolume(v)),
      t`Master volume for all game sounds.`,
    ),
  });
  soundVolumeSettings.forEach(([sound, title]) => {
    items.push({
      cat: categories[3],
      key: sound,
      title,
      render: () => volumeItem(
        title,
        soundVolumes?.[sound] ?? 100,
        (v) => dispatch(setSoundVolume(sound, v)),
        t`Volume for this sound effect.`,
        sound,
      ),
    });
  });

  // Performance
  items.push(toggleEntry({
    cat: categories[4],
    key: 'potato',
    title: t`Potato Mode`,
    desc: t`For when you are playing on a potato.`,
    value: isPotato,
    onToggle: () => dispatch(togglePotatoMode()),
  }));
  items.push(toggleEntry({
    cat: categories[4],
    key: 'animateBrush',
    title: t`Animate brush`,
    desc: t`Animate the brush preview while moving it.`,
    value: animateBrush,
    onToggle: () => dispatch(toggleBrushAnimation()),
  }));

  // Other
  if (window.ssv?.langs && navigator.cookieEnabled) {
    items.push({
      cat: categories[5],
      key: 'language',
      title: t`Select Language`,
      render: () => (
        <div className="setitem">
          <div className="setrow">
            <h3 className="settitle">{t`Select Language`}</h3>
            <LanguageSelect />
          </div>
        </div>
      ),
    });
  }

  // Key bindings
  bindings.forEach(([binding, title]) => {
    items.push({
      cat: categories[6],
      key: `binding-${binding}`,
      title,
      render: () => keyBindingItem([binding, title]),
    });
  });

  const visibleItems = items.filter((item) => {
    if (isSearching) {
      return item.title.toLowerCase().includes(trimmedSearch);
    }
    return item.cat === category;
  });

  const clearSearch = () => setSearch('');

  let content;
  if (isSearching) {
    content = categories.map((cat) => {
      const group = visibleItems.filter((it) => it.cat === cat);
      if (!group.length) return null;
      return (
        <div key={cat}>
          <div className="settings-search-category">{cat}</div>
          {group.map((it) => (
            <div key={it.key}>{it.render()}</div>
          ))}
        </div>
      );
    });
  } else {
    content = visibleItems.map((it) => (
      <div key={it.key}>{it.render()}</div>
    ));
  }

  return (
    <div>
      <div className="settings-search">
        <div className="settings-search-wrapper">
          <svg
            className="settings-search-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M10 2a8 8 0 1 0 4.9 14.32l5.39 5.39 1.41-1.41-5.39-5.39A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"
            />
          </svg>
          <input
            type="search"
            value={search}
            aria-label={t`Search settings`}
            placeholder={t`Search settings…`}
            onInput={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') clearSearch();
            }}
          />
          {isSearching && (
            <button
              type="button"
              className="settings-search-clear"
              aria-label={t`Clear search`}
              onClick={clearSearch}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {!isSearching && (
        <div
          aria-label={t`Settings categories`}
          role="tablist"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 5%',
          }}
        >
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={category === name}
              className={
                'settings-category-tab'
                + (category === name ? ' selected' : '')
              }
              onClick={() => {
                setCategory(name);
                setSearch('');
                setRecordingBinding(null);
                setBindingError('');
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="content" role="tabpanel">
        <div
          className="settings-category-content"
          key={isSearching ? 'search' : category}
        >
          {visibleItems.length === 0 && (
            <div className="settings-search-empty">
              {t`No settings match your search.`}
            </div>
          )}
          {content}
        </div>
      </div>
    </div>
  );
};

export default memo(Settings);
