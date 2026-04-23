function pushCell(rows: string[][], currentRow: string[], cell: string) {
  currentRow.push(cell);
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      pushCell(rows, currentRow, currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      pushCell(rows, currentRow, currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  pushCell(rows, currentRow, currentCell);
  rows.push(currentRow);

  const normalized = rows
    .map((row) => row.map((value) => value.trim()))
    .filter((row) => row.some((value) => value.length > 0));

  const [headerRow = [], ...dataRows] = normalized;
  const headers = headerRow.map((value) => value.trim());

  const records = dataRows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });

  return { headers, rows: records };
}

export function toCsv(headers: string[], rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  const allRows = [
    headers,
    ...rows.map((row) =>
      headers.map((header) => {
        const value = row[header];
        return value == null ? "" : String(value);
      }),
    ),
  ];

  return allRows
    .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
