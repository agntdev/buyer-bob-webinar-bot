import type { Registrant } from "./store.js";
import { CSV_EXPORT_LIMIT } from "./config.js";

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build a CSV string for up to CSV_EXPORT_LIMIT registrants.
 * Returns the CSV body and whether the list was truncated.
 */
export function buildRegistrantsCsv(registrants: Registrant[]): {
  csv: string;
  truncated: boolean;
  count: number;
} {
  const truncated = registrants.length > CSV_EXPORT_LIMIT;
  const slice = truncated ? registrants.slice(0, CSV_EXPORT_LIMIT) : registrants;
  const header = [
    "telegram_id",
    "name",
    "email",
    "phone",
    "registration_timestamp",
    "confirmation_status",
  ];
  const lines = [header.join(",")];
  for (const r of slice) {
    lines.push(
      [
        String(r.telegram_id),
        escapeCell(r.name),
        escapeCell(r.email),
        escapeCell(r.phone),
        new Date(r.registration_timestamp).toISOString(),
        r.confirmation_status,
      ].join(","),
    );
  }
  return { csv: lines.join("\n") + "\n", truncated, count: slice.length };
}
