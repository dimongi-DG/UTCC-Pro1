# Master Prompt: Clip Story Studio

## บทบาท

คุณคือ Senior Desktop Application Engineer และ Product Engineer ที่เชี่ยวชาญ Electron, Vanilla JavaScript, multimedia workflow, Generative AI, prompt engineering, text-to-speech และการจัดการไฟล์สื่อบน Windows/macOS

หน้าที่ของคุณคือออกแบบและเขียนโค้ดแอปให้ใช้งานได้จริงครบทุกไฟล์ พร้อมคำอธิบายสำหรับผู้เริ่มต้น โดยตัดสินใจเชิงวิศวกรรมอย่างรอบคอบ ไม่สร้างเพียง mockup และไม่ทิ้งปุ่มหรือฟังก์ชันที่กดแล้วไม่ทำงาน

---

## เป้าหมายผลิตภัณฑ์

สร้าง Desktop Application ชื่อ **“Clip Story Studio”** สำหรับวางแผนและผลิตคลิปวิดีโอแบบเป็นขั้นตอน ตั้งแต่แนวคิดจนถึงไฟล์วิดีโอสำเร็จรูป โดยผู้ใช้สามารถ:

1. ใส่ concept, ประเด็น หรือข้อความที่ต้องการสื่อสาร แล้วให้ AI สร้าง Story พร้อมบทพูด/คำบรรยาย
2. สร้าง Storyboard เป็นรายฉากและรายช็อต โดย AI สร้าง image prompt ให้ผู้ใช้นำไปสร้างภาพด้วยเครื่องมือภายนอกแบบ Manual
3. สร้าง Character Library และ import รูปอ้างอิงตัวละครเพื่อรักษาความต่อเนื่องของรูปลักษณ์
4. นำภาพ storyboard ที่สร้างจากภายนอกกลับมา import และผูกกับแต่ละช็อต
5. สร้าง video prompt จาก storyboard โดย **หนึ่ง prompt แทนหนึ่ง video segment ความยาวไม่เกิน 8 วินาที** หนึ่ง storyboard shot สามารถมีหลาย segment/prompt และทั้งโปรเจกต์มี prompt ได้ไม่จำกัดจำนวน
6. นำ video prompt ไปสร้างวิดีโอด้วยเครื่องมือภายนอกแบบ Manual แล้ว import คลิปกลับมายังช็อตเดิม
7. สร้างเสียงพูด/เสียงบรรยายจากบทด้วย TTS, เลือกเสียงให้ตัวละคร, ฟังตัวอย่าง และสร้างใหม่เฉพาะประโยคได้
8. จัดวางคลิป เสียงพูด เสียงประกอบ และเพลงบน timeline แบบพื้นฐาน แล้ว export เป็น MP4
9. บันทึกทุกอย่างเป็น Project เพื่อปิดและเปิดทำงานต่อภายหลังได้

แอปเป็น **offline-first**: งาน โปรเจกต์ prompt และไฟล์สื่อเก็บในเครื่อง การเชื่อมต่ออินเทอร์เน็ตจำเป็นเฉพาะตอนเรียก AI/TTS API เท่านั้น ไม่ต้อง deploy cloud และเปิดจากไอคอนโปรแกรมได้โดยไม่ต้องเปิด browser

> ขอบเขต MVP: การสร้างภาพ storyboard และวิดีโอเป็นขั้นตอน Manual โดยแอปสร้าง prompt และรับไฟล์ที่ผู้ใช้ import กลับมา ส่วน Text Generation และ TTS รองรับการเรียก API จากในแอป โครงสร้าง provider ต้องพร้อมเพิ่ม Image/Video API ในอนาคตโดยไม่รื้อ UI หรือข้อมูลเดิม

---

## Tech Stack บังคับ

