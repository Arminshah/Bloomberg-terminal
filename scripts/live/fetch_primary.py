"""Expected values from primary sources, independent of the app's code (the 2.23.0 audit; development only).

Run: python3 -I fetch_primary.py   (reads SEC_USER_AGENT and FRED_API_KEY from the environment; never prints keys)
Writes primary.json beside this file (git-ignored: it is a snapshot).
"""
import json, os, sys, time, urllib.request, urllib.parse, csv, io, datetime

UA_SEC = os.environ.get('SEC_USER_AGENT', 'audit check@example.invalid')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'primary.json')


def get(url, headers=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 audit', **(headers or {})})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 * (i + 1))
    raise err


out = {'fetched': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sec': {}, 'finra': {}, 'nyfed': {}, 'ecb': {}, 'fred': {}, 'nasdaq': {}}

# --- SEC XBRL company facts -------------------------------------------------------------------------------------
CIKS = {'AAPL': 320193, 'MSFT': 789019, 'NVDA': 1045810, 'KO': 21344, 'BRK': 1067983, 'GOOGL': 1652044, 'APLD': 1144879, 'NBIS': 1513845, 'TSLA': 1318605, 'RIVN': 1874178}
for t, cik in CIKS.items():
    try:
        j = json.loads(get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json', {'User-Agent': UA_SEC}))
    except Exception as e:  # noqa: BLE001
        out['sec'][t] = {'error': str(e)}
        continue
    f = j.get('facts', {})
    rec = {'name': j.get('entityName')}
    cover = f.get('dei', {}).get('EntityCommonStockSharesOutstanding', {}).get('units', {}).get('shares', [])
    if cover:
        # The latest cover date; all class rows at that date (a company can give one per class).
        last_end = max(r['end'] for r in cover)
        rows = [r for r in cover if r['end'] == last_end]
        latest_filed = max(r['filed'] for r in rows)
        rows = [r for r in rows if r['filed'] == latest_filed]
        rec['cover_shares'] = {'end': last_end, 'filed': latest_filed, 'rows': [r['val'] for r in rows], 'sum': sum(r['val'] for r in rows)}
    def annual(concept, unit='USD', tax='us-gaap'):
        rows = f.get(tax, {}).get(concept, {}).get('units', {}).get(unit, [])
        by = {}
        for r in rows:
            if r.get('form', '').startswith('10-K') and r.get('fp') == 'FY' and r.get('start'):
                d = (datetime.date.fromisoformat(r['end']) - datetime.date.fromisoformat(r['start'])).days
                if 350 <= d <= 380:
                    k = r['end']
                    if k not in by or r['filed'] > by[k]['filed']:
                        by[k] = r
        return {k: by[k]['val'] for k in sorted(by)[-5:]}
    rec['net_income_fy'] = annual('NetIncomeLoss')
    rec['revenue_fy'] = annual('Revenues') or annual('RevenueFromContractWithCustomerExcludingAssessedTax')
    rec['eps_diluted_fy'] = annual('EarningsPerShareDiluted', 'USD/shares')
    out['sec'][t] = rec
    time.sleep(0.3)

# --- FINRA consolidated short interest (APLD) ------------------------------------------------------------------
try:
    body = json.dumps({'limit': 30, 'compareFilters': [{'compareType': 'EQUAL', 'fieldName': 'symbolCode', 'fieldValue': 'APLD'}],
                       'sortFields': ['-settlementDate']}).encode()
    req = urllib.request.Request('https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest', data=body,
                                 headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 audit'})
    with urllib.request.urlopen(req, timeout=60) as r:
        rows = json.loads(r.read())
    out['finra']['APLD'] = [{'date': x.get('settlementDate'), 'short': x.get('currentShortPositionQuantity'), 'avgVol': x.get('averageDailyVolumeQuantity'), 'days': x.get('daysToCoverQuantity')} for x in rows]
except Exception as e:  # noqa: BLE001
    out['finra']['error'] = str(e)

# --- New York Fed: EFFR and SOFR ---------------------------------------------------------------------------------
for name, path in [('EFFR', 'unsecured/effr'), ('SOFR', 'secured/sofr')]:
    try:
        j = json.loads(get(f'https://markets.newyorkfed.org/api/rates/{path}/last/5.json'))
        out['nyfed'][name] = [{'date': r['effectiveDate'], 'rate': r['percentRate']} for r in j['refRates']]
    except Exception as e:  # noqa: BLE001
        out['nyfed'][name] = {'error': str(e)}

# --- ECB: deposit facility rate and euro reference rates ---------------------------------------------------------
try:
    t = get('https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&lastNObservations=3').decode()
    out['ecb']['DFR'] = [{'date': r['TIME_PERIOD'], 'rate': r['OBS_VALUE']} for r in csv.DictReader(io.StringIO(t))]
except Exception as e:  # noqa: BLE001
    out['ecb']['DFR'] = {'error': str(e)}
for ccy in ['USD', 'JPY', 'GBP', 'MXN']:
    try:
        t = get(f'https://data-api.ecb.europa.eu/service/data/EXR/D.{ccy}.EUR.SP00.A?format=csvdata&lastNObservations=3').decode()
        out['ecb'][f'EUR{ccy}'] = [{'date': r['TIME_PERIOD'], 'rate': r['OBS_VALUE']} for r in csv.DictReader(io.StringIO(t))]
    except Exception as e:  # noqa: BLE001
        out['ecb'][f'EUR{ccy}'] = {'error': str(e)}

# --- FRED: S&P 500 and Dow closes (S&P Dow Jones Indices via FRED) -----------------------------------------------
key = os.environ.get('FRED_API_KEY')
for sid in ['SP500', 'DJIA', 'NASDAQ100', 'DGS10', 'DGS2']:
    if not key:
        out['fred'][sid] = {'error': 'FRED_API_KEY not set'}
        continue
    try:
        q = urllib.parse.urlencode({'series_id': sid, 'api_key': key, 'file_type': 'json', 'sort_order': 'desc', 'limit': 10})
        j = json.loads(get(f'https://api.stlouisfed.org/fred/series/observations?{q}'))
        out['fred'][sid] = [{'date': o['date'], 'value': o['value']} for o in j['observations']]
    except Exception as e:  # noqa: BLE001
        out['fred'][sid] = {'error': type(e).__name__}

# --- Nasdaq: official closes ------------------------------------------------------------------------------------
for sym, cls in [('AAPL', 'stocks'), ('NVDA', 'stocks'), ('MSFT', 'stocks'), ('KO', 'stocks'), ('APLD', 'stocks'), ('TSLA', 'stocks')]:
    try:
        today = datetime.date.today()
        q = urllib.parse.urlencode({'assetclass': cls, 'fromdate': (today - datetime.timedelta(days=10)).isoformat(), 'todate': today.isoformat(), 'limit': 10})
        j = json.loads(get(f'https://api.nasdaq.com/api/quote/{sym}/historical?{q}', {'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}))
        rows = (j.get('data') or {}).get('tradesTable', {}).get('rows', [])
        out['nasdaq'][sym] = [{'date': r['date'], 'close': r['close'], 'volume': r['volume']} for r in rows]
    except Exception as e:  # noqa: BLE001
        out['nasdaq'][sym] = {'error': str(e)}

json.dump(out, open(OUT, 'w'), indent=1)
print('wrote', OUT)
