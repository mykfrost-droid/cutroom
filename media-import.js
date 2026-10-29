const MediaImport = {
  createId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    // getRandomValues also works on HTTP LAN addresses, where randomUUID is unavailable.
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
    else throw new Error('This browser cannot generate a media ID. Open the editor at http://localhost:3000 or use a current browser.');
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  },
  type(file) {
    if (/^audio\//i.test(file.type)) return 'audio';
    if (/^video\//i.test(file.type)) return 'video';
    if (/^image\//i.test(file.type)) return 'image';
    const extension = file.name.split('.').pop().toLowerCase();
    if (['mp3','wav','m4a','aac','ogg','oga','flac','opus','aiff','aif'].includes(extension)) return 'audio';
    if (['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', '3gp', 'mts', 'm2ts', 'ts', 'wmv', 'ogv'].includes(extension)) return 'video';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'heic', 'heif'].includes(extension)) return 'image';
    throw new Error('File type not recognized. Choose a video, audio or image file.');
  },
  probe(src, type, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const element = document.createElement(type === 'image' ? 'img' : type);
      const timer = setTimeout(() => finish(new Error('Reading timed out. Try a shorter video or convert it to MP4 with H.264 video.')), timeoutMs);
      const finish = (error, duration = 5) => {
        clearTimeout(timer);
        element.onload = element.onloadeddata = element.onloadedmetadata = element.onerror = null;
        if (type !== 'image') { element.removeAttribute('src'); element.load(); }
        error ? reject(error) : resolve(duration);
      };
      element.onerror = () => finish(new Error(type === 'audio'
        ? 'This browser cannot decode this audio file. Try MP3 or WAV.'
        : type === 'video'
          ? 'This browser cannot decode this video. Convert it to MP4 with H.264 video, then import it again.'
          : 'This browser cannot open this image. Try PNG or JPEG.'));
      if (type !== 'image') {
        element.preload = 'auto';
        element.muted = true;
        element.playsInline = true;
        const loaded = () => {
          if (!Number.isFinite(element.duration) || element.duration <= 0 || (type === 'video' && !element.videoWidth))
            finish(new Error('No playable media track was found in this file.'));
          else finish(null, element.duration);
        };
        if(type === 'audio') element.onloadedmetadata = loaded; else element.onloadeddata = loaded;
      } else element.onload = () => finish(null);
      element.src = src;
    });
  }
};