- Electron: main process + preload + renderer
- HTML + CSS + Vanilla JavaScript เท่านั้น ห้ามใช้ React, Vue หรือ UI framework
- Node.js สำหรับ filesystem, path, dialog, crypto/safeStorage และ child process
- `ffmpeg-static` หรือ FFmpeg ที่ตรวจพบในเครื่อง สำหรับประกอบ/เข้ารหัสวิดีโอและเสียง
- JSON files สำหรับ project data และ settings; ห้ามใช้ `localStorage` เป็นฐานข้อมูลหลัก
- API calls ต้องเกิดใน main process เท่านั้น แล้วสื่อสารผ่าน IPC ที่กำหนด allow-list ใน preload
- ตั้งค่า `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` ถ้าการทำงานที่เลือกใช้รองรับ
- ใช้ `electron-builder` สร้าง Windows installer และ macOS package
- รองรับข้อความและชื่อไฟล์ภาษาไทยแบบ UTF-8

### หลักการด้าน Provider

แยก abstraction ตาม capability ไม่ผูกทุกอย่างกับ provider เดียว:

- `TextProvider.generateStructuredText()`
- `ImageProvider.generateImage()` — เตรียม interface ไว้ แม้ MVP ใช้ manual flow
- `VideoProvider.generateVideo()` — เตรียม interface ไว้ แม้ MVP ใช้ manual flow
- `TtsProvider.listVoices()` และ `TtsProvider.synthesize()`

ผู้ใช้เลือก provider/model แยกกันได้สำหรับ Story, Storyboard Prompt, Video Prompt และ TTS

อย่า hardcode สมมติฐานว่า model ทุกตัวรองรับ parameter เหมือนกัน ให้มี capability map ต่อ provider/model และส่งเฉพาะ parameter ที่รองรับ ชื่อโมเดลและ endpoint ต้องแก้ได้จาก Settings โดยมีค่าเริ่มต้นใน config กลาง ไม่กระจายอยู่หลายไฟล์

---

## โครงสร้างโปรเจกต์ที่แนะนำ

```text
clip-story-studio/
├── main.js
├── preload.js
├── package.json
├── src/
│   ├── renderer/
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── app.js
│   │   ├── state.js
│   │   ├── router.js
│   │   └── views/
│   │       ├── projects.js
│   │       ├── brief.js
│   │       ├── story.js
│   │       ├── characters.js
│   │       ├── storyboard.js
│   │       ├── voices.js
│   │       ├── timeline.js
│   │       ├── export.js
│   │       └── settings.js
│   ├── main/
│   │   ├── ipc.js
│   │   ├── project-store.js
│   │   ├── settings-store.js
│   │   ├── asset-manager.js
│   │   ├── media-service.js
│   │   └── validators.js
│   ├── services/
│   │   ├── provider-registry.js
│   │   ├── text-provider.js
│   │   ├── tts-provider.js
│   │   ├── openai-provider.js
│   │   ├── gemini-provider.js
│   │   └── mock-provider.js
│   ├── prompts/
│   │   ├── defaults.js
│   │   └── prompt-builder.js
│   └── shared/
│       ├── schema.js
│       ├── constants.js
│       └── utils.js
├── assets/
│   ├── fonts/
│   ├── icon.ico
│   └── icon.icns
├── tests/
├── README.md
└── .gitignore
```

Project ของผู้ใช้แต่ละงานต้องจัดเก็บประมาณนี้:

```text
<project-folder>/
├── project.json
├── prompts/
├── characters/
├── storyboard-images/
├── video-clips/
├── voices/
├── music/
├── exports/
└── temp/
```

ไฟล์ที่ import ต้อง **copy เข้ามาใน project** โดยตั้งชื่อปลอดภัยและไม่อ้างอิงเฉพาะ path เดิม เพื่อให้ย้าย/สำรองโปรเจกต์ได้

---

## โครงสร้างข้อมูลหลัก

ใช้ stable ID เช่น UUID และมี `schemaVersion`, `createdAt`, `updatedAt` เพื่อรองรับ migration ในอนาคต

### Project

```js
{
  id,
  schemaVersion,
  title,
  brief: {
    concept,
    keyMessage,
    targetAudience,
    genre,
    tone,
    language,
    visualStyle,
    aspectRatio,       // 9:16, 16:9, 1:1
    targetDurationSec,
    platform           // TikTok, Reels, Shorts, YouTube, Custom
  },
  story: {
    logline,
    synopsis,
    hook,
    ending,
    callToAction
  },
  characters: [],
  scenes: [],
  voiceAssignments: {},
  timeline: {},
  promptVersions: {},
  createdAt,
  updatedAt
}
```

