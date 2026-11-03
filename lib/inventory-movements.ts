/**
 * Stock writes moved to hms_stock_movement and the hms_request_stock_completion
 * database trigger (20261103080000). No best-effort read/write/log helpers remain:
 * completion, stock, movement and audit must commit or roll back together.
 */
export {};
