import type { Project } from "./core";

export interface SourceSummary {
  id: string;
  name: string;
  source: string;
  hullId: string;
  hullSize: string;
  error?: string;
}

export interface LibrarySummary extends SourceSummary {
  createdUTC: string;
}

export interface PackageMetadata {name:string;version:string}
export interface WorkspaceSnapshot { packageSettings?:{single?:PackageMetadata;all?:PackageMetadata;singles?:Record<string,PackageMetadata>}; format: 1; active: number; documents: {id:string; project:Project; dirty:boolean; zoom:number; selected:string; tool:string; autoAttempted:boolean}[] }
export interface BatchResult {results:{id:string;hullId:string;ok:boolean;output?:string;error?:string}[];directory:string}
export interface DesktopAPI {
  workspaceRead():Promise<{workspace:WorkspaceSnapshot|null;warning?:string}>;
  workspaceWrite(value:WorkspaceSnapshot):Promise<boolean>;
  batch(items:{id:string;project:Project;preview?:string}[],mode:'save'|'ship'|'package',metadata?:PackageMetadata):Promise<BatchResult|false>;
  onPrepareClose(callback:()=>void):void;
  prepareExit(mode:'recover'|'discard'):Promise<boolean>;
  closeReady():void;
  starsectorLocation(): Promise<{
    installation: string | null;
    detected: boolean;
    needsSelection: boolean;
    warning?: string;
  }>;
  chooseStarsectorLocation(): Promise<
    { installation: string; needsSelection: boolean } | false
  >;
  onAlreadyOpen(callback: () => void): () => void;
  save(name: string, text: string): Promise<boolean>;
  exportPackage(project: Project, preview: string, metadata?:PackageMetadata): Promise<string | false>;
  libraryList(): Promise<{ entries: LibrarySummary[]; warnings: string[] }>;
  libraryGet(id: string): Promise<Project>;
  scanShips(): Promise<SourceSummary[] | false>;
  previewShip(id: string): Promise<{
    image?: string;
    name: string;
    hullSize: string;
    issues: string[];
    needsSprite?: boolean;
    message?: string;
  }>;
  importShip(
    id?: string,
  ): Promise<{ entry: LibrarySummary; duplicate: boolean } | false>;
}
