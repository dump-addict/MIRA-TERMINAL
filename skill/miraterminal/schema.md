# `.miraterminal/map.json` schema

All map text is English, sentence case, short (labels 1 to 3 words, summaries one sentence), never uppercase, no middle dots.

```jsonc
{
  "version": 1,
  "project": "Display name",
  "summary": "Two sentences about the project (left panel)",
  "lang": "en",                       // language of the focused session prompt: en (the only one built in)
  "generated_at": "2026-11-13",
  "commit": "a8f4615",
  "models": { "server": "B", "contract": "B" },   // optional: 3D shape per kind (workshop letters, A = original)
  "groups": [                         // one column per group, in flow order (users → clients → backend → contracts or data → external systems)
    { "id": "web", "label": "Web app", "col": 1, "row": 0 }   // row 1 = bottom row (infrastructure, research). "color" is optional: by default the swatch comes from tokens.css (--mira-group-*), never blue
  ],
  "nodes": [
    {
      "id": "api",                    // stable across updates
      "label": "API server",          // what it is, 1 to 3 words: "API server", "Quote signer", "Settlement worker"
      "group": "backend",
      "kind": "api",                  // building block type: icon, card caption and 3D object (list below)
      "parent": null,                 // id of a parent block: collapsed into it in the "Essential" view
      "size": "s",                    // optional: small card (name only), for secondary external systems
      "tag": "FastAPI",               // optional: caption at the top of the card (default: the kind name)
      "brand": { "name": "Vercel", "logo": "vercel.svg" },  // optional: badge above the 3D object. logo = file in .miraterminal/logos/ (svg, png); without a logo: the name, with "color" and "bg"; "full": true for a square app icon that fills the badge. Use the brand's official icon (apple-touch-icon), never the written name instead
      "status": "live",               // live | wip | planned | broken | deprecated
      "summary": "One sentence.",
      "details": "2 to 5 useful lines for someone picking this part up.",
      "tech": ["FastAPI", "web3.py"],
      "files": [{ "path": "app/server.py", "role": "/api routes" }],
      "metric": { "check": 0, "value": "gas.hype", "label": "HYPE for gas", "digits": 3, "unit": "" },  // big number on the card, read from a check's `show` value
      "cost": { "monthly_usd": null, "label": "Free", "note": "plan to confirm" },
      "checks": [ /* see below */ ],
      "todos": [{ "text": "Add the domain to Privy", "done": false }],
      "notes": "Free text, updated by sessions.",
      "questions": [["Short title", "Full request"]]     // optional: replaces the panel shortcuts
    }
  ],
  "links": [
    {
      "id": "web-api",                // optional (default source--target), required when two links join the same blocks
      "source": "web", "target": "api",
      "evidence": [                   // required: the line of code that shows this link (1 to 3)
        { "path": "src/net.js", "line": 25, "match": "new WebSocket(" }   // match: a short piece of that line, copied as is
      ],
      "label": "REST /api",           // protocol or payload, 1 to 3 words: "REST /api", "signed prices", "multi() reads"
      "summary": "...", "details": "...", "files": [], "tech": [], "cost": {}, "checks": [], "todos": [], "notes": ""
    }
  ],
  "flows": [                          // end-to-end flows, animated step by step
    { "id": "buy", "label": "Buy a ticket", "summary": "from click to contract",
      "steps": [{ "from": "player", "to": "web", "text": "The player clicks a cell" }] }
  ]
}
```

A link to a collapsed block is drawn on its parent; several merged links show "N links".
Positions moved with the mouse live in `.miraterminal/layout.json` (2D and 3D apart): do not edit it, the "Reset layout" button clears it.

## Vocabulary

Words follow the C4 model (person, software system, container, component, external system) and arc42 (building block view, runtime view, deployment view), plus common architecture terms. Pick the most precise one.

