import {DASHBOARD_URI} from '../app/constants.js';
import {prisma} from '../database/prisma.js';

const TTL_MS = 60_000;
const bases = new Map<string, {base: string; at: number}>();
const MAX_ORIGINS = 1000;
const origins = new Map<string, {allowed: boolean; at: number}>();

/**
 * Subscribe, unsubscribe and preference links. A project with a `linkDomain` (a CNAME to the dashboard host)
 * gets them on its own brand domain; others use DASHBOARD_URI.
 */
export class ProjectLinkService {
  public static async base(projectId: string): Promise<string> {
    const hit = bases.get(projectId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.base;
    const project = await prisma.project.findUnique({where: {id: projectId}, select: {linkDomain: true}});
    const base = this.baseFor(project?.linkDomain);
    bases.set(projectId, {base, at: Date.now()});
    return base;
  }

  public static baseFor(linkDomain: string | null | undefined): string {
    return linkDomain ? `https://${linkDomain}` : DASHBOARD_URI;
  }

  public static async links(projectId: string, contactId: string) {
    const base = await this.base(projectId);
    return {
      unsubscribeUrl: `${base}/unsubscribe/${contactId}`,
      subscribeUrl: `${base}/subscribe/${contactId}`,
      manageUrl: `${base}/manage/${contactId}`,
    };
  }

  /** Whether an Origin is one of the projects' link domains, whose pages call the public contact endpoints. */
  public static async isLinkOrigin(origin: string): Promise<boolean> {
    const hit = origins.get(origin);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.allowed;
    let host: string | null = null;
    try {
      const url = new URL(origin);
      if (url.protocol === 'https:' && url.origin === origin) host = url.hostname;
    } catch {
      host = null;
    }
    const allowed = host
      ? (await prisma.project.findUnique({where: {linkDomain: host}, select: {id: true}})) !== null
      : false;
    if (origins.size >= MAX_ORIGINS) origins.clear();
    origins.set(origin, {allowed, at: Date.now()});
    return allowed;
  }
}
