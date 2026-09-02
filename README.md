# Clip Story Studio 2.0.6

แอปเดสก์ท็อปแบบ offline-first สำหรับวางแผนและผลิตวิดีโอสั้น ตั้งแต่ Creative Brief, Character Bible, Story/Scene/Shot, Storyboard, Video Segments, Voice/TTS, Timeline จนถึง Export MP4

เวอร์ชัน 2.0.0 ปรับ workflow เป็น **Brief → Character Bible → Story → Reference-based Storyboard → Image-to-Video → Character-aware Voice** โดยแนบ Character Sheet และ Storyboard เป็น image input จริง พร้อมแสดงแหล่งที่มาของทุกตัวแปรใน Prompt Template Registry

เวอร์ชัน 2.0.1 จำกัดความสูง Video preview ตามหน้าจอเพื่อให้เห็นวิดีโอครบทั้งเฟรม และเพิ่มปุ่มสร้าง Image-to-Video แบบรวมสำหรับทุก Scene/Shot ที่ยังขาดวิดีโอ

เวอร์ชัน 2.0.2 เพิ่ม Sora safety framing ที่ request layer, ตรวจ moderation error จาก response body, ปุ่ม **ปรับ Prompt สำหรับ Sora** และทำให้ batch generation ข้ามคลิปที่ถูก moderation เพื่อสร้างคลิปอื่นต่อ

เวอร์ชัน 2.0.6 แก้การเปลี่ยน Voice แล้วยังได้ยินเสียงเดิม โดยซ่อนไฟล์เสียงเก่าทันทีเมื่อค่าที่มีผลต่อเสียงเปลี่ยน บังคับ Regenerate ให้ข้าม application cache และแสดง `requested voice → provider voice` ของไฟล์ล่าสุด พร้อมเพิ่มการ Export เรื่องราวจากขั้นตอนที่ 4 เป็น Prompt Package สำหรับสร้าง Storyboard ด้วย AI ภายนอก

## ความสามารถหลัก

