export interface QueryResult<T = Record<string, any>> {
  rows: T[];
  rowCount?: number | null;
}
export interface DbClient {
  query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<QueryResult<T>>;
  release(): void;
}
export interface Database extends Omit<DbClient, "release"> {
  connect(): Promise<DbClient>;
}
export interface PrivateStore {
  set(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<ArrayBuffer | null>;
  delete(key: string): Promise<void>;
}
export interface Mail {
  to: string;
  subject: string;
  text: string;
  messageId?: string;
}
export interface Services {
  db: Database;
  store: PrivateStore;
  env: Record<string, string | undefined>;
  send: (mail: Mail) => Promise<void>;
  fetch: typeof fetch;
}
export interface User {
  id: string;
  email: string;
  role: "owner" | "learner";
  notifications: boolean;
  reminders: boolean;
  created_at: string;
  last_active_at: string;
}
