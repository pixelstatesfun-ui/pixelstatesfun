/*
 * Rankings Tabs
 */

/* eslint-disable max-len */

import {
  useMemo, useCallback, useContext, useEffect, useRef, useState,
} from 'preact/hooks';
import { memo } from 'preact/compat';
import {
  shallowEqual, useSelector, useDispatch,
} from '../../store/react-redux/index.js';
import { t } from 'ttag';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  LineController,
  ArcElement,
} from 'chart.js';
import { Line, Pie } from '../../utils/react-chartjs';

import Table from '../Table.jsx';
import { cdn } from '../../utils/utag.js';
import { fetchStats } from '../../store/actions/thunks.js';
import { numberToString, numberToStringFull } from '../../core/utils.js';
import { selectIsDarkMode } from '../../store/selectors/gui.js';
import { selectStats } from '../../store/selectors/ranks.js';
import WindowContext from '../context/window.js';
import {
  getCHistChartOpts,
  getCHistChartData,
  getOnlineStatsOpts,
  getOnlineStatsData,
  getHistChartOpts,
  getHistChartData,
  getCPieOpts,
  getCPieData,
  getPDailyStatsOpts,
  getPDailyStatsData,
} from '../../core/chartSettings.js';
import CooldownChanges from '../CooldownChanges.jsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  LineController,
  // for pie chart
  ArcElement,
);

