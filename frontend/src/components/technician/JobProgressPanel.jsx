import { useEffect, useRef, useState } from 'react';
import { FiCamera, FiTrendingUp, FiX } from 'react-icons/fi';
import { fetchTicketProgress, postTicketProgress } from '../../api/api';

// Progress reports for a job that takes days or months: how far along it is, what was done, and
// photos. The technician posts from the job details on a phone; admins and the client see the same
// reports in the ticket timeline, and the job's progress bar follows the latest percent.

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 10;

const formatWhen = (report) => {
  const value = report.workDate ? new Date(`${report.workDate}T00:00:00`) : new Date(report.timestamp);
  if (Number.isNaN(value.getTime())) return '';
  return value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function JobProgressPanel({ ticketId, canPost, onPosted, onDirtyChange }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const previews = useRef([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchTicketProgress(ticketId);
      setReports(data);
      setLoadError('');
      // Start from the last reported percent, so a note-only update keeps the bar where it was.
      const latest = data.find((report) => report.percent !== null && report.percent !== undefined);
      setPercent((current) => (current === '' && latest ? String(latest.percent) : current));
    } catch (error) {
      setLoadError(error.message || 'Unable to load progress updates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [ticketId]);

  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const dirty = Boolean(note.trim()) || photos.length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty]);

  const addPhotos = (event) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    const refused = [];
    const accepted = [];
    chosen.forEach((file) => {
      if (!PHOTO_TYPES.has(file.type)) refused.push(`${file.name} is not a JPG, PNG or WebP photo`);
      else if (file.size > MAX_PHOTO_BYTES) refused.push(`${file.name} is larger than 10 MB`);
      else accepted.push(file);
    });
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    if (accepted.length > room) refused.push(`only ${MAX_PHOTOS} photos fit in one update`);
    const added = accepted.slice(0, room).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { file, preview };
    });
    setPhotos((current) => [...current, ...added]);
    setFormError(refused.length ? `Not added: ${refused.join('; ')}.` : '');
  };

  const submit = async (event) => {
    event.preventDefault();
    setNotice('');
    const value = String(percent).trim();
    if (value !== '' && !(Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100)) {
      setFormError('Percent complete must be a whole number from 0 to 100.');
      return;
    }
    if (!note.trim() && value === '') {
      setFormError('Write what was done, or give the percent complete.');
      return;
    }
    if (note.trim() && note.trim().length < 3) {
      setFormError('Write a little more about what was done.');
      return;
    }
    setPosting(true);
    setFormError('');
    try {
      await postTicketProgress({ ticketId, percent: value, note: note.trim(), photos: photos.map((photo) => photo.file) });
      setNote('');
      setPhotos([]);
      setNotice(value !== '' ? `Update posted: ${value}% done. The client can see it.` : 'Update posted. The client can see it.');
      await load();
      onPosted?.();
    } catch (error) {
      setFormError(error.message || 'Unable to post the progress update.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:mt-4 sm:p-4" aria-label="Progress updates">
      <div className="flex items-center gap-2">
        <FiTrendingUp className="text-indigo-600" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-slate-900">Progress updates</h4>
        {reports.length ? <span className="text-xs text-slate-500">({reports.length})</span> : null}
      </div>

      {canPost ? (
        <form onSubmit={submit} noValidate className="mt-3 space-y-3 rounded-lg border border-indigo-100 bg-white p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">How far along is the job? (%)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              step="5"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              placeholder="e.g. 40"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">What was done</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: mounted the rails on the east roof; panels arrive tomorrow."
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <div>
            <input id={`progress-photos-${ticketId}`} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={addPhotos} className="sr-only" />
            <label
              htmlFor={`progress-photos-${ticketId}`}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FiCamera aria-hidden="true" /> Add photos
            </label>
            <span className="ml-2 text-xs text-slate-500">{photos.length ? `${photos.length} selected` : 'Optional · JPG, PNG or WebP, up to 10 MB'}</span>
            {photos.length ? (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {photos.map((photo, index) => (
                  <div key={photo.preview} className="relative">
                    <img src={photo.preview} alt={`New progress photo ${index + 1}`} className="aspect-square w-full rounded-md object-cover" />
                    <button
                      type="button"
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-1 text-white"
                    >
                      <FiX size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {formError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}
          {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
          <button
            type="submit"
            disabled={posting}
            className="min-h-11 w-full rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 sm:w-auto"
          >
            {posting ? 'Posting…' : 'Post update'}
          </button>
        </form>
      ) : null}

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500">Loading updates…</p>
        ) : loadError ? (
          <p role="alert" className="text-sm text-red-700">{loadError}</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-slate-500">No progress updates yet.</p>
        ) : reports.map((report) => (
          <article key={report.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">{formatWhen(report)} · {report.author}</span>
              {report.percent !== null && report.percent !== undefined ? (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">{report.percent}% done</span>
              ) : null}
            </div>
            {report.note ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{report.note}</p> : null}
            {report.photos.length ? (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {report.photos.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${index + 1}`} className="block aspect-square overflow-hidden rounded-md border border-slate-200">
                    <img src={url} alt={`Progress photo ${index + 1}`} className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
