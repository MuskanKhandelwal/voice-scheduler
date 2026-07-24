export type TaskPriority = "low" | "medium" | "high";
export type TaskEnergy = "high" | "low";
export type TaskStatus = "pending" | "scheduled" | "done";

export interface Task {
  id: string;
  title: string;
  estimated_minutes: number;
  priority: TaskPriority;
  energy_requirement: TaskEnergy;
  status: TaskStatus;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  task_id: string | null;
  title: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  is_manual: boolean;
  completed: boolean;
  created_at: string;
}

export interface Profile {
  id: number;
  working_hours_start: string;
  working_hours_end: string;
  energy_high_start: string;
  energy_high_end: string;
  energy_low_start: string;
  energy_low_end: string;
  updated_at: string;
}

export interface DailyGoal {
  id: string;
  date: string;
  goal_text: string;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export type InsightPeriod = "daily" | "weekly" | "monthly";

export interface Insight {
  id: string;
  period_type: InsightPeriod;
  period_start: string;
  period_end: string;
  stats_json: Record<string, unknown>;
  narrative_text: string;
  generated_at: string;
}

// Structured shape the OpenAI extraction step must fill in before a task
// can be inserted. `null` fields mean the assistant still needs to ask about them.
export interface TaskDraft {
  title: string | null;
  estimated_minutes: number | null;
  priority: TaskPriority | null;
  energy_requirement: TaskEnergy | null;
  complete: boolean;
  follow_up_question: string | null;
}
