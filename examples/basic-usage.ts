/**
 * Example: Using Application Context and Search
 */

import { createHaexHubClient, HAEXTENSION_EVENTS } from "@haexhub/sdk";
import type { SearchRequestEvent, ApplicationContext } from "@haexhub/sdk";

const client = createHaexHubClient({ debug: true });

// ==========================================
// 1. Access Application Context
// ==========================================

async function setupTheme() {
  // Wait for initialization
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Get current context
  const context = client.context;

  if (context) {
    console.log("Current theme:", context.theme); // 'light' | 'dark' | 'system'
    console.log("Current locale:", context.locale); // 'en', 'de', etc.
    console.log("Platform:", context.platform); // "linux", "macos", "ios", "freebsd", "dragonfly", "netbsd", "openbsd", "solaris", "android", "windows", undefined

    // Apply theme to extension UI
    if (context.theme === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }

    // Use locale for translations
    loadTranslations(context.locale);
  }
}

// ==========================================
// 2. Listen to Context Changes
// ==========================================

client.on("context.changed", (event) => {
  const context = (event as any).data.context as ApplicationContext;

  console.log("Context changed:", context);

  // Update theme when user changes it
  if (context.theme === "dark") {
    document.body.classList.add("dark-theme");
  } else {
    document.body.classList.remove("dark-theme");
  }

  // Reload translations if locale changed
  if (context.locale !== getCurrentLocale()) {
    loadTranslations(context.locale);
  }
});

// ==========================================
// 3. Handle Sync Events (Data Updates from Other Devices)
// ==========================================

// When data is synced from other devices, haex-vault emits filtered events
// Each extension only receives table names they have database permissions for
client.on(HAEXTENSION_EVENTS.SYNC_TABLES_UPDATED, async (event) => {
  const syncEvent = event as { data?: { tables?: string[] } };
  const tables = syncEvent?.data?.tables || [];

  console.log("Tables updated via sync:", tables);

  // Reload your data when your tables are updated
  // No need to filter - events are pre-filtered by haex-vault
  // to only include tables your extension has access to
  await reloadData();
});

async function reloadData() {
  // Reload your store/state from database
  console.log("Reloading data after sync...");
}

// ==========================================
// 4. Respond to Search Requests
// ==========================================

// User searches in HaexHub main search bar
// HaexHub broadcasts search to all extensions
client.on("search.request", async (event) => {
  const searchEvent = event as SearchRequestEvent;
  const { query, requestId } = searchEvent.data;

  console.log("Search request:", query.query);

  // Search in extension's data
  const myTable = client.getTableName("notes");

  try {
    const notes = await client.db.query(
      `SELECT id, title, content FROM ${myTable} 
       WHERE title LIKE ? OR content LIKE ?
       LIMIT ?`,
      [`%${query.query}%`, `%${query.query}%`, query.limit || 10]
    );

    // Convert to search results
    const results = notes.map((note: any) => ({
      id: note.id.toString(),
      title: note.title,
      description: note.content.substring(0, 100) + "...",
      type: "note",
      data: {
        noteId: note.id,
        extensionId: client.extensionInfo?.fullId,
      },
      score: calculateRelevance(note, query.query),
    }));

    // Send results back to HaexHub
    await client.respondToSearch(requestId, results);

    console.log(`Sent ${results.length} search results`);
  } catch (error) {
    console.error("Search failed:", error);
    // Send empty results on error
    await client.respondToSearch(requestId, []);
  }
});

// ==========================================
// 4. Complete Example: Notes Extension
// ==========================================

class NotesExtension {
  private client = createHaexHubClient({ debug: true });
  private notesTable: string = "";

  async initialize() {
    // Wait for SDK initialization
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.notesTable = this.client.getTableName("notes");

    // Setup table
    await this.client.db.createTable(
      this.notesTable,
      `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    `
    );

    // Apply initial theme
    this.applyTheme();

    // Listen to context changes
    this.client.on("context.changed", () => this.applyTheme());

    // Register search handler
    this.client.on("search.request", (e) =>
      this.handleSearch(e as SearchRequestEvent)
    );

    console.log("Notes extension initialized");
  }

  private applyTheme() {
    const context = this.client.context;
    if (!context) return;

    const isDark =
      context.theme === "dark" ||
      (context.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light"
    );
  }

  private async handleSearch(event: SearchRequestEvent) {
    const { query, requestId } = event.data;

    const notes = await this.client.db.query<{
      id: number;
      title: string;
      content: string;
    }>(
      `SELECT * FROM ${this.notesTable} 
       WHERE title LIKE ? OR content LIKE ?
       LIMIT ?`,
      [`%${query.query}%`, `%${query.query}%`, query.limit || 5]
    );

    const results = notes.map((note) => ({
      id: `note-${note.id}`,
      title: note.title,
      description: note.content?.substring(0, 100),
      type: "note",
      data: { noteId: note.id },
      score: this.calculateScore(note, query.query),
    }));

    await this.client.respondToSearch(requestId, results);
  }

  private calculateScore(note: any, query: string): number {
    const titleMatch = note.title.toLowerCase().includes(query.toLowerCase());
    const contentMatch = note.content
      ?.toLowerCase()
      .includes(query.toLowerCase());

    if (titleMatch) return 1.0;
    if (contentMatch) return 0.7;
    return 0.5;
  }

  async createNote(title: string, content: string) {
    return await this.client.db.insert(this.notesTable, {
      title,
      content,
    });
  }
}

// Initialize extension
const notesApp = new NotesExtension();
notesApp.initialize();

// Helper function
function calculateRelevance(note: any, query: string): number {
  const titleMatch = note.title.toLowerCase().includes(query.toLowerCase());
  const contentMatch = note.content.toLowerCase().includes(query.toLowerCase());

  if (titleMatch) return 1.0;
  if (contentMatch) return 0.7;
  return 0.5;
}

function getCurrentLocale(): string {
  return "en"; // Placeholder
}

function loadTranslations(locale: string): void {
  console.log(`Loading translations for: ${locale}`);
}
