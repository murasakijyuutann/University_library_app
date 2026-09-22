/**
 * Presigned thesis PDF upload — progress / cancel / retry (Phase 6.5).
 * Bytes go to the storage URL from `upload-url`; Nest only confirms the key.
 */

export interface UploadUrlResponse {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

type UploadControls = {
  root: HTMLElement;
  fileInput: HTMLInputElement;
  start: HTMLButtonElement;
  cancel: HTMLButtonElement;
  retry: HTMLButtonElement;
  progressWrap: HTMLElement;
  progress: HTMLProgressElement;
  progressLabel: HTMLElement;
  error: HTMLElement;
  csrf: string;
  uploadUrlPath: string;
  confirmUrl: string;
};

export function mountThesisUploads(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-thesis-upload]').forEach((el) => {
    const controls = readControls(el);
    if (!controls) {
      return;
    }
    let abort: AbortController | null = null;
    let lastFile: File | null = null;

    controls.start.addEventListener('click', () => {
      const file = controls.fileInput.files?.[0] ?? lastFile;
      if (!file) {
        showError(controls, 'Choose a PDF first.');
        return;
      }
      lastFile = file;
      void runUpload(controls, file, (controller) => {
        abort = controller;
      }).finally(() => {
        abort = null;
      });
    });

    controls.cancel.addEventListener('click', () => {
      abort?.abort();
      abort = null;
      setBusy(controls, false);
      showError(controls, 'Upload cancelled.');
      controls.retry.hidden = false;
    });

    controls.retry.addEventListener('click', () => {
      controls.retry.hidden = true;
      controls.start.click();
    });
  });
}

function readControls(root: HTMLElement): UploadControls | null {
  const fileInput = root.querySelector<HTMLInputElement>('[data-thesis-file]');
  const start = root.querySelector<HTMLButtonElement>('[data-thesis-start]');
  const cancel = root.querySelector<HTMLButtonElement>('[data-thesis-cancel]');
  const retry = root.querySelector<HTMLButtonElement>('[data-thesis-retry]');
  const progressWrap = root.querySelector<HTMLElement>('[data-thesis-progress-wrap]');
  const progress = root.querySelector<HTMLProgressElement>('[data-thesis-progress]');
  const progressLabel = root.querySelector<HTMLElement>('[data-thesis-progress-label]');
  const error = root.querySelector<HTMLElement>('[data-thesis-error]');
  const csrf = root.dataset.csrf ?? '';
  const uploadUrlPath = root.dataset.uploadUrl ?? '';
  const confirmUrl = root.dataset.confirmUrl ?? '';
  if (
    !fileInput ||
    !start ||
    !cancel ||
    !retry ||
    !progressWrap ||
    !progress ||
    !progressLabel ||
    !error ||
    !csrf ||
    !uploadUrlPath ||
    !confirmUrl
  ) {
    return null;
  }
  return {
    root,
    fileInput,
    start,
    cancel,
    retry,
    progressWrap,
    progress,
    progressLabel,
    error,
    csrf,
    uploadUrlPath,
    confirmUrl,
  };
}

async function runUpload(
  controls: UploadControls,
  file: File,
  onAbortable: (controller: AbortController) => void,
): Promise<void> {
  showError(controls, '');
  setBusy(controls, true);
  controls.progressWrap.hidden = false;
  setProgress(controls, 0);

  const controller = new AbortController();
  onAbortable(controller);

  try {
    const intentRes = await fetch(
      `${controls.uploadUrlPath}?contentType=${encodeURIComponent('application/pdf')}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-CSRF-Token': controls.csrf,
        },
        credentials: 'same-origin',
        signal: controller.signal,
      },
    );
    if (!intentRes.ok) {
      throw new Error(`Could not get upload URL (${intentRes.status}).`);
    }
    const intent = (await intentRes.json()) as UploadUrlResponse;

    await putWithProgress(intent.uploadUrl, file, intent.headers, controller, (pct) =>
      setProgress(controls, pct),
    );

    const form = new FormData();
    form.set('_csrf', controls.csrf);
    form.set('key', intent.key);
    const confirmRes = await fetch(controls.confirmUrl, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!confirmRes.ok && confirmRes.type !== 'opaqueredirect') {
      // follow may land on the detail page (200) after 303
      if (confirmRes.status >= 400) {
        throw new Error(`Could not confirm upload (${confirmRes.status}).`);
      }
    }
    window.location.href = confirmRes.url || controls.confirmUrl.replace(/confirm-upload$/, '') + '?alert=uploaded';
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return;
    }
    showError(controls, error instanceof Error ? error.message : 'Upload failed.');
    controls.retry.hidden = false;
    setBusy(controls, false);
  }
}

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  controller: AbortController,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage PUT failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    controller.signal.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

function setBusy(controls: UploadControls, busy: boolean): void {
  controls.start.disabled = busy;
  controls.fileInput.disabled = busy;
  controls.cancel.hidden = !busy;
}

function setProgress(controls: UploadControls, pct: number): void {
  controls.progress.value = pct;
  controls.progressLabel.textContent = `${pct}%`;
}

function showError(controls: UploadControls, message: string): void {
  controls.error.hidden = !message;
  controls.error.textContent = message;
}
