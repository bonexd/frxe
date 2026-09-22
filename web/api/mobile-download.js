import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import youtubedl from 'youtube-dl-exec';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const videoId = String(req.body?.videoId || '').trim();
  if (!VIDEO_ID.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video id.' });
  }

  const workDir = path.join(os.tmpdir(), `vitr-seal-${randomUUID()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const template = path.join(workDir, '%(title).180B [%(id)s].%(ext)s');

  try {
    await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      noPlaylist: true,
      noWarnings: true,
      newline: true,
      format: 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]',
      output: template,
    }, {
      cwd: workDir,
      timeout: 120000,
    });

    const fileName = fs.readdirSync(workDir)
      .find((name) => /\.(?:m4a|mp4)$/i.test(name));

    if (!fileName) {
      cleanup(workDir);
      return res.status(502).json({ error: 'Seal download did not produce an iOS-compatible audio file.' });
    }

    const filePath = path.join(workDir, fileName);
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replaceAll('"', '')}"`);
    res.setHeader('X-Vitr-Engine', 'seal');
    res.setHeader('Cache-Control', 'no-store');

    const stream = fs.createReadStream(filePath);
    const finish = () => cleanup(workDir);
    res.on('finish', finish);
    res.on('close', finish);
    stream.on('error', (error) => {
      cleanup(workDir);
      if (!res.headersSent) res.status(500).json({ error: error.message });
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    cleanup(workDir);
    return res.status(502).json({
      error: 'Seal download is temporarily unavailable.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