| Term | Means | Example |
|---|---|---|
| user | a person using the system (C4 person) | Player, Admin |
| client | code running on the user's side: web app, mobile app, CLI, wallet | Trading app, Connect Wallet |
| service | a backend process with its own responsibility | API server, Quote signer |
| API | a service's interface (REST, GraphQL, JSON-RPC, WebSocket) | REST /api |
| gateway | one entry that routes or converts traffic (reverse proxy, API gateway, deposit gateway) | DepositGateway, Caddy |
| worker | background process that pulls work (queue, loop, timer) | Settlement worker |
| scheduled job | runs on a clock (cron, interval) | Nightly backup |
| queue | buffered messages or jobs between a producer and a consumer | Payout queue, Redis queue |
| data store | database, file store, object storage, cache | Postgres, Historical data |
| data stream, feed | continuous push of events or prices | Pyth stream, WebSocket candles |
| relayer | submits transactions on behalf of users | Transaction relayer |
| smart contract | on-chain program | OptionExchange |
| oracle | brings off-chain data on-chain and verifies it | PriceOracle |
| blockchain, RPC | the chain, and the node endpoint used to read or write it | HyperEVM RPC |
| external system | third-party system outside your control (C4 external system) | Deribit, Privy |
| identity provider | sign-in, sessions, embedded wallets | Privy, Auth0 |
| hosting, CDN | where code runs or static files are served (deployment node) | Vercel, VPS |
| monitoring | alerts, logs, metrics | Alerting |
| secrets | keys, tokens, env files | Keys and secrets |
| deployment | pipeline or script that ships the system | Mainnet deployment |
| mobile app | an app installed on a phone (iOS, Android, React Native) | Customer app |
| desktop app | an app installed on a computer (Electron, native) | Mira Terminal |
| extension | a browser extension or a plugin for another app (VS Code, Figma, WordPress) | Wallet extension |
| game | a game client or engine (Unity, Godot, Phaser) | Game client |
| admin panel | back-office screens for the team | Back office |
| ai model | a language or ML model called by the system (Claude, OpenAI, local model) | Claude API, Scoring model |
| payments | payment provider, billing, subscriptions | Stripe, Paddle |
| email and messages | sends emails, SMS or chat messages | Resend, Twilio |
| notifications | push notifications to users | Push notifications |
| file storage | uploaded files, images, object storage | S3, R2, Uploads |
| spreadsheet | a spreadsheet used as data (Google Sheets, Airtable) | Leads sheet |
| search | search index and engine | Algolia, Meilisearch |
| cms | where editors write content | Sanity, Contentful |
| media | images, video or audio processing and assets | Game assets, Video encoder |
| webhook | an address another service calls when something happens | Stripe webhook |
| device | hardware: IoT, sensors, console, kiosk | Sensor, Arcade cabinet |
| documentation | docs site or knowledge base | Docs site |
| command line | a tool run from the terminal | Admin CLI, Batch command |
| website | a static or marketing site | Landing page, Blog |
| team | people inside the company: support, admins, editors | Support team |
| ai agent | an autonomous agent that uses tools | Research agent, MCP agent |
| vector database | embeddings for search and RAG | Pinecone, pgvector |
| data pipeline | moves and transforms data in steps (ETL) | Airflow, dbt, ETL job |
| data warehouse | analytics storage for large data | BigQuery, Snowflake, Data lake |
| event bus | publish and subscribe between services | Kafka, Pub/Sub, NATS |
| logs | log and trace storage | Loki, Datadog logs, Sentry |
| container | a container or a cluster that runs services | Docker, Kubernetes |
| load balancer | spreads traffic across servers | Nginx, ALB |
| network | private network, VPN, tunnel, firewall | VPC, Tailscale, Cloudflare tunnel |
| domain | domain names and DNS | Domain, Cloudflare DNS |
| infrastructure as code | files that create the infrastructure | Terraform, Pulumi |
| ci | builds and tests on each change | GitHub Actions |
| code repository | where the code lives | GitHub repository |
| package | a library published for others | npm package, PyPI package, SDK |
| automation | no-code flows between apps | Zapier, n8n, Make |
| chat | chat between users or with support | Live chat, Intercom |
| realtime server | live updates, presence, multiplayer | Game server, WebSocket hub |
| video and calls | video calls, live streams | WebRTC, Mux |
| maps and location | maps, geocoding, places | Mapbox, Google Maps |
| calendar | bookings, scheduling, calendars | Booking, Google Calendar |
| feature flags | turns features on and off without a deploy | LaunchDarkly, PostHog flags |
| firmware | code that runs on a device | ESP32 firmware |
| backup | copies kept to restore data | Nightly backup |
| tool server | a server of tools that agents call (MCP) | GitHub MCP, Browser tools |
| scraper | collects pages or drives a browser | Crawler, Playwright bot |
| training | trains or fine-tunes a model | Fine-tuning job |
| gpu compute | GPU machines for training or inference | Modal, RunPod, inference server |
| evals | tests that measure a model's answers | Eval suite, Benchmark |
| speech | speech to text and text to speech | Whisper, ElevenLabs |
| dataset | data prepared for training or analysis | Training set, Labels |
| design system | shared components and styles | Component library, Tokens |
| translations | texts in several languages | Locales, Crowdin |
| serverless function | code run on demand by the host | Vercel function, Lambda |
| crm | customers, leads and deals | HubSpot, Salesforce |
| store | catalog, cart, orders, stock | Shopify, Checkout |
| ledger | balances and accounting entries | Accounting, Balances |
| identity check | checks who a person is (KYC) | Sumsub, Persona |
| organization | another company or a customer account | Partner, Client company |
| governance | votes and proposals (DAO) | DAO, Snapshot |
| mixed reality | VR or AR app | Quest app, AR view |
| code sandbox | an isolated place that runs untrusted or agent-written code | E2B, Docker sandbox, Jupyter kernel |
| proxy | a reverse proxy, connection pooler or outbound filter in front of a service | nginx, PgBouncer, Squid |
| coordination | service discovery, leader election, cluster consensus | ZooKeeper, etcd, Consul |
| workflow engine | durable multi-step jobs with retries | Temporal, Inngest |
| document parser | turns PDFs and office files into text and chunks | Unstructured, Tika, Docling, OCR |
| connector | an adapter that plugs an outside API or data source in | Airbyte connector, Chainlink adapter |
| renderer | generates PDFs, images or screenshots | Gotenberg, Puppeteer PDF |
| headless browser | a browser driven by code or by an agent | Playwright, Browserbase |
| federation | servers run by others that exchange with ours as equals | ActivityPub, Matrix federation |
| peer network | clients that share data directly with each other | WebTorrent, libp2p, WebRTC mesh |
| operating system | a whole managed OS image or appliance | Home Assistant OS, custom Linux image |
| phone and sip | calls through phone networks or SIP | Twilio Voice, Jigasi, Asterisk |
| shipping | fulfillment and carriers | ShipStation, Sendcloud |
| erp | back office for orders, stock and accounting | Odoo, SAP |
| game server | runs matches, rooms and matchmaking | Nakama, Colyseus |
| bridge | moves assets between chains | Cross-chain bridge |
| indexer | reads the chain and stores it for queries | The Graph, Ponder |

