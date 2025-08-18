const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class MediaDownloaderPlugin {
  constructor(config = {}) {
    this.config = {
      outputPath: path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads/terminal_media'),
      maxConcurrency: 4,
      formats: {
        audio: 'bestaudio/best',
        video: 'best[height<=1080]'
      },
      audioFormat: 'mp3',
      audioQuality: '192',
      ...config
    };
    this.initializeOutputPath();
  }

  async initializeOutputPath() {
    try {
      await fs.mkdir(this.config.outputPath, { recursive: true });
    } catch (error) {
      console.error(`Failed to create output directory: ${this.config.outputPath}`, error);
    }
  }

  getCommands() {
    return [
      {
        command: /download (audio|video) (https?:\/\/\S+)/,
        handler: this.downloadSingle.bind(this),
        description: 'Download a single media file (audio or video) from a URL.',
        args: ['media_type', 'url']
      },
      {
        command: /download bulk (audio|video) from (.+)/,
        handler: this.downloadBulk.bind(this),
        description: 'Download multiple URLs from a file.',
        args: ['media_type', 'file_path']
      },
      {
        command: /set download path (.+)/,
        handler: this.setDownloadPath.bind(this),
        description: 'Set the default download path for media.',
        args: ['new_path']
      }
    ];
  }

  async downloadSingle(match) {
    const [, mediaType, url] = match;
    try {
      const result = await this.downloadUrl(url, mediaType);
      return { success: true, output: `Download successful. Output: ${result.output}` };
    } catch (error) {
      return { success: false, output: `Download failed: ${error.message}` };
    }
  }

  async downloadBulk(match) {
    const [, mediaType, filePath] = match;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const urls = data.split(/\r?\n/).filter(url => url.trim());
      
      const results = [];
      for (let i = 0; i < urls.length; i += this.config.maxConcurrency) {
        const chunk = urls.slice(i, i + this.config.maxConcurrency);
        const chunkPromises = chunk.map(url => this.downloadUrl(url, mediaType).catch(e => ({ success: false, output: e.message, url })));
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
      }
      
      const successCount = results.filter(r => r.success).length;
      const failures = results.filter(r => !r.success);

      let output = `Bulk download complete: ${successCount}/${urls.length} succeeded.`;
      if (failures.length > 0) {
          output += `\nFailed URLs:\n${failures.map(f => `${f.url}: ${f.output}`).join('\n')}`;
      }
      return { success: true, output };
    } catch (error) {
      return { success: false, output: `Bulk download failed: ${error.message}` };
    }
  }

  downloadUrl(url, mediaType) {
    return new Promise((resolve, reject) => {
      const outputTemplate = path.join(this.config.outputPath, '%(uploader)s - %(title)s.%(ext)s');
      
      const args = [
        '--ignore-errors',
        '-o', outputTemplate,
        '--format', this.config.formats[mediaType],
      ];

      if (mediaType === 'audio') {
        args.push(
          '-x', // --extract-audio
          '--audio-format', this.config.audioFormat,
          '--audio-quality', this.config.audioQuality
        );
      }
      
      args.push(url);

      const ytdlp = spawn('yt-dlp', args);
      let stdout = '';
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          reject(new Error(`yt-dlp exited with code ${code}. Stderr: ${stderr}`));
        }
      });

      ytdlp.on('error', (err) => {
        reject(new Error(`Failed to start yt-dlp process. Make sure yt-dlp is installed and in your PATH. Error: ${err.message}`));
      });
    });
  }

  setDownloadPath(match) {
    const [, newPath] = match;
    const resolvedPath = path.resolve(newPath);
    this.config.outputPath = resolvedPath;
    
    // Re-initialize to ensure the new path exists
    this.initializeOutputPath();

    return { 
      success: true, 
      output: `Download path set to: ${resolvedPath}` 
    };
  }
}

module.exports = MediaDownloaderPlugin;