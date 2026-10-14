// State store: a single JSON document in a PRIVATE GitHub repo,
// read and written through the GitHub Contents API. The token lives
// only in the GH_STATE_TOKEN env var (server-side). Falls back to the
// baked-in seed when the env is absent (local dev without a token).

import { SEED } from "./seed";
import type { DashboardState } from "./types";

const REPO = "Noah-zipit/ashar-control-state";
const PATH = "dashboard-state.json";
const BRANCH = "main";

function token(): string {
  return process.env.GH_STATE_TOKEN || "";
}

export async function readState(): Promise<DashboardState> {
  const t = token();
  if (!t) return SEED;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${t}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return SEED;
    const json = (await res.json()) as { content?: string };
    if (!json.content) return SEED;
    const parsed = JSON.parse(
      Buffer.from(json.content, "base64").toString("utf-8")
    ) as DashboardState;
    if (!parsed || !Array.isArray(parsed.projects)) return SEED;
    return parsed;
  } catch {
    return SEED;
  }
}

export async function writeState(
  state: DashboardState
): Promise<{ ok: boolean; error?: string }> {
  const t = token();
  if (!t) return { ok: false, error: "State backend not configured." };
  try {
    // Get current sha first (required for update).
    const meta = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${t}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    );
    let sha: string | undefined;
    if (meta.ok) {
      const m = (await meta.json()) as { sha?: string };
      sha = m.sha;
    }
    const body: Record<string, unknown> = {
      message: `dashboard-state update ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(state, null, 2), "utf-8").toString(
        "base64"
      ),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${PATH}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${t}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `GitHub rejected the write (${res.status}). ${err.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Write failed." };
  }
}

export function stateRepoInfo() {
  return { repo: REPO, path: PATH, branch: BRANCH };
}
