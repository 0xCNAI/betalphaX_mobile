# Firestore Schema Documentation

## 1. Transactions Collection (`transactions`)

Stores individual buy/sell records.

### Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | Firestore Document ID |
| `schemaVersion` | number | Schema version (currently 2) |
| `userId` | string | User ID |
| `asset` | string | Asset symbol (e.g., 'BTC') |
| `chain` | string \| null | Blockchain network (e.g., 'Ethereum') |
| `type` | 'buy' \| 'sell' | Transaction type |
| `amount` | number | Amount of asset |
| `price` | number | Price per unit |
| `status` | 'open' \| 'closed' | Transaction status |
| `date` | string | **Transaction Day** (YYYY-MM-DD), fixed at 00:00:00 local representation |
| `timestamp` | string | **Main Sort Field** (ISO 8601), full precision |
| `createdAt` | string | **Creation Time** (ISO 8601), server write time |
| `positionId` | string \| null | ID of the parent Position |
| `entryIndex` | number \| null | Sequence number within the Position (1, 2, ...) |
| `memo` | string | Entry notes |
| `exitMemo` | string | Exit notes |
| `tags` | string[] | Entry tags |
| `exitTags` | string[] | Exit tags |
| `confidence` | string \| null | Confidence level |
| `emotion` | string \| null | Emotional state |
| `ai_entry_summary` | string \| null | AI summary of entry |
| `ai_exit_plan` | string \| null | AI exit plan |
| `ai_risk_comment` | string \| null | AI risk assessment |
| `ai_ta_snapshot` | object \| null | Structured TA snapshot (see below) |
| `market_context_snapshot` | object | Snapshot of market conditions (BTC dom, sentiment, etc.) |
| `closeDate` | string \| null | Date when closed |
| `closePrice` | number \| null | Price when closed |
| `pnl` | number | Realized PnL amount |
| `pnl_abs` | number \| null | Absolute PnL |
| `pnl_pct` | number \| null | Percentage PnL |

### AI TA Snapshot Structure (`ai_ta_snapshot`)

```json
{
  "timeframe": "4h" | "1d" | null,
  "trend": "bullish" | "bearish" | "range" | null,
  "key_levels": ["Support at X", "Resistance at Y"],
  "volatility_comment": string | null,
  "overall_verdict": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" | null
}
```

---

## 2. Positions Collection (`positions`)

Aggregates transactions for a specific asset/trade cycle.

### Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | Firestore Document ID |
| `schemaVersion` | number | Schema version (currently 1) |
| `userId` | string | User ID |
| `asset` | string | Asset symbol |
| `chain` | string \| null | Blockchain network |
| `status` | 'open' \| 'closed' | Position status |
| `createdAt` | string | Creation time (ISO 8601) |
| `updatedAt` | string | Last update time (ISO 8601) |
| `closedAt` | string \| null | Closing time (ISO 8601) |
| `current_size` | number | Current net holding size |
| `total_buy_amount` | number | Total amount bought |
| `total_cost` | number | Total cost basis |
| `avg_entry_price` | number | Average entry price |
| `realized_pnl_abs` | number | Total realized PnL (absolute) |
| `realized_pnl_pct` | number | Total realized PnL (%) |
| `transactionIds` | string[] | List of transaction IDs in this position |
| `main_thesis` | string \| null | Main thesis for the position |
| `main_exit_reason` | string \| null | Main reason for exit |

---

## 3. Metrics Summary Collection (`metrics_summary`)

Stores aggregated stats for fast dashboard loading.
Path: `users/{userId}/metrics_summary/{docId}` (or subcollections)

### Fields (Daily Summary)

| Field | Type | Description |
| :--- | :--- | :--- |
| `date` | string | YYYY-MM-DD |
| `daily_tx_count` | number | Transactions count for the day |
| `daily_realized_pnl` | number | Realized PnL for the day |
| `daily_volume` | number | Volume for the day |

---

## Recommended Firestore Indexes

### Transactions
*   `userId` ASC, `date` DESC, `asset` ASC
*   `userId` ASC, `status` ASC, `date` DESC
*   `userId` ASC, `positionId` ASC

### Positions
*   `userId` ASC, `status` ASC, `updatedAt` DESC
*   `userId` ASC, `asset` ASC, `status` ASC