### Character

```js
{
  id,
  name,
  role,
  ageRange,
  appearance,
  wardrobe,
  personality,
  speakingStyle,
  visualConsistencyPrompt,
  negativePrompt,
  referenceImages: [{ id, relativePath, caption, isPrimary }],
  voiceId
}
```

### Scene, Storyboard Shot และ Video Segment

```js
{
  id,
  sceneNumber,
  title,
  purpose,
  location,
  timeOfDay,
  mood,
  shots: [{
    id,
    shotNumber,
    plannedDurationSec, // ความยาวเชิงเนื้อหา อาจมากกว่า 8 ได้
    description,
    characters: [],    // character IDs
    dialogue: [{
      id,
      speakerId,       // หรือ "narrator"
      text,
      emotion,
      pace,
      startSec,
      estimatedDurationSec,
      audioRelativePath
    }],
    camera: { shotSize, angle, movement, lens },
    action,
    environment,
    lighting,
    imagePrompt,
    imageNegativePrompt,
    storyboardImageRelativePath,
    videoSegments: [{
      id,
      segmentNumber,
      durationSec,      // มากกว่า 0 และไม่เกิน 8 เสมอ
      timelineOrder,
      startFrame,
      endFrame,
      actionBeat,
      videoPrompt,
      videoNegativePrompt,
      transitionIn,
      transitionOut,
      videoClipRelativePath,
      status,
      generationMeta: {
        provider,
        model,
        promptVersion,
        generatedAt
      }
    }],
    status,
  }]
}
```

ข้อกำหนดสำคัญ: เพดาน 8 วินาทีใช้กับ `videoSegment` แต่ละรายการเท่านั้น ไม่ใช่ความยาวรวมของ storyboard shot, scene หรือ final clip ถ้าเนื้อหาหนึ่งช็อตใช้ 22 วินาที ตัวอย่างผลลัพธ์ที่ถูกต้องคือ 3 segments เช่น 8 + 8 + 6 วินาที และสร้าง 3 video prompts เพื่อนำคลิปที่ได้มาต่อกันภายหลัง

การแบ่ง segment ต้องเกิดตรง action beat ที่สมเหตุสมผล รักษา continuity ของตัวละคร ฉาก แสง เครื่องแต่งกาย ตำแหน่งวัตถุ และทิศทางการเคลื่อนไหว โดย `endFrame` ของ segment ก่อนหน้าต้องสัมพันธ์กับ `startFrame` ของ segment ถัดไป ห้ามเพียงตัดค่าเวลาให้เหลือ 8 วินาทีโดยทำข้อมูลสูญหาย

---

## UX และหน้าจอ

ใช้ sidebar แสดงขั้นตอนตามลำดับ พร้อมสถานะ Draft / Ready / Imported / Complete:

1. Projects
2. Brief
3. Story
4. Characters
5. Storyboard
6. Voice
7. Timeline
8. Export
9. Settings

ทุกหน้าต้องมี autosave indicator, undo สำหรับการลบรายการสำคัญ, error zone ที่อ่านเข้าใจง่าย และ confirmation ก่อนล้าง/ลบข้อมูลที่ยังไม่บันทึก

### 1) Projects

- New Project, Open Project, Duplicate, Rename, Archive/Delete
- แสดง thumbnail, ชื่อ, อัตราส่วน, ความยาวเป้าหมาย, วันที่แก้ไขล่าสุด และ progress
- รองรับเลือก project folder เอง
- บันทึกแบบ atomic write: เขียนไฟล์ชั่วคราวแล้ว rename เพื่อป้องกัน `project.json` เสียหาย
- มี autosave และ backup ล่าสุดอย่างน้อย 3 รุ่น

### 2) Brief

ฟิลด์อย่างน้อย:

- ชื่อโปรเจกต์
- Concept / เนื้อหาต้นทาง
- Key message ที่ต้องการสื่อ
- กลุ่มเป้าหมาย
- Platform
- Aspect ratio
- ความยาวคลิปเป้าหมาย
- Genre, tone, language, visual style
- Call to action
- ข้อจำกัดหรือสิ่งที่ไม่ต้องการ

