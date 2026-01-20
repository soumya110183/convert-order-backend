# Production Fix: SAP Code Quantity Bug

## Bug Analysis

### Root Cause
PDF rows are split across 2 lines:
```
Line 1: 1 1013 DIANORM-OD- 60MG TAB 1X10
Line 2: 30 2314.20
```

**Current behavior:**
- Rows merged into: `"1 1013 DIANORM-OD- 60MG TAB 1X10 2314.20 30"`
- extractQuantityFromMergedLine finds: `1013` (SAP code) ❌
- Should find: `30` (actual quantity) ✅

**Why it happens:**
1. SAP codes (1000-9999) are 4-digit numbers
2. Current blocking only blocks 3-6 digits at positions 1-3
3. Position check fails when rows are merged differently
4. SAP code 1013 passes validation and gets selected

## Minimal Production Fixes

### Fix 1: Enhanced SAP Code Blocking
```javascript
// Block ALL 4-digit numbers (1000-9999) that could be SAP codes
if (val >= 1000 && val <= 9999) {
  console.log(`  [BLOCKED] SAP code: ${val}`);
  continue;
}
```

### Fix 2: Amount-Anchored Quantity Extraction
```javascript
// Find quantity as: last valid integer BEFORE decimal amount
// In "30 2314.20", quantity = 30 (immediately before amount)
```

### Fix 3: Better Row Merging Detection
```javascript
// Detect qty-price lines: "30 2314.20" or "30 0 2314.20"
// Must have decimal amount at end
```

## Implementation

See code changes in unifiedParser.js
