import { create } from 'zustand';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface ObsInput {
  name: string;
  kind: string;
}

export interface ObsStats {
  cpu: number;
  fps: number;
  renderSkipped: number;
  renderTotal: number;
  outputSkipped: number;
  outputTotal: number;
}

export interface ObsState {
  status: ConnStatus;
  error?: string;
  obsVersion?: string;
  scenes: string[];
  programScene?: string;
  previewScene?: string;
  studioMode: boolean;
  inputs: ObsInput[];
  specialInputs: Partial<Record<'mic1' | 'mic2' | 'desktop1' | 'desktop2', string>>;
  muted: Record<string, boolean>;
  record: { active: boolean; paused: boolean; timecode?: string };
  stream: { active: boolean; timecode?: string; kbps?: number; dropped?: number };
  replayBuffer: { active: boolean; available: boolean };
  virtualCam: boolean;
  transitions: string[];
  currentTransition?: string;
  /** anahtar: `${sahne}::${kaynak}` */
  sceneItems: Record<string, boolean>;
  /** anahtar: `${kaynak}::${filtre}` */
  filters: Record<string, boolean>;
  stats?: ObsStats;
}

export const initialObsState: ObsState = {
  status: 'idle',
  scenes: [],
  studioMode: false,
  inputs: [],
  specialInputs: {},
  muted: {},
  record: { active: false, paused: false },
  stream: { active: false },
  replayBuffer: { active: false, available: false },
  virtualCam: false,
  transitions: [],
  sceneItems: {},
  filters: {},
};

export const useObs = create<ObsState>(() => ({ ...initialObsState }));

export const setObs = (patch: Partial<ObsState> | ((s: ObsState) => Partial<ObsState>)) =>
  useObs.setState(patch);

export const itemKey = (scene: string, source: string) => `${scene}::${source}`;
export const filterKey = (source: string, filter: string) => `${source}::${filter}`;