ช่องที่ว่างให้ AI เสนอได้ แต่ต้องแสดงข้อเสนอให้ผู้ใช้ตรวจและแก้ก่อนนำไปใช้

### 3) Story

- ปุ่ม “สร้าง Story” เรียก Text API และขอ structured JSON
- ผลลัพธ์ประกอบด้วย title, hook, logline, synopsis, key message, ending, CTA, scenes, shots และ dialogue/narration
- แสดง Story ใน editor ที่แก้ไขได้
- ผู้ใช้เพิ่ม/ลบ/เรียง scene และ shot ได้
- ปุ่ม regenerate ต้องเลือกขอบเขตได้: ทั้งเรื่อง / scene เดียว / shot เดียว / dialogue เฉพาะส่วน
- มี “Lock” ต่อ scene/shot เพื่อไม่ให้ regeneration เขียนทับส่วนที่ผู้ใช้ยืนยันแล้ว
- ตรวจจำนวนเวลาโดยรวมจากผลรวมของ video segments และแจ้งเมื่อเกิน/ต่ำกว่า target duration
- ประเมินเวลาบทพูดตามภาษาและคำต่อนาที พร้อมเตือนเมื่อบทพูดยาวเกินเวลารวมของ segments ที่รองรับ shot นั้น

AI ต้องคืน JSON ตาม schema ที่กำหนด ถ้า parse ไม่ผ่าน ให้ retry แบบ repair JSON หนึ่งครั้ง จากนั้นแสดง raw response และ error โดยไม่ทำให้แอปค้าง

### 4) Characters

- Create/Edit/Delete/Duplicate Character
- import รูปอ้างอิงได้หลายภาพ รองรับ PNG, JPEG, WebP
- แสดง thumbnail และตั้งภาพหลักได้
- ตรวจ MIME จาก file signature ไม่เชื่อเฉพาะนามสกุล
- เก็บคำอธิบายรูปลักษณ์ เสื้อผ้า บุคลิก วิธีพูด และ consistency prompt
- ปุ่ม “วิเคราะห์ภาพอ้างอิง” เป็น optional capability; ถ้า provider ไม่รองรับให้ซ่อนหรือ disable พร้อมคำอธิบาย
- ขณะสร้าง image/video prompt ให้แทรก character consistency block จากตัวละครที่ถูกเลือกใน shot นั้นเสมอ
- ห้ามส่งรูปอ้างอิงไป API โดยไม่บอกผู้ใช้ว่ารูปใดจะถูกอัปโหลด

### 5) Storyboard — Manual Step-by-step

แสดงเป็น card/grid เรียง Scene → Shot แต่ละ card มี:

- shot number และ duration
- จุดประสงค์ของช็อต
- ตัวละคร ฉาก การกระทำ อารมณ์ แสง และกล้อง
- editable image prompt
- negative prompt
- ปุ่ม Copy Prompt
- ปุ่ม Regenerate Prompt
- ปุ่ม Import Storyboard Image
- preview รูป, Replace และ Remove
- สถานะ Prompt Ready / Image Imported

Image prompt ต้องมีโครงสร้างสม่ำเสมอ:

1. subject และ character consistency
2. action และ facial expression
3. environment และ time of day
4. composition, shot size, camera angle, lens
5. lighting, color palette, mood
6. visual style
7. aspect ratio
8. continuity notes จากช็อตก่อนหน้า
9. negative constraints เช่น ห้ามตัวละครซ้ำ แขน/นิ้วผิดรูป ข้อความหรือ watermark ที่ไม่ต้องการ

มีปุ่ม “Export Storyboard Package” สร้าง Markdown/JSON/CSV ซึ่งประกอบด้วย shot list, prompt, negative prompt, duration และ relative path ของภาพอ้างอิง

### 6) Video Prompt และ Video Segments

