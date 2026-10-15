import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';

export type Column = { header: string; key: string; width?: number; numFmt?: string };
export type Sheet = {
  name: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  /** Filas clave/valor que se pintan encima de la tabla (cabecera de documento) */
  meta?: [string, string | number | null | undefined][];
};

const QTY = '#,##0.###';
const MONEY = '#,##0.00 €';
export const fmt = { QTY, MONEY, DATE: 'dd/mm/yyyy', DATETIME: 'dd/mm/yyyy hh:mm' };

/** Genera un .xlsx con cabecera estilizada, filtros, panel fijo y totales legibles. */
export async function buildWorkbook(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gutitool';
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    let headerRow = 1;

    if (s.meta?.length) {
      for (const [k, v] of s.meta) {
        const r = ws.addRow([k, v ?? '']);
        r.getCell(1).font = { bold: true };
      }
      ws.addRow([]);
      headerRow = s.meta.length + 2;
    }

    const header = ws.getRow(headerRow);
    s.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
      cell.alignment = { vertical: 'middle' };
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.max(12, c.header.length + 4);
      if (c.numFmt) col.numFmt = c.numFmt;
    });

    for (const row of s.rows) {
      ws.addRow(s.columns.map((c) => normalize(row[c.key], c.numFmt)));
    }

    ws.views = [{ state: 'frozen', ySplit: headerRow }];
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow + s.rows.length, column: s.columns.length },
    };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Solo convierte según el formato de la columna: un SKU "00123" sigue siendo texto.
function normalize(v: unknown, numFmt?: string) {
  if (v === null || v === undefined) return null;
  if (numFmt && typeof v === 'string') {
    if (numFmt.includes('yyyy')) return new Date(v);
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v); // numeric de Postgres llega como string
  }
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return v as string | number;
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
