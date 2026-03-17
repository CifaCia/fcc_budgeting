import csv
import json
import re

def parse_amount(val):
    if not val: return 0
    cleaned = str(val).strip()
    if '.' in cleaned and ',' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    elif ',' in cleaned:
        cleaned = cleaned.replace(',', '.')
    elif cleaned.count('.') > 1:
        cleaned = cleaned.replace('.', '')
    
    cleaned = re.sub(r'[^\d.-]', '', cleaned)
    try:
        return float(cleaned)
    except ValueError:
        return 0

total_net_worth = 0
with open('Transactions (1).csv', 'r') as f:
    reader = csv.reader(f)
    header = next(reader)
    for i, row in enumerate(reader):
        if not row: continue
        isin = row[3] if len(row) > 3 else ''
        # Logic from App: index 15 (Total EUR) or index 11 (Value EUR)
        raw_val_str = row[15] if len(row) > 15 and row[15] else (row[11] if len(row) > 11 else '0')
        raw_val = parse_amount(raw_val_str)
        
        # Inversion logic: if ISIN is present (buy/sell), invert. Else (cash), keep.
        amount = -raw_val if isin else raw_val
        total_net_worth += amount

print(f"Calculated Total Net Worth: {total_net_worth:,.2f}")
