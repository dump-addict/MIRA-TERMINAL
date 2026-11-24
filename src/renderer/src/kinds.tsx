/* The icon of a part of the map, by its kind : the same icon the map shows on the card */
import { AppWindow, Archive, ArrowLeftRight, AudioLines, Bell, BellRing, Blocks, BookOpen, BookText, Bot, Box, Boxes, Building2, Cable, Calendar, ChartLine, CircleCheck, CircleHelp, ClipboardCheck, Cloud, Coins, Compass, Contact, Container, Cpu, CreditCard, Database, DatabaseZap, Earth, Eye, Factory, FileCode2, FileCog, FileSearch, FileStack, FlaskConical, Gamepad2, GitBranch, GitMerge, Glasses, Globe, Gpu, GraduationCap, Hand, HardDrive, IdCard, Image, KeyRound, Landmark, Languages, Layers, LayoutDashboard, LayoutTemplate, Link2, ListTree, LoaderCircle, Mail, MapPin, MessagesSquare, Microchip, Monitor, MonitorCog, MousePointerClick, Network, Newspaper, Orbit, Package, Palette, Phone, Plug, Printer, Puzzle, Radio, RadioTower, Rocket, Route, Router, ScanSearch, ScrollText, Search, Send, Server, Share2, Sheet, Shield, ShoppingCart, Sigma, Signpost, Smartphone, Sparkles, Split, SquareCode, SquareFunction, Swords, Terminal, Timer, ToggleRight, Truck, User, Users, Video, Wallet, Warehouse, Waypoints, Webhook, Workflow, Wrench, Zap, type LucideIcon } from 'lucide-react'

const KIND: Record<string, LucideIcon> = {
  user: User, app: Monitor, wallet: Wallet, server: Server, api: Server, gateway: Network, engine: Cpu, math: Sigma,
  worker: Workflow, queue: Layers, cache: Database, relay: Send, clock: Timer, alert: Bell, contract: Boxes, oracle: Eye,
  swap: ArrowLeftRight, token: Coins, feed: Radio, stream: Radio, external: Globe, chain: Blocks, database: Database,
  cloud: Cloud, cdn: Cloud, research: FlaskConical, test: Wrench, key: KeyRound, chart: ChartLine, deploy: Rocket,
  security: Shield, auth: Shield, code: FileCode2, group: Layers,
  mobile: Smartphone, desktop: AppWindow, extension: Puzzle, game: Gamepad2, admin: LayoutDashboard, ai: Bot, payment: CreditCard, email: Mail, notify: BellRing, storage: HardDrive, sheet: Sheet, search: Search, cms: Newspaper, media: Image, webhook: Webhook, device: Router, docs: BookOpen,
  cli: Terminal, site: LayoutTemplate, team: Users, agent: Sparkles, vector: DatabaseZap, pipeline: Waypoints, warehouse: Warehouse, events: Share2, logs: ScrollText, container: Container, lb: Split, network: Network, dns: Signpost, infra: FileCog, ci: GitMerge, repo: GitBranch, package: Package, automation: Zap, chat: MessagesSquare, realtime: RadioTower, video: Video, maps: MapPin, calendar: Calendar, flags: ToggleRight, firmware: Microchip, backup: Archive, bridge: Link2, indexer: ListTree, other: CircleHelp,
  mcp: Plug, scraper: ScanSearch, training: GraduationCap, gpu: Gpu, evals: ClipboardCheck, speech: AudioLines, dataset: FileStack, ui: Palette, i18n: Languages, function: SquareFunction, crm: Contact, shop: ShoppingCart, ledger: BookText, kyc: IdCard, org: Building2, governance: Landmark, xr: Glasses,
  sandbox: SquareCode, proxy: Route, coordination: Compass, workflow: Workflow, parser: FileSearch, connector: Cable, renderer: Printer, browser: MousePointerClick, federation: Earth, p2p: Orbit, os: MonitorCog, telephony: Phone, shipping: Truck, erp: Factory, gameserver: Swords
}

export function KindIcon({ kind, size = 14 }: { kind?: string; size?: number }) {
  const I = (kind && KIND[kind]) || CircleHelp
  return <I size={size} />
}

/* what an agent is doing, as a small icon : working, waiting for you, done */
export function StatusIcon({ status, seen, size = 12 }: { status?: 'working' | 'needs' | 'done'; seen?: boolean; size?: number }) {
  if (status === 'working') return <span title="Working" className="shrink-0 text-text-2"><LoaderCircle size={size} className="animate-spin" /></span>
  if (status === 'needs') return <span title="Needs you" className="shrink-0 text-warn"><Hand size={size} /></span>
  if (status === 'done' && !seen) return <span title="Done" className="shrink-0 text-ok"><CircleCheck size={size} /></span>
  return null
}
