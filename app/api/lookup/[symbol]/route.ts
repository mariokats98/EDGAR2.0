// app/api/lookup/[symbol]/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Needed for fetch + potential fs/crypto in Node

// --- Config ---
const SEC_UA =
  process.env.SEC_USER_AGENT ??
  'mkatsaros98@outlook.com Herevna/1.0'; // <-- set a real contact in Vercel env

// Cache the SEC ticker map in-memory for this server process
let __tickerMap: Record<string, string> | null = null;
let __tickerMapFetchedAt = 0;
const TICKER_MAP_TTL_MS = 60 * 60 * 1000; // 1 hour

// Helpers
function padCIK10(cik: string | number) {
  return String(cik).padStart(10, '0');
}
function unpadCIK(cik10: string) {
  return String(parseInt(cik10, 10)); // remove left padding for archive path
}

async function getTickerMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (__tickerMap && now - __tickerMapFetchedAt < TICKER_MAP_TTL_MS) {
    return __tickerMap;
  }

  const url = 'https://www.sec.gov/files/company_tickers.json';
  const res = await fetch(url, {
    headers: {
      'User-Agent': SEC_UA,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    // Allow Next.js to cache at the fetch layer too (edge/CDN) if desired
    next: { revalidate: 60 * 60 }, // 1 hour
  });

  if (!res.ok) {
    throw new Error(`SEC mapping fetch failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;

  // Transform to { [TICKER]: 10-digit CIK }
  const map = Object.values(data).reduce<Record<string, string>>((acc, x) => {
    acc[x.ticker.toUpperCase()] = padCIK10(x.cik_str);
    return acc;
  }, {});

  __tickerMap = map;
  __tickerMapFetchedAt = now;
  return map;
}

async function getLatestFiling(opts: {
  cik10: string;
  formType?: string | null;
}) {
  const { cik10, formType } = opts;
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': SEC_UA,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    next: { revalidate: 60 }, // 1 minute; tune as you like
  });

  if (!res.ok) {
    throw new Error(`Submissions fetch failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  const recent = data?.filings?.recent;
  if (!recent) throw new Error('Missing recent filings in submissions JSON');

  const rows = recent.accessionNumber.map((acc: string, i: number) => ({
    accessionNumber: acc, // e.g., 0001045810-24-000052
    accessionNoNoDashes: acc.replace(/-/g, ''), // e.g., 000104581024000052
    form: recent.form[i] as string,
    filingDate: recent.filingDate[i] as string | null,
    reportDate: recent.reportDate[i] as string | null,
    primaryDocument: recent.primaryDocument[i] as string, // e.g., nvda-20240128.htm
  }));

  const row = formType
    ? rows.find((r: any) => r.form.toUpperCase() === formType.toUpperCase())
    : rows[0];

  if (!row) {
    const available = Array.from(new Set(rows.map((r: any) => r.form))).slice(
      0,
      20
    );
    throw new Error(
      `No recent filings found for requested form "${formType}". Available (sample): ${available.join(
        ', '
      )}`
    );
  }

  return row;
}

function buildEdgarUrls(args: {
  cik10: string;
  accessionNoNoDashes: string;
  primaryDocument: string;
}) {
  const { cik10, accessionNoNoDashes, primaryDocument } = args;
  const cikUnpadded = unpadCIK(cik10);
  const base = `https://www.sec.gov/Archives/edgar/data/${cikUnpadded}/${accessionNoNoDashes}`;
  return {
    indexUrl: `${base}/${accessionNoNoDashes}-index.html`,
    primaryDocUrl: `${base}/${primaryDocument}`,
    txtFullSubmission: `${base}/${accessionNoNoDashes}.txt`,
  };
}

// GET /api/lookup/[symbol]?form=10-K
export async function GET(
  req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const form = searchParams.get('form'); // optional (e.g., 10-K, 10-Q, 8-K)
    const symbol = (params.symbol || '').toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol path param is required' },
        { status: 400 }
      );
    }

    const map = await getTickerMap();
    const cik10 = map[symbol];

    if (!cik10) {
      return NextResponse.json(
        {
          error: `Ticker not found in SEC mapping: ${symbol}`,
          hint: 'Ensure the symbol is a US-listed ticker tracked by the SEC mapping.',
        },
        { status: 404 }
      );
    }

    // Optionally fetch a recent filing & construct URLs
    let filing:
      | {
          accessionNumber: string;
          accessionNoNoDashes: string;
          form: string;
          filingDate: string | null;
          reportDate: string | null;
          primaryDocument: string;
        }
      | null = null;
    let urls:
      | {
          indexUrl: string;
          primaryDocUrl: string;
          txtFullSubmission: string;
        }
      | null = null;

    try {
      filing = await getLatestFiling({ cik10, formType: form });
      urls = buildEdgarUrls({
        cik10,
        accessionNoNoDashes: filing.accessionNoNoDashes,
        primaryDocument: filing.primaryDocument,
      });
    } catch (e: any) {
      // If filing fetch fails, still return the CIK so the client can act on it
      filing = null;
      urls = null;
    }

    return NextResponse.json(
      {
        symbol,
        cik_unpadded: unpadCIK(cik10),
        cik_10digit: cik10,
        ...(filing
          ? {
              latest: {
                form: filing.form,
                filingDate: filing.filingDate,
                reportDate: filing.reportDate,
                accessionNumber: filing.accessionNumber,
                primaryDocument: filing.primaryDocument,
                urls,
              },
            }
          : { latest: null }),
      },
      {
        headers: {
          // Light CORS for dev; tighten as needed
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60', // client/proxy cache hint
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Unexpected error' },
      { status: 500 }
    );
  }
}
