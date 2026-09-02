const { flattenShots } = require('../shared/schema');

function escapeText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function wrapText(text, maxLen, maxLines = 999) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= maxLen) current += ' ' + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

class PdfWriter {
  constructor() {
    this.objects = [];
    this.offsets = new Array(1000).fill(0);
  }

  add(object) {
    const id = this.objects.length + 1;
    this.objects.push(object);
    return id;
  }

  addStream(content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'latin1');
    return this.add(`<< /Length ${buffer.length} >>\nstream\n${buffer.toString('latin1')}\nendstream`);
  }

  build() {
    let out = Buffer.from('               %PDF-1.4\n%\xe2\xe3\xcf\xd3\n\n');
    let pos = out.length;
    for (let i = 0; i < this.objects.length; i++) {
      const id = i + 1;
      this.offsets[id] = pos;
      const buf = Buffer.isBuffer(this.objects[i]) ? this.objects[i] : Buffer.from(this.objects[i], 'latin1');
      const header = Buffer.from(`${id} 0 obj\n`);
      const tail = Buffer.from('\nendobj\n');
      out = Buffer.concat([out, header, buf, tail]);
      pos = out.length;
    }

    const xrefPos = out.length;
    const count = this.objects.length + 1;
    let xref = `xref\n0 ${count}\n`;
    xref += `0000000000 65535 f \r\n`;
    for (let i = 1; i <= this.objects.length; i++) {
      const offset = String(this.offsets[i]).padStart(10, '0');
      xref += `${offset} 00000 n \r\n`;
    }

    const trailer = `${xref}\ntrailer\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nstartxref\n${xrefPos}\n%%EOF`;
    return Buffer.concat([out, Buffer.from(trailer)]);
  }
}

function buildImageXObject(pdf, rgbaData, width, height) {
  const id = pdf.add(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rgbaData.length} >>\nstream\n`);

  // We need to re-add as stream because we returned the id before adding the stream data
  // Actually, let's fix this by adding the stream properly
  return `${id} 0 R`;
}

function createImageXObject(rgbaData, width, height) {
  return `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rgbaData.length} >>\nstream\n${rgbaData.toString('binary')}\nendstream`;
}

function buildStoryboardPdf(project, options = {}) {
  const pdf = new PdfWriter();
  const fontId = 3;
  const catalog = pdf.add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesObj = pdf.add(''); // placeholder, will be filled after we know page count
  pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const shots = flattenShots(project);
  const shotsPerPage = options.shotsPerPage || 3;
  const groups = [];
  for (let i = 0; i < shots.length; i += shotsPerPage) {
    groups.push(shots.slice(i, i + shotsPerPage));
  }
  if (groups.length === 0) groups.push([]);

  const pageRefs = [];
  const images = [];

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const cmds = [];
    cmds.push('/F1 20 Tf');
    cmds.push('1 0 0 1 72 740 Tm');
    cmds.push(`(${escapeText(project.title || 'Storyboard')}) Tj`);
    cmds.push('/F1 11 Tf');
    cmds.push('1 0 0 1 72 714 Tm');
    cmds.push(`(Clip Story Studio — Storyboard Export | ${new Date().toLocaleString('th-TH')}) Tj`);

    let x = 50, y = 670;
    const colW = 250, rowH = 200;

    for (const { scene, shot } of group) {
      const label = `S${scene.sceneNumber}·SH${shot.shotNumber} (${shot.plannedDurationSec}s)`;
      cmds.push('/F1 9 Tf');
      cmds.push(`1 0 0 1 ${x} ${y} Tm`);
      cmds.push(`(${escapeText(label)}) Tj`);

      const imageRef = shot.storyboardImageRelativePath;
      const prompt = shot.imagePrompt || 'No prompt';

      if (options.includeImages && imageRef && options.imageLoader) {
        try {
          const imageData = options.imageLoader(imageRef);
          if (imageData) {
            const xobjStr = createImageXObject(imageData.rgba, imageData.width, imageData.height);
            const imgId = pdf.add(xobjStr);
            images.push({ id: imgId, x, y: y - rowH - 20, w: Math.min(200, imageData.width), h: Math.min(200, imageData.height) });
            cmds.push(`/X${imgId} Do ${x} ${y - rowH - 20} ${rowH} ${rowH} cm`);
          }
        } catch { /* skip image */ }
      }

      const preview = prompt.slice(0, 140);
      const promptLines = wrapText(preview, 50, 8);
      cmds.push('/F1 6 Tf');
      let py = y - (options.includeImages && imageRef ? rowH + 40 : 24);
      for (const line of promptLines) {
        cmds.push(`1 0 0 1 ${x} ${py} Tm`);
        cmds.push(`(${escapeText(line)}) Tj`);
        py -= 8;
      }

      y -= colW;
      if (y < 80) {
        y = 670;
        x += colW + 60;
        if (x > 400) {
          x = 50;
        }
      }
    }

    const resources = `<< /Font << /F1 3 0 R >>${images.length ? ' /XObject <<' + images.map(img => ` /X${img.id} ${img.id} 0 R`).join('') + ' >>' : ''} >>`;
    const contentStr = cmds.join('\n');
    const contentId = pdf.addStream(contentStr);
    const pageId = pdf.add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources ${resources} >>`);
    pageRefs.push(pageId);
  }

  // Fix the Pages object
  const kids = pageRefs.map(ref => `${ref} 0 R`).join(' ');
  pdf.objects[1] = `<< /Type /Pages /Count ${pageRefs.length} /Kids [${kids}] >>`;

  return pdf.build();
}

module.exports = { PdfWriter, createImageXObject, buildStoryboardPdf, escapeText, wrapText };
