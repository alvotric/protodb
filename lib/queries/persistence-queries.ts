export function savedQueryListStatement(userId: string): { text: string; values: [string] } {
  return {
    text: `select id, name, sql, created_at
       from protodb_admin.saved_queries
       where user_id = $1
       order by created_at desc, id desc
       limit 200`,
    values: [userId],
  };
}

export function savedQueryDeleteStatement(id: string, userId: string): { text: string; values: [string, string] } {
  return {
    text: "delete from protodb_admin.saved_queries where id = $1 and user_id = $2 returning id",
    values: [id, userId],
  };
}

export function queryHistoryListStatement(
  userId: string,
  limit: number
): { text: string; values: [string, number] } {
  return {
    text: `select id, sql, status, row_count, duration_ms, error_message, error_position, created_at
       from protodb_admin.query_history
       where user_id = $1
       order by created_at desc, id desc
       limit $2`,
    values: [userId, limit],
  };
}
