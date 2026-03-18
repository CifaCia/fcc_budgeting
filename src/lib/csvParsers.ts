import Papa from 'papaparse';
import CryptoJS from 'crypto-js';

export type CSVSource = 'abn_amro_checking' | 'abn_amro_savings' | 'degiro' | 'degiro_portfolio' | 'trade_republic';

export interface NormalizedTransaction {
  date: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  source: CSVSource;
  asset_type: string;
  raw_csv_row: any;
  row_hash: string;
  balance?: number;
  isin?: string;
}

export interface Holding {
  isin: string;
  name: string;
  source: string;
  shares: number;
  costBasis: number;
  avgCost: number;
  assetType: string;
}

export const parseHoldingsFromRaw = (source: string, raw: any): { isin: string; name: string; quantity: number; price: number; ticker?: string } | null => {
  if (!raw) return null;

  const parseAmount = (val: string | number): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    let cleaned = val.trim();
    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    } else if ((cleaned.match(/\./g) || []).length > 1) {
      cleaned = cleaned.replace(/\./g, '');
    }
    const result = parseFloat(cleaned.replace(/[^\d.-]/g, ''));
    return isNaN(result) ? 0 : result;
  };

  if (source === 'degiro') {
    // Date,Time,Product,ISIN,Reference exchange,Venue,Quantity,Price
    const isin = raw[3];
    if (!isin) return null;
    const name = raw[2];
    const quantity = parseAmount(raw[6]);
    const price = parseAmount(raw[7]);
    return { isin, name, quantity, price };
  }

  if (source === 'degiro_portfolio') {
    // Standard DEGIRO Portfolio usually: Product, ISIN, Symbol/Ticker, Quantity, Price, Value...
    // But can vary. We'll look for ISIN-like strings if index 1 isn't it.
    let isin = raw[1];
    let ticker = raw[2];
    let name = raw[0];
    let qtyIdx = 3;
    let priceIdx = 4;

    // Heuristic: If index 1 doesn't look like an ISIN (2 letters + 10 alphanumeric)
    if (isin && !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) {
      // Try to find ISIN in the row
      const foundISIN = raw.find((col: string) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(col));
      if (foundISIN) {
        const idx = raw.indexOf(foundISIN);
        isin = foundISIN;
        // Adjust other indices relative to ISIN
        ticker = raw[idx + 1];
        qtyIdx = idx + 2;
        priceIdx = idx + 3;
      }
    }

    if (!isin) return null;
    
    return { 
      isin, 
      name, 
      quantity: parseAmount(raw[qtyIdx]), 
      price: parseAmount(raw[priceIdx]),
      ticker: ticker && ticker.length < 10 ? ticker : undefined // Simple guard for ticker vs description
    };
  }

  return null;
};

const DEFAULT_MAPPINGS: Record<string, string> = {
  'albert heijn': 'Groceries',
  'jumbo': 'Groceries',
  'lidl': 'Groceries',
  'aldi': 'Groceries',
  'ns ': 'Transport',
  'uber': 'Transport',
  'spotify': 'Subscriptions',
  'netflix': 'Subscriptions',
  'disney+': 'Subscriptions',
  'amazon prime': 'Subscriptions',
  'rent': 'Housing',
  'mortgage': 'Housing',
  'vattenfall': 'Utilities',
  'ziggo': 'Utilities',
  'kpn': 'Utilities',
  't-mobile': 'Utilities',
  'salary': 'Income',
};

const autoDetectCategory = (description: string, customMappings: Record<string, string>): string => {
  const desc = description.toLowerCase();
  
  // Custom mappings take precedence
  for (const [keyword, category] of Object.entries(customMappings)) {
    if (desc.includes(keyword.toLowerCase())) return category;
  }

  // Fallback to defaults
  for (const [keyword, category] of Object.entries(DEFAULT_MAPPINGS)) {
    if (desc.includes(keyword)) return category;
  }
  
  return 'Uncategorized';
};

export const generateRowHash = (row: any, index?: number) => {
  const sortedKeys = Object.keys(row).sort();
  const sortedObj = sortedKeys.reduce((acc: any, key) => {
    acc[key] = row[key];
    return acc;
  }, {});
  if (index !== undefined) (sortedObj as any)._row_index = index;
  return CryptoJS.SHA256(JSON.stringify(sortedObj)).toString();
};

const parseAmount = (val: string | number): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let cleaned = val.trim();
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    cleaned = cleaned.replace(/\./g, '');
  }
  const result = parseFloat(cleaned.replace(/[^\d.-]/g, ''));
  return isNaN(result) ? 0 : result;
};

const detectAssetTypeFromISIN = (isin: string): string => {
  if (!isin) return 'cash';
  const etfPrefixes = ['IE', 'LU', 'FR', 'DE'];
  return etfPrefixes.some(prefix => isin.startsWith(prefix)) ? 'etf' : 'stock';
};

export const parseCSV = (
  file: File,
  source: CSVSource,
  customMappings: Record<string, string> = {}
): Promise<NormalizedTransaction[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      delimiter: source.startsWith('abn_amro') ? '\t' : ',',
      complete: (results) => {
        try {
          let data = results.data as string[][];
          let startIndex = (source === 'abn_amro_checking' || source === 'abn_amro_savings') ? 0 : 1;

          const normalized = data.slice(startIndex).map((row: string[], index: number): NormalizedTransaction => {
            const hash = generateRowHash(row, index);
            const today = new Date().toISOString().split('T')[0];
            
            let date = today;
            let amount = 0;
            let description = '';
            let assetType = 'cash';
            let balance: number | undefined;

            if (source.startsWith('abn_amro')) {
              const dateRaw = String(row[2]);
              date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
              amount = parseAmount(row[6]);
              balance = parseAmount(row[4]);
              description = row[7] || 'ABN Transaction';
              assetType = 'cash';
            } else if (source === 'degiro') {
              const [day, month, year] = row[0].split('-');
              date = `${year}-${month}-${day}`;
              const isin = row[3] || '';
              const rawTotal = parseAmount(row[15] || row[11] || '0');
              amount = isin ? -rawTotal : rawTotal;
              description = `${row[2] || ''} ${isin}`.trim();
              assetType = detectAssetTypeFromISIN(isin);
            } else if (source === 'degiro_portfolio') {
              const isin = row[1] || '';
              amount = parseAmount(row[6] || '0');
              description = `Portfolio: ${row[0] || ''} (${isin})`;
              assetType = detectAssetTypeFromISIN(isin);
            } else if (source === 'trade_republic') {
              date = row[0];
              amount = parseAmount(row[8]);
              description = row[2] || (row[1] || '').toLowerCase();
              assetType = 'etf';
            }

            const category = autoDetectCategory(description, customMappings);
            const holdingInfo = parseHoldingsFromRaw(source === 'degiro_portfolio' ? 'degiro' : source, row);

            return {
              date,
              amount,
              currency: 'EUR',
              description,
              category,
              source: source === 'degiro_portfolio' ? 'degiro' : source,
              asset_type: assetType,
              raw_csv_row: row,
              row_hash: hash,
              balance,
              isin: holdingInfo?.isin
            };
          });
          resolve(normalized);
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => reject(err),
    });
  });
};
