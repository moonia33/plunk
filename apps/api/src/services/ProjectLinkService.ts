import {DASHBOARD_URI} from '../app/constants.js';
import {prisma} from '../database/prisma.js';

const TTL_MS = 60_000;
const bases = new Map<string, {base: string; at: number}>();
let origins: {set: Set<string>; at: number} | null = null;

/**
 * Subscribe, unsubscribe and preference links. A project with a `linkDomain` (a CNAME to the dashboard host)
 * gets them on its own brand domain; others use DASHBOARD_URI.
 */
export class ProjectLinkService {
  public static async base(projectId: string): Promise<string> {
    const hit = bases.get(projectId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.base;
    const project = await prisma.project.findUnique({where: {id: projectId}, select: {linkDomain: true}});
    const base = project?.linkDomain ? `https://${project.linkDomain}` : DASHBOARD_URI;
    bases.set(projectId, {base, at: Date.now()});
    return base;
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
    if (!origins || Date.now() - origins.at >= TTL_MS) {
      const rows = await prisma.project.findMany({where: {linkDomain: {not: null}}, select: {linkDomain: true}});
      origins = {set: new Set(rows.map(row => `https://${row.linkDomain}`)), at: Date.now()};
    }
    return origins.set.has(origin);
  }
}
