/**
 * Converts images to canvas palettes
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { useSelector, shallowEqual } from '../../store/react-redux/index.js';
import fileDownload from 'js-file-download';
import { jt, t } from 'ttag';

import {
  ColorDistanceCalculators,
  ImageQuantizerKernels,
  scaleImage,
  quantizeImage,
  addGrid,
} from '../../utils/imageFilters.js';
import { fileToCanvas } from '../../utils/imageFiles.js';
import printGIMPPalette from '../../core/exportGPL.js';
import { copyCanvasToClipboard } from '../../utils/clipboard.js';
function Converter() {
  const [
    canvasId,
    canvases,
    showHiddenCanvases,
  ] = useSelector((state) => [
    state.canvas.canvasId,
    state.canvas.canvases,
    state.gui.easterEgg,
  ], shallowEqual);

  const [selectedCanvas, selectCanvas] = useState(canvasId);
  const [inputImageCanvas, setInputImageCanvas] = useState(null);
  const [selectedStrategy, selectStrategy] = useState('Nearest');
  const [selectedColorDist, selectColorDist] = useState('Euclidean');
  const [selectedScaleKeepRatio, selectScaleKeepRatio] = useState(true);
  const [extraOpts, setExtraOpts] = useState({
    serpentine: true,
    minColorDistance: 0,
    GIMPerror: false,
  });
  const [scaleData, setScaleData] = useState({
    enabled: false,
    width: 10,
    height: 10,
    aa: true,
  });
  const [gridData, setGridData] = useState({
    enabled: false,
    light: false,
    offsetX: 0,
    offsetY: 0,
  });
  const [extraRender, setExtraRender] = useState(false);
  const [gridRender, setGridRender] = useState(false);
  const [scalingRender, setScalingRender] = useState(false);
  const [conversionError, setConversionError] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const outputCanvasRef = useRef(null);
  const progressRef = useRef(null);
  const imageLoadRef = useRef(0);

  useEffect(() => {
    if (!inputImageCanvas) {
      return undefined;
    }

    let active = true;
    const canvas = canvases[selectedCanvas];
    if (!canvas) {
      setConversionError(t`Choose a valid canvas before converting.`);
      setIsConverting(false);
      return () => {
        active = false;
      };
    }

    const colors = canvas.cli
      ? canvas.colors.slice(canvas.cli)
      : canvas.colors;
    if (!colors?.length) {
      setConversionError(t`The selected canvas has no usable color palette.`);
      setIsConverting(false);
      return () => {
        active = false;
      };
    }

    const convert = async () => {
      setConversionError('');
      setIsConverting(true);
      if (progressRef.current) progressRef.current.textContent = t`Loading...`;
      try {
        let image = inputImageCanvas;
        if (scaleData.enabled) {
          image = scaleImage(
            image,
            Number(scaleData.width),
            Number(scaleData.height),
            scaleData.aa,
          );
        }
        image = await quantizeImage(colors, image, {
          strategy: selectedStrategy,
          colorDist: selectedColorDist,
          ...extraOpts,
          onProgress: (progress) => {
            if (active && progressRef.current) {
              progressRef.current.textContent = (
                `Loading... ${Math.round(progress)} %`
              );
            }
          },
        });
        if (!active) return;
        if (gridData.enabled) {
          image = addGrid(
            image,
            gridData.light,
            gridData.offsetX,
            gridData.offsetY,
          );
        }
        const output = outputCanvasRef.current;
        const context = output?.getContext('2d');
        if (!output || !context) {
          throw new Error(t`The converted image could not be displayed.`);
        }
        output.width = image.width;
        output.height = image.height;
        context.drawImage(image, 0, 0);
        if (progressRef.current) progressRef.current.textContent = t`Done`;
      } catch (error) {
        if (active) {
          setConversionError(error.message || t`Image conversion failed.`);
          if (progressRef.current) {
            progressRef.current.textContent = t`Conversion failed`;
          }
        }
      } finally {
        if (active) setIsConverting(false);
      }
    };

    convert();
    return () => {
      active = false;
    };
  }, [
    selectedCanvas,
    inputImageCanvas,
    selectedStrategy,
    selectedColorDist,
    extraOpts,
    scaleData,
    gridData,
    canvases,
  ]);

  const {
    serpentine,
    minColorDistance,
    GIMPerror,
  } = extraOpts;
  const {
    enabled: gridEnabled,
    light: gridLight,
    offsetX: gridOffsetX,
    offsetY: gridOffsetY,
  } = gridData;
  const {
    enabled: scalingEnabled,
    width: scalingWidth,
    height: scalingHeight,
    aa: scalingAA,
  } = scaleData;

  const showExtraOptions = selectedStrategy !== 'Nearest'
    && selectedStrategy !== 'Riemersma';
  useEffect(() => {
    if (showExtraOptions) {
      setTimeout(() => setExtraRender(true), 10);
    }
  }, [showExtraOptions]);
  useEffect(() => {
    if (gridEnabled) {
      setTimeout(() => setGridRender(true), 10);
    }
  }, [gridEnabled]);
  useEffect(() => {
    if (scalingEnabled) {
      setTimeout(() => setScalingRender(true), 10);
    }
  }, [scalingEnabled]);

  const gimpLink = <a href="https://www.gimp.org">GIMP</a>;

  return (
    <div className="content">
      <h2>{t`Converter`}</h2>
      <div>{t`Choose Canvas`}:&nbsp;
        <select
          value={selectedCanvas}
          onChange={(e) => {
            const sel = e.target;
            selectCanvas(sel.options[sel.selectedIndex].value);
          }}
        >
          {
            Object.keys(canvases).map((canvas) => (
              (canvases[canvas].v
                || (canvases[canvas].hid && !showHiddenCanvases))
                ? null
                : (
                    <option
                      key={canvas}
                      value={canvas}
                    >
                      {
                        canvases[canvas].title
                      }
                    </option>
                  )
            ))
          }
        </select>
      </div>
      <h3>{t`Palette Download`}</h3>
      <div>
        {jt`Palette for ${gimpLink}`}:&nbsp;
        <button
          type="button"
          style={{ display: 'inline' }}
          onClick={() => {
            const canvas = canvases[selectedCanvas];
            const {
              title,
              desc,
              colors,
              cli = 0,
            } = canvas;
            fileDownload(
              printGIMPPalette(title, desc, colors.slice(cli)),
              `Pixelplanet${title}.gpl`,
            );
          }}
        >
          Download
        </button>
      </div>
      <h3>{t`Image Converter`}</h3>
      <p>{t`Convert an image to canvas colors`}</p>
      <input
        type="file"
        accept="image/*"
        onChange={async (evt) => {
          const [file] = evt.currentTarget.files || [];
          if (!file) return;
          imageLoadRef.current += 1;
          const currentLoad = imageLoadRef.current;
          setConversionError('');
          setIsConverting(false);
          try {
            const imageData = await fileToCanvas(file);
            if (currentLoad !== imageLoadRef.current) return;
            setInputImageCanvas(null);
            setScaleData({
              enabled: false,
              width: imageData.width,
              height: imageData.height,
              aa: true,
            });
            setInputImageCanvas(imageData);
          } catch (error) {
            if (currentLoad === imageLoadRef.current) {
              setConversionError(error.message || t`Could not load this image.`);
            }
          }
        }}
      />
      <p>{t`Choose Strategy`}:&nbsp;
        <select
          value={selectedStrategy}
          onChange={(e) => {
            const sel = e.target;
            selectStrategy(sel.options[sel.selectedIndex].value);
          }}
        >
          {
            ImageQuantizerKernels.map((strat) => (
              <option
                key={strat}
                value={strat}
              >{strat}</option>
            ))
          }
        </select>
      </p>
      {(showExtraOptions || extraRender) && (
        <div
          className={(showExtraOptions && extraRender)
            ? 'convBox show'
            : 'convBox'}
          onTransitionEnd={() => {
            if (!showExtraOptions) setExtraRender(false);
          }}
        >
          <p style={{ fontHeight: 16 }}>
            <input
              type="checkbox"
              checked={serpentine}
              onChange={(e) => {
                setExtraOpts({
                  ...extraOpts,
                  serpentine: e.target.checked,
                });
              }}
            />
            {t`Serpentine`}
          </p>
          <span>{t`Minimum Color Distance`}:&nbsp;
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              style={{ width: '4em' }}
              value={minColorDistance}
              onChange={(e) => {
                setExtraOpts({
                  ...extraOpts,
                  minColorDistance: e.target.value,
                });
              }}
            />&nbsp;
          </span>
          <p style={{ fontHeight: 16 }}>
            <input
              type="checkbox"
              checked={GIMPerror}
              onChange={(e) => {
                setExtraOpts({
                  ...extraOpts,
                  GIMPerror: e.target.checked,
                });
              }}
            />
            {t`Calculate like GIMP`}
          </p>
        </div>
      )}
      <p>{t`Choose Color Mode`}:&nbsp;
        <select
          value={selectedColorDist}
          onChange={(e) => {
            const sel = e.target;
            selectColorDist(sel.options[sel.selectedIndex].value);
          }}
        >
          {
            ColorDistanceCalculators.map((strat) => (
              <option
                key={strat}
                value={strat}
              >{strat}</option>
            ))
          }
        </select>
      </p>
      <p style={{ fontHeight: 16 }}>
        <input
          type="checkbox"
          checked={gridEnabled}
          onChange={(e) => {
            setGridData({
              ...gridData,
              enabled: e.target.checked,
            });
          }}
        />
        {t`Add Grid (uncheck if you need a 1:1 template)`}
      </p>
      {(gridEnabled || gridRender) && (
        <div
          className={(gridEnabled && gridRender) ? 'convBox show' : 'convBox'}
          onTransitionEnd={() => {
            if (!gridEnabled) setGridRender(false);
          }}
        >
          <p style={{ fontHeight: 16 }}>
            <input
              type="checkbox"
              checked={gridLight}
              onChange={(e) => {
                setGridData({
                  ...gridData,
                  light: e.target.checked,
                });
              }}
            />
            {t`Light Grid`}
          </p>
          <span>{t`Offset`} X:&nbsp;
            <input
              type="number"
              step="1"
              min="0"
              max="10"
              style={{ width: '2em' }}
              value={gridOffsetX}
              onChange={(e) => {
                setGridData({
                  ...gridData,
                  offsetX: e.target.value,
                });
              }}
            />&nbsp;
          </span>
          <span>{t`Offset`} Y:&nbsp;
            <input
              type="number"
              step="1"
              min="0"
              max="10"
              style={{ width: '2em' }}
              value={gridOffsetY}
              onChange={(e) => {
                setGridData({
                  ...gridData,
                  offsetY: e.target.value,
                });
              }}
            />
          </span>
        </div>
      )}
      <p style={{ fontHeight: 16 }}>
        <input
          type="checkbox"
          checked={scalingEnabled}
          onChange={(e) => {
            setScaleData({
              ...scaleData,
              enabled: e.target.checked,
            });
          }}
        />
        {t`Scale Image`}
      </p>
      {(scalingEnabled || scalingRender) && (
        <div
          className={(scalingEnabled && scalingRender)
            ? 'convBox show'
            : 'convBox'}
          onTransitionEnd={() => {
            if (!scalingEnabled) setScalingRender(false);
          }}
        >
          <span>{t`Width`}:&nbsp;
            <input
              type="number"
              step="1"
              min="1"
              max="1024"
              style={{ width: '3em' }}
              value={scalingWidth}
              onChange={(e) => {
                const newWidth = (e.target.value > 1024)
                  ? 1024 : e.target.value;
                if (!newWidth) return;
                if (selectedScaleKeepRatio && inputImageCanvas) {
                  const ratio = inputImageCanvas.width
                    / inputImageCanvas.height;
                  const newHeight = Math.round(newWidth / ratio);
                  if (newHeight <= 0) return;
                  setScaleData({
                    ...scaleData,
                    width: newWidth,
                    height: newHeight,
                  });
                  return;
                }
                setScaleData({
                  ...scaleData,
                  width: newWidth,
                });
              }}
            />&nbsp;
          </span>
          <span>{t`Height`}:&nbsp;
            <input
              type="number"
              step="1"
              min="1"
              max="1024"
              style={{ width: '3em' }}
              value={scalingHeight}
              onChange={(e) => {
                const nuHeight = (e.target.value > 1024)
                  ? 1024 : e.target.value;
                if (!nuHeight) return;
                if (selectedScaleKeepRatio && inputImageCanvas) {
                  const ratio = inputImageCanvas.width
                    / inputImageCanvas.height;
                  const nuWidth = Math.round(ratio * nuHeight);
                  if (nuWidth <= 0) return;
                  setScaleData({
                    ...scaleData,
                    width: nuWidth,
                    height: nuHeight,
                  });
                  return;
                }
                setScaleData({
                  ...scaleData,
                  height: nuHeight,
                });
              }}
            />
          </span>
          <p style={{ fontHeight: 16 }}>
            <input
              type="checkbox"
              checked={selectedScaleKeepRatio}
              onChange={(e) => {
                selectScaleKeepRatio(e.target.checked);
              }}
            />
            {t`Keep Ratio`}
          </p>
          <p style={{ fontHeight: 16 }}>
            <input
              type="checkbox"
              checked={scalingAA}
              onChange={(e) => {
                setScaleData({
                  ...scaleData,
                  aa: e.target.checked,
                });
              }}
            />
            {t`Anti Aliasing`}
          </p>
          <button
            type="button"
            onClick={() => {
              if (inputImageCanvas) {
                setScaleData({
                  ...scaleData,
                  width: inputImageCanvas.width,
                  height: inputImageCanvas.height,
                });
              }
            }}
          >
            {t`Reset`}
          </button>
        </div>
      )}
      {(inputImageCanvas)
        ? (
            <div>
              <p ref={progressRef} aria-live="polite">...</p>
              {conversionError && (
                <p className="errormessage" role="alert">{conversionError}</p>
              )}
              <p>
                <canvas
                  ref={outputCanvasRef}
                  style={{ width: '80%', imageRendering: 'crisp-edges' }}
                />
              </p>
              <button
                type="button"
                disabled={isConverting}
                onClick={() => {
                  const output = outputCanvasRef.current;
                  if (!output) return;
                  output.toBlob((blob) => {
                    if (blob) {
                      fileDownload(blob, 'ppfunconvert.png');
                    } else {
                      setConversionError(t`Could not create the converted image file.`);
                    }
                  });
                }}
              >
                {t`Download Template`}
              </button>
              {(typeof ClipboardItem === 'undefined')
                ? null
                : (
                    <button
                      type="button"
                      disabled={isConverting}
                      onClick={() => {
                        if (outputCanvasRef.current) {
                          copyCanvasToClipboard(outputCanvasRef.current);
                        }
                      }}
                    >
                      {t`Copy to Clipboard`}
                    </button>
                  )}
            </div>
          ) : null}
    </div>
  );
}

export default Converter;
