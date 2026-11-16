/*
 * Persistent bridge to the official IPQualityScore Python flat-file reader.
 */
import { spawn } from 'child_process';
import { createInterface } from 'readline';

import {
  IPQS_DB_IPV4_PATH,
  IPQS_DB_IPV6_PATH,
  IPQS_PYTHON,
  IPQS_READER_PATH,
  USE_IPQS_DB,
} from '../../core/config.js';

const PYTHON_WORKER = String.raw`
import json
import os
import sys

reader_path, ipv4_path, ipv6_path = sys.argv[1:4]
if not reader_path or not os.path.isdir(reader_path):
    raise RuntimeError(
        "IPQS_READER_PATH must point to the reader package directory"
    )
sys.path.insert(0, reader_path)

from IPQualityScore.DBReader import DBReader
from IPQualityScore.Exceptions import IPNotFoundException

readers = {}
for family, path in (("ipv4", ipv4_path), ("ipv6", ipv6_path)):
    if path:
        if not os.path.isfile(path):
            raise RuntimeError("IPQS database file does not exist: " + path)
        readers[family] = DBReader(path)

if not readers:
    raise RuntimeError("Configure at least one IPQS IPv4 or IPv6 database file")

def read(record, method, default=None, *args):
    try:
        return getattr(record, method)(*args)
    except (AttributeError, KeyError, IndexError):
        return default

def record_data(record):
    fraud_score = read(record, "FraudScore", None, 0)
    strict_fraud_score = read(record, "FraudScore", None, 1)
    columns = {}
    for column in record.GetColumns():
        value = column.Value()
        if isinstance(value, bytes):
            value = value.decode("utf-8", errors="replace")
        if value is None or isinstance(value, (str, int, float, bool)):
            columns[column.Name()] = value
    return {
        "isProxy": read(record, "IsProxy", False),
        "isVPN": read(record, "IsVPN", False),
        "isTOR": read(record, "IsTOR", False),
        "isCrawler": read(record, "IsCrawler", False),
        "isBot": read(record, "IsBot", False),
        "recentAbuse": read(record, "RecentAbuse", False),
        "isBlacklisted": read(record, "IsBlackListed", False),
        "isPrivate": read(record, "IsPrivate", False),
        "isMobile": read(record, "IsMobile", False),
        "hasOpenPorts": read(record, "HasOpenPorts", False),
        "isHostingProvider": read(record, "IsHostingProvider", False),
        "activeVPN": read(record, "ActiveVPN", False),
        "activeTOR": read(record, "ActiveTOR", False),
        "publicAccessPoint": read(record, "PublicAccessPoint", False),
        "frequentAbuser": read(record, "FrequentAbuser", False),
        "trustedApplication": read(record, "TrustedApplication", False),
        "securityScanner": read(record, "SecurityScanner", False),
        "sharedIP": read(record, "SharedIP", False),
        "dynamicIP": read(record, "DynamicIP", False),
        "connectionTypeRaw": read(record, "ConnectionTypeRaw", 0),
        "connectionType": read(record, "ConnectionType", "Unknown"),
        "abuseVelocityRaw": read(record, "AbuseVelocityRaw", 0),
        "abuseVelocity": read(record, "AbuseVelocity", "none"),
        "fraudScore": fraud_score,
        "strictFraudScore": strict_fraud_score,
        "country": read(record, "Country", ""),
        "city": read(record, "City", ""),
        "region": read(record, "Region", ""),
        "isp": read(record, "ISP", ""),
        "organization": read(record, "Organization", ""),
        "zipcode": read(record, "Zipcode", ""),
        "hostname": read(record, "Hostname", ""),
        "asn": read(record, "ASN", 0),
        "timezone": read(record, "Timezone", ""),
        "latitude": read(record, "Latitude", 0.0),
        "longitude": read(record, "Longitude", 0.0),
        "columns": columns,
    }


print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        ip = request["ip"]
        family = "ipv6" if ":" in ip else "ipv4"
        reader = readers.get(family)
        if reader is None:
            raise RuntimeError(
                "IPQS " + family.upper() + " database is not configured"
            )
        try:
            record = reader.Fetch(ip)
            response = {
                "id": request["id"],
                "found": True,
                "record": record_data(record),
            }
        except IPNotFoundException:
            response = {"id": request["id"], "found": False, "record": None}
        print(json.dumps(response), flush=True)
    except Exception as error:
        print(json.dumps({
            "id": request.get("id"),
            "error": str(error),
        }), flush=True)
`;

let worker;
let workerReady;
let requestId = 0;
const pendingRequests = new Map();

function failWorker(error) {
  workerReady = null;
  worker = null;
  pendingRequests.forEach(({ reject }) => reject(error));
  pendingRequests.clear();
}

function startWorker() {
  if (!USE_IPQS_DB) {
    return Promise.reject(new Error('IPQS database checks are disabled'));
  }
  if (workerReady) {
    return workerReady;
  }
  if (!IPQS_READER_PATH) {
    return Promise.reject(
      new Error('IPQS_READER_PATH is required when USE_IPQS_DB is enabled'),
    );
  }
  if (!IPQS_DB_IPV4_PATH && !IPQS_DB_IPV6_PATH) {
    return Promise.reject(
      new Error('Configure an IPQS IPv4 or IPv6 database file'),
    );
  }

  const child = spawn(IPQS_PYTHON, [
    '-u',
    '-c',
    PYTHON_WORKER,
    IPQS_READER_PATH,
    IPQS_DB_IPV4_PATH || '',
    IPQS_DB_IPV6_PATH || '',
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  worker = child;

  workerReady = new Promise((resolve, reject) => {
    let ready = false;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let response;
      try {
        response = JSON.parse(line);
      } catch (error) {
        console.error(`IPQS worker returned invalid JSON: ${error.message}`);
        return;
      }
      if (response.ready) {
        ready = true;
        resolve(child);
      } else {
        const pending = pendingRequests.get(response.id);
        if (pending) {
          pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(
              `IPQS database lookup failed: ${response.error}`,
            ));
          } else {
            pending.resolve(response);
          }
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      console.error(`IPQS reader: ${chunk.toString().trim()}`);
    });
    child.once('error', (error) => {
      failWorker(error);
      if (!ready) reject(error);
    });
    child.once('exit', (code, signal) => {
      const error = new Error(
        `IPQS reader stopped (code ${code ?? 'unknown'}, `
        + `signal ${signal || 'none'})`,
      );
      failWorker(error);
      if (!ready) reject(error);
    });
  });

  return workerReady;
}

export async function lookupIPQS(ip) {
  if (!((ip.includes(':') && IPQS_DB_IPV6_PATH) || (!ip.includes(':') && IPQS_DB_IPV4_PATH))) return { found: false };
  const child = await startWorker();
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ id, ip })}\n`, (error) => {
      if (error) {
        pendingRequests.delete(id);
        reject(error);
      }
    });
  });
}

process.once('exit', () => {
  if (worker && !worker.killed) {
    worker.kill();
  }
});
