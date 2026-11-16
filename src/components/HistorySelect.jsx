/*
 * LogIn Form
 */
import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { memo } from 'preact/compat';
import {
  useSelector, shallowEqual, useDispatch,
} from '../store/react-redux/index.js';
import { t } from 'ttag';

import {
  dateToString, getToday, stringToDate, stringToTime,
} from '../core/utils.js';
import { selectHistoricalTime } from '../store/actions/index.js';
import { requestHistoricalTimes } from '../store/actions/fetch.js';

const TIME_CACHE = new Map();

const HistorySelect = ({ id }) => {
  const dateSelect = useRef(null);
  const requestControllerRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [times, setTimes] = useState([]);
  const [max] = useState(getToday());

  const [
    canvasId,
    canvasStartDate,
    canvasEndDate,
    historicalDate,
    historicalTime,
  ] = useSelector((state) => [
    state.canvas.canvasId,
    state.canvas.canvasStartDate,
    state.canvas.canvasEndDate,
    state.canvas.historicalDate,
    state.canvas.historicalTime,
  ], shallowEqual);

  const dispatch = useDispatch();

  const setTime = useCallback((date, time) => {
    const timeString = time.substring(0, 2) + time.substring(3, 5);
    const dateString = dateToString(date);
    dispatch(selectHistoricalTime(dateString, timeString));
  }, [dispatch]);

  const handleDateChange = useCallback(async (date) => {
    if (requestControllerRef.current
      && !requestControllerRef.current.signal.aborted
    ) {
      requestControllerRef.current.abort();
    }
    const controller = new AbortController();
    requestControllerRef.current = controller;

    const key = `${date}/${canvasId}`;
    const cache = TIME_CACHE.get(key);
    if (cache && cache[1] > Date.now() - 30 * 60 * 1000) {
      requestControllerRef.current = null;
      setSubmitting(false);
      return cache[0];
    }

    setSubmitting(true);
    const newTimes = await requestHistoricalTimes(date, canvasId, controller);
    if (controller.signal.aborted
      || requestControllerRef.current !== controller
    ) {
      // got aborted by future request
      return null;
    }

    requestControllerRef.current = null;
    TIME_CACHE.set(key, [newTimes, Date.now()]);
    setSubmitting(false);
    return newTimes;
  }, [canvasId]);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
  }, []);

  const changeTime = useCallback(async (diff) => {
    if (!times.length || !dateSelect.current?.value) {
      return;
    }

    const newPos = times.indexOf(stringToTime(historicalTime)) + diff;
    let date = dateSelect.current.value;
    if (newPos >= times.length || newPos < 0) {
      if (newPos < 0) {
        dateSelect.current.stepDown(1);
      } else {
        dateSelect.current.stepUp(1);
      }
      date = dateSelect.current.value;
      const newTimes = await handleDateChange(date);
      if (newTimes === null) {
        return;
      }
      let newTime;
      if (newPos < 0 && newTimes.length > 0) {
        newTime = newTimes[newTimes.length - 1];
      } else {
        newTime = newTimes[0] || '00:00';
      }
      setTimes(newTimes);
      setTime(date, newTime);
      return;
    }
    setTime(date, times[newPos]);
  }, [historicalTime, times, handleDateChange, setTime]);

  // account for store getting changed somewhere else
  useEffect(() => {
    let active = true;
    (async () => {
      const date = stringToDate(historicalDate);
      const key = `${date}/${canvasId}`;
      const cache = TIME_CACHE.get(key);
      if (!cache || times !== cache[0]) {
        const newTimes = await handleDateChange(date);
        if (!active || newTimes === null) {
          return;
        }
        setTimes(newTimes);
      }
      if (active && cache && cache[0].length
        && !cache[0].includes(stringToTime(historicalTime))
      ) {
        setTime(date, cache[0][0]);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    historicalDate, historicalTime, canvasId, handleDateChange, setTime, times,
  ]);

  const selectedDate = stringToDate(historicalDate);
  const selectedTime = stringToTime(historicalTime);
  const displayedTimes = times.length ? times : [selectedTime];

  return (
    <div className="historyselect" id={id}>
      <input
        type="date"
        pattern="\d{4}-\d{2}-\d{2}"
        key="dateinput"
        value={selectedDate}
        min={canvasStartDate}
        max={canvasEndDate || max}
        ref={dateSelect}
        autoComplete="off"
        onChange={async (evt) => {
          const date = evt.target.value;
          if (!date) {
            return;
          }
          const newTimes = await handleDateChange(date);
          if (newTimes === null) {
            return;
          }
          setTimes(newTimes);
          setTime(date, newTimes[0] || '00:00');
        }}
      />
      <div key="timeselcon">
        <div key="timesel">
          <button
            type="button"
            className="hsar"
            disabled={!times.length || submitting}
            onClick={() => changeTime(-1)}
          >←</button>
          <select
            aria-label={t`Historical time`}
            value={selectedTime}
            disabled={!times.length || submitting}
            onChange={(evt) => setTime(selectedDate, evt.target.value)}
          >
            {displayedTimes.map((value) => (
              <option
                key={value}
                value={value}
              >
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="hsar"
            disabled={!times.length || submitting}
            onClick={() => changeTime(+1)}
          >→</button>
        </div>
        {submitting && <p>{`${t`Loading`}...`}</p>}
        {!times.length && !submitting && (
          <p>{t`No times available for this date`}</p>
        )}
      </div>
    </div>
  );
};

export default memo(HistorySelect);
