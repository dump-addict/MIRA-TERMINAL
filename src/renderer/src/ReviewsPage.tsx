/* Reviews : the pull requests open on GitHub, project by project (read with the gh command, nothing is changed).
   One click opens the default agent in the project to read and test it with you. */
import { ExternalLink, FolderGit2, GitBranch, GitPullRequest, GitPullRequestDraft, RefreshCw } from 'lucide-react'
import type { ProjectInfo, Pull, Reviews } from '../../preload'
import { AgentIcon } from './agents'
import { IconButton, PrimaryButton, SecondaryButton, ICON } from './ui'
import { platform } from './platform'

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (!Number.isFinite(s)) return ''
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
const DECISION: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: 'Approved', tone: 'text-ok' }, CHANGES_REQUESTED: { label: 'Changes asked', tone: 'text-warn' }, REVIEW_REQUIRED: { label: 'Review needed', tone: 'text-text-2' }
}

export function ReviewsPage({ projects, reviews, loading, onRefresh, onReview, onRun, agent, agentName, lead }: {
  projects: ProjectInfo[]; reviews: Record<string, Reviews>; loading: boolean; onRefresh: () => void
  onReview: (p: ProjectInfo, pr: Pull) => void; onRun: (command: string, title: string) => void
  agent: string; agentName: string; lead?: React.ReactNode
}) {
  const git = projects.filter((p) => p.git)
  const states = git.map((p) => reviews[p.id]?.state)
  const noGh = states.includes('nogh'), signedOut = states.includes('signedout')

  return (
    <div className="absolute inset-0 z-[15] flex flex-col bg-bg">
      <div className="drag flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        {lead}
        <span className="text-body font-medium text-text">Reviews</span>
        <IconButton onClick={onRefresh} title="Look again" className="ml-auto"><RefreshCw size={ICON} className={loading ? 'animate-spin' : ''} /></IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 pt-5 pb-16">
          {/* GitHub not reachable yet : the way to fix it, in a terminal tab */}
          {noGh && (
            <div className="flex items-center gap-3 rounded-md border border-line-strong p-4">
              <GitPullRequest size={18} className="shrink-0 text-text-2" />
              <div className="min-w-0 flex-1"><div className="text-body text-text">Connect GitHub</div><div className="text-meta text-text-3">The GitHub command line tool is not installed</div></div>
              <PrimaryButton onClick={() => onRun(`${platform === 'win32' ? 'winget install --id GitHub.cli -e' : platform === 'linux' ? 'echo "Install gh with your package manager: https://github.com/cli/cli#installation"' : 'brew install gh'} && gh auth login`, 'Install GitHub')}>Install and connect</PrimaryButton>
            </div>
          )}
          {!noGh && signedOut && (
            <div className="flex items-center gap-3 rounded-md border border-line-strong p-4">
              <GitPullRequest size={18} className="shrink-0 text-text-2" />
              <div className="min-w-0 flex-1"><div className="text-body text-text">Connect GitHub</div><div className="text-meta text-text-3">Sign in once, in a terminal tab</div></div>
              <PrimaryButton onClick={() => onRun('gh auth login', 'Connect GitHub')}>Connect GitHub</PrimaryButton>
            </div>
          )}

          {git.map((p) => {
            const r = reviews[p.id]
            if (!r || r.state === 'nogh' || r.state === 'signedout') return null
            return (
              <section key={p.id} className="mt-6 first:mt-0">
                <div className="flex h-9 items-center gap-2 border-b border-line px-1">
                  <span className="text-text-2"><FolderGit2 size={15} /></span>
                  <span className="truncate text-body font-medium text-text">{p.name}</span>
                  <span className="ml-auto text-meta text-text-3 tnum">
                    {r.state === 'ok' ? (r.pulls.length ? `${r.pulls.length} open` : 'Nothing to review') : r.state === 'nogithub' ? 'Not on GitHub' : 'Could not be read'}
                  </span>
                </div>
                <div className="pt-1">
                  {r.state === 'ok' && r.pulls.map((pr) => {
                    const d = DECISION[pr.decision]
                    return (
                      <div key={pr.number} className="group flex h-10 items-center gap-3 rounded-sm px-3 text-body hover:bg-surface-1">
                        <span className={`shrink-0 ${pr.draft ? 'text-text-3' : 'text-ok'}`} title={pr.draft ? 'Draft' : 'Open'}>{pr.draft ? <GitPullRequestDraft size={15} /> : <GitPullRequest size={15} />}</span>
                        <span className="w-12 shrink-0 font-mono text-meta text-text-3">#{pr.number}</span>
                        <span className="min-w-0 flex-1 truncate text-text">{pr.title}</span>
                        {d && <span className={`hidden shrink-0 text-meta md:inline ${d.tone}`}>{d.label}</span>}
                        <span className="hidden max-w-48 shrink-0 items-center gap-1 truncate font-mono text-meta text-text-3 lg:flex"><GitBranch size={11} />{pr.branch}</span>
                        <span className="w-28 shrink-0 truncate text-right text-meta text-text-3">{pr.author}</span>
                        <span className="w-16 shrink-0 text-right text-meta text-text-3 tnum">{ago(pr.updatedAt)}</span>
                        <IconButton onClick={() => window.open(pr.url)} title="Open on GitHub"><ExternalLink size={ICON} /></IconButton>
                        <SecondaryButton size="sm" onClick={() => onReview(p, pr)} icon={<AgentIcon id={agent} />}>Review with {agentName}</SecondaryButton>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {!git.length && <div className="py-16 text-center text-body text-text-3">No project uses git yet</div>}
        </div>
      </div>
    </div>
  )
}
