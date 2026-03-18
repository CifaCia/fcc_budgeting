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

  if (source === 'degiro' || source === 'degiro_portfolio') {
    const isinIdx = raw.findIndex((col: string) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(col));
    if (isinIdx === -1) return null;

    const isin = raw[isinIdx];
    const name = raw[0] || raw[2]; 
    
    // Extract all numeric values from the row to find the right ones
    const allNumerics = raw.map((v: string, idx: number) => ({ 
      val: Math.abs(parseAmount(v)), 
      idx, 
      original: v 
    })).filter((n: any) => n.original && !isNaN(n.val) && n.val !== 0);

    let quantity = 0;
    let price = 0;
    let ticker = undefined;

    // Smart heuristic: In a portfolio row, we usually have Qty, Price, and Value.
    // Value = Qty * Price. We look for a trio that satisfies this.
    let foundMatch = false;
    let bestMatch = { q: 0, p: 0, score: -1 };

    for (let i = 0; i < allNumerics.length; i++) {
      for (let j = 0; j < allNumerics.length; j++) {
        if (i === j) continue;
        const q = allNumerics[i].val;
        const p = allNumerics[j].val;
        const product = q * p;
        
        const match = allNumerics.find((n: any, idx: number) => 
          idx !== i && idx !== j && Math.abs(n.val - product) / (n.val || 1) < 0.001
        );

        if (match) {
          let score = 0;
          
          // 1. Quantity is usually smaller than Value
          if (q < match.val) score += 20;
          
          // 2. Price is usually the one with more decimals (not always, but likely)
          const pDecimals = (p.toString().split('.')[1] || '').length;
          if (pDecimals >= 2) score += 10;

          // 3. Avoid "1" as a price if possible (often exchange rate or unit)
          if (p !== 1) score += 15;
          
          // 4. Quantity is very often an integer
          if (Number.isInteger(q)) score += 10;

          // 5. Column order: Qty is usually before Price in DEGIRO
          if (allNumerics[i].idx < allNumerics[j].idx) score += 5;

          if (score > bestMatch.score) {
            bestMatch = { q, p, score };
            foundMatch = true;
          }
        }
      }
    }

    if (foundMatch) {
      quantity = bestMatch.q;
      price = bestMatch.p;
    }

    // Fallback to old reliable offsets if heuristic fails
    if (!foundMatch) {
      if (source === 'degiro') {
        quantity = parseAmount(raw[6]);
        price = parseAmount(raw[7]);
      } else {
        if (isinIdx === 2) {
          ticker = raw[1];
          quantity = parseAmount(raw[3]);
          price = parseAmount(raw[5] || raw[4]);
        } else if (isinIdx === 1) {
          quantity = parseAmount(raw[2]);
          price = parseAmount(raw[3]);
        }
      }
    }

    return { isin, name, quantity, price, ticker };
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
              const info = parseHoldingsFromRaw('degiro_portfolio', row);
              const isin = info?.isin || '';
              // For Portfolio snapshots, the 'amount' represents the Total EUR Value of the holding
              amount = info ? (info.quantity * info.price) : 0;
              description = `Portfolio: ${info?.name || row[0] || ''} (${isin})`;
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