Link labels say what moves, not that something moves: "signed prices", "REST /api", "multi() reads", "relayed transactions"; avoid "calls", "uses", "data".
Group names are areas: "Web app", "Backend", "Smart contracts", "External systems", "Infrastructure", "Research".

## Kinds (`kind`)

Close kinds, how to choose (from mapping 31 open-source projects):
- One process that serves pages and its API (Rails, Django, NestJS monolith): `server`. `api` is for an API-only service.
- nginx, Traefik, HAProxy in front of the app, or a connection pooler (PgBouncer): `proxy`. `lb` only when its job is spreading traffic across copies. `gateway` for an API gateway that routes and converts (Kong, Envoy, an LLM gateway).
- Redis or a broker: its main role. Jobs waiting to be done: `queue`. Messages published to many listeners (Kafka, NATS, Redis pub/sub): `events`. A continuous push of values (prices, sensor readings): `stream`.
- `email` sends mail or SMS; `notify` is push and in-app notifications.
- `ai` is a model that answers; `math` is a calculation of the project's own (pricing, scoring); `agent` decides and calls tools.
- `engine` is a central piece of the project's code; `code` is a smaller module or file.
- Prometheus, Grafana, tracing: `alert`. Product analytics (PostHog, Plausible): `chart`. Log and trace storage: `logs`.
- ClickHouse, BigQuery for analysis: `warehouse`. The app's own database: `database`.
- `relay` and `bridge` are crypto only; a Matrix bridge or an integration adapter is a `connector`.
- A game's client is `game`; the server that runs matches is `gameserver`.

