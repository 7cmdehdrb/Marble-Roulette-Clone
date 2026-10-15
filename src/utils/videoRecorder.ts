import { pad } from './utils';

type Session = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; discard: boolean };

/** A recording owns its stream and buffers, so cancelling cannot affect the next round. */
export class VideoRecorder {
  private session: Session | null = null;

  constructor(private targetCanvas: HTMLCanvasElement) {}

  get isRecording() {
    return this.session?.recorder.state === 'recording';
  }

  async start(): Promise<void> {
    if (this.isRecording) return;
    if (!('MediaRecorder' in window) || !this.targetCanvas.captureStream) {
      throw new Error('이 브라우저는 화면 녹화를 지원하지 않습니다.');
    }
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
    const stream = this.targetCanvas.captureStream(30);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 6000000 });
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      throw error;
    }
    const session: Session = { recorder, stream, chunks: [], discard: false };
    this.session = session;
    return new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstart = () => resolve();
      recorder.onerror = () => {
        session.discard = true;
        session.stream.getTracks().forEach(track => track.stop());
        if (this.session === session) this.session = null;
        reject(new Error('녹화를 시작하지 못했습니다.'));
      };
      recorder.onstop = () => {
        session.stream.getTracks().forEach(track => track.stop());
        if (this.session === session) this.session = null;
        if (session.discard || !session.chunks.length) return;
        const actualType = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(session.chunks, { type: actualType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const d = new Date();
        const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        link.href = url;
        link.download = `marble_roulette_${stamp}.${actualType.includes('mp4') ? 'mp4' : 'webm'}`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      try {
        recorder.start();
      } catch (error) {
        session.discard = true;
        stream.getTracks().forEach(track => track.stop());
        if (this.session === session) this.session = null;
        reject(error);
      }
    });
  }

  stop() {
    if (this.session && this.session.recorder.state !== 'inactive') this.session.recorder.stop();
  }

  cancel() {
    const session = this.session;
    if (!session) return;
    session.discard = true;
    if (session.recorder.state !== 'inactive') session.recorder.stop();
    else session.stream.getTracks().forEach(track => track.stop());
    this.session = null;
  }
}