ระบบต้องสร้าง video prompts ได้หลายรายการต่อหนึ่ง storyboard shot โดยหนึ่ง prompt เท่ากับหนึ่ง video segment ความยาว 1–8 วินาที ผู้ใช้เพิ่ม ลบ แบ่ง รวม (เมื่อผลรวมไม่เกิน 8) ทำซ้ำ และเรียง segment ได้ จำนวน prompt ต่อ scene และต่อโปรเจกต์ไม่จำกัด

ตัวอย่าง: Storyboard shot ยาว 20 วินาทีอาจแตกเป็น Segment 1 = 7 วินาที, Segment 2 = 8 วินาที และ Segment 3 = 5 วินาที เมื่อนำวิดีโอที่สร้างจากทั้ง 3 prompts มา import ระบบต้องเรียงต่อกันเป็นช่วงเวลา 20 วินาทีบน timeline

แต่ละ segment prompt ต้องระบุ:

- duration ที่ชัดเจน 1–8 วินาที
- start frame / initial composition
- subject action และลำดับการเคลื่อนไหวตามเวลา
- facial expression และ body motion
- camera movement
- environment motion เช่น ลม ฝุ่น แสง หรือวัตถุฉากหลัง
- pacing และ mood
- ending frame เพื่อให้ต่อกับ segment หรือช็อตถัดไปได้
- continuity constraints
- negative constraints เช่น ไม่เปลี่ยนหน้า เสื้อผ้า จำนวนตัวละคร หรือรูปทรงระหว่างเฟรม
- audio direction แยกเป็น metadata; อย่าฝังบทพูดยาวไว้ใน visual prompt ถ้า provider ไม่รองรับเสียง

แต่ละ segment มีปุ่ม Copy Prompt, Regenerate, Split, Duplicate, Import Generated Video, Preview, Replace และ Remove รองรับ MP4/WebM/MOV ตามที่ media probe ตรวจอ่านได้ และแสดงหมายเลขเช่น `Scene 2 / Shot 3 / Segment 2 of 4`

เมื่อ `plannedDurationSec` ของ shot มากกว่า 8 วินาที ให้เปิด dialog แสดงแผนแบ่ง action beats และ video segments ก่อน apply จากนั้นสร้าง prompt แยกทุก segment พร้อม continuity handoff ระหว่าง prompt ระบบต้องไม่จำกัดความยาว final clip และไม่จำกัดจำนวน segment

### 7) Voice / TTS

- แสดงรายการ dialogue/narration ทุกบรรทัดตามลำดับ timeline
- mapping เสียงต่อ Character และเสียง Narrator
- เลือก provider, model, voice, language, speaking rate และ output format ตาม capability ของ provider
- ตั้งค่า emotion/style instruction เมื่อ provider รองรับเท่านั้น
- Preview voice sample ก่อนสร้างทั้งหมด
- Generate ทั้งโปรเจกต์ / scene / character / บรรทัดเดียว
- Regenerate เฉพาะบรรทัดโดยไม่กระทบไฟล์อื่น
- import ไฟล์เสียงที่สร้างจากภายนอกได้
- เก็บไฟล์เสียงแยกต่อ dialogue ID เพื่อแก้ไขง่าย
- ตรวจ duration จริงของเสียง แล้วเตือนหากยาวกว่าช็อต
- มีทางเลือก: เพิ่มเวลารวมด้วยการเพิ่ม segment, ปรับความยาว segment เดิมโดยแต่ละ segmentยังไม่เกิน 8 วินาที, ปรับ speaking rate, ย่อบทด้วย AI หรือแบ่งบทไปยัง segment ถัดไป
- ต้องมี cache key จาก text + voice + settings เพื่อไม่เสียค่า API ซ้ำโดยไม่จำเป็น
- แสดง estimated cost ถ้า provider มี pricing metadata; ถ้าไม่มีให้แสดงว่าไม่ทราบแทนการเดา

### 8) Timeline และการประกอบคลิป

Timeline แบบพื้นฐานต้องมี track อย่างน้อย:

- Video
- Dialogue/Narration
- Background music
- Sound effects

ความสามารถขั้นต่ำ:

- เรียง video clips ตาม Scene → Shot → Segment order
- trim จุดเริ่ม/จบแบบตัวเลข
- ปรับ volume และ fade in/out
- preview ช็อตพร้อมเสียง
- ตรวจ missing asset และ duration mismatch
- เลือก fit mode: crop / contain / blur background
- export ด้วย FFmpeg เป็น H.264 + AAC MP4
- preset: 1080x1920, 1920x1080, 1080x1080 และ Custom
- แสดง progress และยกเลิก export ได้
- ห้ามต่อ command ด้วย string ที่รับจากผู้ใช้โดยตรง ให้ใช้ argument array และ validate path/number ทุกค่า

ถ้าไม่มี FFmpeg หรือ binary ใช้ไม่ได้ แอปต้องยังเปิดและใช้ workflow อื่นได้ พร้อมข้อความวิธีแก้ที่ชัดเจน

### 9) Export

รองรับ:

- Final MP4
- Story เป็น Markdown และ JSON
- Storyboard เป็น PDF/Markdown, CSV และ JSON
- Image prompts รวมเป็น `.txt`/`.md`
- Video prompts รวมเป็น `.txt`/`.md`
- Dialogue script เป็น CSV: scene, shot, speaker, text, emotion, duration, audio file
- Project package แบบ folder หรือ ZIP ซึ่งใช้ relative paths

ก่อน export แสดง checklist: missing storyboard image, missing video, missing voice, shot > 8 sec, dialogue overflow และ asset ที่อ่านไม่ได้ ผู้ใช้เลือก export ต่อได้เฉพาะคำเตือนที่ไม่ทำให้ไฟล์เสีย

---

## Settings

รวมไว้หน้าเดียวและแบ่งแท็บ:

### Providers & Secrets

- API key แยกตาม provider
- ปุ่ม Test Connection โดยไม่แสดง key ใน log หรือ renderer
- ใช้ Electron `safeStorage` เข้ารหัสก่อนบันทึกลงไฟล์ settings
- ถ้า OS encryption ใช้ไม่ได้ ต้องเตือนผู้ใช้และไม่ fallback เป็น plaintext โดยเงียบ ๆ
- มีปุ่มลบ key

### Models & Capabilities

- เลือก provider/model แยกสำหรับ Story, Storyboard Prompt, Video Prompt และ TTS
- แสดง capability เช่น structured output, vision input, TTS emotion, supported audio format
- model ID และ endpoint แก้ได้จาก config แต่ต้อง validate ก่อนบันทึก

### Prompt Templates

มี template อย่างน้อย:

- Story generation
- Story revision
- Character consistency
- Storyboard image prompt
- Video prompt
- Dialogue shortening

ทุก template:

- แสดง placeholders ที่รองรับ
- validate placeholder
- Save version ด้วย timestamp
- ใส่ label/note ได้
- preview prompt หลังแทนค่า
- rollback และ restore default ได้

### Project & Export Defaults

- default project location
- autosave interval
- default language/platform/aspect ratio
- FFmpeg path และ Test FFmpeg
- default export preset

---

## IPC และความปลอดภัย

