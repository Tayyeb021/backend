/**
 * Safe concat of independent WebM chunks (decode once)
 * Creates concat list automatically
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// 🔧 CHANGE THESE
const CHUNKS_DIR = path.resolve(__dirname, 'F:\\Rashid Work\\Falcon-AI\\Falcon-AI-Recruiter\\backend\\temp\\interviews\\93b57c6b-b62a-46a4-b5e1-c0ed74eda5e3'); // folder with chunk-*.webm
const OUTPUT_FILE = path.resolve(__dirname, 'final2.mp4');

// Temp concat list
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-concat-'));
const LIST_FILE = path.join(TEMP_DIR, 'list.txt');

function getSortedChunks(dir) {
  return fs
    .readdirSync(dir)
    .filter(f => /^chunk-\d+\.webm$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)[0]);
      const nb = Number(b.match(/\d+/)[0]);
      return na - nb;
    });
}

function createConcatList(chunks) {
  const content = chunks
    .map(f => {
      const fullPath = path.join(CHUNKS_DIR, f).replace(/\\/g, '/');
      return `file '${fullPath}'`;
    })
    .join('\n');

  fs.writeFileSync(LIST_FILE, content);
}

function runFFmpeg() {
  return new Promise((resolve, reject) => {
    const args = [
      '-err_detect', 'ignore_err',
      '-fflags', '+genpts',

      '-f', 'concat',
      '-safe', '0',
      '-i', LIST_FILE,

      '-map', '0:v:0',
      '-map', '0:a:0',

      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',

      '-c:a', 'aac',
      '-ar', '48000',

      '-movflags', '+faststart',
      '-y',
      OUTPUT_FILE
    ];

    console.log('▶️ FFmpeg started...\n');

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });

    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

(async () => {
  try {
    console.log('📁 Scanning chunks...');
    const chunks = getSortedChunks(CHUNKS_DIR);

    if (!chunks.length) {
      throw new Error('No chunk-*.webm files found');
    }

    console.log(`✅ Found ${chunks.length} chunks`);
    createConcatList(chunks);

    console.log('📝 Concat list created');
    await runFFmpeg();

    console.log('\n🎉 Video created successfully!');
    console.log(`📄 Output: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
})();
