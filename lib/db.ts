import { neon } from "@neondatabase/serverless";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Defina a variável de ambiente com a connection string do Neon."
    );
  }
  return neon(url);
}

export type AppSettings = {
  chatbotUrl: string | null;
  bearerToken: string | null;
  useBusinessHours: boolean;
  /** Inclui atendimentos ainda em andamento (getCurrent na API Suri) */
  getCurrent: boolean;
};

export type Department = {
  id: number;
  departmentId: string;
  name: string;
  active: boolean;
  sortOrder: number;
  goalTmeSeconds: number;
  goalTmaSeconds: number;
  goalTmrSeconds: number;
  goalCsat: number;
  /** subconjunto de attendantId da API Suri; vazio = considera todos os atendentes do setor */
  attendantIds: string[];
};

export async function ensureSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INT PRIMARY KEY DEFAULT 1,
      chatbot_url TEXT,
      bearer_token TEXT,
      use_business_hours BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT single_row CHECK (id = 1)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      department_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      goal_tme_seconds INT NOT NULL DEFAULT 300,
      goal_tma_seconds INT NOT NULL DEFAULT 3600,
      goal_tmr_seconds INT NOT NULL DEFAULT 300,
      goal_csat NUMERIC(3,2) NOT NULL DEFAULT 4.6,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS attendant_ids TEXT[] NOT NULL DEFAULT '{}'
  `;
  await sql`
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS get_current BOOLEAN NOT NULL DEFAULT false
  `;
  await sql`
    INSERT INTO app_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function getSettings(): Promise<AppSettings> {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`SELECT chatbot_url, bearer_token, use_business_hours, get_current FROM app_settings WHERE id = 1`;
  const row = rows[0] as any;
  return {
    chatbotUrl: row?.chatbot_url ?? null,
    bearerToken: row?.bearer_token ?? null,
    useBusinessHours: row?.use_business_hours ?? false,
    getCurrent: row?.get_current ?? false,
  };
}

export async function saveSettings(input: {
  chatbotUrl?: string;
  bearerToken?: string;
  useBusinessHours?: boolean;
  getCurrent?: boolean;
}) {
  const sql = getSql();
  await ensureSchema();
  const current = await getSettings();
  const chatbotUrl = input.chatbotUrl ?? current.chatbotUrl;
  const bearerToken = input.bearerToken ?? current.bearerToken;
  const useBusinessHours = input.useBusinessHours ?? current.useBusinessHours;
  const getCurrent = input.getCurrent ?? current.getCurrent;
  await sql`
    UPDATE app_settings
    SET chatbot_url = ${chatbotUrl},
        bearer_token = ${bearerToken},
        use_business_hours = ${useBusinessHours},
        get_current = ${getCurrent},
        updated_at = now()
    WHERE id = 1
  `;
}

function mapDepartment(row: any): Department {
  return {
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    active: row.active,
    sortOrder: row.sort_order,
    goalTmeSeconds: row.goal_tme_seconds,
    goalTmaSeconds: row.goal_tma_seconds,
    goalTmrSeconds: row.goal_tmr_seconds,
    goalCsat: Number(row.goal_csat),
    attendantIds: row.attendant_ids ?? [],
  };
}

export async function listDepartments(): Promise<Department[]> {
  const sql = getSql();
  await ensureSchema();
  const rows = await sql`SELECT * FROM departments ORDER BY sort_order ASC, name ASC`;
  return rows.map(mapDepartment);
}

export async function upsertDepartment(input: {
  departmentId: string;
  name: string;
  active?: boolean;
  sortOrder?: number;
  goalTmeSeconds?: number;
  goalTmaSeconds?: number;
  goalTmrSeconds?: number;
  goalCsat?: number;
  attendantIds?: string[];
}) {
  const sql = getSql();
  await ensureSchema();
  const active = input.active ?? null;
  const sortOrder = input.sortOrder ?? null;
  const goalTmeSeconds = input.goalTmeSeconds ?? null;
  const goalTmaSeconds = input.goalTmaSeconds ?? null;
  const goalTmrSeconds = input.goalTmrSeconds ?? null;
  const goalCsat = input.goalCsat ?? null;
  const attendantIds = input.attendantIds ?? null;
  const rows = await sql`
    INSERT INTO departments (
      department_id, name, active, sort_order,
      goal_tme_seconds, goal_tma_seconds, goal_tmr_seconds, goal_csat, attendant_ids
    ) VALUES (
      ${input.departmentId}, ${input.name}, ${active ?? true}, ${sortOrder ?? 0},
      ${goalTmeSeconds ?? 300}, ${goalTmaSeconds ?? 3600}, ${goalTmrSeconds ?? 300}, ${goalCsat ?? 4.6}, ${attendantIds ?? []}
    )
    ON CONFLICT (department_id) DO UPDATE SET
      name = EXCLUDED.name,
      active = COALESCE(${active}, departments.active),
      sort_order = COALESCE(${sortOrder}, departments.sort_order),
      goal_tme_seconds = COALESCE(${goalTmeSeconds}, departments.goal_tme_seconds),
      goal_tma_seconds = COALESCE(${goalTmaSeconds}, departments.goal_tma_seconds),
      goal_tmr_seconds = COALESCE(${goalTmrSeconds}, departments.goal_tmr_seconds),
      goal_csat = COALESCE(${goalCsat}, departments.goal_csat),
      attendant_ids = COALESCE(${attendantIds}, departments.attendant_ids)
    RETURNING *
  `;
  return mapDepartment(rows[0]);
}

export async function deleteDepartment(id: number) {
  const sql = getSql();
  await ensureSchema();
  await sql`DELETE FROM departments WHERE id = ${id}`;
}