- preload เปิดเฉพาะ method ที่จำเป็นผ่าน `contextBridge`; ห้าม expose `ipcRenderer` ตรง ๆ
- validate payload ทั้ง renderer และ main process
- validate project path ว่าอยู่ใน project root ที่ผู้ใช้เลือก
- ป้องกัน path traversal และ sanitize filename สำหรับ Windows/macOS
- ห้าม renderer อ่าน API key ได้
- ห้าม log secret, Authorization header, raw reference image หรือข้อมูลส่วนตัวโดยไม่จำเป็น
- ตั้ง Content Security Policy อย่างน้อย:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' file: blob:;
connect-src 'none';
```

การเชื่อมต่อ API อยู่ที่ main process จึงไม่ต้องเปิดปลายทาง API ใน renderer CSP

- รองรับ `data:`/`blob:` เฉพาะ resource ที่จำเป็น
- ตรวจ MIME และขนาดไฟล์ก่อน import พร้อมจำกัดขนาดที่สมเหตุสมผล
- ใช้ atomic save และ backup เพื่อป้องกันข้อมูลเสียหายตอนแอปปิดกะทันหัน

---

## Error Handling และสถานะงาน

- ทุก async action มี loading/progress/cancel state ตามความเหมาะสม
- toast สำหรับผลสำเร็จทั่วไป
- inline error สำหรับ validation
- dialog สำหรับ error ที่ต้องตัดสินใจ เช่น key ผิด, quota, network, parse fail, export fail
- แยกข้อความสำหรับ authentication, rate limit, timeout, network offline, malformed response และ unsupported capability
- retry เฉพาะ error ที่ retry ได้ และใช้ exponential backoff จำกัดจำนวนครั้ง
- แอปต้องไม่ค้าง ไม่เงียบ และไม่ทำข้อมูลที่ผู้ใช้แก้ไว้หาย
- บันทึก diagnostic log แบบ redact secrets และมีปุ่มเปิด log folder

---

## Prompt และ Structured Output Contract

ทุกการสร้าง Story ต้องขอผลลัพธ์ JSON ตาม schema ที่แอปรู้จัก ห้ามพึ่งการแยกข้อความด้วย regex แบบเปราะบาง

ข้อกำหนดสำหรับ AI:

- รักษา key message ของผู้ใช้
- ห้ามเปลี่ยน locked scene/shot
- duration รวมควรใกล้ target duration
- **กฎการแสดงอารมณ์ทางภาพ (Show, Don't Tell)**: ในการเขียน `action` และ `imagePrompt` ให้หลีกเลี่ยงการอธิบายอารมณ์ตรงๆ (เช่น 'she is sad') แต่ให้ใช้หลักการ Visual Storytelling เล่าอารมณ์ผ่านท่าทางและสภาพแวดล้อมแทน (เช่น 'she looks down, fidgeting with her thumbs under cold blue lighting')
- **ระบุคำศัพท์มุมกล้อง (Cinematography Keywords)**: ให้ระบุ Camera Movement, Angle และ Lens อย่างชัดเจน เช่น 'Slow push-in, 35mm lens, shallow depth of field, over-the-shoulder (OTS)' เพื่อให้ video segment มีความเป็นภาพยนตร์
- **จัดการ Pacing (จังหวะการตัดต่อ)**: แบ่ง Segment ให้สอดคล้องกับอารมณ์ฉาก หากเป็น Action ให้แบ่ง Segment สั้นๆ (1-3 วินาที) หากเป็น Drama ให้อารมณ์ซึ้ง ใช้ Segment ยาวขึ้น (5-8 วินาที)
- **สร้างความต่อเนื่องให้ Video Prompts (Temporal Continuity)**: สำหรับ Video Prompt ที่แตกแขนงจาก Shot เดียวกัน ให้เขียน prompt ของ Segment 2 ให้เชื่อมกับการกระทำในท้าย Segment 1 เสมอ เพื่อป้องกันภาพกระโดด (Jump cut)
- ทุก storyboard shot ต้องมี `plannedDurationSec` มากกว่า 0 และมี `videoSegments` อย่างน้อยหนึ่งรายการเมื่อเข้าสู่ขั้น Video Prompt
- ทุก `videoSegment.durationSec` ต้องมากกว่า 0 และไม่เกิน 8 วินาที แต่จำนวน segments และความยาวรวมของ final clip ไม่จำกัด
- dialogue ต้องเหมาะกับเวลาและภาษา
- ทุก character reference ต้องใช้ ID ที่มีอยู่จริง
- shot number ต้องไม่ซ้ำและเรียงลำดับ
- image/video prompts ควรเขียนเป็นภาษาอังกฤษโดย default เพื่อให้เข้ากับเครื่องมือสร้างสื่อส่วนใหญ่ แต่ UI, Story และ dialogue ใช้ภาษาที่ผู้ใช้เลือก
- ผู้ใช้สลับภาษา prompt ได้ใน Settings

หลังรับ response ต้อง validate schema และ business rules ก่อนเขียนทับ state เดิมเสมอ

---

## การทดสอบขั้นต่ำ

ใช้ mock provider เพื่อทดสอบได้โดยไม่เสียค่า API และไม่ต้องมีอินเทอร์เน็ต

ต้องมี test อย่างน้อยสำหรับ:

- create/save/reopen project แล้วข้อมูลไม่หาย
- autosave แบบ atomic และ restore backup
- import asset แล้ว copy เข้ามาใน project ถูกต้อง
- sanitize filename และป้องกัน path traversal
- Story JSON validation และ JSON repair path
- locked shot ไม่ถูก regenerate ทับ
- storyboard shot ที่ยาวเกิน 8 วินาทีถูกแบ่งเป็นหลาย video segments โดยไม่ทำ dialogue/action beat หาย และทุก segment ไม่เกิน 8 วินาที
- timeline เรียงหลาย segments ของ shot เดียวกันถูกต้องและคำนวณความยาวรวมจากผลรวมของ segments
- dialogue overflow warning
- TTS cache key
- API error แต่ละประเภท
- secret ไม่ปรากฏใน renderer/log
- FFmpeg argument validation และ cancel export
- export package ใช้ relative paths และเปิดบนอีกเครื่องได้

---

## Definition of Done

- [ ] ติดตั้งแล้วเปิดจากไอคอนบน Windows/macOS ได้
- [ ] สร้าง ปิด และเปิด Project ต่อได้โดยข้อมูลและไฟล์สื่อไม่หาย
- [ ] สร้าง Story พร้อม scene, shot, dialogue และ narration จาก concept/key message ได้
- [ ] แก้ไข เรียง ล็อก และ regenerate เฉพาะส่วนได้
- [ ] Character Library import รูปอ้างอิงและผูกตัวละครกับ shot ได้
- [ ] สร้าง image prompt ต่อ shot และ import storyboard image กลับได้
- [ ] หนึ่ง storyboard shot สร้าง video prompts ได้หลายรายการโดยไม่จำกัดจำนวน
- [ ] ทุก video prompt/segment มี duration ไม่เกิน 8 วินาที โดยไม่จำกัดความยาว final clip
- [ ] import video clip กลับมาแยกตาม segment, preview และเรียงต่อกันบน timeline ได้
- [ ] เลือกเสียงต่อ character และสร้าง/import เสียงต่อบรรทัดได้
- [ ] ตรวจ dialogue overflow และแก้ด้วยวิธีที่กำหนดได้
- [ ] timeline รวม video, voice, music และ SFX ได้
- [ ] export MP4 และ export prompt/storyboard package ได้
- [ ] API key ไม่ออกไป renderer และถูกเข้ารหัสด้วย safeStorage
- [ ] provider/model ที่ไม่รองรับ parameter ใดจะไม่ถูกส่ง parameter นั้น
- [ ] มี mock provider และ test สำคัญผ่าน
- [ ] error ถูกแสดงชัดเจน แอปไม่ค้าง และงานที่แก้ไว้ไม่หาย
- [ ] README อธิบาย `npm install`, `npm start`, การตั้ง API key, manual workflow, FFmpeg และ `npm run build`

---

## วิธีดำเนินงานที่ต้องการจากคุณ

1. เริ่มจากสรุป architecture, data flow และ assumptions ที่จำเป็นแบบกระชับ
2. สร้างโค้ดจริงครบทุกไฟล์ตามโครงสร้าง โดยไม่ใช้ placeholder ที่ทำให้ flow หลักกดใช้งานไม่ได้
3. ใช้ mock provider เป็นค่าเริ่มต้นเพื่อให้ทดลอง workflow ได้ทันที
4. ทำ project persistence และ manual Storyboard/Video import workflow ให้เสร็จก่อน
5. เชื่อม Text API และ TTS ผ่าน provider abstraction
6. ทำ Timeline/FFmpeg export
7. เพิ่ม tests และรันตรวจสอบ
8. สรุปไฟล์ที่สร้าง วิธีติดตั้ง วิธีรัน วิธี build และข้อจำกัดที่ยังมี

ถ้ามีข้อมูลไม่ครบ ให้เลือกค่าเริ่มต้นที่ปลอดภัยและแก้ไขภายหลังได้ พร้อมบันทึก assumption ไว้ใน README ห้ามหยุดงานเพื่อถามรายละเอียดเล็กน้อย และห้ามอ้างว่างานเสร็จจนกว่า Definition of Done ที่ทดสอบได้จะผ่านจริง
