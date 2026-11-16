/*
 * top left main menu
 */

// settings cog wheel
import FaCog from '../../icons/FaCog.svg';
// Questionmark
import FaQuestion from '../../icons/FaQuestion.svg';
// canvas icon
import FaFlipboard from '../../icons/FaFlipboard.svg';
// search icon
import FaSearch from '../../icons/FaSearch.svg';
// download symbol
import MdFileDownload from '../../icons/MdFileDownload.svg';
// 3d symbol,
import Md3dRotation from '../../icons/Md3dRotation.svg';
// bar chart
import IoIosStats from '../../icons/IoIosStats.svg';
import fileDownload from 'js-file-download';
import { t } from 'ttag';

import { getRenderer } from '../../ui/rendererFactory.js';
import { CANVAS_TYPES } from '../../core/constants.js';
import { toggleHistoricalView } from '../../store/actions/index.js';
import { notify } from '../../store/actions/thunks.js';

function download() {
  const renderer = getRenderer();
  const viewport = renderer.getViewport();
  if (!viewport) return;
  const filename = `pixelstates-${
    window.location.hash.replace('#', '').replaceAll(',', '-')
  }.png`;
  viewport.toBlob((blob) => fileDownload(blob, filename));
}

export default function mainMenu(store) {
  const elements = [{
    id: 'ca1',
    type: 'link',
    symbol: FaFlipboard,
    link: 'CANVAS_SELECTION',
    text: t`Canvas Selection`,
  }];

  const state = store.getState();

  if (state.canvas.rendererType !== CANVAS_TYPES.THREED) {
    elements.push({
      id: 'gl',
      type: 'func',
      symbol: Md3dRotation,
      func: () => {
        const {
          canvasIdent, canvasId, canvasSize, view,
        } = store.getState().canvas;
        const [x, y] = view.map(Math.round);
        // eslint-disable-next-line max-len
        window.location.href = `globe#${canvasIdent},${canvasId},${canvasSize},${x},${y}`;
      },
      text: t`Globe View`,
    });
  }

  if (state.canvas.rendererType !== CANVAS_TYPES.THREED) {
    const historyAvailable = !!window.ssv?.backupurl;
    elements.push({
      id: 'hi',
      type: historyAvailable ? 'boolean' : 'func',
      func: () => {
        if (!historyAvailable) {
          store.dispatch(notify(t`History is not configured on this server.`));
          return true;
        }
        store.dispatch(toggleHistoricalView());
        return true;
      },
      state: historyAvailable && state.canvas.isHistoricalView,
      text: t`History Mode`,
    });
  }

  elements.push({
    id: 'sc1',
    type: 'func',
    symbol: MdFileDownload,
    func: download,
    text: t`Make Screenshot`,
  },
  { id: 's1', type: 'spacer' },
  );

  elements.push({
    id: 'sea',
    type: 'link',
    symbol: FaSearch,
    link: 'SEARCH',
    reuse: true,
    text: t`Search`,
  });

  elements.push(
    {
      id: 'st',
      type: 'link',
      symbol: IoIosStats,
      link: 'STATISTICS',
      text: t`Statistics`,
    },
    { id: 's2', type: 'spacer' },
    {
      id: 'set',
      type: 'link',
      symbol: FaCog,
      link: 'SETTINGS',
      text: t`Settings`,
    },
    {
      id: 'he',
      type: 'link',
      symbol: FaQuestion,
      link: 'HELP',
      reuse: true,
      text: t`Help`,
    },
  );

  return elements;
}
