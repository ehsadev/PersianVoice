export type DownloadEvent = {
  name?: string;
  file?: string;
  status?: string;
  loaded?: number;
  total?: number;
};

export type DownloadFile = {
  id: string;
  file: string;
  status: 'waiting' | 'progress' | 'done' | 'cached';
  loaded: number;
  total: number;
};

// Progress callbacks for different model files arrive interleaved. Keep each
// file's counter independent so the UI never presents a new file as a reset.
export class DownloadTracker {
  private readonly files = new Map<string, DownloadFile>();

  update(event: DownloadEvent): DownloadFile[] {
    const file = event.file || 'مدل';
    const id = `${event.name || ''}/${file}`;
    const previous = this.files.get(id);
    const row: DownloadFile = previous ? { ...previous } : { id, file, status: 'waiting', loaded: 0, total: 0 };
    if (typeof event.total === 'number' && Number.isFinite(event.total) && event.total > 0) row.total = Math.max(row.total, event.total);
    if (typeof event.loaded === 'number' && Number.isFinite(event.loaded) && event.loaded >= 0) row.loaded = Math.max(row.loaded, event.loaded);
    if (event.status === 'cached') row.status = 'cached';
    else if (event.status === 'done') { row.status = 'done'; if (row.total) row.loaded = Math.max(row.loaded, row.total); }
    else if (event.status === 'progress' && row.status !== 'done' && row.status !== 'cached') row.status = 'progress';
    this.files.set(id, row);
    return [...this.files.values()];
  }
}
