export interface ForeignKeyColumnPair {
  column: string;
  refColumn: string;
}

export interface ForeignKeyMetadata {
  schema: string;
  table: string;
  column: string;
  constraintName: string;
  columns: ForeignKeyColumnPair[];
  refSchema: string;
  refTable: string;
  refColumn: string;
  onUpdate: string;
  onDelete: string;
}

export interface ForeignKeyMetadataRow {
  constraint_id: string;
  schema: string;
  table: string;
  constraint_name: string;
  column: string;
  ref_schema: string;
  ref_table: string;
  ref_column: string;
  ordinal_position: number;
  on_update: string;
  on_delete: string;
}

export function groupForeignKeyMetadata(rows: ForeignKeyMetadataRow[]): ForeignKeyMetadata[] {
  const grouped = new Map<string, ForeignKeyMetadata>();
  const orderedRows = [...rows].sort((a, b) =>
    a.constraint_id.localeCompare(b.constraint_id) || a.ordinal_position - b.ordinal_position
  );
  for (const row of orderedRows) {
    let foreignKey = grouped.get(row.constraint_id);
    if (!foreignKey) {
      foreignKey = {
        schema: row.schema,
        table: row.table,
        column: row.column,
        constraintName: row.constraint_name,
        columns: [],
        refSchema: row.ref_schema,
        refTable: row.ref_table,
        refColumn: row.ref_column,
        onUpdate: row.on_update,
        onDelete: row.on_delete,
      };
      grouped.set(row.constraint_id, foreignKey);
    }
    foreignKey.columns.push({ column: row.column, refColumn: row.ref_column });
  }
  return [...grouped.values()];
}