When no kind fits, use `other` with a `tag` that says what it is: the card shows a question mark and "Not in the library yet", so the missing kind is easy to spot and add here.

The kind says what the block is (a server stays a server), `brand` says whose it is. Caption shown on the card for each kind:

| kind | caption | icon, 3D object |
|---|---|---|
| `user` | User | person |
| `app` | Web app | screen |
| `wallet` | Wallet | wallet |
| `api` | API service | server |
| `server` | Server | server rack |
| `gateway` | Gateway | network (3D: server) |
| `engine` | Core engine | chip and gear |
| `math` | Calculation | crystal |
| `worker` | Worker | workflow (3D: engine) |
| `clock` | Scheduled job | clock |
| `queue` | Queue | layers (3D: cylinders) |
| `cache` | Cache | cylinders |
| `database` | Data store | cylinders |
| `relay` | Transaction relayer | antenna |
| `alert` | Monitoring | bell |
| `contract` | Smart contract | linked blocks |
| `chain` | Blockchain | block stack |
| `oracle` | Oracle | crystal ball |
| `swap` | DEX | two coins |
| `token` | Token | coin stack |
| `feed` | Data feed | dish |
| `stream` | Data stream | dish |
| `external` | External system | globe |
| `auth` | Identity provider | shield |
| `security` | Security | shield |
| `cloud` | Hosting | cloud |
| `cdn` | CDN | cloud |
| `key` | Secrets | key |
| `deploy` | Deployment | rocket |
| `chart` | Analytics | bars |
| `research` | Research | flask |
| `test` | Test harness | test tubes |
| `code` | Module | document |
| `group` | Group | box |
| `mobile` | Mobile app | smartphone (3D: app) |
| `desktop` | Desktop app | app window (3D: app) |
| `extension` | Extension | puzzle (3D: app) |
| `game` | Game client | gamepad 2 (3D: app) |
| `admin` | Admin panel | layout dashboard (3D: app) |
| `ai` | AI model | bot (3D: math) |
| `payment` | Payments | credit card (3D: token) |
| `email` | Email and messages | mail (3D: relay) |
| `notify` | Notifications | bell ring (3D: alert) |
| `storage` | File storage | hard drive (3D: database) |
| `sheet` | Spreadsheet | sheet (3D: database) |
| `search` | Search | search (3D: engine) |
| `cms` | CMS | newspaper (3D: research) |
| `media` | Media | image (3D: feed) |
| `webhook` | Webhook | webhook (3D: relay) |
| `device` | Device | router (3D: server) |
| `docs` | Documentation | book open (3D: research) |
| `cli` | Command line | terminal (3D: app) |
| `site` | Website | layout template (3D: app) |
| `team` | Team | users (3D: user) |
| `agent` | AI agent | sparkles (3D: math) |
| `vector` | Vector database | database zap (3D: database) |
| `pipeline` | Data pipeline | waypoints (3D: engine) |
| `warehouse` | Data warehouse | warehouse (3D: database) |
| `events` | Event bus | share 2 (3D: relay) |
| `logs` | Logs | scroll text (3D: database) |
| `container` | Container | container (3D: server) |
| `lb` | Load balancer | split (3D: server) |
| `network` | Network | network (3D: cloud) |
| `dns` | Domain | signpost (3D: cloud) |
| `infra` | Infrastructure as code | file cog (3D: deploy) |
| `ci` | CI | git merge (3D: deploy) |
| `repo` | Code repository | git branch |
| `package` | Package | package |
| `automation` | Automation | zap (3D: engine) |
| `chat` | Chat | messages square (3D: relay) |
| `realtime` | Realtime server | radio tower (3D: server) |
| `video` | Video and calls | video (3D: feed) |
| `maps` | Maps and location | map pin (3D: external) |
| `calendar` | Calendar | calendar (3D: clock) |
| `flags` | Feature flags | toggle right (3D: key) |
| `firmware` | Firmware | microchip (3D: engine) |
| `backup` | Backup | archive (3D: database) |
| `bridge` | Cross-chain bridge | link 2 (3D: swap) |
| `indexer` | Indexer | list tree (3D: database) |
| `mcp` | Tool server | plug (3D: api) |
| `scraper` | Scraper | scan search (3D: engine) |
| `training` | Training | graduation cap (3D: math) |
| `gpu` | GPU compute | gpu (3D: server) |
| `evals` | Evals | clipboard check (3D: test) |
| `speech` | Speech | audio lines (3D: math) |
| `dataset` | Dataset | file stack (3D: database) |
| `ui` | Design system | palette (3D: app) |
| `i18n` | Translations | languages |
| `function` | Serverless function | square function (3D: api) |
| `crm` | CRM | contact (3D: external) |
| `shop` | Store | shopping cart (3D: app) |
| `ledger` | Ledger | book text (3D: database) |
| `kyc` | Identity check | id card (3D: security) |
| `org` | Organization | building 2 (3D: external) |
| `governance` | Governance | landmark (3D: contract) |
| `xr` | Mixed reality | glasses (3D: app) |
| `sandbox` | Code sandbox | square code (3D: server) |
| `proxy` | Proxy | route (3D: server) |
| `coordination` | Coordination | compass (3D: database) |
| `workflow` | Workflow engine | workflow (3D: engine) |
| `parser` | Document parser | file search (3D: engine) |
| `connector` | Connector | cable (3D: relay) |
| `renderer` | Renderer | printer (3D: engine) |
| `browser` | Headless browser | mouse pointer click (3D: app) |
| `federation` | Federation | earth (3D: external) |
| `p2p` | Peer network | orbit (3D: cloud) |
| `os` | Operating system | monitor cog (3D: server) |
| `telephony` | Phone and SIP | phone (3D: relay) |
| `shipping` | Shipping | truck (3D: external) |
| `erp` | ERP | factory (3D: external) |
| `gameserver` | Game server | swords (3D: server) |
| `other` | Not in the library yet | circle help |

