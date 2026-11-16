/*
 * Cron job of argumentless functions that will get run in a specific interval,
 * at full hours
 */
import { HOUR } from '../core/constants.js';

function getMsToNextFullHour() {
  const now = new Date();
  const msIntoHour = (now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1000
    + now.getUTCMilliseconds();
  return HOUR - msIntoHour;
}

class Cron {
  // timestamp of last run
  lastRun;
  // interval in hours
  interval;
  // whether to run once per UTC calendar day instead of every 24 hours
  daily;
  // array with functions to run
  functions;
  // timeout return
  timeout;

  // interval = how many hours between runs
  // lastRun = when this cron job was last run
  constructor(interval, lastRun = 0, daily = false) {
    this.checkForExecution = this.checkForExecution.bind(this);
    this.interval = interval;
    this.lastRun = lastRun;
    this.daily = daily;
    this.functions = [];

    this.timeout = setTimeout(
      this.checkForExecution, getMsToNextFullHour(),
    );
  }

  destructor() {
    clearTimeout(this.timeout);
  }

  checkForExecution() {
    this.timeout = setTimeout(
      this.checkForExecution, getMsToNextFullHour(),
    );
    const curDate = new Date();
    const curTime = curDate.getTime();
    let shouldRun = false;
    if (this.daily) {
      const utcDayStart = Date.UTC(
        curDate.getUTCFullYear(),
        curDate.getUTCMonth(),
        curDate.getUTCDate(),
      );
      if (utcDayStart > this.lastRun) {
        this.lastRun = utcDayStart;
        shouldRun = true;
      }
    } else if (curTime + 120000 > this.lastRun + this.interval * HOUR) {
      this.lastRun = curTime;
      shouldRun = true;
    }

    if (shouldRun) {
      // eslint-disable-next-line max-len
      console.info(`${curDate.toUTCString()}> Run cron events for interval: ${this.interval}h`);
      this.functions.forEach(async (item) => {
        try {
          await item();
        } catch (err) {
          console.error(`Error on cron job ${item?.name}: ${err.message}`);
        }
      });
    }
  }

  hook(func) {
    this.functions.push(func);
  }
}


function initializeDailyCron() {
  const now = new Date();
  // make it first run at midnight
  const lastRun = now.getTime()
    - now.getUTCHours() * HOUR
    - (now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1000;
  return new Cron(24, lastRun, true);
}

function initializeHourlyCron() {
  return new Cron(1);
}

export const DailyCron = initializeDailyCron();

export const HourlyCron = initializeHourlyCron();
