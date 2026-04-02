/**
 * File watcher — uses chokidar to watch ~/.claude/projects/ for new/updated JSONL files.
 *
 * Handles:
 *   - New session JSONL files appearing (detect new sessions)
 *   - Appended lines in existing files (incremental parsing via size tracking)
 *   - Subagent JSONL files under <session>/subagents/
 *
 * Deduplication: if a session already has ingestion_source='hooks', the watcher skips it.
 */

import { openSync, readSync, closeSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import { monotonicFactory } from "ulid";
import type { ServerEvent } from "@agent-viz/shared-types";
import {
  parseLines,
  makeRootContext,
  makeSubagentContext,
  makeSessionStartEvent,
  makeRootAgentSpawnedEvent,
} from "./jsonl-parser.js";
import { getBuffer } from "./event-buffer.js";
import { createSession, upsertAgent, getSession } from "../db/queries.js";
import type { NewSession, NewAgent } from "../db/schema.js";

const ulid = monotonicFactory();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PROJECTS_DIR = path.join(homedir(), ".claude", "projects");

// Matches: <session-uuid>.jsonl (main session file)
const SESSION_FILE_RE = /^([0-9a-f-]{36})\.jsonl$/i;
// Matches: subagents/agent-<hex>.jsonl
const SUBAGENT_FILE_RE = /[/\\]([0-9a-f-]{36})[/\\]subagents[/\\](agent-[0-9a-f]+\.jsonl)$/i;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface FileState {
  size: number;       // last known byte offset (we read from here on change)
  sequence: number;   // running sequence counter — never resets to 0 between reads
  sessionId: string;
  agentId: string;
  isSubagent: boolean;
}

const fileStates = new Map<string, FileState>();
// Sessions we've emitted a session_start for via JSONL (so we don't duplicate)
const knownSessions = new Set<string>();
// Sessions that are handled by hooks (skip JSONL for those)
const hookSessions = new Set<string>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function markHookSession(sessionId: string): void {
  hookSessions.add(sessionId);
}

export function startFileWatcher(): FSWatcher {
  const projectsDir = process.env.CLAUDE_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;

  const watcher = chokidarWatch(projectsDir, {
    persistent: true,
    ignoreInitial: false,      // process existing files on startup
    depth: 3,                  // sessions/subagents/agent-*.jsonl
    awaitWriteFinish: {
      stabilityThreshold: 50,
      pollInterval: 50,
    },
  });

  watcher.on("add", (filePath) => handleFile(filePath, projectsDir, true));
  watcher.on("change", (filePath) => handleFile(filePath, projectsDir, false));
  watcher.on("error", (err) => console.error("[file-watcher] Error:", err));

  console.log(`[file-watcher] Watching ${projectsDir}`);
  return watcher;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function handleFile(filePath: string, projectsDir: string, isNew: boolean): void {
  if (!filePath.endsWith(".jsonl")) return;

  const rel = path.relative(projectsDir, filePath);

  // Determine if this is a main session file or a subagent file
  const subagentMatch = SUBAGENT_FILE_RE.exec(filePath);
  const sessionMatch = path.basename(filePath).match(SESSION_FILE_RE);

  if (subagentMatch) {
    handleSubagentFile(filePath, subagentMatch[1]!, subagentMatch[2]!, isNew);
  } else if (sessionMatch) {
    handleSessionFile(filePath, sessionMatch[1]!, isNew);
  }
}

function handleSessionFile(filePath: string, sessionUuid: string, isNew: boolean): void {
  if (hookSessions.has(sessionUuid)) return; // hooks own this session

  const state = fileStates.get(filePath);

  if (!state) {
    // First time seeing this file — initialize state
    const sessionId = ulid();
    const cwd = decodeCwd(path.dirname(filePath));
    const slug = generateSlug(sessionId);

    // Register in DB
    const newSession: NewSession = {
      id: sessionId,
      slug,
      cwd,
      transcriptPath: filePath,
      ingestionSource: "jsonl",
      status: "active",
      createdAt: Date.now(),
    };
    createSession(newSession);

    // Register root agent
    const rootAgent: NewAgent = {
      id: "root",
      sessionId,
      isSidechain: 0,
      depth: 0,
      status: "active",
      createdAt: Date.now(),
    };
    upsertAgent(rootAgent);

    // sequence starts at 2: session_start=0, root_agent_spawned=1 (emitted above)
    fileStates.set(filePath, { size: 0, sequence: 2, sessionId, agentId: "root", isSubagent: false });
    knownSessions.add(sessionUuid);

    // Emit synthetic session_start + root agent_spawned
    const buffer = getBuffer();
    const sessionStartEv = makeSessionStartEvent(sessionId, cwd, slug);
    const rootSpawnedEv = makeRootAgentSpawnedEvent(sessionId, 1);
    buffer.push(sessionStartEv, rootSpawnedEv);
  }

  readNewLines(filePath);
}

function handleSubagentFile(
  filePath: string,
  parentSessionUuid: string,
  filename: string,
  isNew: boolean,
): void {
  // Look up the sessionId for this session uuid
  // We use knownSessions + fileStates for reverse lookup
  const parentFilePath = filePath.replace(
    /[/\\]subagents[/\\].*$/,
    path.sep + parentSessionUuid + ".jsonl",
  );
  const parentState = fileStates.get(parentFilePath);
  if (!parentState) {
    // Parent session file not yet seen — file watcher will process parent first via "add"
    return;
  }

  if (hookSessions.has(parentSessionUuid)) return;

  const state = fileStates.get(filePath);
  if (!state) {
    const agentId = extractAgentId(filename);
    fileStates.set(filePath, {
      size: 0,
      sequence: 0,
      sessionId: parentState.sessionId,
      agentId,
      isSubagent: true,
    });

    // Register agent in DB
    const agentRow: NewAgent = {
      id: agentId,
      sessionId: parentState.sessionId,
      parentAgentId: "root",
      isSidechain: 1,
      depth: 1,
      status: "active",
      createdAt: Date.now(),
    };
    upsertAgent(agentRow);
  }

  readNewLines(filePath);
}

function readNewLines(filePath: string): void {
  const state = fileStates.get(filePath);
  if (!state) return;

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch {
    return; // file deleted or inaccessible
  }

  if (stat.size <= state.size) return; // no new data

  let newContent: string;
  try {
    // Read only the new bytes (fix 7: fd always closed via finally)
    const buf = Buffer.alloc(stat.size - state.size);
    const fd = openSync(filePath, "r");
    try {
      readSync(fd, buf, 0, buf.length, state.size);
    } finally {
      closeSync(fd);
    }
    newContent = buf.toString("utf8");
  } catch {
    return;
  }

  state.size = stat.size;

  const lines = newContent.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return;

  // fix 2: pass the running sequence counter so it never resets to 0
  const ctx = state.isSubagent
    ? makeSubagentContext(state.sessionId, path.basename(filePath), "root", state.sequence)
    : makeRootContext(state.sessionId, state.sequence);

  const events = parseLines(lines, ctx);
  // Advance the stored sequence by however many events were produced
  state.sequence += events.length;

  if (events.length > 0) {
    getBuffer().push(...events);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Claude Code encodes the CWD as the directory name under ~/.claude/projects/:
 *   /home/user/myproject → -home-user-myproject
 * We reverse this heuristically.
 */
function decodeCwd(dirPath: string): string {
  const dirname = path.basename(dirPath);
  // Leading '-' means the path started with '/'
  if (dirname.startsWith("-")) {
    return dirname.replace(/-/g, "/");
  }
  return dirname;
}

function generateSlug(id: string): string {
  // Simple slug: first 8 chars of ULID
  return `session-${id.slice(0, 8).toLowerCase()}`;
}

function extractAgentId(filename: string): string {
  const match = /agent-([0-9a-f]+)\.jsonl$/i.exec(filename);
  return match ? match[1]! : filename.replace(".jsonl", "");
}