3D objects live in `viewer/objects3d.js` (one `case` per kind; kinds without their own object reuse the closest one through `KIND_BASE` in `viewer/icons.js`). Several shapes per kind (A, B, C) can be compared in the workshop (`viewer/workshop.html`); variants B and C are in `viewer/models3d.js`. The choice is kept in the browser and can be pinned in `models`.

## Checks

All accept `label` (short, sentence case: "latest block", "pool seeded"), `timeout` (s), `optional` (a failure shows "Off" instead of red) and `manual` (only run from the panel).
Any string can hold `${VAR}`, replaced server side by the value from `.env` or the environment, never sent to the browser.

| type | fields | passes when |
|---|---|---|
| `http` | `url`, `method`, `body`, `headers`, `status`, `contains`, `expect`, `warn`, `nonempty`, `warn_empty`, `show` | 2xx/3xx code (or `status`) |
| `rpc` | `url`, `method` (default `eth_blockNumber`), `params`, `nonempty_result` | JSON-RPC answer without `error`; `result` shown (`eth_getCode` + `nonempty_result`: contract deployed) |
| `env` | `vars`: list of names | all present and non empty |
| `file` | `path` (relative to the root) | exists |
| `port` | `port`, `host` | TCP connection accepted |
| `cmd` | `run`, `warn_codes`, `show_output` | exit code 0 |

JSON assertions (`http`): dotted paths (`gas.level`, `items.0.id`).
- `expect`: `{ "ok": true }` fails when different.
- `warn`: `{ "gas.level": "ok" }` turns amber when different.
- `nonempty` / `warn_empty`: paths that must not be empty.
- `show`: paths whose value is shown in the panel and can feed `metric`.
