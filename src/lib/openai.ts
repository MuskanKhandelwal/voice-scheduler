import OpenAI from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Stronger model for the agentic planning loop (multi-step tool calling +
// time-management reasoning). Cheaper model is fine for one-shot narratives.
export const AGENT_MODEL = "gpt-4o";
export const CHAT_MODEL = "gpt-4o-mini";
