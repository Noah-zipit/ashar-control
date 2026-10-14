export type ProjectStatus =
  | "live"
  | "waiting"
  | "building"
  | "active"
  | "starts"
  | "offline";

export interface Hub {
  id: string;
  name: string;
  percent: number;
}

export interface ProjectStat {
  label: string;
  value: string;
}

export interface Project {
  id: string;
  name: string;
  hubId: string;
  status: ProjectStatus;
  summary: string;
  stats: ProjectStat[];
  nextAction: string;
  link?: string;
  details: string[];
}

export interface OverviewGridItem {
  label: string;
  value: string;
  sub?: string;
}

export interface Overview {
  heroLabel: string;
  heroValue: string;
  heroSub: string;
  sparkline: number[];
  sparklineLabel: string;
  grid: OverviewGridItem[];
  waiting: string[];
  deadlineLine: string;
}

export interface DashboardState {
  version: number;
  owner: { name: string; location: string; meta: string };
  hubs: Hub[];
  projects: Project[];
  overview: Overview;
  footer: string;
  updatedAt: string;
}