- Workflow แบบ Character-first: ต้องกำหนดตัวละครและมี Character Sheet/รูปอ้างอิงครบก่อนสร้าง Story
- AI ช่วยสร้างตัวละครจาก Brief พร้อมเพศ ช่วงวัย อายุ บุคลิก วิธีพูด และ voice profile
- Character Turnaround Sheet หลายมุม พร้อม preset เช่น Cinematic Realism, 3D Character Concept, 3D Cartoon, Chibi, Shibi, Anime, Low-poly และสไตล์ที่พิมพ์เพิ่มเอง
- ล็อกรูปแบบภาพตัวละคร ลดปัญหาสั่ง 3D/Cartoon แล้วได้ภาพ photorealistic
- Story แบ่งเป็น Scene/Shot/Dialogue และอ้าง Character Bible ด้วย ID ที่คงที่
- Story เก็บ opening/climax/ending, สถานที่ บรรยากาศ mood/tone, narrative beat, emotional arc, กล้อง, ผู้พูด/ผู้ฟัง, emotion และ delivery
- หน้า Character และ Story สามารถ Export **System Prompt + User Prompt** โดย Render จาก Prompt Template ปัจจุบัน รวมถึง Template ที่ผู้ใช้แก้เอง
- หน้า Story มีปุ่ม **Export Prompt สำหรับ AI ภายนอก** สร้าง Full Story Prompt, Prompt ราย Shot, Markdown/JSON และคัดลอก Character Sheet หลักไปพร้อมกัน
- สร้าง Storyboard Prompt และภาพได้ตั้งแต่หน้า Story; เมื่อ Shot มีตัวละคร ระบบแนบ Character Sheet จริงเข้า Images Edit API แล้วสร้างเป็นภาพฉากใหม่
- Storyboard รองรับภาพสี ภาพสมจริง Concept Art, Anime, 3D Previsualization, Pencil และขาวดำ
- แสดงสถานะ Prompt/Storyboard ที่สร้างแล้วและเตือนก่อนสร้างซ้ำ
- แบ่ง Image-to-Video Segment อัตโนมัติช่วงละ 1–8 วินาที บังคับใช้ภาพ Storyboard เป็น `input_reference` และไม่ fallback เป็น text-to-video
- TTS ใช้บทพูด emotion/delivery ร่วมกับภาษา เพศ อายุ บุคลิก วิธีพูด และ voice profile จาก Character Bible; alias `th-female-warm` ส่งเป็น `coral` พร้อม native-Thai/feminine instructions
- Video ที่สร้างจาก Sora จะถูกลบ audio track อัตโนมัติก่อนบันทึก เพื่อให้เสียงมาจาก Voice/TTS, Music และ SFX ของโปรเจกต์เท่านั้น; คลิปเก่าใช้ปุ่ม **ลบเสียงจาก Video** ได้โดยไม่ต้องสร้างใหม่
- Video Preview จำกัดแนวนอนไม่เกิน 640×360 px และแนวตั้งไม่เกินความกว้าง 300 px พร้อม `object-fit: contain`; ไม่กระทบ resolution ของไฟล์จริงหรือ Export
- Image Prompt และ Video Prompt บังคับให้ทุกเฟรมไม่มีข้อความ ตัวอักษร ตัวเลข subtitle, label, logo, watermark, ป้าย เอกสาร ข้อความบนหน้าจอ หรือ typography ทุกภาษา โดยบังคับซ้ำอีกครั้งก่อนส่ง Media API
- Video preview ใช้ `contain` เพื่อให้เห็นภาพเต็มเฟรม
- ปุ่ม **สร้าง Image-to-Video ทุก Scene ที่ยังขาด** สร้าง/อัปเดต Segment แล้วสร้างเฉพาะคลิปที่ยังไม่มี พร้อมข้าม Shot ที่ไม่มี Storyboard และรายงานผล
- แสดง progress ระหว่าง AI, media, import และ export พร้อมสถานะ error ราย Segment
- Video Prompt ถูกครอบด้วยบริบทสื่อรณรงค์ ตัวละครสมมติ และตัดถ้อยคำเชิงเลียนแบบ/ข้อมูลการเงินก่อนส่ง Sora; Prompt ต้นฉบับในโปรเจกต์ยังแก้ไขได้
- Brief Dependency Sync ทำเครื่องหมายงานปลายทางที่เก่ากว่า Brief และให้ผู้ใช้เลือกอัปเดตเฉพาะส่วน
- Mock provider ทำงานออฟไลน์สำหรับทดสอบ workflow
- Export project package และประกอบ Final MP4 ด้วย FFmpeg

## Prompt Template Registry

เปิด **Settings → Prompt Template Registry** เพื่อดูและแก้ไข Template ต่อไปนี้:

| Template | ใช้กับ | ตัวอย่างตัวแปร |
|---|---|---|
| Story generation | Story, Scene, Shot, Dialogue | `{{briefJson}}`, `{{characterBibleJson}}`, `{{keyMessage}}` |
| Character design | สร้าง Character Bible | `{{contextJson}}`, `{{characterStyle}}` |
| Storyboard prompt | Image prompt ราย Shot | `{{contextJson}}`, `{{characterReferencesJson}}`, `{{storyboardStyle}}` |
| Image-to-video segment prompt | Motion prompt ต่อ Segment | `{{contextJson}}`, `{{storyboardImageJson}}`, `{{segmentCount}}` |

แต่ละ Template แยกเป็น:

- **System prompt** — บทบาท กฎ และข้อจำกัดระดับสูง
- **User prompt** — งานที่ต้องทำ โครงสร้าง JSON และตำแหน่งข้อมูลจากตัวแปร

กด **ตัวแปรเหล่านี้มาจากไหน?** ใต้รายการตัวแปรเพื่อดู source path และความหมาย เช่น `project.brief`, `project.characters`, `shot.characters` หรือ `shot.storyboardImageRelativePath` ข้อมูลในตัวแปรเป็นข้อความ/JSON; ไฟล์ภาพ Character Sheet และ Storyboard ถูกแนบแยกผ่าน media API จริง