const Rankings = () => {
  const lastStatsFetch = useSelector((state) => state.ranks.lastFetch);
  const [
    totalRanking,
    totalDailyRanking,
    factionRanking,
    dailyFactionRanking,
    dailyCRanking,
    prevTop,
    onlineStats,
    cHistStats,
    cHourlyStats,
    histStats,
    pDailyStats,
    pHourlyStats,
  ] = useSelector(selectStats, shallowEqual);
  const isDarkMode = useSelector(selectIsDarkMode);
  const dispatch = useDispatch();
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const statsRequestPendingRef = useRef(false);

  const {
    args: { activeTab = 'total' },
    setArgs,
    setTitle,
  } = useContext(WindowContext);

  const tabNames = {
    total: t`Total`,
    today: t`Today`,
    yesterday: t`Yesterday`,
    factionsTotal: t`Factions Total`,
    factionsToday: t`Factions Today`,
    countries: t`Countries Today`,
    charts: t`Charts`,
  };

  const setActiveTab = useCallback((tab) => {
    setArgs({
      activeTab: tab,
    });
    setTitle(tabNames[tab]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setArgs, setTitle]);

  const loadStats = useCallback(async () => {
    if (statsRequestPendingRef.current) {
      return;
    }
    statsRequestPendingRef.current = true;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const result = await dispatch(fetchStats());
      if (result?.errors) {
        setStatsError(result.errors.join(', '));
      }
    } catch (error) {
      setStatsError(error.message);
    } finally {
      statsRequestPendingRef.current = false;
      setStatsLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    loadStats();
    const interval = window.setInterval(loadStats, 300000);
    return () => window.clearInterval(interval);
  }, [loadStats]);

  const [
    onlineOpts,
    histOpts,
    pDailyOpts,
    cHistOpts,
  ] = useMemo(() => {
    if (activeTab !== 'charts') {
      return [null, null, null, null];
    }
    return [
      getOnlineStatsOpts(isDarkMode),
      getHistChartOpts(isDarkMode),
      getPDailyStatsOpts(isDarkMode),
      getCHistChartOpts(isDarkMode),
    ];
  }, [activeTab, isDarkMode]);

  const cHistData = useMemo(() => {
    if (activeTab !== 'charts') {
      return null;
    }
    return getCHistChartData(cHistStats);
  }, [activeTab, cHistStats]);

  const onlineData = useMemo(() => {
    if (activeTab !== 'charts') {
      return null;
    }
    return getOnlineStatsData(onlineStats, pHourlyStats);
  }, [activeTab, onlineStats, pHourlyStats]);

  const histData = useMemo(() => {
    if (activeTab !== 'charts') {
      return null;
    }
    return getHistChartData(histStats);
  }, [activeTab, histStats]);

  const pDailyData = useMemo(() => {
    if (activeTab !== 'charts') {
      return null;
    }
    return getPDailyStatsData(pDailyStats);
  }, [activeTab, pDailyStats]);

  const cPieData = useMemo(() => {
    if (activeTab !== 'countries') {
      return null;
    }
    return getCPieData(dailyCRanking);
  }, [activeTab, dailyCRanking]);

  const cPieOpts = useMemo(() => {
    if (activeTab !== 'countries') {
      return null;
    }
    return getCPieOpts();
  }, [activeTab]);

  const tables = {
    total: totalRanking,
    today: totalDailyRanking,
    factionsTotal: factionRanking,
    factionsToday: dailyFactionRanking,
    yesterday: prevTop,
  };
  const availableTabs = Object.keys(tabNames);

  let content;

  if (tables[activeTab]) {
    const tableDescriptions = {
      total: t`Total Pixels per Player`,
      today: t`Daily Pixels per Player`,
      factionsTotal: t`Total Pixels per Faction`,
      factionsToday: t`Daily Pixels per Faction`,
      yesterday: t`Top 10 Players from Yesterday`,
    };
    const { rows, columnIds, types, uniqueColumnKey } = tables[activeTab];

    content = (
      <div className={`statwin-${activeTab}`} key={activeTab}>
        <h3>{tableDescriptions[activeTab]}</h3>
        <div className="statistics-table">
          {rows.length ? (
            <Table
              rows={rows}
              columnIds={columnIds}
              types={types}
              uniqueColumnKey={uniqueColumnKey}
              sortColumnKey={0}
            />
          ) : (
            <p role="status">{t`No ranking data available.`}</p>
          )}
        </div>
      </div>
    );
  } else if (activeTab === 'countries') {
    content = (
      <div className={`statwin-${activeTab}`} key={activeTab}>
        <CooldownChanges />
        <h3>{t`Daily Pixels per Country`}</h3>
        <div className="statistics-pie-chart">
          <Pie options={cPieOpts} data={cPieData} />
        </div>
        <table style={{ display: 'inline' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>{t`Country`}</th>
              <th>
                Pixels&nbsp;
                <span className="c-last-hour">{t`+last hour`}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {dailyCRanking.map((rank, ind) => (
              <tr key={rank.name}>
                <td>{ind + 1}</td>
                <td
                  title={rank.cc}
                  className="tab-cc-cell"
                >
                  <img
                    alt={rank.cc}
                    src={cdn`/cf/${rank.cc}.gif`}
                  />
                </td>
                <td className="c-num">
                  {numberToStringFull(rank.px)}
                  {(cHourlyStats[rank.cc] > 0) && (
                    <span className="c-last-hour">
                    &nbsp;+{numberToString(cHourlyStats[rank.cc])}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!dailyCRanking.length && (
          <p role="status">{t`No country statistics available.`}</p>
        )}
      </div>
    );
  } else if (activeTab === 'charts') {
    content = (
      <div className={`statwin-${activeTab}`} key={activeTab}>
        <div className="statistics-chart">
          <Line options={cHistOpts} data={cHistData} />
        </div>
        <div className="statistics-chart">
          <Line options={onlineOpts} data={onlineData} />
        </div>
        <div className="statistics-chart">
          <Line options={pDailyOpts} data={pDailyData} />
        </div>
        <div className="statistics-chart">
          <Line options={histOpts} data={histData} />
        </div>
      </div>
    );
  } else {
    content = (<h3>{t`Unavailable`}</h3>);
  }

  return (
    <div className="content statistics-content" key="factionpage">
      <nav className="statistics-tabs" aria-label={t`Statistics sections`}>
        {availableTabs.map((tab) => (
          <button
            type="button"
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tabNames[tab]}
          </button>
        ))}
      </nav>
      {statsError && (
        <p className="statistics-error" role="alert">
          {t`Could not load statistics:`} {statsError}
          {' '}
          <button type="button" onClick={loadStats}>{t`Retry`}</button>
        </p>
      )}
      {statsLoading && lastStatsFetch === 0 && (
        <p role="status">{t`Loading statistics...`}</p>
      )}
      {content}
      <p>
        {t`Ranking updates every 5 min. Daily rankings get reset at midnight UTC.`}
      </p>
    </div>
  );
};

export default memo(Rankings);
