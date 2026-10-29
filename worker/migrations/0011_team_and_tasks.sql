-- Team members (e.g. customer relations) with their own password, and tasks the admin assigns them.
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  disabled_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE sessions ADD COLUMN staff_id INTEGER;

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT,
  order_id INTEGER REFERENCES orders(id),
  assigned_to INTEGER REFERENCES staff(id),
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'todo',
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assigned_to, status);

CREATE TABLE IF NOT EXISTS task_notes (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS task_notes_task ON task_notes(task_id);
