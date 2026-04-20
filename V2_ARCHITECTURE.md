# Noxivo V2: PostgreSQL Schema-per-Client Architecture

This document outlines the architectural transition from MongoDB (V1) to PostgreSQL (V2) with a "Sub-DB" (Schema-per-Client) approach.

> **Tip:** In VS Code, press `Cmd+Shift+V` (Mac) or `Ctrl+Shift+V` (Windows/Linux) to open the Markdown preview and render these diagrams.

## 1. Entity & Multi-Tenancy Hierarchy
This shows how data is physically isolated using PostgreSQL Schemas.

```mermaid
graph TD
    subgraph "PostgreSQL Global Instance"
        subgraph "Public Schema (Control Plane)"
            Admin[<b>Noxivo Admin</b><br/>System Wide Access]
            Owner[<b>Agency Owner</b><br/>Subscription & Billing]
            Agency[<b>Agency Entity</b><br/>White-label Config]
            ClientMap[<b>Client Registry</b><br/>Maps Domain to Schema Name]
        end

        subgraph "Client_A Schema (Data Plane)"
            EmpA[<b>Employees</b>]
            WAA[<b>WhatsApp Inbox</b>]
            WebA[<b>Website Config</b>]
            AIA[<b>AI Personas</b>]
        end

        subgraph "Client_B Schema (Data Plane)"
            EmpB[<b>Employees</b>]
            WAB[<b>WhatsApp Inbox</b>]
            WebB[<b>Website Config</b>]
            AIB[<b>AI Personas</b>]
        end
    end

    Admin --> Owner
    Owner --> Agency
    Agency --> ClientMap
    ClientMap -- "Route to Schema" --> Client_A
    ClientMap -- "Route to Schema" --> Client_B
```

---

## 2. Multi-Tenant Routing Logic
How a request from a custom domain dynamically finds its private "Sub-DB".

```mermaid
sequenceDiagram
    participant User as Client Employee / End User
    participant DNS as Custom Domain (client-a.com)
    participant API as V2 Dashboard API (Next.js/Node)
    participant DB as PostgreSQL (V2)

    User->>DNS: Access Website / Dashboard
    DNS->>API: Request with Host: client-a.com
    API->>DB: Query Public Schema: "Which schema for client-a.com?"
    DB-->>API: Returns "client_a_schema"
    API->>DB: SET search_path TO client_a_schema;
    API->>DB: SELECT * FROM messages;
    DB-->>API: Returns Client A's Private Data
    API-->>User: Show WhatsApp Inbox / Website
```

---

## 3. Migration Strategy (V1 to V2)
How we safely migrate data from MongoDB to the new PostgreSQL structure.

```mermaid
flowchart LR
    subgraph "V1 Architecture (Current)"
        MDB[(MongoDB)]
        V1App[V1 Dashboard & Engine]
    end

    subgraph "Migration Layer"
        MScript[[Migration Script<br/>TS/Node]]
    end

    subgraph "V2 Architecture (New)"
        V2App[V2 Dashboard & Engine]
        PG[(PostgreSQL)]
        subgraph "PG Schemas"
            Public[Public Schema]
            S1[Client 1 Schema]
            S2[Client 2 Schema]
        end
    end

    MDB --> MScript
    MScript -- "1. Sync Global Data" --> Public
    MScript -- "2. Create Schemas" --> PG
    MScript -- "3. Transform & Load" --> S1
    MScript -- "3. Transform & Load" --> S2
    
    V1App -.->|Parallel Running| V1App
    V2App -.->|Testing & Validation| PG
```