กด **บันทึก Settings** ก่อนใช้งาน Template ใหม่ ระบบตรวจ prompt ว่าห้ามว่าง ยาวเกิน 30,000 ตัวอักษร หรือมีตัวแปรที่ไม่ได้ประกาศ ปุ่ม **คืนค่าเริ่มต้น** ใช้คืนเฉพาะ Template และ **คืนค่า Template ทั้งหมด** ใช้คืนทั้งหมด

OpenAI Responses ส่ง System/User แยกผ่าน `instructions` และ `input`; OpenAI-compatible Chat ใช้ role `system`/`user`; Gemini ใช้ `systemInstruction` และ `contents` ตาม protocol ของ vendor

Export Settings จะรวม Prompt Templates, vendor registry, routing, models, reasoning, endpoints และค่าเริ่มต้นต่าง ๆ แต่ **ไม่รวม API key**

## Workflow แนะนำ

1. **Dashboard** — ดูสถานะ Brief, Character, Story, Storyboard, Voice และ Export ของโปรเจกต์
2. **Brief** — ระบุ concept, จุดจบ, key message, กลุ่มเป้าหมาย, mood/tone, visual style และข้อจำกัด
3. **Character** — ให้ AI สร้างเพศ ช่วงวัย อายุ บุคลิก รูปลักษณ์ วิธีพูด และ voice profile แล้วสร้าง/import Character Sheet ให้ครบ
4. **Story** — สร้างสถานที่ บรรยากาศ เหตุการณ์ opening/climax/ending, Scene/Shot, กล้อง, ผู้พูด/ผู้ฟัง น้ำเสียง และ Prompt ภาพทุก Shot
5. **Storyboard** — สร้างภาพฉากใหม่โดยอ้างอิงภาพจริงจาก Character Sheet; จากนั้นสร้าง Image-to-Video Segments ที่ผูกกับภาพ Storyboard
6. **Voice** — สร้างเสียงจากบทพูดและ Character Bible แล้วตรวจ Timeline, Export package หรือ Final MP4

เมื่อแก้ Brief หลังสร้างงานแล้ว ระบบจะไม่เขียนทับงานเดิมทันที แต่จะติดป้าย stale ที่ Character, Story, Storyboard, Video, Voice และ Timeline ตามผลกระทบ ผู้ใช้เลือกยืนยัน Character เดิม, ใช้สไตล์ใหม่, สร้าง Story ใหม่ หรืออัปเดตเฉพาะ Prompt/ภาพ/Segment/เสียงได้

### ขั้นตอนที่ 3: Export Prompt สำหรับสร้างตัวละคร

หน้า **ตัวละคร** มีปุ่ม **Export System + User Prompt** ซึ่งใช้ Character Prompt Template ล่าสุดจาก Settings และแทนค่าตัวแปร `projectTitle`, `characterStyle` และ `contextJson` ด้วยข้อมูลจริงแล้ว ระบบสร้างโฟลเดอร์ `exports/external-character-prompt-<timestamp>/` ประกอบด้วย:

- `character-system-prompt.md` — บทบาท กฎ รูปแบบคำตอบ และข้อจำกัดของ AI
- `character-user-prompt.md` — Brief, รูปแบบตัวละคร, ตัวละครเดิม และงานที่ต้องสร้าง
- `character-system-and-user-prompt.md` — รวมทั้งสองส่วนพร้อมหัวข้อ `SYSTEM PROMPT` และ `USER PROMPT` สำหรับคัดลอกใช้งาน
- `character-generation-prompt.json` — เก็บ `systemPrompt` และ `userPrompt` แยก field สำหรับ API หรือ workflow ภายนอก

### Export เรื่องราวไปสร้าง Storyboard ด้วย AI ภายนอก

ในขั้นตอนที่ 4 **เรื่องราว** กด **Export Prompt สำหรับ AI ภายนอก** ระบบจะสร้างโฟลเดอร์ `exports/external-storyboard-prompt-<timestamp>/` ภายในโปรเจกต์ ประกอบด้วย:

- `full-story-master-prompt.md` — Prompt เดียวของเรื่องทั้งหมด ตั้งแต่ Brief, Opening, Climax, Ending, Character Bible, เหตุการณ์และบทสนทนาทุก Scene/Shot จนถึงข้อกำหนดผลลัพธ์ครบเรื่อง
- `storyboard-ai-prompt.md` — Prompt ราย Shot สำหรับสร้างหรือแก้ภาพเฉพาะ Shot โดยยังคงบริบทของโปรเจกต์และตัวละคร
- `story-system-prompt.md` — System Prompt ของ Story Generation จาก Template ปัจจุบัน
- `story-user-prompt.md` — User Prompt ที่แทน Brief และ Character Bible จริงแล้ว
- `story-system-and-user-prompt.md` — รวม Story System/User สำหรับส่งให้ AI ภายนอก
- `storyboard-ai-prompt.json` — ข้อมูลเดียวกันแบบมีโครงสร้าง สำหรับ AI workflow หรือโปรแกรมภายนอก
- `character-references/` — สำเนา Character Sheet หลักของตัวละครแต่ละตัวที่มีไฟล์อ้างอิง

หากต้องการให้ AI เข้าใจและสร้าง Storyboard **ทั้งเรื่อง** ให้อัปโหลด `full-story-master-prompt.md` พร้อมรูปใน `character-references/` ไฟล์นี้สั่งให้ AI อ่านเรื่องตั้งแต่ต้นจนจบก่อนสร้างภาพ รักษาเหตุและผล ลำดับอารมณ์ ความต่อเนื่องของตัวละคร เสื้อผ้า ฉาก แสง และกล้อง และห้ามหยุดก่อน Shot สุดท้าย

ใช้ `storyboard-ai-prompt.md` เมื่อต้องการสร้างหรือแก้เฉพาะบาง Shot โดยสร้างตามลำดับไฟล์ `S01-SH01.png`, `S01-SH02.png` เป็นต้น ทั้งสอง Prompt กำหนดให้สร้างหนึ่งภาพต่อหนึ่ง Shot, ไม่สร้าง contact sheet และห้ามมีตัวอักษร ตัวเลข subtitle, label, logo หรือ watermark ในภาพ

หาก Shot มี `imagePrompt` และ `imageNegativePrompt` อยู่แล้ว ระบบจะส่งออกค่านั้นโดยตรง หากยังไม่มี Prompt ระบบจะสร้างคำสั่งสำรองจากรายละเอียด Scene/Shot แต่แนะนำให้กด **สร้าง Prompt** ให้ครบก่อน Export เพื่อให้ควบคุมภาพได้ละเอียดที่สุด

## ขั้นตอนที่ 6: Voice & TTS

หน้า **Voice & TTS** แสดงบทพูดแต่ละบรรทัดแยกตาม Scene/Shot และสร้างไฟล์เสียงโดยใช้ข้อมูลจาก Story ร่วมกับ Character Bible ความหมายของแต่ละช่องมีดังนี้:

| ช่อง/ข้อมูล | ความหมายและแหล่งที่มา |
|---|---|
| `S3 / SH1` | ตำแหน่งของบทพูด: Scene 3, Shot 1 มาจาก `project.scenes[].shots[]` |
| ชื่อตัวละคร | ผู้พูดของบรรทัดนั้น อ้างจาก `dialogue.speakerId` ไปยัง `project.characters[].id` |
| `1.0s / 3s` | เวลาพูดโดยประมาณ เทียบกับเวลาที่ Shot หรือ Video Segments รองรับ หากเกินจะแสดงคำเตือนและปุ่ม **ย่อบท** |
| `Character Bible → TTS` | โปรไฟล์ที่ส่งเป็นคำกำกับการแสดงเสียง เช่น เพศ ช่วงวัย อายุ บุคลิก วิธีพูด โทนเสียง จังหวะ และสำเนียง |
| ข้อความในเครื่องหมายคำพูด | ข้อความจริงจาก `dialogue.text` ที่ส่งให้ TTS อ่าน ห้ามเปลี่ยนคำเองในขั้นตอนสร้างเสียง |
| **Voice** | เสียงหลักของผู้พูด เก็บใน `voiceAssignments.<speakerId>` และใช้กับทุกบรรทัดของผู้พูดคนเดียวกัน การเปลี่ยนช่องนี้จะทำเครื่องหมายเสียงเดิมทุกบรรทัดของผู้พูดคนนั้นว่าเก่า |
| **Emotion** | อารมณ์ของตัวละครเฉพาะบรรทัด เช่น `neutral`, `evasive`, กังวล หรือโกรธ ส่งเป็น TTS instruction |
| **น้ำเสียง / วิธีส่งคำ** | วิธีแสดงประโยค เช่น รีบร้อน กระซิบ สั่นเครือ หรือหนักแน่น ส่งเป็น TTS instruction |
| **Speaking rate** | อัตราความเร็วเสียง `1.0` คือปกติ ค่าต่ำกว่าจะช้าลงและค่าสูงกว่าจะเร็วขึ้น ช่วงที่หน้าแอปรับคือ `0.5–2.0` |
| `requested → provider` | ตรวจสอบเสียงของไฟล์ล่าสุด: `requested` คือค่าที่เลือกในแอป และ `provider` คือ Voice ID ที่ส่งให้ API จริง เช่น `th-female-warm → coral` |
| Audio player | เล่นเฉพาะไฟล์ล่าสุดที่ตรงกับค่าปัจจุบัน เมื่อ Voice, Emotion, วิธีส่งคำ, Speaking rate หรือบทพูดเปลี่ยน ระบบจะซ่อน player เดิมจนกว่าจะสร้างใหม่ |
| **Generate Voice** | สร้างเสียงครั้งแรก หากมีไฟล์ cache ที่ตรงกับข้อความ Voice และทุก instruction อาจนำมาใช้ซ้ำได้ |
| **Regenerate / สร้างเสียงใหม่** | เรียกผู้ให้บริการใหม่โดยข้าม application cache แล้วเพิ่ม revision ให้ player โหลดไฟล์ใหม่ อาจมีค่าใช้ API |
| **Import Audio** | นำไฟล์เสียงภายนอกมาแทน TTS ของบรรทัดนั้น และระบุ metadata ว่าเป็น `imported audio` |
| **Generate ทั้งหมด** | สร้างเฉพาะบรรทัดที่ยังไม่มีเสียงหรือถูกทำเครื่องหมายว่าต้องอัปเดต |

### เมื่อเปลี่ยน Voice แต่เสียงยังคล้ายเดิม

1. เปลี่ยนช่อง **Voice** แล้วตรวจว่ากล่องเสียงเดิมถูกซ่อนและมีข้อความให้สร้างเสียงใหม่
2. กด **สร้างเสียงใหม่** ระบบจะข้าม cache แม้ชื่อไฟล์ปลายทางเดิมจะเหมือนกัน
3. ตรวจบรรทัด `requested → provider` เช่น `nova → nova` หรือ `th-female-warm → coral` เพื่อยืนยัน Voice ID ที่ API ได้รับ
4. เปิด **Settings** แล้วตรวจว่า TTS provider เป็น `openai` และ TTS model เป็น `gpt-4o-mini-tts`; `mock` ใช้ทดสอบ workflow และไม่ได้สร้างเสียงพูดจริง
5. เสียงสำเร็จรูปบางเสียงอาจมีลักษณะใกล้กันเมื่อใช้ Character Bible และ instructions ชุดเดียวกัน ลองเลือก Voice ที่ต่างชัดเจนแล้วสร้างใหม่เพื่อเปรียบเทียบ

การเลือก Voice จาก dropdown อย่างเดียวไม่สามารถแก้ไฟล์เสียงที่สร้างไปแล้วได้ เวอร์ชัน 2.0.6 จึงซ่อนไฟล์เดิมและบังคับให้ผู้ใช้สร้างใหม่ก่อนฟัง เพื่อลดความสับสนว่า API ไม่เปลี่ยนเสียง

## AI Vendors และ Routing

Settings แยก vendor, model และ reasoning ตามงาน:

| งาน | ค่า preset ของแอป | Endpoint |
|---|---|---|
| Story | `gpt-5.6-terra` | `POST /v1/responses` |
| Storyboard Prompt | `gpt-5.6-terra` | `POST /v1/responses` |
| Video Prompt | `gpt-5.6-luna` | `POST /v1/responses` |
| Character Image / Shot ไม่มีตัวละคร | `gpt-image-2` | `POST /v1/images/generations` |
| Storyboard + Character references | `gpt-image-2` | `POST /v1/images/edits` (`image[]`) |
| Image-to-Video Generation | `sora-2` | `POST /v1/videos` (`input_reference`) |
| TTS | `gpt-4o-mini-tts` | `POST /v1/audio/speech` |

Model ID ทุกช่องแก้ได้ตามสิทธิ์ของบัญชีและ vendor ที่ใช้งาน ค่าในตารางเป็น preset ของโปรเจกต์นี้ ไม่ใช่การรับรองว่าแต่ละบัญชีเข้าถึงโมเดลได้

Vendor ที่มี preset:

- `mock` — Story, Prompt และ TTS workflow แบบออฟไลน์
- `openai` — Responses API, Image, Video และ Audio Speech
- `gemini` — structured text ผ่าน Gemini protocol
- `openrouter` — OpenAI-compatible Chat Completions
- `qwen` — OpenAI-compatible endpoint ของ Alibaba Model Studio; ต้องเลือก endpoint ให้ตรงภูมิภาคของ key
- Custom Vendor — เพิ่ม OpenAI-compatible vendor, endpoint, model และ JSON mode เอง

API key ถูกส่งและเก็บใน Main process เท่านั้น โดย Electron `safeStorage` เข้ารหัสด้วยระบบปฏิบัติการ Renderer เห็นเพียงสถานะว่า configured หรือไม่ หาก OS encryption ใช้ไม่ได้ แอปจะไม่ fallback ไปเก็บ plaintext

