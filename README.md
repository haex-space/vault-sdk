# @haex-space/vault-sdk

[![npm version](https://badge.fury.io/js/@haex-space%2Fvault-sdk.svg)](https://www.npmjs.com/package/@haex-space/vault-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@haex-space/vault-sdk.svg)](https://www.npmjs.com/package/@haex-space/vault-sdk)

Official SDK for building HaexVault extensions with cryptographic identity and granular permissions.

## Installation

```bash
npm install @haex-space/vault-sdk
# or
pnpm add @haex-space/vault-sdk
# or
yarn add @haex-space/vault-sdk
```

## Quick Start

### 1. Initialize Your Project

```bash
# Create your project (any framework)
npm create vite@latest my-extension -- --template react-ts

# Install SDK
cd my-extension
npm install @haex-space/vault-sdk

# Initialize extension structure
npx haex init
```

The `haex init` command creates:
- `haextension/` directory with `manifest.json`
- Public/private keypair (`public.key`, `private.key`)
- `haextension.config.json` for development
- Updates `.gitignore` to exclude `private.key`
- Adds npm scripts (`ext:dev`, `ext:build`)

### 2. Load the Manifest

Import the manifest in your app's entry point:

```typescript
import manifest from './haextension/manifest.json'; // or '../haextension/manifest.json'
const { client } = useHaexVault({ manifest });
```

### 3. Run Your Extension

```bash
# Development
npm run ext:dev

# Build & sign for production
npm run ext:build
```

## Setup Hook System

**Important:** Always use the setup hook system to initialize your extension (create tables, run migrations, etc.). This ensures all database tables are created before your app tries to query them.

### Why Use Setup Hooks?

Without setup hooks, your app might try to query tables before they exist, causing race conditions. The setup hook system guarantees:
- ✅ Tables are created before queries run
- ✅ Migrations complete before app loads
- ✅ No race conditions on first load
- ✅ Clean separation of setup logic

### How to Use

<details>
<summary><b>Nuxt/Vue</b> - Setup in Pinia Store (Recommended)</summary>

**⚠️ Important for All Framework Users:**

You must register your setup hook **BEFORE** calling `setupComplete()`. The recommended pattern is to register the hook at store/component initialization time, then explicitly call `setupComplete()` to execute it.

**Recommended approach for Nuxt: Register setup hook in a Pinia store:**

```typescript
// stores/haex.ts
import { defineStore } from 'pinia';
import * as schema from '~/database/schemas';
import manifest from '../../haextension/manifest.json';

// Import migration SQL files
const migrationFiles = import.meta.glob('../database/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const useHaexVaultStore = defineStore('haex', () => {
  const nuxtApp = useNuxtApp();
  const haex = nuxtApp.$haex;

  const orm = shallowRef(null);

  // Step 1: Register setup hook FIRST
  haex.client.onSetup(async () => {
    // Convert migration files to SDK format
    const migrations = Object.entries(migrationFiles).map(
      ([path, content]) => {
        const fileName = path.split('/').pop()?.replace('.sql', '') || '';
        return { name: fileName, sql: content };
      }
    );

    console.log(`Running ${migrations.length} migration(s)`);

    // Run migrations
    await haex.client.runMigrationsAsync(
      manifest.public_key,
      manifest.name,
      migrations
    );
  });

  // Step 2: Initialize database and trigger setup
  const initializeAsync = async () => {
    orm.value = haex.client.initializeDatabase(schema);

    // Step 3: Call setupComplete() to execute the hook
    await haex.client.setupComplete();

    console.log('Database ready');
  };

  return {
    client: haex.client,
    state: haex.state,
    orm,
    initializeAsync,
  };
});
```

Then in your `app.vue`:

```vue
<!-- app/app.vue -->
<template>
  <div v-if="haexStore.state.isSetupComplete">
    <NuxtPage />
  </div>
  <div v-else>
    <p>Initializing extension...</p>
  </div>
</template>

<script setup lang="ts">
const haexStore = useHaexVaultStore();

onMounted(async () => {
  await haexStore.initializeAsync();
});
</script>
```

**Key Points:**

1. Register the setup hook **immediately** when creating your store/client
2. Call `setupComplete()` explicitly when you're ready to run the setup
3. `isSetupComplete` will only become `true` after the hook finishes executing
4. This ensures migrations complete before any database operations

</details>

<details>
<summary><b>Vue 3 (Non-Nuxt)</b> - Setup in app.vue</summary>

```vue
<!-- app/app.vue -->
<template>
  <div v-if="isSetupComplete">
    <YourApp />
  </div>
  <div v-else>
    <p>Initializing extension...</p>
  </div>
</template>

<script setup lang="ts">
const isSetupComplete = ref(false);

onMounted(async () => {
  const { client } = useHaexVault();

  // Register setup function (runs once after SDK initialization)
  // This is where you create tables, run migrations, etc.
  client.onSetup(async () => {
    console.log('[Setup] Creating database tables...');

    // Example: Create tables using raw SQL
    const tableName = client.getTableName('demo_table');
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Or with Drizzle ORM:
    // await createTablesAsync(client);

    console.log('[Setup] Database tables created successfully');
  });

  // Wait for setup to complete before showing the app
  console.log('[app.vue] Waiting for setup completion...');
  await client.setupComplete();
  console.log('[app.vue] Setup complete, app ready');

  isSetupComplete.value = true;
});
</script>
```

</details>

<details>
<summary><b>React</b> - Setup in App component</summary>

```tsx
// src/App.tsx
import { useState, useEffect } from 'react';
import { useHaexVault } from '@haex-space/vault-sdk/react';
import manifest from './manifest.json';

function App() {
  const { client, getTableName, isSetupComplete } = useHaexVault({ manifest });

  // Register setup hook to initialize database
  useEffect(() => {
    if (!client) return;

    // Register setup function (runs once after SDK initialization)
    client.onSetup(async () => {
      console.log('[Setup] Creating database tables...');

      // Example: Create tables using raw SQL
      const tableName = getTableName('demo_table');
      await client.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id TEXT PRIMARY KEY,
          name TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[Setup] Database tables created successfully');
    });
  }, [client, getTableName]);

  // Show loading screen until setup completes
  if (!isSetupComplete) {
    return <div>Initializing extension...</div>;
  }

  return (
    <div>
      {/* Your app content */}
    </div>
  );
}
```

</details>

<details>
<summary><b>Svelte</b> - Setup in root component</summary>

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { initHaexVault, haexHub, isSetupComplete } from '@haex-space/vault-sdk/svelte';
  import manifest from '../haextension/manifest.json';

  onMount(async () => {
    // Initialize SDK with manifest
    initHaexVault({ manifest });

    // Register setup function (runs once after SDK initialization)
    haexHub.client.onSetup(async () => {
      console.log('[Setup] Creating database tables...');

      const tableName = haexHub.getTableName('demo_table');
      await haexHub.client.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id TEXT PRIMARY KEY,
          name TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[Setup] Database tables created successfully');
    });
  });
</script>

{#if $isSetupComplete}
  <div>
    <!-- Your app content -->
  </div>
{:else}
  <p>Initializing extension...</p>
{/if}
```

</details>

<details>
<summary><b>Vite (Vanilla JS/TS)</b> - Setup in main.ts</summary>

```typescript
// src/main.ts
import { createHaexVaultClient } from '@haex-space/vault-sdk';
import manifest from '../haextension/manifest.json';

const client = createHaexVaultClient({ manifest });

// Register setup function (runs once after SDK initialization)
client.onSetup(async () => {
  console.log('[Setup] Creating database tables...');

  const tableName = client.getTableName('demo_table');
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('[Setup] Database tables created successfully');
});

// Wait for setup to complete before rendering app
await client.setupComplete();
console.log('[main.ts] Setup complete, rendering app');

// Now render your app
document.querySelector('#app')!.innerHTML = `
  <h1>My Extension</h1>
`;
```

</details>

### Using with Drizzle ORM

For complex schemas, create a separate setup file:

```typescript
// database/createTables.ts
export async function createTablesAsync(client: HaexVaultClient) {
  console.log('[Setup] Creating database tables...');

  const tables = [
    { table: schema.users, name: 'users' },
    { table: schema.posts, name: 'posts' },
    // ... more tables
  ];

  for (const { table, name } of tables) {
    const config = getTableConfig(table);
    const tableName = config.name;

    const createTableSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (...)`;
    await client.execute(createTableSQL, []);

    console.log(`[Setup] ✓ Table ${name} created/verified`);
  }
}
```

Then use it in your setup hook:

```typescript
client.onSetup(async () => {
  await createTablesAsync(client);
});
```

## Demo Projects

Complete working examples for each framework:

- **Nuxt**: [github.com/haex-space/haex-demo-nuxt](https://github.com/haex-space/haex-demo-nuxt)
- **React**: [github.com/haex-space/haex-demo-react](https://github.com/haex-space/haex-demo-react)
- **Svelte**: [github.com/haex-space/haex-demo-svelte](https://github.com/haex-space/haex-demo-svelte)
- **Vite**: [github.com/haex-space/haex-demo-vite](https://github.com/haex-space/haex-demo-vite)

Each demo shows:
- ✅ **Setup Hook System** - Proper initialization with table creation
- ✅ Database operations (CREATE, INSERT, SELECT)
- ✅ Application context subscription (theme & locale)
- ✅ Manifest loading
- ✅ Framework-specific best practices

## Framework Integration

The HaexVault SDK provides **framework-specific adapters** for seamless integration with popular frameworks:

### 🎯 Quick Start by Framework

<details>
<summary><b>Vue 3</b> - Composable with reactive refs</summary>

```bash
npm install @haex-space/vault-sdk
```

```vue
<script setup lang="ts">
import { useHaexVault } from '@haex-space/vault-sdk/vue';
import manifest from './manifest.json';

const { client, context, getTableName } = useHaexVault({ manifest });

// Watch for context changes (theme/locale from HaexVault)
watch(() => context.value, (ctx) => {
  if (ctx) {
    console.log('Theme:', ctx.theme);  // 'light' or 'dark'
    console.log('Locale:', ctx.locale); // 'en', 'de', etc.

    // Update your app's theme
    document.documentElement.classList.toggle('dark', ctx.theme === 'dark');
  }
}, { immediate: true });

// Create your own table - no permissions needed!
// Tables are automatically namespaced with your extension's publicKey
const tableName = getTableName('users');
await client.execute(`
  CREATE TABLE IF NOT EXISTS ${tableName} (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
  )
`);

// Full read/write access to your own tables
await client.execute(
  `INSERT INTO ${tableName} (id, name, email) VALUES (?, ?, ?)`,
  [crypto.randomUUID(), 'John Doe', 'john@example.com']
);

const users = await client.query<User>(`SELECT * FROM ${tableName}`);
</script>

<template>
  <div>
    <h1>My Extension</h1>
    <p>Theme: {{ context?.theme }}</p>
    <p>Locale: {{ context?.locale }}</p>
    <p>Users: {{ users.length }}</p>
  </div>
</template>
```

</details>

<details>
<summary><b>React</b> - Hook with automatic state updates</summary>

```bash
npm install @haex-space/vault-sdk
```

```tsx
import { useHaexVault } from '@haex-space/vault-sdk/react';
import { useEffect, useState } from 'react';
import manifest from './manifest.json';

interface User {
  id: string;
  name: string;
  email: string;
}

function App() {
  const { client, context, getTableName } = useHaexVault({ manifest });
  const [users, setUsers] = useState<User[]>([]);

  // React to context changes (theme/locale from HaexVault)
  useEffect(() => {
    if (context) {
      console.log('Theme:', context.theme);  // 'light' or 'dark'
      console.log('Locale:', context.locale); // 'en', 'de', etc.

      // Update your app's theme
      document.documentElement.classList.toggle('dark', context.theme === 'dark');
    }
  }, [context]);

  useEffect(() => {
    async function initializeDatabase() {
      // Create your own table - no permissions needed!
      // Tables are automatically namespaced with your extension's publicKey
      const tableName = getTableName('users');

      await client.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL
        )
      `);

      // Full read/write access to your own tables
      await client.execute(
        `INSERT INTO ${tableName} (id, name, email) VALUES (?, ?, ?)`,
        [crypto.randomUUID(), 'John Doe', 'john@example.com']
      );

      // Query users
      const result = await client.query<User>(`SELECT * FROM ${tableName}`);
      setUsers(result);
    }

    initializeDatabase();
  }, [client, getTableName]);

  return (
    <div>
      <h1>My Extension</h1>
      <p>Theme: {context?.theme}</p>
      <p>Locale: {context?.locale}</p>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
```

</details>

<details>
<summary><b>Svelte</b> - Stores with $-syntax reactivity</summary>

```bash
npm install @haex-space/vault-sdk
```

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { initHaexVault, haexHub, context } from '@haex-space/vault-sdk/svelte';
  import manifest from '../haextension/manifest.json';

  let users = [];

  onMount(() => {
    // Initialize SDK with manifest
    initHaexVault({ manifest });
  });

  // React to context changes (theme/locale from HaexVault)
  $: if ($context) {
    console.log('Theme:', $context.theme);  // 'light' or 'dark'
    console.log('Locale:', $context.locale); // 'en', 'de', etc.

    // Update your app's theme
    document.documentElement.classList.toggle('dark', $context.theme === 'dark');
  }

  async function loadUsers() {
    // Create your own table - no permissions needed!
    // Tables are automatically namespaced with your extension's publicKey
    const tableName = haexHub.getTableName('users');

    await haexHub.client.execute(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      )
    `);

    // Full read/write access to your own tables
    await haexHub.client.execute(
      `INSERT INTO ${tableName} (id, name, email) VALUES (?, ?, ?)`,
      [crypto.randomUUID(), 'John Doe', 'john@example.com']
    );

    users = await haexHub.client.query(`SELECT * FROM ${tableName}`);
  }

  onMount(() => {
    loadUsers();
  });
</script>

<!-- Automatically reactive with $ syntax! -->
<h1>My Extension</h1>
<p>Theme: {$context?.theme}</p>
<p>Locale: {$context?.locale}</p>

<ul>
  {#each users as user}
    <li>{user.name} - {user.email}</li>
  {/each}
</ul>
```

</details>

<details>
<summary><b>Vanilla JS / Other Frameworks</b> - Core SDK</summary>

```bash
npm install @haex-space/vault-sdk
```

```typescript
import { createHaexVaultClient } from '@haex-space/vault-sdk';
import manifest from '../haextension/manifest.json';

const client = createHaexVaultClient({ manifest });

// Subscribe to context changes (theme/locale from HaexVault)
client.subscribe(() => {
  const context = client.context;
  if (context) {
    console.log('Theme:', context.theme);  // 'light' or 'dark'
    console.log('Locale:', context.locale); // 'en', 'de', etc.

    // Update your app's theme
    document.documentElement.classList.toggle('dark', context.theme === 'dark');
  }
});

// Create your own table - no permissions needed!
// Tables are automatically namespaced with your extension's publicKey
const tableName = client.getTableName('users');
await client.execute(`
  CREATE TABLE IF NOT EXISTS ${tableName} (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
  )
`);

// Full read/write access to your own tables
await client.execute(
  `INSERT INTO ${tableName} (id, name, email) VALUES (?, ?, ?)`,
  [crypto.randomUUID(), 'John Doe', 'john@example.com']
);

const users = await client.query(`SELECT * FROM ${tableName}`);
console.log(users);
```

</details>

### 📦 Available Adapters

| Framework | Import Path | Features |
|-----------|-------------|----------|
| **Vue 3** | `@haex-space/vault-sdk/vue` | Composable with `ref` reactivity |
| **React** | `@haex-space/vault-sdk/react` | Hook with state management |
| **Svelte** | `@haex-space/vault-sdk/svelte` | Stores with `$` syntax |
| **Core** | `@haex-space/vault-sdk` | Framework-agnostic client |

## Built-in Polyfills

The SDK automatically includes polyfills for browser APIs that don't work in custom protocol contexts (`haex-extension://`). **You don't need to do anything** - just import the SDK and everything works!

### What's Included

✅ **localStorage** - In-memory fallback when blocked
✅ **sessionStorage** - No-op implementation
✅ **Cookies** - In-memory cookie store
✅ **History API** - Hash-based routing fallback for SPAs

### How It Works

When you import the SDK:

```typescript
import { createHaexVaultClient } from '@haex-space/vault-sdk';
// Polyfills are automatically active!
```

The polyfills detect whether the native APIs work and only activate if needed. This means:

- **Zero configuration** - Works out of the box
- **Framework agnostic** - Works with Vue, React, Svelte, etc.
- **No performance impact** - Only activates when necessary
- **SPA-friendly** - Includes history API patches for client-side routing

### What This Means for You

You can build your extension using **any framework and any libraries** without worrying about custom protocol restrictions. Things that "just work":

- Vuex, Pinia, Zustand (state management using localStorage)
- Vue Router, React Router (client-side routing)
- Cookie-based authentication libraries
- Any npm package that uses localStorage/cookies

## Core Concepts

### 1. Application Context

HaexVault provides an **Application Context** that extensions can subscribe to for reactive updates:

```typescript
interface ApplicationContext {
  theme: 'light' | 'dark';   // User's theme preference
  locale: string;             // User's language (e.g., 'en', 'de', 'fr')
}
```

**Framework-specific subscription examples:**

<details>
<summary><b>Vue 3 / Nuxt</b></summary>

```vue
<script setup lang="ts">
import { watch } from 'vue';
import { useHaexVault } from '@haex-space/vault-sdk/vue';
import manifest from './manifest.json';

const { context } = useHaexVault({ manifest });

watch(() => context.value, (ctx) => {
  if (ctx) {
    // Update theme
    document.documentElement.classList.toggle('dark', ctx.theme === 'dark');

    // Update i18n locale
    // i18n.locale.value = ctx.locale;
  }
}, { immediate: true });
</script>
```
</details>

<details>
<summary><b>React</b></summary>

```tsx
import { useEffect } from 'react';
import { useHaexVault } from '@haex-space/vault-sdk/react';
import manifest from './manifest.json';

function App() {
  const { context } = useHaexVault({ manifest });

  useEffect(() => {
    if (context) {
      // Update theme
      document.documentElement.classList.toggle('dark', context.theme === 'dark');

      // Update i18n language
      // i18n.changeLanguage(context.locale);
    }
  }, [context]);

  return <div>Theme: {context?.theme}</div>;
}
```
</details>

<details>
<summary><b>Svelte</b></summary>

```svelte
<script lang="ts">
  import { initHaexVault, context } from '@haex-space/vault-sdk/svelte';
  import manifest from '../haextension/manifest.json';

  initHaexVault({ manifest });

  // Reactive statement - runs whenever $context changes
  $: if ($context) {
    // Update theme
    document.documentElement.classList.toggle('dark', $context.theme === 'dark');
  }
</script>

<p>Theme: {$context?.theme}</p>
<p>Locale: {$context?.locale}</p>
```
</details>

<details>
<summary><b>Vanilla JS / Vite</b></summary>

```typescript
import { createHaexVaultClient } from '@haex-space/vault-sdk';
import manifest from '../haextension/manifest.json';

const client = createHaexVaultClient({ manifest });

// Subscribe to context changes
client.subscribe(() => {
  const context = client.context;
  if (context) {
    // Update theme
    document.documentElement.classList.toggle('dark', context.theme === 'dark');

    // Update language
    // updateLanguage(context.locale);
  }
});
```
</details>

### 2. Cryptographic Identity

Each extension is identified by a **public key**, not by name or namespace.

```typescript
// Extension ID format: {publicKey}_{name}_{version}
// Example: MCowBQYDK2VwAyEA7x8Z9Kq3mN2pL5tR8vW4yB6cE1fH3gJ9kM7nP0qS2uV_password-manager_1.0.0
```

**Benefits:**

- ✅ Mathematically unique (no collisions)
- ✅ Tamper-proof (signed with private key)
- ✅ Registry-independent (works everywhere)

### 2. Table Naming

All tables are automatically prefixed with your extension's identity:

```typescript
const tableName = client.getTableName("users");
// Result: "MCowBQYDK2VwAyEA7x8Z9Kq3mN2pL5tR8vW4yB6cE1fH3gJ9kM7nP0qS2uV__my-extension__users"
```

**Naming Rules:**
- Extension names and table names must start with a letter (a-z, A-Z)
- Can contain letters, numbers, hyphens (`-`), and underscores (`_`)
- **Cannot contain** double underscores (`__`) - reserved as separator
- **Cannot contain** dots (`.`) - causes issues with SQL schema qualification
- Must follow npm package naming conventions

**Format:** `{publicKey}__{extensionName}__{tableName}`

**Own tables:** Automatic full read/write access
**Dependency tables:** Requires explicit permission

### 3. Permission System

HaexVault uses a **zero-trust permission model** with automatic isolation:

#### 🔓 Own Tables - Always Allowed

Your extension can **freely create, read, write, and delete** its own tables without any permissions:

```typescript
// ✅ Always works - no permissions needed!
const myTable = client.getTableName('users');

await client.database.createTable(myTable, '...');  // ✅ Create
await client.database.query(`SELECT * FROM ${myTable}`);  // ✅ Read
await client.database.insert(myTable, {...});  // ✅ Write
await client.database.delete(myTable, 'id = ?', [1]);  // ✅ Delete
```

**Why this is safe:**
- Tables are automatically prefixed with your `publicKey` (e.g., `MCowBQYDK2VwAyEA7x8Z9Kq3mN2pL5tR8vW4yB6cE1fH3gJ9kM7nP0qS2uV__myext__users`)
- Impossible to access other extensions' tables
- Complete sandbox isolation
- No manifest declarations required

#### 🔒 Dependency Tables - Explicit Permission Required

To access **another extension's tables**, you must declare it in your manifest:

**manifest.json:**
```json
{
  "dependencies": [
    {
      "publicKey": "MCowBQYDK2VwAyEA7x8Z9Kq3mN2pL5tR8vW4yB6cE1fH3gJ9kM7nP0qS2uV",
      "name": "password-manager",
      "minVersion": "1.0.0",
      "reason": "Access stored credentials",
      "tables": [
        {
          "table": "credentials",
          "operations": ["read"],
          "reason": "Retrieve login data for email sync"
        }
      ]
    }
  ]
}
```

**Code:**
```typescript
// ❌ Would fail without permission!
const depTable = client.getDependencyTableName(
  'a7f3b2c1d4e5f6a8b9c0',
  'password-manager',
  'credentials'
);

const creds = await client.database.query(`SELECT * FROM ${depTable}`);
```

**Permission Granularity:**
- ✅ **Per-table** - Request access to specific tables only
- ✅ **Per-operation** - `["read"]` or `["read", "write"]`
- ✅ **User consent** - User approves each permission
- ✅ **Revocable** - User can revoke anytime

## API Reference

### Vue 3 Adapter

```typescript
import { useHaexVault } from '@haex-space/vault-sdk/vue';

const {
  client,          // Raw HaexVaultClient instance
  extensionInfo,   // Readonly<Ref<ExtensionInfo | null>>
  context,         // Readonly<Ref<ApplicationContext | null>>
  db,              // DatabaseAPI
  storage,         // StorageAPI
  getTableName     // (tableName: string) => string
} = useHaexVault({ debug: true });

// Use in templates or computed
watch(() => extensionInfo.value, (info) => {
  console.log('Extension:', info?.name);
});
```

### React Adapter

```typescript
import { useHaexVault } from '@haex-space/vault-sdk/react';

function MyComponent() {
  const {
    client,          // HaexVaultClient instance
    extensionInfo,   // ExtensionInfo | null
    context,         // ApplicationContext | null
    db,              // DatabaseAPI
    storage,         // StorageAPI
    getTableName     // (tableName: string) => string
  } = useHaexVault({ debug: true });

  // State automatically updates on SDK changes
  return <div>{extensionInfo?.name}</div>;
}
```

### Svelte Adapter

```typescript
// Initialize once in +layout.svelte
import { initHaexVault } from '@haex-space/vault-sdk/svelte';
initHaexVault({ debug: true });

// Use stores anywhere
import { extensionInfo, context, haexHub } from '@haex-space/vault-sdk/svelte';

// In templates with $ syntax
<h1>{$extensionInfo?.name}</h1>

// In script
const tableName = haexHub.getTableName('users');
await haexHub.database.query(`SELECT * FROM ${tableName}`);
```

### Core Client API

#### Client Initialization

```typescript
import { createHaexVaultClient } from '@haex-space/vault-sdk';

const client = createHaexVaultClient({
  debug: true,      // Optional: Enable debug logging
  timeout: 30000    // Optional: Request timeout in ms
});
```

#### Subscribe to Changes

```typescript
// Subscribe to SDK updates
const unsubscribe = client.subscribe(() => {
  console.log('Extension info:', client.extensionInfo);
  console.log('Context:', client.context);
});

// Cleanup
unsubscribe();
```

#### Extension Info

```typescript
// Get your extension's info
const info = client.extensionInfo;
// {
//   publicKey: "MCowBQYDK2VwAyEA7x8Z9Kq3mN2pL5tR8vW4yB6cE1fH3gJ9kM7nP0qS2uV",
//   name: "my-extension",
//   version: "1.0.0",
//   namespace: "johndoe"  // Display only
// }
```

#### Table Names

```typescript
// Get table name for your extension
const myTable = client.getTableName("users");
// → "MCowBQYDK2VwAyEA7x8Z9Kq3mN2pL5tR8vW4yB6cE1fH3gJ9kM7nP0qS2uV__my-extension__users"

// Get table name for a dependency
const depTable = client.getDependencyTableName(
  "MCowBQYDK2VwAyEAp1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k",  // Dependency's publicKey
  "password-manager",      // Dependency's name
  "credentials"            // Table name
);
// → "MCowBQYDK2VwAyEAp1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k__password-manager__credentials"
```

### Database Operations

#### Query

```typescript
// SELECT queries
const users = await client.database.query<User>(
  `SELECT * FROM ${myTable} WHERE age > ?`,
  [18]
);

// Single row
const user = await client.database.queryOne<User>(
  `SELECT * FROM ${myTable} WHERE id = ?`,
  [1]
);
```

#### Execute

```typescript
// INSERT, UPDATE, DELETE
const result = await client.database.execute(
  `INSERT INTO ${myTable} (name) VALUES (?)`,
  ['Alice']
);

console.log(result.lastInsertId);
console.log(result.rowsAffected);
```

#### Transactions

```typescript
await client.database.transaction([
  `INSERT INTO ${myTable} (name) VALUES ('Alice')`,
  `INSERT INTO ${myTable} (name) VALUES ('Bob')`
]);
```

#### Helper Methods

```typescript
// Create table
await client.database.createTable('posts', `
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT
`);

// Check existence
const exists = await client.database.tableExists(myTable);

// Get table info
const info = await client.database.getTableInfo(myTable);

// List all tables
const tables = await client.database.listTables();

// Drop table
await client.database.dropTable('posts');

// Insert
const id = await client.database.insert(myTable, {
  name: 'John',
  email: 'john@example.com'
});

// Update
const updated = await client.database.update(
  myTable,
  { name: 'Jane' },
  'id = ?',
  [id]
);

// Delete
const deleted = await client.database.delete(myTable, 'id = ?', [id]);

// Count
const count = await client.database.count(myTable, 'age > ?', [18]);
```

### Storage API

```typescript
// Store data
await client.storage.setItem('theme', 'dark');

// Retrieve data
const theme = await client.storage.getItem('theme');

// Remove data
await client.storage.removeItem('theme');

// Get all keys
const keys = await client.storage.keys();

// Clear all
await client.storage.clear();
```

### Dependencies

```typescript
// Get all dependencies
const deps = await client.getDependencies();

// Each dependency has:
// {
//   publicKey: string,
//   name: string,
//   version: string
// }
```

### Permissions

```typescript
// Request permission (runtime - usually done via manifest)
const response = await client.requestDatabasePermission({
  resource: 'MCowBQYDK2VwAyEAp1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k__password-manager__credentials',
  operation: 'read',
  reason: 'To retrieve email credentials'
});

if (response.status === 'granted') {
  // Permission granted!
}

// Check if permission exists
const hasPermission = await client.checkDatabasePermission(
  'MCowBQYDK2VwAyEAp1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k__password-manager__credentials',
  'read'
);
```

### Events

```typescript
// Listen to context changes
client.on('context.changed', (event) => {
  console.log('Context changed:', event.data.context);
});

// Listen to search requests
client.on('search.request', (event) => {
  const { query, requestId } = event.data;

  // Respond with search results
  await client.respondToSearch(requestId, [
    {
      id: '1',
      title: 'Result 1',
      description: 'Description',
      type: 'item',
      score: 0.9
    }
  ]);
});

// Remove listener
const callback = (event) => console.log(event);
client.on('some-event', callback);
client.off('some-event', callback);
```

### Cleanup

```typescript
// Clean up when extension is destroyed
client.destroy();
```

## Manifest Structure

Your extension needs a `manifest.json` file:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "My awesome extension",

  "publicKey": "<64 hex digits, written by haex sign>",

  "namespace": "johndoe",
  "displayName": "My Extension",
  "author": "John Doe <john@example.com>",
  "icon": "icon.png",
  "entry": "index.html",

  "permissions": {
    "database": [],
    "filesystem": [],
    "http": [],
    "shell": []
  },

  "dependencies": [
    {
      "publicKey": "<64 hex digits: public key of the password-manager extension>",
      "name": "password-manager",
      "minVersion": "1.0.0",
      "reason": "To access stored credentials",
      "tables": [
        {
          "table": "credentials",
          "operations": ["read"],
          "reason": "Read email login credentials"
        }
      ]
    }
  ]
}
```

## Cross-Extension Access Example

### Extension A: Password Manager

```typescript
import { useHaexVault } from '@haex-space/vault-sdk/vue';

const { db, getTableName } = useHaexVault();

// Create credentials table - no permissions needed for own tables!
const credentialsTable = getTableName('credentials');
await db.createTable(credentialsTable, `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL
`);

// Store credentials - full access to own tables
await db.insert(credentialsTable, {
  service: 'gmail',
  username: 'john@example.com',
  password: 'encrypted_password'
});
```

### Extension B: Email Client

**manifest.json** - Must declare dependency and request permission:

```json
{
  "name": "email-client",
  "version": "1.0.0",

  "dependencies": [
    {
      "publicKey": "<64 hex digits: public key of the password-manager extension>",
      "name": "password-manager",
      "minVersion": "1.0.0",
      "reason": "Access stored credentials for email sync",
      "tables": [
        {
          "table": "credentials",
          "operations": ["read"],
          "reason": "Retrieve Gmail login credentials"
        }
      ]
    }
  ]
}
```

**Code:**

```typescript
import { useHaexVault } from '@haex-space/vault-sdk/react';

function EmailClient() {
  const { db, client } = useHaexVault();

  async function loadCredentials() {
    // Access Password Manager's credentials table
    // ✅ Works because we declared permission in manifest
    const credentialsTable = client.getDependencyTableName(
      'MCowBQYDK2VwAyEAp1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k',   // Password Manager's publicKey
      'password-manager',        // Extension name
      'credentials'              // Table name
    );

    // Read Gmail credentials (read permission granted via manifest)
    const creds = await db.queryOne(
      `SELECT username, password FROM ${credentialsTable} WHERE service = ?`,
      ['gmail']
    );

    if (creds) {
      connectToGmail(creds.username, creds.password);
    }
  }

  return <button onClick={loadCredentials}>Connect Gmail</button>;
}
```

**User Experience:**
1. User installs Email Client extension
2. HaexVault shows permission request: "Email Client wants to **read** the **credentials** table from Password Manager"
3. User sees the reason: "Retrieve Gmail login credentials"
4. User approves or denies
5. Permission can be revoked anytime in settings

## Extension Signing & Packaging

HaexVault Extensions must be cryptographically signed to ensure authenticity and prevent tampering. The SDK provides tools to generate keypairs, sign, and package your extensions.

### 1. Generate a Keypair (One-time Setup)

Before publishing your extension, generate a keypair:

```bash
npx haex keygen
```

This creates two files:

- `public.key` - Include this in your repository
- `private.key` - Keep this secret! Add to `.gitignore`

**Important**: **Never commit your private.key**. Anyone with this key can impersonate your extension.

### 2. Add Keys to .gitignore

```gitignore
private.key
*.key
!public.key
```

### 3. Build and Sign Your Extension

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "build": "nuxt generate",
    "package": "haex sign dist -k private.key",
    "build:release": "npm run build && npm run package"
  },
  "devDependencies": {
    "@haex-space/vault-sdk": "^1.0.0"
  }
}
```

Then build and package:

```bash
npm run build:release
```

This creates `your-extension-1.0.0.xt` - a signed ZIP file ready for distribution.

**OR** build your extension and run:

```bash
npx haex sign dist -k private.key
```

### 4. What Gets Signed? (format `haextension-bundle/2`)

`haex sign`:

1. Collects the build output, the extra files of `haextension/` and the migrations (`migrationsDir`).
   Symlinks abort signing; `haextension.config.json`, `public.key` and `private.key` are never packaged.
2. Writes `haextension/manifest.json` as canonical JSON (RFC 8785) without a `signature` field.
3. Writes `haextension/signature.json` listing path, size and SHA-256 of every file, signed with
   Ed25519 over `"haextension-bundle/2\n"` + the canonical JSON of that list and the public key.
4. Packs everything into a deterministic `.xt` ZIP (fixed timestamps, no directory entries) and verifies it.

Moving content between files, renaming, adding or removing a file all break the signature.

### 5. Verification

```bash
npx haex verify your-extension-1.0.0.xt
```

checks the bundle exactly like the host does and names the first failing rule (for example
`file_mismatch { path: "index.html" }`). Bundles signed by SDK 3.x (signature inside the manifest) are
rejected with `legacy_signature_format`: re-sign them with `haex sign`. Shared test vectors for hosts are in
`test-vectors/bundles/`.

The format has exactly one implementation: the Rust crate `crates/haex-bundle`. Hosts such as holzi use it
natively, and `haex sign` / `haex verify` call its WebAssembly build, so the tool and the hosts cannot apply
different rules. From Node.js the same functions are available as `verifyBundle` and `buildBundle` from
`@haex-space/vault-sdk/node`.

### 6. Key Management Best Practices

- **Backup your private key** - Store it securely (password manager, encrypted backup)
- **One key per extension** - Don't reuse keys across different extensions
- **Rotate keys carefully** - Key changes require users to reinstall your extension
- **Lost key = lost extension** - You cannot update an extension without the original key

## Security Features

### ✅ Automatic Isolation

- **Own tables**: Full CRUD access without permissions
- **Table namespacing**: Automatic prefix with publicKey prevents conflicts
- **Sandbox isolation**: Extensions cannot access each other's data by default
- **No manifest bloat**: No need to declare own tables

### ✅ Cryptographic Identity

- Each extension identified by public key hash
- Impossible to impersonate another extension
- Works across all registries
- Tamper-proof signing with Ed25519

### ✅ Granular Permissions

- **Per-table permissions**: Request access to specific tables only
- **Per-operation control**: `read` and/or `write` per table
- **Explicit manifest declarations**: Dependencies must be declared upfront
- **User consent required**: All cross-extension access needs approval
- **Human-readable reasons**: Users see why permission is needed

### ✅ Dependency Validation

- Must declare dependencies in manifest
- Extension name must match publicKey
- Version requirements enforced (semver)
- Missing dependencies prevent installation

### ✅ Runtime Verification

- Every database access validated in real-time
- Permission checks on every query
- User can revoke permissions anytime
- No way to bypass permission system
- Audit trail for all cross-extension access

## TypeScript Support

Full TypeScript support included:

```typescript
import type {
  ExtensionInfo,
  ApplicationContext,
  DatabaseQueryResult,
  PermissionStatus
} from '@haex-space/vault-sdk';
```

## Error Handling

```typescript
import { ErrorCode } from '@haex-space/vault-sdk';

try {
  await client.database.query(`SELECT * FROM ${someTable}`);
} catch (error) {
  if (error.code === ErrorCode.PERMISSION_DENIED) {
    console.error('Permission denied');
  } else if (error.code === ErrorCode.TIMEOUT) {
    console.error('Request timeout');
  } else {
    console.error('Error:', error.message);
  }
}
```

## Development

Building and testing need, besides Node.js and pnpm, a Rust toolchain with the `wasm32-unknown-unknown`
target and `wasm-bindgen` in the version `crates/haex-bundle/Cargo.toml` pins
(`cargo install wasm-bindgen-cli --version <pin>`). `pnpm build`, `pnpm test` and `pnpm typecheck` build the
WebAssembly module first (`pnpm build:wasm`); run that once before `pnpm test:watch`.

```bash
# Install dependencies
pnpm install

# Build the SDK
pnpm build

# Watch mode for development
pnpm dev

# Link locally for testing
pnpm link
```

## Release Process

Create a new release using the automated scripts:

```bash
# Patch release (1.2.3 → 1.2.4)
pnpm release:patch

# Minor release (1.2.3 → 1.3.0)
pnpm release:minor

# Major release (1.2.3 → 2.0.0)
pnpm release:major
```

The script automatically:
1. Updates version in `package.json`
2. Creates a git commit
3. Creates a git tag
4. Pushes to remote

After the release, publish to npm:

```bash
pnpm publishVersion
```

## License

ISC

## Support

- Documentation: https://github.com/haex-space/vault-sdk
- GitHub: https://github.com/haex-space/vault-sdk
- Issues: https://github.com/haex-space/vault-sdk/issues
