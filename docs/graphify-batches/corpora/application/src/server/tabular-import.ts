import { ApiError } from "./api";
import * as XLSX from "xlsx";

function parseLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += char;
  }
  if (quoted) throw new ApiError(400, "INVALID_CSV", "CSV contains an unterminated quoted value.");
  values.push(value.trim());
  return values;
}

export function parseCsvRows(csv: string, maxRows = 1000) {
  if (typeof csv !== "string" || !csv.trim())
    throw new ApiError(400, "INVALID_CSV", "A non-empty CSV string is required.");
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2)
    throw new ApiError(400, "INVALID_CSV", "CSV requires headers and at least one row.");
  if (lines.length - 1 > maxRows)
    throw new ApiError(400, "INVALID_CSV", `CSV may contain at most ${maxRows} rows.`);
  const headers = parseLine(lines[0]).map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length)
    throw new ApiError(400, "INVALID_CSV", "CSV headers must be non-empty and unique.");
  return lines.slice(1).map((line, index) => {
    const values = parseLine(line);
    if (values.length !== headers.length)
      throw new ApiError(
        400,
        "INVALID_CSV",
        `CSV row ${index + 2} does not match the header width.`,
      );
    return Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]]));
  });
}

export function parseXlsxRows(base64: string, maxRows = 1000) {
  if (typeof base64 !== "string" || !base64.trim())
    throw new ApiError(400, "INVALID_XLSX", "A non-empty base64 XLSX payload is required.");
  let workbook: XLSX.WorkBook;
  try {
    const payload = base64.replace(/^data:[^;]+;base64,/i, "");
    workbook = XLSX.read(Buffer.from(payload, "base64"), { type: "buffer", cellFormula: false });
  } catch {
    throw new ApiError(400, "INVALID_XLSX", "The spreadsheet could not be read as XLSX.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError(400, "INVALID_XLSX", "The spreadsheet has no worksheets.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
  if (!rows.length)
    throw new ApiError(400, "INVALID_XLSX", "The spreadsheet requires headers and one row.");
  if (rows.length > maxRows)
    throw new ApiError(400, "INVALID_XLSX", `Spreadsheet may contain at most ${maxRows} rows.`);
  if (rows.some((row) => Object.keys(row).some((key) => !key.trim())))
    throw new ApiError(400, "INVALID_XLSX", "Spreadsheet headers must be non-empty.");
  return rows;
}