เอกสาร OpenAI ที่เกี่ยวข้อง: [Responses API](https://developers.openai.com/api/reference/resources/responses), [Image generation and edits](https://developers.openai.com/api/docs/guides/image-generation), [Video API](https://developers.openai.com/api/reference/resources/videos), [Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech)

## ติดตั้งและรัน

ต้องมี Node.js 20 หรือใหม่กว่า

```powershell
npm install
npm start
```

สำหรับ development:

```powershell
npm run dev
```

## โครงสร้างโปรเจกต์งาน

```text
project-name/
├── project.json
├── prompts/
├── characters/
├── storyboard-images/
├── video-clips/
├── voices/
├── music/
├── sfx/
├── exports/
└── temp/
```

แอปใช้ asset path แบบ relative เพื่อให้ย้ายทั้งโฟลเดอร์ได้ และบันทึก `project.json` แบบ atomic พร้อม rotating backup

## โครงสร้างซอร์ส

```text
main.js                         Electron window, custom asset protocol, smoke test
preload.js                      contextBridge allow-list
src/main/ipc.js                 validated IPC และ native dialogs
src/main/settings-store.js      settings และ safeStorage
src/main/project-store.js       project persistence
src/services/provider-registry.js  structured text AI routing
src/services/media-provider.js  image และ queued video generation
src/services/tts-provider.js    mock/OpenAI TTS
src/shared/prompt-templates.js  defaults, validation, template rendering
src/shared/schema.js            project schema และ normalization
src/renderer/app.js             Vanilla JS UI/workflow
tests/                          Node test suite
skills/clip-story-studio/       skill สำหรับดูแลโปรเจกต์นี้
```

## Tests และ Smoke Test

```powershell
npm.cmd test
node_modules\.bin\electron.cmd . --smoke-test
```

ชุดทดสอบปัจจุบันนี้ 56 รายการ ครอบคลุม schema/normalization, Prompt Templates และ variable provenance, rendered Character/Story System + User exports, text-free Image/Video prompts, provider request shape, multipart Character references, image-to-video guard, Sora standard/strict safety framing และ moderation classification, silent generated-video post-processing, segment ≤ 8 วินาที, Character style lock, settings portability, atomic save, path traversal, packaged FFmpeg resolution, Thai female TTS/Character instructions, TTS force-regenerate/cache bypass, External Storyboard Prompt Package และ export, ZIP package export, และ Storyboard PDF export

Smoke test เปิด Renderer จริงและตรวจ Settings, Prompt Template Registry, Brief sync, Character-first UI, Story/Storyboard status, media routing และ video `contain` โดยผลสำเร็จจะแสดง `SMOKE_OK`

## Build Installer

```powershell
npm.cmd run build:win
npm.cmd run build:mac
```

ต้อง build บนระบบปฏิบัติการเป้าหมาย ผลลัพธ์อยู่ใน `dist/`

## แก้ปัญหา Network offline / request timed out

1. เปิด **Settings → AI Vendor Registry** แล้วกด **Test Connection**
2. ตรวจ API key, credit/quota และสิทธิ์เข้าถึง model
3. ตรวจ Text API endpoint และ Models endpoint ให้ตรง vendor/ภูมิภาค โดยเฉพาะ Qwen
4. ตรวจ VPN, Proxy, Firewall และโปรแกรมป้องกันไวรัส
5. เพิ่ม **AI request timeout** จาก 120 เป็น 180–300 วินาทีเมื่อใช้ reasoning model หรือ Brief ยาว
6. หากได้ malformed JSON ให้ตรวจ System/User prompt ว่ายังคงสั่ง JSON schema ครบ และลองคืนค่า Template เริ่มต้น
7. เปิด Log folder จาก Settings เพื่อดู channel, error code และเวลาเกิดปัญหา

ข้อผิดพลาดจากข้อมูล AI ที่ไม่ครบจะถูกแปลงเป็นข้อความ `malformed_response` พร้อมคำแนะนำ แทนการแสดง JavaScript error เช่น `Cannot read properties of undefined`

## แก้ปัญหา Sora moderation

1. ใน Segment ที่ถูกบล็อก กด **ใช้ Strict Safety Prompt** ระบบจะสร้าง Prompt ใหม่ที่เหลือเฉพาะการหยุดคิด ตรวจสอบ และป้องกัน แล้วจึงกดสร้างใหม่
2. ระบบจะระบุว่าเป็น public-service safety dramatization ใช้ตัวละครสมมติ และไม่แสดงขั้นตอนหลอกลวง ข้อมูลส่วนตัว ข้อมูลธนาคาร หรือ credential
3. การสร้างแบบรวมจะข้าม Segment ที่ถูก moderation และดำเนินการกับ Segment อื่นต่อ
4. หากยังถูกบล็อก สาเหตุอาจเป็นภาพ Storyboard ที่ดูเหมือนบุคคลจริง ให้สร้าง Storyboard ใหม่เป็น 3D Cartoon, Chibi, Anime หรือ Concept Art
5. Safety framing ช่วยลด false positive แต่ไม่สามารถรับประกันการอนุมัติ เพราะ provider ตรวจทั้ง prompt, ภาพอ้างอิง และ output

## ข้อจำกัดที่ควรทราบ

- การสร้างภาพ วิดีโอ และเสียงจริงอาจมีค่าใช้จ่าย ใช้เวลาหลายนาที หรือถูก moderation ปฏิเสธตาม policy ของ provider
- Character consistency ดีขึ้นจาก reference image แต่ผลลัพธ์ยังขึ้นกับจำนวนตัวละคร คุณภาพภาพอ้างอิง และข้อจำกัดของ image model; ควรตรวจทุก Shot ก่อนสร้างวิดีโอ
- Mock TTS ใช้ทดสอบ file workflow/cache ไม่ใช่เสียงพูด production
- Timeline เป็น editor พื้นฐาน ยังไม่มี waveform และ drag trim
- Storyboard PDF รองรับการแสดงข้อความและ Shot labels; รูปภาพ Storyboard จะถูกรวมเข้าไปเมื่อ Electron nativeImage พร้อมใช้งาน
- Export package รองรับการส่งออกเป็นโฟลเดอร์ portable หรือไฟล์ ZIP แล้ว
- การลบ Project ในหน้า Projects เอาออกจาก recent list ไม่ได้ลบโฟลเดอร์จริง
